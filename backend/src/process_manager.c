/* ─────────────────────────────────────────────
 * process_manager.c — Memory Allocation Visualizer
 *
 * Creates and manages simulated OS processes as real
 * Linux child processes via fork().
 *
 * Linux concepts used:
 *   fork()        — process creation
 *   SIGTERM       — process termination signal
 *   SIGCHLD       — child exit notification to parent
 *   waitpid()     — parent reaps exited children
 *   /proc/[p]/statm — real RSS memory reading
 *   sem_wait/post — frame pool locking (Phase 2 semaphores)
 *
 * Phase 3 note: test with ONE process at a time.
 * Full concurrent contention logging added in Phase 4.
 * ───────────────────────────────────────────── */

#define _DEFAULT_SOURCE   /* expose usleep(), fork(), kill(), sigaction() */

#include "process.h"
#include "memory.h"
#include "sync.h"
#include "logger.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <signal.h>
#include <errno.h>
#include <time.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <sys/time.h>
#include <fcntl.h>

/* ── External: shared_memory.c exports ──────────────────────── */
extern SharedMemory *shm;
extern void shm_print_status(void);

/* ── Internal helpers ─────────────────────────────────────────── */

static long epoch_ms(void) {
    struct timeval tv;
    gettimeofday(&tv, NULL);
    return (long)tv.tv_sec * 1000L + (long)tv.tv_usec / 1000L;
}

static void log_proc_stats(const char *name, pid_t pid);

/*
 * read_proc_rss(pid)
 *   Reads /proc/[pid]/statm and returns resident set size in KB.
 *   statm field 1 (0-indexed) = RSS in pages; multiply by page size.
 *   Returns -1 if the file cannot be read (process already gone).
 */
static long read_proc_rss(pid_t pid) {
    char path[64];
    snprintf(path, sizeof(path), "/proc/%d/statm", pid);

    FILE *f = fopen(path, "r");
    if (!f) return -1;

    long vmsize, rss;
    if (fscanf(f, "%ld %ld", &vmsize, &rss) != 2) {
        fclose(f);
        return -1;
    }
    fclose(f);

    long page_size_kb = sysconf(_SC_PAGESIZE) / 1024;
    return rss * page_size_kb;
}

/*
 * find_process_slot(name)
 *   Returns the index of the ProcessEntry matching `name`, or -1.
 */
static int find_process_slot(const char *name) {
    for (int i = 0; i < MAX_PROCESSES; i++) {
        if (shm->processes[i].active &&
            strncmp(shm->processes[i].name, name, 8) == 0) {
            return i;
        }
    }
    return -1;
}

/*
 * find_free_slot()
 *   Returns the index of the first inactive ProcessEntry slot, or -1.
 */
static int find_free_slot(void) {
    for (int i = 0; i < MAX_PROCESSES; i++) {
        if (!shm->processes[i].active) return i;
    }
    return -1;
}

/* ── Child process: SIGTERM handler ─────────────────────────── */
/*
 * This runs inside the child process only.
 * Acquires the shared memory lock, releases all owned frames, then exits.
 * The child's name is stored in this global (set after fork).
 */
static char child_process_name[8];

static void child_sigterm_handler(int sig) {
    (void)sig;

    /*
     * Acquire /mem_lock before touching the frame pool.
     * Use the contention-logging wrapper (Phase 4).
     */
    mem_lock_acquire(child_process_name);
    long held_since = epoch_ms();

    /* Release all frames owned by this child */
    for (int i = 0; i < shm->total_frames; i++) {
        if (shm->frames[i].occupied &&
            strncmp(shm->frames[i].process_name, child_process_name, 8) == 0) {
            shm->frames[i].occupied    = 0;
            shm->frames[i].owner_pid   = 0;
            shm->frames[i].page_number = -1;
            shm->frames[i].last_used   = 0;
            shm->frames[i].load_order  = 0;
            memset(shm->frames[i].process_name, 0,
                   sizeof(shm->frames[i].process_name));
            shm->free_frames++;
        }
    }

    /* Mark process slot as inactive */
    int slot = find_process_slot(child_process_name);
    if (slot >= 0) shm->processes[slot].active = 0;

    mem_lock_release(child_process_name, held_since);

    log_event(MOD_PROCESS, "%s (PID %d) SIGTERM caught — frames released, exiting",
              child_process_name, getpid());

    char json[128];
    snprintf(json, sizeof(json),
        "{\"process_name\":\"%s\",\"pid\":%d}",
        child_process_name, (int)getpid());
    emit_event("terminate", json);

    _exit(0);
}

/* ── Child process: main loop ────────────────────────────────── */
/*
 * child_loop(slot_index)
 *   Runs inside the forked child.
 *   Cycles through the reference string, allocating frames
 *   (or triggering a page fault stub) for each access.
 *   Sleeps between accesses to simulate execution time.
 */
static void child_loop(int slot) {
    /* Install SIGTERM handler */
    signal(SIGTERM, child_sigterm_handler);

    ProcessEntry *entry = &shm->processes[slot];
    int ref_pos = 0;

    log_event(MOD_PROCESS, "%s (PID %d) entering execution loop [%d pages]",
              entry->name, getpid(), entry->page_count);

    int iter_count = 0;
    while (1) {
        /* Periodic stats update (every 5 memory accesses) */
        if (iter_count++ % 5 == 0) {
            log_proc_stats(entry->name, getpid());
        }

        /*
         * Determine the next page to access.
         * If a reference string is set, follow it cyclically.
         * Otherwise, generate a simple sequential reference: 0,1,2,...,page_count-1.
         */
        int page;
        if (entry->ref_count > 0) {
            page = entry->refs[ref_pos % entry->ref_count];
            entry->ref_index = ref_pos % entry->ref_count; /* track for OPT */
            ref_pos++;
        } else {
            page = ref_pos % entry->page_count;
            ref_pos++;
        }

        /* ── Acquire frame pool lock (with contention logging) ── */
        long lock_acquired = epoch_ms();
        mem_lock_acquire(entry->name);

        /*
         * Check if this page is already in a frame (page hit).
         * Phase 3: simple linear scan — optimized in Phase 5.
         */
        int already_loaded = 0;
        for (int i = 0; i < shm->total_frames; i++) {
            if (shm->frames[i].occupied &&
                strncmp(shm->frames[i].process_name, entry->name, 8) == 0 &&
                shm->frames[i].page_number == page) {

                /* Hit — update LRU timestamp */
                shm->frames[i].last_used = epoch_ms();
                shm->hit_count++;
                already_loaded = 1;

                log_event(MOD_MEMORY, "%s Page %d — HIT (Frame %d) [hits:%d faults:%d]",
                          entry->name, page, i,
                          shm->hit_count, shm->fault_count);

                char json[128];
                snprintf(json, sizeof(json),
                    "{\"process_name\":\"%s\",\"page_number\":%d,"
                    "\"frame_id\":%d,\"type\":\"hit\"}",
                    entry->name, page, i);
                emit_event("alloc", json);
                
                /* Update frame grid */
                shm_print_status();
                break;
            }
        }

        if (!already_loaded) {
            /*
             * Page fault path.
             * Phase 3: try to allocate a free frame directly.
             * If no free frame exists: log the fault and release lock.
             * Full replacement handshake (sem_post fault_requested etc.)
             * is wired in Phase 5 when the replacement thread exists.
             */
            int free_frame = -1;
            for (int i = 0; i < shm->total_frames; i++) {
                if (!shm->frames[i].occupied) {
                    free_frame = i;
                    break;
                }
            }

            if (free_frame >= 0) {
                Frame *f = &shm->frames[free_frame];
                f->occupied    = 1;
                f->owner_pid   = getpid();
                f->page_number = page;
                f->last_used   = epoch_ms();
                f->load_order  = shm->load_counter++;
                strncpy(f->process_name, entry->name,
                        sizeof(f->process_name) - 1);
                shm->free_frames--;
                shm->hit_count++;   /* first load counts as a hit */

                log_event(MOD_MEMORY,
                    "%s Page %d → Frame %d [free:%d/%d]",
                    entry->name, page, free_frame,
                    shm->free_frames, shm->total_frames);

                char json[192];
                snprintf(json, sizeof(json),
                    "{\"frame_id\":%d,\"process_name\":\"%s\","
                    "\"page_number\":%d,\"load_order\":%d}",
                    free_frame, entry->name, page, f->load_order);
                emit_event("alloc", json);
                
                /* Update frame grid */
                shm_print_status();

            } else {
                /*
                 * No free frame — page fault requiring replacement.
                 * Phase 5: full semaphore handshake.
                 */
                shm->fault_count++;
                log_event(MOD_REPLACE,
                    "Page fault — %s needs Page %d (frames full)",
                    entry->name, page);

                char json[128];
                snprintf(json, sizeof(json),
                    "{\"process_name\":\"%s\",\"page_number\":%d,"
                    "\"frames_full\":true}",
                    entry->name, page);
                emit_event("fault", json);

                /*
                 * Deadlock avoidance: we MUST release /mem_lock before sleeping,
                 * otherwise the replacement thread can't acquire it to free a frame.
                 */
                mem_lock_release(entry->name, lock_acquired);

                /* Wake replacement thread */
                fault_signal();

                /* Sleep until replacement thread finishes evicting */
                log_event(MOD_SYNC, "%s waiting for /fault_resolved...", entry->name);
                fault_wait();

                /*
                 * The replacement thread has freed a frame for us.
                 * Loop back to the top of the while(1), without incrementing `ref_pos`.
                 * We will re-request the exact same page, and this time we will
                 * hit the `if (free_frame >= 0)` branch and claim the freed frame.
                 */
                if (entry->ref_count > 0) ref_pos--;
                else ref_pos--;

                /* Small artificial sleep to represent fetching from disk */
                usleep(200000);
                continue;
            }
        }

        /* ── Release frame pool lock ── */
        mem_lock_release(entry->name, lock_acquired);

        /* Simulate execution time between memory accesses */
        usleep(600000);  /* 600ms — visible in demo, not too fast */
    }
}

/* ── Parent: SIGCHLD handler ─────────────────────────────────── */
static void sigchld_handler(int sig) {
    (void)sig;
    int status;
    pid_t pid;

    /*
     * WNOHANG: non-blocking reap. Loop to catch multiple simultaneous exits.
     * This runs in the parent's signal context — keep it minimal.
     */
    while ((pid = waitpid(-1, &status, WNOHANG)) > 0) {
        /* Find and mark the process slot inactive */
        for (int i = 0; i < MAX_PROCESSES; i++) {
            if (shm->processes[i].active &&
                shm->processes[i].pid == pid) {
                shm->processes[i].active = 0;
                log_event(MOD_PROCESS,
                    "SIGCHLD: %s (PID %d) reaped [exit status: %d]",
                    shm->processes[i].name, (int)pid,
                    WIFEXITED(status) ? WEXITSTATUS(status) : -1);

                char json[128];
                snprintf(json, sizeof(json),
                    "{\"process_name\":\"%s\",\"pid\":%d}",
                    shm->processes[i].name, (int)pid);
                emit_event("terminate", json);
                break;
            }
        }
    }
}

/* ── /proc reader: periodic RSS logger ──────────────────────── */
/*
 * log_proc_stats(name, pid)
 *   Called by the parent every few seconds after fork.
 *   Reads /proc/[pid]/statm and logs real RSS alongside simulated stats.
 */
static void log_proc_stats(const char *name, pid_t pid) {
    long rss_kb = read_proc_rss(pid);
    if (rss_kb < 0) return;

    /* Count simulated frames */
    int frame_count = 0;
    for (int i = 0; i < shm->total_frames; i++) {
        if (shm->frames[i].occupied &&
            strncmp(shm->frames[i].process_name, name, 8) == 0) {
            frame_count++;
        }
    }

    log_event(MOD_PROC,
        "%s (PID %d) — Simulated: %d frames (%dKB) | Real RSS: %ldKB",
        name, (int)pid, frame_count, frame_count * 4, rss_kb);

    char json[256];
    snprintf(json, sizeof(json),
        "{\"process_name\":\"%s\",\"pid\":%d,"
        "\"sim_frames\":%d,\"real_rss_kb\":%ld}",
        name, (int)pid, frame_count, rss_kb);
    emit_event("proc", json);
}

/* ── Public API ───────────────────────────────────────────────── */

void process_manager_init(void) {
    /* Install SIGCHLD handler in the parent */
    struct sigaction sa;
    memset(&sa, 0, sizeof(sa));
    sa.sa_handler = sigchld_handler;
    sigemptyset(&sa.sa_mask);
    sa.sa_flags = SA_RESTART | SA_NOCLDSTOP;
    sigaction(SIGCHLD, &sa, NULL);

    log_event(MOD_PROCESS, "Process manager initialized (SIGCHLD handler installed)");
}

pid_t process_add(const char *name, int page_count) {
    if (!shm) {
        log_event(MOD_ERROR, "process_add: shared memory not initialized");
        return -1;
    }
    if (page_count < 1 || page_count > MAX_REFS) {
        log_event(MOD_ERROR, "process_add: page_count %d out of range (1..%d)",
                  page_count, MAX_REFS);
        return -1;
    }
    int slot = find_process_slot(name);
    ProcessEntry *entry = NULL;

    if (slot >= 0) {
        entry = &shm->processes[slot];
        if (entry->pid != 0) {
            log_event(MOD_ERROR, "process_add: process '%s' already running", name);
            return -1;
        }
        /* Slot was pre-populated by process_set_refs */
        log_event(MOD_PROCESS, "process_add: using pre-populated refs for '%s'", name);
    } else {
        slot = find_free_slot();
        if (slot < 0) {
            log_event(MOD_ERROR, "process_add: process table full (%d max)", MAX_PROCESSES);
            return -1;
        }
        entry = &shm->processes[slot];
        memset(entry, 0, sizeof(ProcessEntry));
        strncpy(entry->name, name, sizeof(entry->name) - 1);
        entry->ref_count = 0;
    }

    entry->page_count = page_count;
    entry->ref_index  = 0;
    entry->active     = 1;
    entry->pid        = 0;   /* will be set after fork() */

    /* ── fork() ── */
    pid_t pid = fork();

    if (pid == -1) {
        log_event(MOD_ERROR, "fork() failed: %s", strerror(errno));
        entry->active = 0;
        return -1;
    }

    if (pid == 0) {
        /* ─── Child process ─────────────────────────────────── */
        strncpy(child_process_name, name, sizeof(child_process_name) - 1);
        child_loop(slot);
        _exit(0);  /* should never reach here */
    }

    /* ─── Parent process ────────────────────────────────────── */
    entry->pid = pid;

    log_event(MOD_PROCESS, "fork() → %s (PID %d) created [%d pages requested]",
              name, (int)pid, page_count);

    char json[192];
    snprintf(json, sizeof(json),
        "{\"process_name\":\"%s\",\"pid\":%d,\"page_count\":%d}",
        name, (int)pid, page_count);
    emit_event("spawn", json);

    /* Log real RSS from /proc shortly after fork */
    usleep(100000);  /* 100ms — give child time to start */
    log_proc_stats(name, pid);

    return pid;
}

void process_kill(const char *name) {
    int slot = find_process_slot(name);
    if (slot < 0) {
        log_event(MOD_ERROR, "kill: process '%s' not found or not active", name);
        return;
    }

    pid_t pid = shm->processes[slot].pid;
    log_event(MOD_PROCESS, "Sending SIGTERM → %s (PID %d)", name, (int)pid);
    kill(pid, SIGTERM);
}

void process_kill_all(void) {
    for (int i = 0; i < MAX_PROCESSES; i++) {
        if (shm && shm->processes[i].active) {
            pid_t pid = shm->processes[i].pid;
            log_event(MOD_PROCESS,
                "Sending SIGTERM → %s (PID %d) [shutdown cleanup]",
                shm->processes[i].name, (int)pid);
            kill(pid, SIGTERM);
        }
    }
    /* Give children time to clean up before shared memory is destroyed */
    usleep(200000);  /* 200ms */
}

pid_t process_find_pid(const char *name) {
    int slot = find_process_slot(name);
    if (slot < 0) return -1;
    return shm->processes[slot].pid;
}

void process_set_refs(const char *name, int *refs, int count) {
    if (!shm) return;
    if (count > MAX_REFS) count = MAX_REFS;

    int slot = find_process_slot(name);
    if (slot >= 0) {
        if (shm->processes[slot].pid != 0) {
            log_event(MOD_ERROR, "process_set_refs: '%s' is already running", name);
            return;
        }
    } else {
        slot = find_free_slot();
        if (slot < 0) {
            log_event(MOD_ERROR, "process_set_refs: table full");
            return;
        }
        memset(&shm->processes[slot], 0, sizeof(ProcessEntry));
        strncpy(shm->processes[slot].name, name, 8);
    }

    for (int i = 0; i < count; i++) {
        shm->processes[slot].refs[i] = refs[i];
    }
    shm->processes[slot].ref_count = count;
    shm->processes[slot].active = 1;
    shm->processes[slot].pid = 0; /* marks as pre-populated, not running */

    log_event(MOD_PROCESS, "Pre-populated reference string for %s (%d pages)",
              name, count);
}
