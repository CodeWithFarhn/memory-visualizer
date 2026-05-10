/* ─────────────────────────────────────────────
 * memory_manager.c — Memory Allocation Visualizer
 *
 * Main entry point. Phase 2 scope adds:
 *   - Shared memory segment (frame pool)
 *   - POSIX semaphore initialization
 *   - Full cleanup contract (shmctl + sem_unlink)
 * ───────────────────────────────────────────── */

#include "logger.h"
#include "command_handler.h"
#include "memory.h"
#include "sync.h"
#include "process.h"

/* shared_memory.c exports */
extern int  shm_init(int frame_count, const char *algorithm);
extern void shm_reinit(int frame_count);
extern void shm_print_status(void);
extern void shm_free_frames(const char *process_name);
extern int  shm_alloc_frame(const char *process_name, pid_t owner_pid, int page_number);
extern void shm_destroy(void);
/* replacement.c exports */
extern int  replacement_thread_init(void);
extern void replacement_thread_stop(void);

#include <stdio.h>
#include <stdlib.h>
#include <signal.h>
#include <string.h>
#include <unistd.h>

/* ── Defaults ────────────────────────────────────────────────── */
#define DEFAULT_FRAMES    8
#define DEFAULT_ALGO      "fifo"

/* ── Global state — will grow in later phases ────────────────── */
static int   g_frame_count = DEFAULT_FRAMES;
static char  g_algorithm[8];
static int   g_pipe_fd = -1;

/* ── Cleanup ─────────────────────────────────────────────────── */

/*
 * cleanup()
 * Called on clean exit and from the SIGINT handler.
 *
 * Phase 1: closes pipes and logger.
 * Phase 2+: will also detach/remove shared memory and unlink semaphores.
 */
static void cleanup(void) {
    log_event(MOD_SYSTEM, "Cleanup initiated...");

    /* Terminate all child processes before destroying shared memory */
    process_kill_all();

    /* Stop replacement thread */
    replacement_thread_stop();

    /* Destroy shared memory segment */
    shm_destroy();

    /* Close and unlink all three semaphores */
    sync_destroy();

    /* Close command pipe */
    command_handler_close(g_pipe_fd);

    /* Remove named pipes from filesystem */
    unlink(CMD_PIPE_PATH);
    unlink(STATE_PIPE_PATH);

    /* Close logger last (closes state pipe fd) */
    logger_close();
}

/* ── Signal handlers ─────────────────────────────────────────── */
static void sigint_handler(int sig) {
    (void)sig;
    printf("\n");
    log_event(MOD_SYSTEM, "SIGINT received — shutting down gracefully");
    cleanup();
    exit(0);
}

/* ── Usage ───────────────────────────────────────────────────── */
static void print_usage(const char *prog) {
    fprintf(stderr,
        "Usage: %s [frames] [algorithm]\n"
        "  frames    : number of physical frames (default: %d, max: 32)\n"
        "  algorithm : fifo | lru | opt              (default: %s)\n"
        "\nExample: %s 8 lru\n",
        prog, DEFAULT_FRAMES, DEFAULT_ALGO, prog
    );
}

/* ── Main ────────────────────────────────────────────────────── */
int main(int argc, char *argv[]) {
    /* ── Argument parsing ── */
    g_frame_count = DEFAULT_FRAMES;
    strncpy(g_algorithm, DEFAULT_ALGO, sizeof(g_algorithm) - 1);

    if (argc >= 2) {
        if (strcmp(argv[1], "--help") == 0 || strcmp(argv[1], "-h") == 0) {
            print_usage(argv[0]);
            return 0;
        }
        int n = atoi(argv[1]);
        if (n < 1 || n > 32) {
            fprintf(stderr, "Error: frames must be between 1 and 32\n");
            print_usage(argv[0]);
            return 1;
        }
        g_frame_count = n;
    }

    if (argc >= 3) {
        const char *algo = argv[2];
        if (strcmp(algo, "fifo") != 0 &&
            strcmp(algo, "lru")  != 0 &&
            strcmp(algo, "opt")  != 0) {
            fprintf(stderr, "Error: algorithm must be fifo, lru, or opt\n");
            print_usage(argv[0]);
            return 1;
        }
        strncpy(g_algorithm, algo, sizeof(g_algorithm) - 1);
    }

    /* ── Signal handlers ── */
    signal(SIGINT,  sigint_handler);
    signal(SIGPIPE, SIG_IGN);   /* ignore broken pipe — bridge may disconnect */

    /* ── Initialize named pipes ── */
    g_pipe_fd = command_handler_init();
    if (g_pipe_fd == -1) {
        fprintf(stderr, "Fatal: could not initialize command pipes\n");
        return 1;
    }

    /* ── Initialize logger (opens state pipe for writing) ── */
    logger_init();

    /* ── Startup banner ── */
    log_event(MOD_SYSTEM, "Memory Manager started — %d frames, algorithm: %s",
              g_frame_count, g_algorithm);
    log_event(MOD_SYSTEM, "PID: %d", getpid());

    emit_event("status", "{\"note\":\"system starting\","
                          "\"frames\":0,\"algorithm\":\"none\","
                          "\"fault_count\":0,\"hit_count\":0}");

    /* ── Initialize shared memory (frame pool) ── */
    if (shm_init(g_frame_count, g_algorithm) != 0) {
        fprintf(stderr, "Fatal: could not initialize shared memory\n");
        cleanup();
        return 1;
    }

    /* ── Initialize semaphores ── */
    if (sync_init() != 0) {
        fprintf(stderr, "Fatal: could not initialize semaphores\n");
        cleanup();
        return 1;
    }

    /* ── Initialize process manager (installs SIGCHLD handler) ── */
    process_manager_init();

    /* ── Phase 5: launch replacement thread ── */
    if (replacement_thread_init() != 0) {
        fprintf(stderr, "Fatal: could not launch replacement thread\n");
        cleanup();
        return 1;
    }

    /* ── Enter command loop ── */
    command_handler_run(g_pipe_fd);

    /* ── Clean exit (CMD_EXIT or stdin EOF) ── */
    cleanup();
    log_event(MOD_SYSTEM, "Shutdown complete. Goodbye.");
    return 0;
}
