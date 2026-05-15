# Memory Allocation Visualizer - Project Report

## 1. Project Overview
The **Memory Allocation Visualizer** is a multi-tier application designed to simulate and visualize operating system memory management concepts, specifically demand paging, page replacement algorithms, and process memory contention. It provides a real-time, interactive interface to observe how multiple processes compete for a limited pool of physical frames.

## 2. System Architecture
The project follows a three-tier architecture:

### A. Backend (C)
- **Role**: Core simulation engine.
- **Technologies**: C11, System V Shared Memory, POSIX Semaphores, Pthreads.
- **Key Files**:
  - `memory_manager.c`: Entry point, initializes shared memory and manages the lifecycle.
  - `shared_memory.c`: Manages the frame pool and global statistics.
  - `process_manager.c`: Handles process creation (`fork()`) and simulates memory access loops.
  - `replacement.c`: Runs a dedicated background thread for page eviction logic.
  - `command_handler.c`: Dispatches commands received via named pipes or stdin.
  - `logger.c`: Handles structured logging and JSON event emission.
  - `sync.c`: Implements mutexes and condition variables via semaphores.

### B. Bridge (Python)
- **Role**: Event multiplexer and SSE server.
- **Technologies**: Python 3, Flask, Server-Sent Events (SSE).
- **Mechanism**: Reads newline-delimited JSON events from a Linux named pipe (`/tmp/mem_state_pipe`) and broadcasts them to all connected frontend clients via a persistent HTTP stream. It also provides a REST API for sending commands back to the backend.

### C. Frontend (React)
- **Role**: User interface and visualization.
- **Technologies**: React, Vite, TypeScript, Vanilla CSS.
- **Components**:
  - **Frame Grid**: Visual representation of physical RAM frames.
  - **Process List**: Live stats for running processes (PID, RSS, frames held).
  - **Log Feed**: Real-time system logs.
  - **Reference String**: Visualization of page access patterns.
  - **Learning Mode Narrator**: An interactive guided tutorial system that controls the simulation, highlights UI components with dynamic dimming overlays, and uses real-time state interpolation to explain OS concepts dynamically.

## 3. Key Technical Features Built

### Demand Paging Simulation
- Processes are simulated as independent children that access "virtual pages."
- Page hits and faults are detected by scanning the shared frame pool.
- Full synchronization is maintained via a global memory lock to prevent race conditions during frame allocation.

### Real-time Synchronization
- **SSE Streaming**: High-frequency updates ensure the UI reflects the simulation state with sub-100ms latency.
- **Robust Decoding**: The bridge includes logic to handle partial UTF-8 character reads, preventing stream crashes during high-traffic bursts.

### Page Replacement Logic
- Supports multiple algorithms (FIFO implemented as default).
- Features a dedicated **Replacement Thread** that acts as the "OS kernel," evicting victim pages when a fault occurs in a full memory environment.

### Process Interaction
- Dynamic process management: `add <name> <pages>`, `kill <pid>`, `status`.
- Automatic RSS tracking: Real resident set size is pulled from `/proc/[pid]/statm` for each simulated process.

### Interactive Learning Mode
- Features guided, step-by-step scenarios (e.g., Demand Paging, Thrashing) that automatically orchestrate backend commands.
- **Robust Event Matching**: The frontend handles asynchronous event mapping (buffering "spawn" vs "frame_update" events) to ensure reliable state transitions.
- **Dynamic Storytelling**: Narration text interpolates live simulation statistics (faults, hits, hit ratio) directly into the educational copy.
- **Focus Overlay**: A dynamic `backdrop-blur` dimming layer automatically isolates and highlights key statistics or memory frames during specific learning steps.
## 4. Operational Instructions

### Prerequisites
- Linux OS (for `fork`, `shared memory`, and `/proc` filesystem).
- `gcc`, `make`, `python3`, `node`.

### Build and Run
1. **Backend**:
   ```bash
   cd backend && make
   ./memory_manager
   ```
2. **Bridge**:
   ```bash
   cd bridge && source .venv/bin/activate && python3 bridge.py
   ```
3. **Frontend**:
   ```bash
   cd frontend && npm install && npm run dev
   ```

## 5. Current Project State
The system is fully functional. The backend successfully simulates multi-process memory contention, and the frontend provides a rich, real-time visualization of frame occupancy, page replacement events, and process statistics. The bridge layer is optimized for high-throughput event transmission.
