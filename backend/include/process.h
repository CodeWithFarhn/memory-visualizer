#ifndef PROCESS_H
#define PROCESS_H

/* ─────────────────────────────────────────────
 * process.h — Memory Allocation Visualizer
 *
 * Process lifecycle management.
 * Uses fork() to create real Linux child processes
 * that simulate OS processes accessing memory.
 *
 * Linux concepts: fork(), SIGTERM, SIGCHLD, waitpid(),
 *                 /proc/[pid]/statm
 * ───────────────────────────────────────────── */

#include <sys/types.h>  /* pid_t */

/*
 * process_manager_init()
 *   Installs the SIGCHLD handler in the parent.
 *   Called once from memory_manager main() before entering the command loop.
 */
void process_manager_init(void);

/*
 * process_add(name, page_count)
 *   Forks a new child process simulating an OS process named `name`
 *   that needs `page_count` pages of memory.
 *
 *   Parent: registers the child in shm->processes[], logs PID.
 *   Child:  enters the page-reference loop until SIGTERM.
 *
 *   Returns the child PID on success, -1 on failure.
 *   Single-process testing only in Phase 3 (full concurrency in Phase 4).
 */
pid_t process_add(const char *name, int page_count);

/*
 * process_kill(name)
 *   Sends SIGTERM to the child process named `name`.
 *   The child catches the signal, releases its frames, and exits.
 *   The parent's SIGCHLD handler reaps the child.
 */
void process_kill(const char *name);

/*
 * process_kill_all()
 *   Sends SIGTERM to every active child process.
 *   Called from cleanup() before shared memory is destroyed.
 */
void process_kill_all(void);

/*
 * process_find_pid(name)
 *   Looks up the PID of a named process in shm->processes[].
 *   Returns the PID, or -1 if not found / not active.
 */
pid_t process_find_pid(const char *name);

/*
 * process_set_refs(name, refs, count)
 *   Pre-populates the reference string for a process before it is added.
 *   Finds a free slot, sets the name and refs array, and marks it active
 *   (but with PID 0). When `process_add` is later called with the same name,
 *   it will use this pre-populated slot instead of a new one.
 */
void process_set_refs(const char *name, int *refs, int count);

#endif /* PROCESS_H */
