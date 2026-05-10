#ifndef LOGGER_H
#define LOGGER_H

/* ─────────────────────────────────────────────
 * logger.h — Memory Allocation Visualizer
 *
 * Every module routes through here.
 * Two outputs:
 *   1. Color-coded timestamped terminal lines
 *   2. Typed JSON envelopes → /tmp/mem_state_pipe
 * ───────────────────────────────────────────── */

/* Pipe paths — defined here so logger.c is self-contained */
#define STATE_PIPE_PATH "/tmp/mem_state_pipe"

/* Module tag strings — used as the bracket label in terminal output */
#define MOD_SYSTEM   "SYSTEM"
#define MOD_PROCESS  "PROCESS"
#define MOD_MEMORY   "MEMORY"
#define MOD_SYNC     "SYNC"
#define MOD_REPLACE  "REPLACE"
#define MOD_PROC     "PROC"
#define MOD_CMD      "CMD"
#define MOD_ERROR    "ERROR"

/* ANSI color codes */
#define COLOR_RESET   "\033[0m"
#define COLOR_BOLD    "\033[1m"
#define COLOR_SYSTEM  "\033[36m"   /* cyan       — SYSTEM  */
#define COLOR_PROCESS "\033[32m"   /* green      — PROCESS */
#define COLOR_MEMORY  "\033[34m"   /* blue       — MEMORY  */
#define COLOR_SYNC    "\033[35m"   /* magenta    — SYNC    */
#define COLOR_REPLACE "\033[33m"   /* yellow     — REPLACE */
#define COLOR_PROC    "\033[37m"   /* white      — PROC    */
#define COLOR_CMD     "\033[96m"   /* light cyan — CMD     */
#define COLOR_ERROR   "\033[31m"   /* red        — ERROR   */

/*
 * log_event(module, message)
 *   Prints a color-coded, timestamped line to stdout:
 *     [HH:MM:SS] [MODULE]  message
 *   Also writes a {"type":"log", ...} JSON envelope to the state pipe.
 */
void log_event(const char *module, const char *fmt, ...);

/*
 * emit_event(type, json_data)
 *   Writes a fully-formed typed JSON envelope to /tmp/mem_state_pipe.
 *   Format: {"type":"<type>","ts":<epoch_ms>,"data":<json_data>}\n
 *
 *   json_data must be a valid JSON object string, e.g. "{\"frame_id\":0}"
 *   Pass "{}" if there is no payload.
 */
void emit_event(const char *type, const char *json_data);

/*
 * logger_init()
 *   Opens /tmp/mem_state_pipe for writing (non-blocking).
 *   Called once from memory_manager main() after the pipe is created.
 */
void logger_init(void);

/*
 * logger_close()
 *   Closes the state pipe file descriptor.
 *   Called from cleanup().
 */
void logger_close(void);

#endif /* LOGGER_H */
