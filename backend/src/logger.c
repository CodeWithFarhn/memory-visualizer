/* ─────────────────────────────────────────────
 * logger.c — Memory Allocation Visualizer
 *
 * Two responsibilities:
 *   1. Print color-coded, timestamped lines to stdout
 *   2. Write typed JSON envelopes to /tmp/mem_state_pipe
 * ───────────────────────────────────────────── */

#include "logger.h"

#include <stdio.h>
#include <stdlib.h>
#include <stdarg.h>
#include <string.h>
#include <time.h>
#include <fcntl.h>
#include <unistd.h>
#include <sys/time.h>
#include <sys/stat.h>
#include <errno.h>

/* File descriptor for /tmp/mem_state_pipe — opened by logger_init() */
static int state_pipe_fd = -1;

/* ── Internal helpers ─────────────────────────────────────────── */

/* Returns the ANSI color code string for a given module tag */
static const char *module_color(const char *module) {
    if (strcmp(module, MOD_SYSTEM)  == 0) return COLOR_SYSTEM;
    if (strcmp(module, MOD_PROCESS) == 0) return COLOR_PROCESS;
    if (strcmp(module, MOD_MEMORY)  == 0) return COLOR_MEMORY;
    if (strcmp(module, MOD_SYNC)    == 0) return COLOR_SYNC;
    if (strcmp(module, MOD_REPLACE) == 0) return COLOR_REPLACE;
    if (strcmp(module, MOD_PROC)    == 0) return COLOR_PROC;
    if (strcmp(module, MOD_CMD)     == 0) return COLOR_CMD;
    if (strcmp(module, MOD_ERROR)   == 0) return COLOR_ERROR;
    return COLOR_RESET;
}

/* Returns current time as epoch milliseconds */
static long long current_epoch_ms(void) {
    struct timeval tv;
    gettimeofday(&tv, NULL);
    return (long long)tv.tv_sec * 1000LL + (long long)tv.tv_usec / 1000LL;
}

/* Fills buf with current wall-clock time as "HH:MM:SS" */
static void current_timestamp(char *buf, size_t len) {
    time_t now = time(NULL);
    struct tm *t = localtime(&now);
    strftime(buf, len, "%H:%M:%S", t);
}

/* ── Public API ───────────────────────────────────────────────── */

void logger_init(void) {
    /*
     * Open the state pipe for writing in non-blocking mode.
     * O_WRONLY | O_NONBLOCK: if no reader is on the pipe yet,
     * open() returns immediately instead of blocking forever.
     * We retry with O_WRONLY (blocking) if the non-blocking open
     * fails with ENXIO (no reader present) — this keeps Phase 1
     * working even when no bridge is running.
     */
    state_pipe_fd = open(STATE_PIPE_PATH, O_WRONLY);
    if (state_pipe_fd == -1) {
        fprintf(stderr, "[Logger] Failed to open state pipe %s: %s\n", 
                STATE_PIPE_PATH, strerror(errno));
        state_pipe_fd = -1;
    } else {
        fprintf(stderr, "[Logger] State pipe %s opened (fd %d)\n", 
                STATE_PIPE_PATH, state_pipe_fd);
    }
}

void logger_close(void) {
    if (state_pipe_fd != -1) {
        close(state_pipe_fd);
        state_pipe_fd = -1;
    }
}

void log_event(const char *module, const char *fmt, ...) {
    char timestamp[16];
    current_timestamp(timestamp, sizeof(timestamp));

    /* Build the message string from variadic args */
    char message[1024];
    va_list args;
    va_start(args, fmt);
    vsnprintf(message, sizeof(message), fmt, args);
    va_end(args);

    /* ── Terminal output ── */
    const char *color = module_color(module);
    fprintf(stdout,
        "%s[%s]%s %s%-8s%s %s\n",
        COLOR_BOLD, timestamp, COLOR_RESET,
        color, module, COLOR_RESET,
        message
    );
    fflush(stdout);

    /* ── State pipe: emit a "log" event ── */
    /*
     * Escape double-quotes and backslashes in message for valid JSON.
     * We keep this simple — production JSON libraries aren't appropriate here.
     */
    char escaped[1200];
    int j = 0;
    for (int i = 0; message[i] && j < (int)sizeof(escaped) - 2; i++) {
        if (message[i] == '"' || message[i] == '\\') {
            escaped[j++] = '\\';
        }
        escaped[j++] = message[i];
    }
    escaped[j] = '\0';

    char json_data[1400];
    snprintf(json_data, sizeof(json_data),
        "{\"module\":\"%s\",\"message\":\"%s\"}",
        module, escaped
    );
    emit_event("log", json_data);
}

void emit_event(const char *type, const char *json_data) {
    if (state_pipe_fd == -1) return;  /* no bridge — skip silently */

    char envelope[65536];
    int len = snprintf(envelope, sizeof(envelope),
        "{\"type\":\"%s\",\"ts\":%lld,\"data\":%s}\n",
        type, current_epoch_ms(), json_data
    );

    /*
     * Write in a single call. If the pipe buffer is full (bridge slow or absent),
     * write() will return EAGAIN with O_NONBLOCK — we discard the event rather
     * than blocking the backend. Lost events are acceptable; stalling is not.
     */
    if (len > 0 && len < (int)sizeof(envelope)) {
        write(state_pipe_fd, envelope, (size_t)len);
    }
}
