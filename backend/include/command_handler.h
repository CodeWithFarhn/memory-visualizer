#ifndef COMMAND_HANDLER_H
#define COMMAND_HANDLER_H

/* ─────────────────────────────────────────────
 * command_handler.h — Memory Allocation Visualizer
 *
 * Parses and dispatches commands arriving from
 * two sources simultaneously via select():
 *   - stdin (interactive CLI)
 *   - /tmp/mem_pipe (named pipe from Python bridge)
 * ───────────────────────────────────────────── */

#include "logger.h"  /* STATE_PIPE_PATH, log_event, emit_event */

/* Command pipe path (state pipe path lives in logger.h) */
#define CMD_PIPE_PATH "/tmp/mem_pipe"

/* Recognized command types */
typedef enum {
    CMD_ADD = 0,   /* add <name> <pages>          */
    CMD_KILL,      /* kill <name>                  */
    CMD_STATUS,    /* status                       */
    CMD_ALGO,      /* algo <fifo|lru|opt>          */
    CMD_REFS,      /* refs <name> <p0> <p1> ...    */
    CMD_FRAMES,    /* frames <N>                   */
    CMD_SCENARIO,  /* scenario <N>                 */
    CMD_RESET,     /* reset                        */
    CMD_EXIT,      /* exit                         */
    CMD_UNKNOWN    /* anything else — log and ignore */
} CommandType;

/* Parsed command struct — populated by parse_command() */
typedef struct {
    CommandType type;
    char        arg1[64];    /* process name or algorithm string or scenario N */
    int         arg2;        /* page count or frame count */
    int         refs[64];    /* reference string pages (for CMD_REFS) */
    int         ref_count;   /* number of refs parsed */
} Command;

/*
 * command_handler_init()
 *   Creates both named pipes if they don't exist.
 *   Opens CMD_PIPE_PATH in non-blocking read mode.
 *   Returns the pipe fd, or -1 on failure.
 */
int command_handler_init(void);

/*
 * command_handler_run(pipe_fd)
 *   Enters the main select() loop on stdin + pipe_fd.
 *   Blocks until input arrives on either source.
 *   Calls parse_command() then dispatch_command() on each line.
 *   Returns when CMD_EXIT is processed.
 */
void command_handler_run(int pipe_fd);

/*
 * parse_command(line, cmd)
 *   Parses a raw input line into a Command struct.
 *   Returns 1 on success, 0 if line is empty/whitespace.
 */
int parse_command(const char *line, Command *cmd);

/*
 * dispatch_command(cmd)
 *   Routes a parsed Command to the appropriate module handler.
 *   At Phase 1, most commands are stubs that log receipt.
 *   Returns 1 to continue the loop, 0 to exit.
 */
int dispatch_command(const Command *cmd);

/*
 * command_handler_close(pipe_fd)
 *   Closes the pipe fd. Called from cleanup().
 */
void command_handler_close(int pipe_fd);

#endif /* COMMAND_HANDLER_H */
