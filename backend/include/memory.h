#ifndef MEMORY_H
#define MEMORY_H

/* ─────────────────────────────────────────────
 * memory.h — Memory Allocation Visualizer
 *
 * Single source of truth for all shared memory
 * data structures. Every module that touches the
 * frame pool includes this header.
 *
 * Sizing rationale:
 *   MAX_FRAMES    32  — more than enough for any demo (typical: 4–16)
 *   MAX_PROCESSES 16  — students run 2–5 processes max
 *   MAX_REFS      64  — realistic reference string length for teaching
 * ───────────────────────────────────────────── */

#include <sys/types.h>  /* pid_t */

/* ── Limits ──────────────────────────────────────────────────── */
#define MAX_FRAMES    32
#define MAX_PROCESSES 16
#define MAX_REFS      64

/* ── Frame — one physical memory frame ───────────────────────── */
typedef struct {
    int   frame_id;
    int   occupied;        /* 0 = free, 1 = in use                     */
    pid_t owner_pid;       /* real Linux PID of the owning process      */
    char  process_name[8]; /* "P1", "P2", etc.                          */
    int   page_number;     /* which logical page is currently loaded    */
    long  last_used;       /* epoch-ms timestamp of last access — LRU   */
    int   load_order;      /* monotonic counter at allocation time—FIFO */
} Frame;

/* ── ProcessEntry — one simulated OS process ─────────────────── */
typedef struct {
    char  name[8];         /* "P1", "P2", etc.                          */
    pid_t pid;             /* real Linux PID assigned by fork()         */
    int   refs[MAX_REFS];  /* page reference string (set via `refs` cmd)*/
    int   ref_count;       /* number of entries in refs[]               */
    int   ref_index;       /* current position in the reference loop    */
    int   page_count;      /* number of pages this process requested    */
    int   active;          /* 1 = running, 0 = terminated / slot free   */
} ProcessEntry;

/* ── SharedMemory — the entire shared segment ────────────────── */
typedef struct {
    Frame        frames[MAX_FRAMES];
    ProcessEntry processes[MAX_PROCESSES];
    int          total_frames;      /* configured frame count           */
    int          free_frames;       /* currently unoccupied frames      */
    int          fault_count;       /* cumulative page faults           */
    int          hit_count;         /* cumulative page hits             */
    char         algorithm[8];      /* "fifo", "lru", or "opt"          */
    int          algo_switch_flag;  /* set to 1 when algo changes mid-run*/
    int          load_counter;      /* monotonically increases on alloc — FIFO*/
} SharedMemory;

#endif /* MEMORY_H */
