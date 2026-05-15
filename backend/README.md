# Backend

This directory contains the C11 backend for Memory Allocation Visualizer. It is the simulation engine responsible for shared memory, process creation, synchronization, logging, and replacement policy execution.

## What It Does

- Creates simulated processes with `fork()`.
- Manages the frame pool in shared memory.
- Coordinates access with named POSIX semaphores.
- Handles process lifecycle events and cleanup.
- Runs FIFO, LRU, and OPT replacement logic.
- Writes structured state events to `/tmp/mem_state_pipe`.

## Build

```bash
make
```

This creates the `memory_manager` binary in this directory.

## Run

The backend is normally launched by the bridge, but it can also be started directly for terminal-only use:

```bash
./memory_manager 8 fifo
```

The default runtime expects Linux and a working IPC environment.

## Runtime Notes

- Shared memory limits are defined in `include/memory.h`.
- Semaphore names are defined in `include/sync.h`.
- Logging and JSON event emission are implemented in `src/logger.c`.
- The command loop reads from stdin and the named pipe `/tmp/mem_pipe`.

## Source Map

- `src/memory_manager.c`: main entry point and startup sequence
- `src/command_handler.c`: command parsing and dispatch
- `src/process_manager.c`: process lifecycle and `/proc` inspection
- `src/shared_memory.c`: frame pool and shared state
- `src/replacement.c`: page replacement thread
- `src/sync.c`: semaphore management
- `src/logger.c`: terminal logging and JSON event emission

## Related Documentation

- [Project proposal](../docs/MemoryVisualizer_Proposal.md)
- [Project report](../docs/PROJECT_REPORT.md)
- [Technical report](../docs/tech_report.md)
