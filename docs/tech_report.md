# Memory Allocation Visualizer: Technical Project Report

## 1. Project Overview
The **Memory Allocation Visualizer** is a sophisticated educational tool designed to demonstrate fundamental Operating System memory management concepts. It simulates a demand-paging environment where multiple concurrent processes compete for a limited pool of physical frames. The project emphasizes real-time feedback, interactive control, and algorithmic analysis.

---

## 2. System Architecture
The project utilizes a robust three-tier architecture to decouple high-performance simulation from user interaction.

### A. Core Simulation Engine (Backend - C)
*   **Role**: The "Kernel." It manages physical RAM, processes, and page replacement logic.
*   **Technologies**: C11, System V Shared Memory, POSIX Semaphores, Pthreads.
*   **Key Design Patterns**:
    *   **Shared Memory Segment**: A single source of truth for the entire simulation state (frame pool, process table, global stats).
    *   **Kernel Thread (Replacement Thread)**: A dedicated pthread that acts as the OS scheduler/memory manager, evicting pages when faults occur.
    *   **Semaphore Synchronization**: Uses `/mem_lock` (mutex) for atomic state updates and `/fault_requested` / `/fault_resolved` for process signaling.

### B. Communication Bridge (Python)
*   **Role**: The "Adapter." It bridges the gap between low-level Linux IPC and modern web protocols.
*   **Technologies**: Python 3, Flask, Server-Sent Events (SSE), Named Pipes.
*   **Key Responsibilities**:
    *   **Event Multiplexing**: Reads newline-delimited JSON from a named pipe and streams it to multiple frontend clients via SSE.
    *   **Command Proxy**: Provides a REST API to receive UI commands and write them to the backend's command pipe.
    *   **Robust Streaming**: Implements buffering logic to handle partial UTF-8 character reads during high-frequency bursts.

### C. Interactive Dashboard (Frontend - React)
*   **Role**: The "UI." Provides a rich, visual representation of the simulation.
*   **Technologies**: React, TypeScript, Vite, Vanilla CSS/Tailwind.
*   **Design Philosophy**:
    *   **High Reactivity**: Sub-100ms latency from backend event to UI update.
    *   **Educational Context**: Features a "Learning Mode" with contextual annotations.

---

## 3. Feature Breakdown

### 🛠️ Core Simulation Features
*   **Demand Paging Simulation**: Real processes (forked) access virtual memory pages, triggering page faults when pages aren't resident in frames.
*   **Multi-Process Contention**: Supports up to 16 concurrent processes competing for a shared frame pool (up to 32 frames).
*   **RSS Tracking**: Real-time tracking of Resident Set Size using `/proc/[pid]/statm` for simulated processes.

### 🧠 Page Replacement Algorithms
The system supports three primary algorithms, selectable in real-time:
1.  **FIFO (First-In, First-Out)**: Simplest approach; evicts the oldest frame based on allocation order.
2.  **LRU (Least Recently Used)**: Evicts the frame not accessed for the longest time, using millisecond-precision timestamps.
3.  **OPT (Optimal)**: A "look-ahead" algorithm that analyzes the process's reference string to evict the page used farthest in the future (demonstrates the theoretical limit).

### 📊 Visualization & Analysis
*   **Physical Memory Grid**: A dynamic grid showing frame status, owner, and page number with occupancy animations.
*   **Reference String Viewer**: Visualizes the page access sequence for every process, marking hits (green) and faults (red).
*   **Real-time Statistics**: Live calculation of Hit Ratio, Fault Count, and RAM utilization.
*   **Log Feed**: A structured audit trail of all system events (allocations, evictions, process kills).

### 🎓 Educational Features
*   **Learning Mode**: Pre-configured scenarios that guide users through complex concepts like **Belady's Anomaly** (where increasing frames can lead to more faults in FIFO) and **Thrashing**.
*   **Event Annotations**: Tooltips that explain *why* the system took a specific action (e.g., "Frame 4 was evicted because it was the oldest frame in the pool").
*   **Built-in Scenarios**:
    *   **Empty Memory**: Initial state demonstration.
    *   **Enough Free Memory**: Basic demand paging without eviction.
    *   **Memory Becomes Full**: Observation of capacity limits.
    *   **Page Fault and Replacement**: Eviction logic in action.
    *   **FIFO vs LRU Comparison**: Direct comparison of algorithmic behavior.
    *   **Thrashing**: Demonstration of system collapse under high contention.

### ⌨️ Interactive CLI Commands
The system features a custom terminal interface supporting the following commands:
*   `add <name> <pages>`: Spawns a new process with a specific virtual page count.
*   `kill <name>`: Terminates a process and releases its frames.
*   `frames <count>`: Resizes the physical frame pool dynamically.
*   `algo <fifo|lru|opt>`: Switches the replacement algorithm on-the-fly.
*   `reset`: Clears all state and restarts the simulation.
*   `status`: Prints a detailed dump of the current memory state to the backend terminal.

---

## 4. Technical Implementation Details

### Data Flow Pipeline
1.  **Input**: User types a command in the UI (e.g., `add P1 5`).
2.  **Request**: Frontend sends POST to Bridge.
3.  **Relay**: Bridge writes `add P1 5\n` to `/tmp/mem_pipe`.
4.  **Backend Processing**: `command_handler.c` reads the pipe, forks a child process.
5.  **Simulation**: Child process accesses a page -> triggers `shm_alloc_frame`.
6.  **State Update**: Backend updates shared memory and writes JSON event to `/tmp/mem_state_pipe`.
7.  **Broadcast**: Bridge reads pipe, sends SSE message to Frontend.
8.  **Render**: Frontend updates state and reflects changes in the UI.

### Synchronization Logic
To prevent race conditions (e.g., two processes trying to allocate the same free frame), a strict semaphore-based locking protocol is used:
```c
mem_lock_acquire("ProcessAccess");
// ... check/update frame pool ...
mem_lock_release("ProcessAccess", start_time);
```
The **Replacement Thread** sleeps on a semaphore and is only woken when a process encounters a fault in a full memory environment, ensuring efficient CPU usage.

---

## 5. Directory Structure
```text
.
├── backend/            # C Source Code
│   ├── include/        # Header files (Shared memory structs)
│   └── src/            # Implementation (Simulation, sync, logging)
├── bridge/             # Python Bridge
│   ├── bridge.py       # Flask SSE server
│   └── scenarios.py    # Educational scenario definitions
├── frontend/           # React Frontend
│   ├── src/components/ # UI Components (FrameGrid, ProcessList, etc.)
│   └── src/hooks/      # Custom React hooks (useSSE, useCommand)
└── docs/               # Project Documentation
```

---

## 6. Project Impact
This tool effectively bridges the gap between abstract OS theory and practical implementation. By providing a "God's eye view" of memory management, users can gain an intuitive understanding of how different algorithms perform under various workloads and why certain architectural decisions are made in modern operating systems.
