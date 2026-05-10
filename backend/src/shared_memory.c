/* ─────────────────────────────────────────────
 * shared_memory.c — Memory Allocation Visualizer
 *
 * Manages the shared memory segment that holds the
 * entire simulation state: frame pool + process table.
 *
 * Linux concepts: shmget(), shmat(), shmdt(), shmctl()
 * ───────────────────────────────────────────── */

#define _POSIX_C_SOURCE 200809L

#include "memory.h"
#include "logger.h"

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/ipc.h>
#include <sys/shm.h>
#include <errno.h>
#include <time.h>
#include <sys/time.h>

/* ── Shared memory key ───────────────────────────────────────── */
/*
 * We use a fixed key rather than ftok() so the key is predictable
 * and easy to inspect with `ipcs -m` during debugging.
 */
#define SHM_KEY  0x4D454D30   /* "MEM0" in hex */

/* ── Module-level state ──────────────────────────────────────── */
static int shm_id = -1;

/* Pointer to the shared segment — exported for use by all other modules */
SharedMemory *shm = NULL;

/* ── Internal helpers ─────────────────────────────────────────── */

/* Returns current time as epoch milliseconds */
static long current_epoch_ms(void) {
    struct timeval tv;
    gettimeofday(&tv, NULL);
    return (long)tv.tv_sec * 1000L + (long)tv.tv_usec / 1000L;
}

/* ── Pool initialization ──────────────────────────────────────── */

/*
 * init_frame_pool(frame_count, algorithm)
 *   Marks all frames as free and resets pool counters.
 *   Called at startup and when the `frames <N>` command is received.
 */
static void init_frame_pool(int frame_count, const char *algorithm) {
    if (frame_count < 1 || frame_count > MAX_FRAMES) {
        log_event(MOD_ERROR, "Invalid frame count %d — must be 1..%d",
                  frame_count, MAX_FRAMES);
        return;
    }

    /* Reset all frame slots */
    for (int i = 0; i < MAX_FRAMES; i++) {
        shm->frames[i].frame_id    = i;
        shm->frames[i].occupied    = 0;
        shm->frames[i].owner_pid   = 0;
        shm->frames[i].page_number = -1;
        shm->frames[i].last_used   = 0;
        shm->frames[i].load_order  = 0;
        memset(shm->frames[i].process_name, 0,
               sizeof(shm->frames[i].process_name));
    }

    /* Reset process table */
    for (int i = 0; i < MAX_PROCESSES; i++) {
        shm->processes[i].active = 0;
    }

    /* Set counters */
    shm->total_frames     = frame_count;
    shm->free_frames      = frame_count;
    shm->fault_count      = 0;
    shm->hit_count        = 0;
    shm->algo_switch_flag = 0;
    shm->load_counter     = 0;

    strncpy(shm->algorithm, algorithm, sizeof(shm->algorithm) - 1);
    shm->algorithm[sizeof(shm->algorithm) - 1] = '\0';
}

/* ── Public API ───────────────────────────────────────────────── */

/*
 * shm_init(frame_count, algorithm)
 *   Creates the shared memory segment and attaches to it.
 *   Initializes the frame pool and process table.
 *   Returns 0 on success, -1 on failure.
 */
int shm_init(int frame_count, const char *algorithm) {
    /* Create the shared memory segment */
    shm_id = shmget(SHM_KEY, sizeof(SharedMemory),
                    IPC_CREAT | IPC_EXCL | 0666);

    if (shm_id == -1) {
        if (errno == EEXIST) {
            /*
             * A leftover segment exists from a previous crashed run.
             * Remove it and try again — this keeps dev restarts clean.
             */
            log_event(MOD_SYSTEM,
                "Stale shared memory segment found — removing and recreating");

            int old_id = shmget(SHM_KEY, 0, 0666);
            if (old_id != -1) shmctl(old_id, IPC_RMID, NULL);

            shm_id = shmget(SHM_KEY, sizeof(SharedMemory),
                            IPC_CREAT | IPC_EXCL | 0666);
        }

        if (shm_id == -1) {
            log_event(MOD_ERROR, "shmget() failed: %s", strerror(errno));
            return -1;
        }
    }

    /* Attach the segment to our address space */
    shm = (SharedMemory *)shmat(shm_id, NULL, 0);
    if (shm == (SharedMemory *)-1) {
        log_event(MOD_ERROR, "shmat() failed: %s", strerror(errno));
        shm = NULL;
        return -1;
    }

    /* Zero the segment before use */
    memset(shm, 0, sizeof(SharedMemory));

    /* Initialize frame pool */
    init_frame_pool(frame_count, algorithm);

    log_event(MOD_MEMORY, "shmget() → segment key=0x%X id=%d size=%zu bytes",
              SHM_KEY, shm_id, sizeof(SharedMemory));
    log_event(MOD_MEMORY, "Frame pool ready: %d frames | algorithm: %s",
              frame_count, algorithm);

    /* Emit typed event for the bridge */
    char json[256];
    snprintf(json, sizeof(json),
        "{\"total_frames\":%d,\"free_frames\":%d,\"algorithm\":\"%s\","
        "\"fault_count\":0,\"hit_count\":0}",
        frame_count, frame_count, algorithm);
    emit_event("status", json);

    return 0;
}

/*
 * shm_reinit(frame_count)
 *   Reinitializes the frame pool with a new frame count.
 *   Used by the `frames <N>` command.
 *   Assumes all child processes have been terminated first.
 */
void shm_reinit(int frame_count) {
    if (!shm) return;
    init_frame_pool(frame_count, shm->algorithm);
    log_event(MOD_MEMORY, "Frame pool reinitialized: %d frames", frame_count);

    char json[256];
    snprintf(json, sizeof(json),
        "{\"total_frames\":%d,\"free_frames\":%d,\"algorithm\":\"%s\","
        "\"fault_count\":0,\"hit_count\":0}",
        frame_count, frame_count, shm->algorithm);
    emit_event("status", json);
}

/*
 * shm_alloc_frame(process_name, owner_pid, page_number)
 *   Finds the first free frame, marks it occupied, and returns its index.
 *   Returns -1 if no free frames are available (page fault condition).
 *
 *   Caller must hold /mem_lock before calling.
 */
int shm_alloc_frame(const char *process_name, pid_t owner_pid, int page_number) {
    if (!shm) return -1;

    for (int i = 0; i < shm->total_frames; i++) {
        if (!shm->frames[i].occupied) {
            Frame *f = &shm->frames[i];
            f->occupied    = 1;
            f->owner_pid   = owner_pid;
            f->page_number = page_number;
            f->last_used   = current_epoch_ms();
            f->load_order  = shm->load_counter++;
            strncpy(f->process_name, process_name,
                    sizeof(f->process_name) - 1);
            f->process_name[sizeof(f->process_name) - 1] = '\0';

            shm->free_frames--;
            shm->hit_count++;

            log_event(MOD_MEMORY,
                "Frame %d → %s, Page %d [free: %d/%d]",
                i, process_name, page_number,
                shm->free_frames, shm->total_frames);

            char json[256];
            snprintf(json, sizeof(json),
                "{\"frame_id\":%d,\"process_name\":\"%s\","
                "\"page_number\":%d,\"load_order\":%d}",
                i, process_name, page_number, f->load_order);
            emit_event("alloc", json);

            return i;
        }
    }

    /* No free frame found — page fault */
    shm->fault_count++;
    log_event(MOD_MEMORY,
        "No free frame for %s Page %d — page fault [faults: %d]",
        process_name, page_number, shm->fault_count);

    char json[128];
    snprintf(json, sizeof(json),
        "{\"process_name\":\"%s\",\"page_number\":%d,\"frames_full\":true}",
        process_name, page_number);
    emit_event("fault", json);

    return -1;
}

/*
 * shm_free_frames(process_name)
 *   Releases all frames owned by process_name.
 *   Caller must hold /mem_lock before calling.
 */
void shm_free_frames(const char *process_name) {
    if (!shm) return;

    int freed[MAX_FRAMES];
    int freed_count = 0;

    for (int i = 0; i < shm->total_frames; i++) {
        if (shm->frames[i].occupied &&
            strncmp(shm->frames[i].process_name, process_name, 8) == 0) {

            shm->frames[i].occupied    = 0;
            shm->frames[i].owner_pid   = 0;
            shm->frames[i].page_number = -1;
            shm->frames[i].last_used   = 0;
            shm->frames[i].load_order  = 0;
            memset(shm->frames[i].process_name, 0,
                   sizeof(shm->frames[i].process_name));

            shm->free_frames++;
            freed[freed_count++] = i;
        }
    }

    if (freed_count > 0) {
        /* Build the freed frame list string for logging */
        char frame_list[128] = "";
        for (int i = 0; i < freed_count; i++) {
            char tmp[8];
            snprintf(tmp, sizeof(tmp), "%d%s",
                     freed[i], (i < freed_count - 1) ? "," : "");
            strncat(frame_list, tmp,
                    sizeof(frame_list) - strlen(frame_list) - 1);
        }
        log_event(MOD_MEMORY,
            "%s released frames [%s] [free: %d/%d]",
            process_name, frame_list,
            shm->free_frames, shm->total_frames);

        /* Build JSON array for the event */
        char json_arr[256] = "[";
        for (int i = 0; i < freed_count; i++) {
            char tmp[8];
            snprintf(tmp, sizeof(tmp), "%d%s",
                     freed[i], (i < freed_count - 1) ? "," : "");
            strncat(json_arr, tmp, sizeof(json_arr) - strlen(json_arr) - 1);
        }
        strncat(json_arr, "]", sizeof(json_arr) - strlen(json_arr) - 1);

        char json[320];
        snprintf(json, sizeof(json),
            "{\"process_name\":\"%s\",\"freed_frames\":%s}",
            process_name, json_arr);
        emit_event("release", json);
    }
}

/*
 * shm_print_status()
 *   Prints the full frame pool state to stdout.
 *   Called by the `status` command.
 */
void shm_print_status(void) {
    if (!shm) {
        log_event(MOD_SYSTEM, "Shared memory not initialized");
        return;
    }

    printf("\n");
    printf("  \033[1mFrame Pool\033[0m  [%d/%d free | algorithm: %s | "
           "faults: %d | hits: %d | ratio: %.0f%%]\n",
           shm->free_frames, shm->total_frames, shm->algorithm,
           shm->fault_count, shm->hit_count,
           (shm->fault_count + shm->hit_count) > 0
               ? (double)shm->hit_count /
                 (double)(shm->fault_count + shm->hit_count) * 100.0
               : 0.0);

    printf("  %-6s  %-10s  %-6s  %-8s\n",
           "Frame", "Process", "Page", "Status");
    printf("  %-6s  %-10s  %-6s  %-8s\n",
           "-----", "-------", "----", "------");

    for (int i = 0; i < shm->total_frames; i++) {
        Frame *f = &shm->frames[i];
        if (f->occupied) {
            printf("  \033[32m%-6d  %-10s  %-6d  occupied\033[0m\n",
                   f->frame_id, f->process_name, f->page_number);
        } else {
            printf("  \033[90m%-6d  %-10s  %-6s  free\033[0m\n",
                   f->frame_id, "—", "—");
        }
    }
    printf("\n");

    /* Emit a full status event for the bridge */
    /* Build frames JSON array */
    char frames_json[4096] = "[";
    for (int i = 0; i < shm->total_frames; i++) {
        Frame *f = &shm->frames[i];
        char entry[256];
        snprintf(entry, sizeof(entry),
            "{\"frame_id\":%d,\"occupied\":%d,\"process_name\":\"%s\","
            "\"page_number\":%d,\"load_order\":%d,\"last_used\":%ld}%s",
            f->frame_id, f->occupied,
            f->occupied ? f->process_name : "",
            f->page_number, f->load_order, f->last_used,
            (i < shm->total_frames - 1) ? "," : "");
        strncat(frames_json, entry,
                sizeof(frames_json) - strlen(frames_json) - 1);
    }
    strncat(frames_json, "]", sizeof(frames_json) - strlen(frames_json) - 1);

    char status_json[5120];
    snprintf(status_json, sizeof(status_json),
        "{\"frames\":%s,\"total_frames\":%d,\"free_frames\":%d,"
        "\"algorithm\":\"%s\",\"fault_count\":%d,\"hit_count\":%d}",
        frames_json, shm->total_frames, shm->free_frames,
        shm->algorithm, shm->fault_count, shm->hit_count);
    emit_event("status", status_json);
}

/*
 * shm_destroy()
 *   Detaches and removes the shared memory segment.
 *   Called from cleanup() in memory_manager.c.
 */
void shm_destroy(void) {
    if (shm) {
        shmdt(shm);
        shm = NULL;
    }
    if (shm_id != -1) {
        shmctl(shm_id, IPC_RMID, NULL);
        log_event(MOD_MEMORY, "Shared memory segment removed (id=%d)", shm_id);
        shm_id = -1;
    }
}
