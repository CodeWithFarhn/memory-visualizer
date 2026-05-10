/* ─────────────────────────────────────────────
 * sync.c — Memory Allocation Visualizer
 *
 * Phase 2: create and destroy the three named POSIX semaphores.
 * Phase 4: adds acquire/release wrappers with millisecond
 *          contention logging and wait-time measurement.
 * ───────────────────────────────────────────── */

#define _DEFAULT_SOURCE  /* gettimeofday(), usleep() */

#include "sync.h"
#include "logger.h"

#include <stdio.h>
#include <string.h>
#include <errno.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <sys/time.h>
#include <unistd.h>

/* ── Semaphore handles — used by process_manager and replacement ─ */
sem_t *sem_mem_lock        = NULL;
sem_t *sem_fault_requested = NULL;
sem_t *sem_fault_resolved  = NULL;

/* ── Internal helper ─────────────────────────────────────────── */

/*
 * open_semaphore(name, initial_value)
 *   Unlinks any stale semaphore with this name, then creates a fresh one.
 *   Returns the semaphore pointer, or NULL on failure.
 */
static sem_t *open_semaphore(const char *name, unsigned int initial_value) {
    /* Unlink first — silently ignore ENOENT (didn't exist) */
    if (sem_unlink(name) == -1 && errno != ENOENT) {
        log_event(MOD_ERROR, "sem_unlink(%s) failed: %s", name, strerror(errno));
    }

    sem_t *s = sem_open(name, O_CREAT | O_EXCL, 0666, initial_value);
    if (s == SEM_FAILED) {
        log_event(MOD_ERROR, "sem_open(%s) failed: %s", name, strerror(errno));
        return NULL;
    }

    log_event(MOD_SYNC, "Semaphore %-20s created (initial=%u)", name, initial_value);
    return s;
}

/* ── Public API ───────────────────────────────────────────────── */

int sync_init(void) {
    /*
     * /mem_lock — starts at 1 (binary semaphore, initially unlocked)
     * /fault_requested — starts at 0 (replacement thread waits until posted)
     * /fault_resolved  — starts at 0 (child waits until replacement posts)
     */
    sem_mem_lock = open_semaphore(SEM_MEM_LOCK, 1);
    if (!sem_mem_lock) return -1;

    sem_fault_requested = open_semaphore(SEM_FAULT_REQUESTED, 0);
    if (!sem_fault_requested) {
        sem_close(sem_mem_lock);
        sem_unlink(SEM_MEM_LOCK);
        return -1;
    }

    sem_fault_resolved = open_semaphore(SEM_FAULT_RESOLVED, 0);
    if (!sem_fault_resolved) {
        sem_close(sem_mem_lock);
        sem_unlink(SEM_MEM_LOCK);
        sem_close(sem_fault_requested);
        sem_unlink(SEM_FAULT_REQUESTED);
        return -1;
    }

    return 0;
}

void sync_destroy(void) {
    if (sem_mem_lock) {
        sem_close(sem_mem_lock);
        sem_unlink(SEM_MEM_LOCK);
        sem_mem_lock = NULL;
        log_event(MOD_SYNC, "Semaphore %s closed and unlinked", SEM_MEM_LOCK);
    }
    if (sem_fault_requested) {
        sem_close(sem_fault_requested);
        sem_unlink(SEM_FAULT_REQUESTED);
        sem_fault_requested = NULL;
        log_event(MOD_SYNC, "Semaphore %s closed and unlinked", SEM_FAULT_REQUESTED);
    }
    if (sem_fault_resolved) {
        sem_close(sem_fault_resolved);
        sem_unlink(SEM_FAULT_RESOLVED);
        sem_fault_resolved = NULL;
        log_event(MOD_SYNC, "Semaphore %s closed and unlinked", SEM_FAULT_RESOLVED);
    }
}

/* ───────────────────────────────────────────────────────────────────────────────
 * Phase 4: Contention-logging acquire/release wrappers
 * ─────────────────────────────────────────────────────────────────────────────── */

/* Returns current time as epoch milliseconds */
static long ms_now(void) {
    struct timeval tv;
    gettimeofday(&tv, NULL);
    return (long)tv.tv_sec * 1000L + (long)tv.tv_usec / 1000L;
}

/*
 * mem_lock_acquire(caller)
 *   Tries sem_trywait first. If the lock is already held, logs that
 *   the caller is contending, then falls back to blocking sem_wait.
 *   Logs how long the wait took once the lock is acquired.
 */
void mem_lock_acquire(const char *caller) {
    if (!sem_mem_lock) return;

    long t_start = ms_now();

    /*
     * sem_trywait: non-blocking. Returns 0 on immediate success,
     * -1/EAGAIN if already locked by another process.
     */
    if (sem_trywait(sem_mem_lock) == 0) {
        /* Acquired immediately — no contention */
        return;
    }

    /* Lock is held by someone else — log contention and block */
    log_event(MOD_SYNC, "%s waiting for %s...", caller, SEM_MEM_LOCK);
    sem_wait(sem_mem_lock);

    long wait_ms = ms_now() - t_start;
    log_event(MOD_SYNC, "%s acquired %s (waited %ldms)",
              caller, SEM_MEM_LOCK, wait_ms);
}

/*
 * mem_lock_release(caller, held_ms)
 *   Releases /mem_lock and logs how long it was held.
 *   `held_since` should be the ms_now() value captured just after acquire.
 */
void mem_lock_release(const char *caller, long held_since) {
    if (!sem_mem_lock) return;
    long held_ms = ms_now() - held_since;
    sem_post(sem_mem_lock);
    if (held_ms > 0) {
        log_event(MOD_SYNC, "%s released %s (held %ldms)",
                  caller, SEM_MEM_LOCK, held_ms);
    }
}

/* ─ Fault semaphore wrappers (used by Phase 5 replacement handshake) ─ */

/*
 * fault_signal() — called by child when it hits a page fault.
 * Posts /fault_requested to wake the replacement thread.
 * Child must have already released /mem_lock before calling this.
 */
void fault_signal(void) {
    if (sem_fault_requested) sem_post(sem_fault_requested);
}

/*
 * fault_wait() — called by child after posting fault_requested.
 * Blocks until replacement thread posts /fault_resolved.
 */
void fault_wait(void) {
    if (sem_fault_resolved) sem_wait(sem_fault_resolved);
}

/*
 * fault_listen() — called by replacement thread at start of its loop.
 * Blocks until a child posts /fault_requested.
 */
void fault_listen(void) {
    if (sem_fault_requested) sem_wait(sem_fault_requested);
}

/*
 * fault_resolve() — called by replacement thread after evicting a frame.
 * Posts /fault_resolved to wake the waiting child.
 */
void fault_resolve(void) {
    if (sem_fault_resolved) sem_post(sem_fault_resolved);
}
