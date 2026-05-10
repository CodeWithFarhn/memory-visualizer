#ifndef SYNC_H
#define SYNC_H

/* ─────────────────────────────────────────────
 * sync.h — Memory Allocation Visualizer
 *
 * Three named POSIX semaphores:
 *
 *   /mem_lock        — mutex guarding all frame pool read/write.
 *                      Initial value: 1  (binary semaphore)
 *
 *   /fault_requested — signals the replacement thread that a
 *                      child process hit a page fault and is
 *                      waiting for a frame to be freed.
 *                      Initial value: 0
 *
 *   /fault_resolved  — signals the child process that the
 *                      replacement thread has finished evicting
 *                      a frame and loaded its new page.
 *                      Initial value: 0
 *
 * Phase 2: init + destroy only.
 * Phase 4: full acquire/release wrappers with contention logging.
 * ───────────────────────────────────────────── */

#include <semaphore.h>

/* Semaphore name constants */
#define SEM_MEM_LOCK        "/mem_lock"
#define SEM_FAULT_REQUESTED "/fault_requested"
#define SEM_FAULT_RESOLVED  "/fault_resolved"

/*
 * sync_init()
 *   Creates (or resets) all three named semaphores.
 *   Calls sem_unlink first to clear any leftover state from a crashed run.
 *   Returns 0 on success, -1 on failure.
 */
int sync_init(void);

/*
 * sync_destroy()
 *   Closes and unlinks all three named semaphores.
 *   Called from cleanup() in memory_manager.c.
 */
void sync_destroy(void);

/* ── Phase 4: acquire/release wrappers with contention logging ── */

/*
 * mem_lock_acquire(caller)
 *   Acquires /mem_lock. Uses sem_trywait first; if contended, logs
 *   the wait and blocks. Caller is a descriptive string e.g. "P1".
 */
void mem_lock_acquire(const char *caller);

/*
 * mem_lock_release(caller, held_since)
 *   Releases /mem_lock. Logs hold time in milliseconds.
 *   Pass the ms_now() value captured right after acquire as held_since.
 */
void mem_lock_release(const char *caller, long held_since);

/* ── Fault semaphore wrappers (wired in Phase 5) ── */
void fault_signal(void);   /* child: post /fault_requested  */
void fault_wait(void);     /* child: wait /fault_resolved   */
void fault_listen(void);   /* replacement: wait /fault_requested */
void fault_resolve(void);  /* replacement: post /fault_resolved  */

/* Semaphore handles — used by process_manager.c and replacement.c */
extern sem_t *sem_mem_lock;
extern sem_t *sem_fault_requested;
extern sem_t *sem_fault_resolved;

#endif /* SYNC_H */
