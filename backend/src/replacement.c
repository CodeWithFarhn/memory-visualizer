/* ─────────────────────────────────────────────
 * replacement.c — Memory Allocation Visualizer
 *
 * Runs as a separate pthread.
 * Sleeps on the /fault_requested semaphore.
 * When woken by a child process page fault:
 *   1. Acquires /mem_lock
 *   2. Selects a victim frame based on current algorithm
 *   3. Evicts the old page and loads the new one
 *   4. Emits "evict" and "load" JSON events
 *   5. Releases /mem_lock
 *   6. Posts /fault_resolved to wake the child
 * ───────────────────────────────────────────── */

#define _DEFAULT_SOURCE

#include "memory.h"
#include "sync.h"
#include "logger.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <pthread.h>
#include <unistd.h>
#include <sys/time.h>

extern SharedMemory *shm;
static pthread_t thread_id;
static int       shutdown_flag = 0;

/* ── Internal helper: ms clock ───────────────────────────────── */
static long ms_now(void) {
    struct timeval tv;
    gettimeofday(&tv, NULL);
    return (long)tv.tv_sec * 1000L + (long)tv.tv_usec / 1000L;
}

/* ── Algorithms ──────────────────────────────────────────────── */

/*
 * fifo_victim()
 *   Selects the frame with the smallest load_order counter.
 */
static int fifo_victim(void) {
    int  victim_idx = 0;
    int  min_order  = shm->frames[0].load_order;

    for (int i = 1; i < shm->total_frames; i++) {
        if (shm->frames[i].load_order < min_order) {
            min_order  = shm->frames[i].load_order;
            victim_idx = i;
        }
    }
    return victim_idx;
}

/*
 * lru_victim()
 *   Selects the frame with the oldest last_used timestamp.
 */
static int lru_victim(void) {
    int  victim_idx = 0;
    long min_time   = shm->frames[0].last_used;

    for (int i = 1; i < shm->total_frames; i++) {
        if (shm->frames[i].last_used < min_time) {
            min_time   = shm->frames[i].last_used;
            victim_idx = i;
        }
    }
    return victim_idx;
}

/*
 * opt_victim()
 *   Looks forward in the reference strings of all currently loaded frames.
 *   Selects the frame whose page will be referenced farthest in the future.
 *   If a frame's page is never referenced again, it is evicted immediately.
 *   Fallback: if no future refs are known (shouldn't happen due to command gate), falls back to LRU.
 */
static int opt_victim(void) {
    int victim_idx = -1;
    int farthest_dist = -1;

    for (int i = 0; i < shm->total_frames; i++) {
        Frame *f = &shm->frames[i];
        int dist = -1;  /* -1 means 'never again' */

        /* Find the ProcessEntry for this frame's owner */
        int process_slot = -1;
        for (int p = 0; p < MAX_PROCESSES; p++) {
            if (shm->processes[p].active &&
                strncmp(shm->processes[p].name, f->process_name, 8) == 0) {
                process_slot = p;
                break;
            }
        }

        if (process_slot >= 0) {
            ProcessEntry *pe = &shm->processes[process_slot];
            if (pe->ref_count > 0) {
                /* Look forward from the current reference index */
                int current_idx = pe->ref_index;
                /* Limit search to avoid infinite loops on cyclical reference strings */
                int limit = pe->ref_count * 2;
                for (int step = 1; step <= limit; step++) {
                    int future_page = pe->refs[(current_idx + step) % pe->ref_count];
                    if (future_page == f->page_number) {
                        dist = step;
                        break;
                    }
                }
            }
        }

        /* If this page is never used again, pick it immediately */
        if (dist == -1) return i;

        if (dist > farthest_dist) {
            farthest_dist = dist;
            victim_idx = i;
        }
    }

    if (victim_idx == -1) return lru_victim(); /* safety fallback */
    return victim_idx;
}

/* ── The Thread ──────────────────────────────────────────────── */

static void *replacement_thread_func(void *arg) {
    (void)arg;
    log_event(MOD_REPLACE, "Thread started (algorithm: %s)", shm->algorithm);

    while (!shutdown_flag) {
        /* Wait for a child to hit a page fault */
        fault_listen();
        if (shutdown_flag) break;

        /* We woke up — acquire lock to safely modify shared memory */
        mem_lock_acquire("Replacement");
        long lock_acquired = ms_now();

        if (shm->algo_switch_flag) {
            log_event(MOD_REPLACE, "Algorithm switch detected → %s", shm->algorithm);
            shm->algo_switch_flag = 0;
        }

        /* Verify there actually are zero free frames (sanity check) */
        if (shm->free_frames > 0) {
            log_event(MOD_ERROR, "Replacement thread woke but free frames exist (%d)", shm->free_frames);
            fault_resolve();
            mem_lock_release("Replacement", lock_acquired);
            continue;
        }

        /* Select victim */
        int victim_idx = 0;
        if      (strcmp(shm->algorithm, "fifo") == 0) victim_idx = fifo_victim();
        else if (strcmp(shm->algorithm, "lru")  == 0) victim_idx = lru_victim();
        else if (strcmp(shm->algorithm, "opt")  == 0) victim_idx = opt_victim();

        Frame *f = &shm->frames[victim_idx];

        char evicted_process[8];
        int  evicted_page;
        strncpy(evicted_process, f->process_name, 8);
        evicted_page = f->page_number;

        log_event(MOD_REPLACE,
            "Victim: Frame %d (%s, Page %d) via %s",
            victim_idx, evicted_process, evicted_page, shm->algorithm);

        char evict_json[256];
        snprintf(evict_json, sizeof(evict_json),
            "{\"frame_id\":%d,\"evicted_process\":\"%s\",\"evicted_page\":%d,\"algorithm\":\"%s\"}",
            victim_idx, evicted_process, evicted_page, shm->algorithm);
        emit_event("evict", evict_json);

        /* Free the frame (virtually) so the child can allocate it when it wakes */
        f->occupied    = 0;
        f->owner_pid   = 0;
        f->page_number = -1;
        f->last_used   = 0;
        f->load_order  = 0;
        memset(f->process_name, 0, sizeof(f->process_name));
        shm->free_frames++;

        /* Tell child it can proceed */
        fault_resolve();

        mem_lock_release("Replacement", lock_acquired);

        /* Simulate disk I/O time for the eviction */
        usleep(400000);  /* 400ms */
    }

    log_event(MOD_REPLACE, "Thread terminating cleanly");
    return NULL;
}

/* ── Public API ──────────────────────────────────────────────── */

int replacement_thread_init(void) {
    if (pthread_create(&thread_id, NULL, replacement_thread_func, NULL) != 0) {
        log_event(MOD_ERROR, "pthread_create failed for replacement thread");
        return -1;
    }
    return 0;
}

void replacement_thread_stop(void) {
    if (thread_id) {
        shutdown_flag = 1;
        /* Post to wake the thread up so it sees the shutdown flag */
        fault_signal();
        pthread_join(thread_id, NULL);
        thread_id = 0;
    }
}
