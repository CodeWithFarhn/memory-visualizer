#define _POSIX_C_SOURCE 200809L   /* expose fileno(), mkfifo(), strtok_r() */

/* ─────────────────────────────────────────────
 * command_handler.c — Memory Allocation Visualizer
 *
 * Reads commands from two sources simultaneously:
 *   - stdin (interactive CLI)
 *   - /tmp/mem_pipe (named pipe from Python bridge)
 *
 * Uses select() to multiplex without busy-waiting.
 * Dispatches parsed commands to module handlers.
 * At Phase 1, handlers are stubs that log receipt.
 * ───────────────────────────────────────────── */

#include "command_handler.h"
#include "logger.h"
#include "memory.h"
#include "process.h"

/* Forward declarations for shared_memory.c functions used by dispatcher */
extern void shm_print_status(void);
extern void shm_reinit(int frame_count);
extern SharedMemory *shm;

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>
#include <unistd.h>
#include <fcntl.h>
#include <sys/stat.h>
#include <sys/select.h>
#include <errno.h>

/* ── Internal: pipe fd (set by init, used by run) ───────────── */
static int cmd_pipe_fd = -1;

/* ── Internal: prompt ────────────────────────────────────────── */
static void print_prompt(void) {
    printf("\033[96m>\033[0m ");
    fflush(stdout);
}

/* ── Internal: strip leading/trailing whitespace in-place ────── */
static void trim(char *s) {
    /* Left trim */
    char *p = s;
    while (*p && isspace((unsigned char)*p)) p++;
    if (p != s) memmove(s, p, strlen(p) + 1);
    /* Right trim */
    size_t len = strlen(s);
    while (len > 0 && isspace((unsigned char)s[len - 1])) {
        s[--len] = '\0';
    }
}

/* ── Public: init ────────────────────────────────────────────── */
int command_handler_init(void) {
    /* Create command pipe if it doesn't already exist */
    if (mkfifo(CMD_PIPE_PATH, 0666) == -1 && errno != EEXIST) {
        log_event(MOD_ERROR, "mkfifo(%s) failed: %s", CMD_PIPE_PATH, strerror(errno));
        return -1;
    }

    /* Create state pipe if it doesn't already exist */
    if (mkfifo(STATE_PIPE_PATH, 0666) == -1 && errno != EEXIST) {
        log_event(MOD_ERROR, "mkfifo(%s) failed: %s", STATE_PIPE_PATH, strerror(errno));
        return -1;
    }

    log_event(MOD_SYSTEM, "Named pipe %s ready", CMD_PIPE_PATH);
    log_event(MOD_SYSTEM, "State pipe %s ready", STATE_PIPE_PATH);

    /*
     * Open the command pipe in non-blocking read mode.
     * Without O_NONBLOCK, open() blocks until a writer appears.
     * We open non-blocking so the manager starts immediately;
     * select() will still block correctly until data arrives.
     */
    cmd_pipe_fd = open(CMD_PIPE_PATH, O_RDONLY | O_NONBLOCK);
    if (cmd_pipe_fd == -1) {
        log_event(MOD_ERROR, "open(%s) failed: %s", CMD_PIPE_PATH, strerror(errno));
        return -1;
    }

    return cmd_pipe_fd;
}

/* ── Public: parse ───────────────────────────────────────────── */
int parse_command(const char *line, Command *cmd) {
    if (!line || !cmd) return 0;

    /* Work on a local copy so we can strtok safely */
    char buf[512];
    strncpy(buf, line, sizeof(buf) - 1);
    buf[sizeof(buf) - 1] = '\0';
    trim(buf);

    if (buf[0] == '\0') return 0;  /* empty line */

    memset(cmd, 0, sizeof(Command));
    cmd->type = CMD_UNKNOWN;

    char *token = strtok(buf, " \t");
    if (!token) return 0;

    /* Match command verb */
    if      (strcmp(token, "add")      == 0) cmd->type = CMD_ADD;
    else if (strcmp(token, "kill")     == 0) cmd->type = CMD_KILL;
    else if (strcmp(token, "status")   == 0) cmd->type = CMD_STATUS;
    else if (strcmp(token, "algo")     == 0) cmd->type = CMD_ALGO;
    else if (strcmp(token, "refs")     == 0) cmd->type = CMD_REFS;
    else if (strcmp(token, "frames")   == 0) cmd->type = CMD_FRAMES;
    else if (strcmp(token, "scenario") == 0) cmd->type = CMD_SCENARIO;
    else if (strcmp(token, "reset")    == 0) cmd->type = CMD_RESET;
    else if (strcmp(token, "exit")     == 0) cmd->type = CMD_EXIT;

    /* Parse arguments depending on command type */
    switch (cmd->type) {
        case CMD_ADD: {
            /* add <name> <pages> */
            char *name  = strtok(NULL, " \t");
            char *pages = strtok(NULL, " \t");
            if (name)  strncpy(cmd->arg1, name, sizeof(cmd->arg1) - 1);
            if (pages) cmd->arg2 = atoi(pages);
            break;
        }
        case CMD_KILL: {
            /* kill <name> */
            char *name = strtok(NULL, " \t");
            if (name) strncpy(cmd->arg1, name, sizeof(cmd->arg1) - 1);
            break;
        }
        case CMD_ALGO: {
            /* algo <fifo|lru|opt> */
            char *algo = strtok(NULL, " \t");
            if (algo) strncpy(cmd->arg1, algo, sizeof(cmd->arg1) - 1);
            break;
        }
        case CMD_REFS: {
            /* refs <name> <p0> <p1> <p2> ... */
            char *name = strtok(NULL, " \t");
            if (name) strncpy(cmd->arg1, name, sizeof(cmd->arg1) - 1);
            char *page;
            while ((page = strtok(NULL, " \t")) != NULL && cmd->ref_count < 64) {
                cmd->refs[cmd->ref_count++] = atoi(page);
            }
            break;
        }
        case CMD_FRAMES: {
            /* frames <N> */
            char *n = strtok(NULL, " \t");
            if (n) cmd->arg2 = atoi(n);
            break;
        }
        case CMD_SCENARIO: {
            /* scenario <N> */
            char *n = strtok(NULL, " \t");
            if (n) cmd->arg2 = atoi(n);
            break;
        }
        default:
            if (cmd->type == CMD_UNKNOWN) {
                /* Store the unrecognised verb so we can log it */
                strncpy(cmd->arg1, token, sizeof(cmd->arg1) - 1);
            }
            break;
    }

    return 1;
}

/* ── Public: dispatch ────────────────────────────────────────── */

/*
 * Weak stub handlers — these will be replaced by real implementations
 * as each phase is added. They log receipt and do nothing else.
 *
 * Returns 1 to continue the command loop, 0 to exit.
 */
int dispatch_command(const Command *cmd) {
    switch (cmd->type) {

        case CMD_ADD:
            if (cmd->arg1[0] == '\0' || cmd->arg2 < 1) {
                log_event(MOD_ERROR, "Usage: add <name> <pages>  (e.g. add P1 3)");
            } else {
                log_event(MOD_CMD, "add %s %d", cmd->arg1, cmd->arg2);
                process_add(cmd->arg1, cmd->arg2);
            }
            break;

        case CMD_KILL:
            if (cmd->arg1[0] == '\0') {
                log_event(MOD_ERROR, "Usage: kill <name>  (e.g. kill P1)");
            } else {
                log_event(MOD_CMD, "kill %s", cmd->arg1);
                process_kill(cmd->arg1);
            }
            break;

        case CMD_STATUS:
            log_event(MOD_CMD, "status");
            shm_print_status();
            break;

        case CMD_ALGO:
            if (strcmp(cmd->arg1, "fifo") != 0 &&
                strcmp(cmd->arg1, "lru")  != 0 &&
                strcmp(cmd->arg1, "opt")  != 0) {
                log_event(MOD_ERROR, "algo must be 'fifo', 'lru', or 'opt'");
            } else {
                log_event(MOD_CMD, "algo %s", cmd->arg1);
                if (shm) {
                    strncpy(shm->algorithm, cmd->arg1, sizeof(shm->algorithm) - 1);
                    shm->algo_switch_flag = 1;
                    char json[128];
                    snprintf(json, sizeof(json), "{\"algorithm\":\"%s\"}", cmd->arg1);
                    emit_event("algo", json);
                }
            }
            break;

        case CMD_REFS:
            if (cmd->arg1[0] == '\0' || cmd->ref_count < 1) {
                log_event(MOD_ERROR, "Usage: refs <name> <ref1> <ref2> ... (e.g. refs P1 0 1 2 0)");
            } else {
                log_event(MOD_CMD, "refs %s [%d pages]", cmd->arg1, cmd->ref_count);
                process_set_refs(cmd->arg1, (int*)cmd->refs, cmd->ref_count);
            }
            break;

        case CMD_FRAMES:
            log_event(MOD_CMD, "frames %d", cmd->arg2);
            shm_reinit(cmd->arg2);
            break;

        case CMD_SCENARIO:
            log_event(MOD_CMD, "scenario %d — not yet implemented", cmd->arg2);
            break;

        case CMD_RESET:
            log_event(MOD_CMD, "reset — terminating all processes and clearing memory");
            process_kill_all();
            shm_reinit(shm ? shm->total_frames : 8);
            emit_event("reset", "{}");
            break;

        case CMD_EXIT:
            log_event(MOD_SYSTEM, "Exit command received — initiating shutdown");
            return 0;  /* signal the run loop to stop */

        case CMD_UNKNOWN:
        default:
            log_event(MOD_ERROR, "Unknown command: \"%s\" — type 'status' for help",
                      cmd->arg1);
            break;
    }

    return 1;  /* continue */
}

/* ── Public: run loop ────────────────────────────────────────── */
void command_handler_run(int pipe_fd) {
    char    buf[512];
    fd_set  read_fds;
    int     stdin_fd = fileno(stdin);
    int     maxfd    = (pipe_fd > stdin_fd ? pipe_fd : stdin_fd) + 1;
    Command cmd;

    log_event(MOD_SYSTEM, "Awaiting commands... (stdin or %s)", CMD_PIPE_PATH);
    print_prompt();

    while (1) {
        FD_ZERO(&read_fds);
        FD_SET(stdin_fd, &read_fds);
        FD_SET(pipe_fd,  &read_fds);

        int ready = select(maxfd, &read_fds, NULL, NULL, NULL);
        if (ready == -1) {
            if (errno == EINTR) continue;  /* interrupted by signal — retry */
            log_event(MOD_ERROR, "select() failed: %s", strerror(errno));
            break;
        }

        /* ── stdin input ── */
        if (FD_ISSET(stdin_fd, &read_fds)) {
            if (fgets(buf, sizeof(buf), stdin) == NULL) {
                /* EOF (Ctrl+D) */
                log_event(MOD_SYSTEM, "EOF on stdin — shutting down");
                break;
            }
            if (parse_command(buf, &cmd)) {
                if (!dispatch_command(&cmd)) break;
            }
            print_prompt();
        }

        /* ── named pipe input ── */
        if (FD_ISSET(pipe_fd, &read_fds)) {
            ssize_t n = read(pipe_fd, buf, sizeof(buf) - 1);
            if (n > 0) {
                buf[n] = '\0';
                /*
                 * The pipe may deliver multiple newline-separated commands
                 * in a single read. Process them one at a time.
                 */
                char *line = strtok(buf, "\n");
                while (line) {
                    log_event(MOD_CMD, "[pipe] %s", line);
                    if (parse_command(line, &cmd)) {
                        if (!dispatch_command(&cmd)) goto done;
                    }
                    line = strtok(NULL, "\n");
                }
            } else if (n == 0 || (n == -1 && errno == EAGAIN)) {
                /*
                 * Pipe EOF (writer disconnected) or no data (EAGAIN).
                 * Re-open the pipe so the next writer can connect.
                 */
                close(pipe_fd);
                pipe_fd = open(CMD_PIPE_PATH, O_RDONLY | O_NONBLOCK);
                if (pipe_fd == -1) {
                    log_event(MOD_ERROR, "Re-open of %s failed: %s",
                              CMD_PIPE_PATH, strerror(errno));
                    break;
                }
                maxfd = (pipe_fd > stdin_fd ? pipe_fd : stdin_fd) + 1;
                cmd_pipe_fd = pipe_fd;
            }
        }
    }

done:
    return;
}

/* ── Public: close ───────────────────────────────────────────── */
void command_handler_close(int pipe_fd) {
    if (pipe_fd != -1) close(pipe_fd);
}
