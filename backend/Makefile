# ─────────────────────────────────────────────
# Makefile — Memory Allocation Visualizer Backend
# ─────────────────────────────────────────────

CC      = gcc
CFLAGS  = -Wall -Wextra -Wpedantic -std=c11 -g \
           -I./include
LDFLAGS = -lpthread -lrt

# Source files — add new .c files here as phases progress
SRCS = src/memory_manager.c \
       src/logger.c         \
       src/command_handler.c \
       src/shared_memory.c  \
       src/sync.c           \
       src/process_manager.c

# Phase 5+: replacement thread added
SRCS += src/replacement.c

OBJS    = $(SRCS:.c=.o)
TARGET  = memory_manager

.PHONY: all clean run

all: $(TARGET)

$(TARGET): $(OBJS)
	$(CC) $(CFLAGS) -o $@ $^ $(LDFLAGS)
	@echo "Build successful → ./$(TARGET)"

%.o: %.c
	$(CC) $(CFLAGS) -c $< -o $@

run: all
	./$(TARGET) 8 fifo

clean:
	rm -f $(OBJS) $(TARGET)
	@echo "Cleaned build artifacts"
