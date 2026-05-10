# Memory Allocation Visualizer
## Project Proposal — CSL320 Operating Systems Lab
**Bahria University, Department of Computer Science**

---

## 1. Project Overview

The Memory Allocation Visualizer is a Linux-native backend system with a web-based visualization layer built on top of it. The core principle is that the backend runs as a fully functional, self-demonstrating OS simulation — observable entirely through terminal logs — and the UI exists solely as a display client that reads from it.

The project demonstrates six key concepts from the CSL320 lab outline:
- Process creation via `fork()` system call
- Inter-process communication via shared memory (`shmget`, `shmat`)
- Synchronization via POSIX semaphores
- Multi-threading via `pthreads`
- Signal handling (`SIGTERM`, `SIGCHLD`)
- Real Linux memory inspection via the `/proc` filesystem

The UI visualizes the live state of the backend — frame allocation, page faults, replacement decisions, and process lifecycle — in real time.

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────┐
│              C Backend (Linux Process)               │
│                                                     │
│  ┌─────────────┐     ┌──────────────────────────┐  │
│  │   Command   │     │    Memory Manager        │  │
│  │   Handler   │────▶│    (Main Process)        │  │
│  │  (CLI/Pipe) │     └──────────┬───────────────┘  │
│  └─────────────┘                │                   │
│                        ┌────────┴────────┐          │
│                        │  Shared Memory  │          │
│                        │  (Frame Pool)   │          │
│                        └────────┬────────┘          │
│              ┌──────────────────┼───────────────┐   │
│              │                  │               │   │
│         ┌────▼───┐        ┌─────▼────┐   ┌─────▼──┐│
│         │ Child  │        │ Child    │   │Replace ││
│         │ Proc   │        │ Proc P2  │   │Thread  ││
│         │ P1     │        │ (fork()) │   │(pthread││
│         └────────┘        └──────────┘   └────────┘│
└────────────────────────────┬────────────────────────┘
                             │ Cmd Pipe (/tmp/mem_pipe)
                             │ Event Pipe (/tmp/mem_state_pipe)
                    ┌────────▼────────┐
                    │  Python Bridge  │
                    │  (Flask API)    │
                    │  + SSE Stream   │
                    └────────┬────────┘
                             │ HTTP / SSE
                    ┌────────▼────────┐
                    │   React UI      │
                    │  (Display Only) │
                    └─────────────────┘
```

**Key principle:** If the UI crashes or is never launched, the backend continues running and is fully observable through terminal logs. The UI adds no logic — it only renders what the backend reports.

---

## 3. Backend Design

### 3.1 Module Breakdown

#### `logger.c` — Logging System
The first module built. Every other module routes through it.

Produces color-coded, timestamped terminal output, and also writes real-time JSON state events to the `/tmp/mem_state_pipe` for the Python bridge to consume:
```
[12:04:01] [SYSTEM]   Memory Manager started — 8 frames, algorithm: FIFO
[12:04:03] [PROCESS]  fork() called → P1 created (PID 4821)
[12:04:03] [SYNC]     Semaphore acquired by PID 4821
[12:04:03] [MEMORY]   Frame 2 → P1, Page 0 allocated
[12:04:04] [REPLACE]  Page fault — Frame 5 evicted (FIFO), Page 3 loaded
[12:04:04] [PROC]     /proc/4821/statm → VmRSS: 1.2MB
```

Format: `[timestamp] [MODULE] message`
Modules: SYSTEM, PROCESS, MEMORY, SYNC, REPLACE, PROC, CMD

---

#### `shared_memory.c` — Frame Pool (Physical Memory)
Simulates physical RAM as a shared memory segment accessible by all child processes.

**Linux concepts used:** `shmget()`, `shmat()`, `shmdt()`, `shmctl()`

**Core data structure:**
```c
typedef struct {
    int    frame_id;
    int    occupied;       // 0 = free, 1 = used
    pid_t  owner_pid;
    char   process_name[8];
    int    page_number;
    long   last_used;      // timestamp for LRU
    int    load_order;     // for FIFO
} Frame;

typedef struct {
    char   name[8];
    pid_t  pid;
    int    refs[1024];     // MAX_REFS
    int    ref_count;
    int    ref_index;      // current position in string
    int    active;
} ProcessEntry;

typedef struct {
    Frame         frames[1024]; // MAX_FRAMES
    ProcessEntry  processes[256]; // MAX_PROCESSES
    int           total_frames;
    int           free_frames;
    int           fault_count;
    int           hit_count;
    char          algorithm[8];   // "FIFO", "LRU", "OPT"
    int           algo_switch_flag;
} SharedMemory;
```

The entire `SharedMemory` struct lives in the shared memory segment. Every child process and the replacement thread read and write to it — protected by semaphores.

---

#### `process_manager.c` — Process Lifecycle
Handles creation, management, and termination of simulated processes.

**Linux concepts used:** `fork()`, `SIGTERM`, `SIGCHLD`, `waitpid()`

**On "add process" command:**
```
Command received: add P1 3
    ↓
fork() called in memory_manager
    ↓
Parent: registers child PID, logs creation
    ↓
Child: enters page reference loop
    ↓
Child: requests frames via shared memory (semaphore-protected)
    ↓
Child: sleeps between accesses (simulates execution)
    ↓
Child: loops until SIGTERM received
```

**Child process behavior:**
The child process runs a loop generating page references. It reads its own reference string directly from the `ProcessEntry` array in the shared memory segment. When the parent receives a new reference string, it updates this entry atomically (setting `ref_count = 0` during the write). Each iteration it checks the frame pool, requests a frame if the page isn't loaded, and then sleeps. This simulates a process executing and accessing memory over time.

**On SIGTERM:** child process catches the signal, releases all its frames from shared memory, logs cleanup, and exits cleanly. Parent receives SIGCHLD and updates the process registry.

**`/proc` integration:** after fork, the parent reads `/proc/[child_pid]/statm` every few seconds and logs the real RSS alongside simulated stats:
```
[PROC] P1 (PID 4821) — Simulated: 3 frames (12KB) | Real RSS: 1.4MB
```

---

#### `sync.c` — Synchronization
Protects the shared memory frame pool from concurrent access.

**Linux concepts used:** POSIX semaphores (`sem_open`, `sem_wait`, `sem_post`, `sem_close`)

Three named semaphores are used:
1. `/mem_lock`: Guards all frame pool read/write operations. Any process wanting to allocate or release a frame must acquire this lock first.
2. `/fault_requested`: Wakes the replacement thread when a child process encounters a page fault.
3. `/fault_resolved`: Wakes the child process when the replacement thread has finished evicting a frame.

```
[SYNC] P2 (PID 4823) requesting semaphore...
[SYNC] P1 (PID 4821) holds lock — P2 blocked
[SYNC] P1 released lock (held 2ms)
[SYNC] P2 acquired lock
```

This makes synchronization visible. When multiple processes run simultaneously, the terminal shows real blocking and waiting — not simulated output.

---

#### `replacement.c` — Page Replacement Engine
Runs as a `pthread` inside the memory manager process. Wakes up on page fault events.

**Linux concepts used:** `pthread_create()`, `sem_wait()`, `sem_post()`

**Algorithms implemented (all in C):**

- **FIFO:** evicts the frame with the lowest `load_order` value
- **LRU:** evicts the frame with the oldest `last_used` timestamp
- **Optimal:** requires reference string upfront; looks ahead to evict the page used farthest in the future

The replacement thread uses a two-semaphore handshake with child processes. When a child process finds no free frames, it posts to `fault_requested` and waits on `fault_resolved`. **Crucially, the child releases the shared memory lock before waiting** to avoid a deadlock. The replacement thread wakes up, acquires the shared memory lock, selects a victim, evicts it, posts to `fault_resolved` to wake the child, and releases the lock.

```
[REPLACE] Page fault triggered by P2 (page 4)
[REPLACE] All 8 frames occupied
[REPLACE] Algorithm: LRU
[REPLACE] Candidate frames evaluated:
[REPLACE]   Frame 0 (P1,pg0) last_used=t-8 ← victim
[REPLACE]   Frame 3 (P2,pg1) last_used=t-2
[REPLACE] Frame 0 evicted → P2, Page 4 loaded
[REPLACE] Total faults: 5 | Hit ratio: 62%
```

Algorithm can be switched at runtime via command without restarting the system.

---

#### `command_handler.c` — Command Interface
Two input sources read simultaneously: CLI stdin and a named pipe.

**Linux concepts used:** `mkfifo()`, `select()` for multiplexing both inputs

**CLI commands:**
```
add P1 3           create process P1, needs 3 pages
kill P1            send SIGTERM to P1's child process
status             print full frame pool state
algo fifo          switch replacement algorithm (fifo/lru/opt)
refs P1 1 3 2 4    set P1's page reference string manually
frames 4           reinitialize pool with 4 frames
scenario 1         load a predefined learning scenario
reset              terminate all processes, clear memory
exit               shut down cleanly
```

**Command Named pipe** (`/tmp/mem_pipe`): the Python bridge writes the same commands here when they arrive from the UI. The backend cannot tell the difference between a CLI command and a UI command — they go through the same parser.

---

#### `memory_manager.c` — Main Entry Point
Ties all modules together. Startup sequence:

```
1. Parse arguments (frame count, default algorithm)
2. Initialize shared memory segment
3. Create named semaphore
4. Start replacement pthread
5. Create named pipe
6. Log system ready
7. Enter command loop (select() on stdin + pipe)
```

---

### 3.2 Python Bridge (`bridge.py`)

A minimal Flask application. Its only jobs are:

1. Receive HTTP requests from the UI and write commands to `/tmp/mem_pipe`
2. Block on `readline()` from a second named pipe (`/tmp/mem_state_pipe`) where the C backend pushes JSON state updates, and forward these directly to the UI via Server-Sent Events (SSE) immediately.
3. Parse `/proc/meminfo` and include real system memory in the SSE stream

The bridge contains zero memory management logic. It is a translator, not a system component.

**Endpoints:**
```
POST /command        → writes command to named pipe
GET  /stream         → SSE stream of memory state (JSON)
GET  /status         → single snapshot of current state
```

---

### 3.3 Inter-Component Communication Summary

| From | To | Method |
|---|---|---|
| CLI user | Backend | stdin |
| UI | Backend | HTTP POST → named pipe |
| Backend | Python bridge | Named pipe (`/tmp/mem_state_pipe`) |
| Python bridge | UI | SSE (JSON stream) |
| Parent process | Child process | SIGTERM |
| Child process | Parent | SIGCHLD |
| Child process | Replacement thread | Two POSIX semaphores (`fault_requested`, `fault_resolved`) |

---

## 4. Visualization Design

### 4.1 What the UI Renders

The UI has four panels arranged on a single screen:

**Panel A — Physical Memory Grid**
The centerpiece. A grid of frame blocks, one per frame. Each block displays its frame ID, owner process name, and page number. Color-coded by process (P1 = one color, P2 = another). Free frames are dim/grey. Animations: frame fills with color on allocation, flashes red briefly on eviction, fades to grey on release. The grid resizes dynamically based on total frame count.

**Panel B — Process Registry**
A live list of running processes. Each entry shows process name, real Linux PID (from fork), pages requested, frames currently held, and a small memory bar from `/proc/[pid]/statm`. Processes appear with a slide-in animation on creation, fade out on termination.

**Panel C — Reference String & Page Table**
Shows the active reference string as a horizontal sequence. A moving cursor highlights the current access. Below it, a step-by-step table (like the classic OS textbook diagram) fills in as accesses happen — hits marked green, faults marked red. Running fault count and hit ratio displayed below.

**Panel D — Live Log Feed**
A scrolling terminal-style panel mirroring the backend's terminal output verbatim. Color-coded by module tag. Makes it visually clear that the UI is watching a real running system.

**Top Bar — Real Memory Strip**
A thin bar showing actual system RAM from `/proc/meminfo` (total, used, free) updating every second. Small, unobtrusive — but connects the simulation to the real machine.

---

### 4.2 Two Modes

**Playground Mode (default)**
Full control. User adds processes, sets reference strings, switches algorithms, adjusts frame count, and watches everything respond live. No guided explanation — just the system running.

**Learning Mode**
User selects a scenario. The UI sends a predefined command sequence to the backend via the normal API, overlays an explanation panel beside the visualization, and steps through the scenario with contextual text at key moments. The backend runs identically — Learning Mode is just Playground Mode with predefined inputs and added text.

---

## 5. Learning Mode — Six Scenarios

Each scenario is a JSON config: a name, a description, a sequence of commands sent to the backend, and text annotations keyed to specific events.

---

**Scenario 1 — Empty Memory (Baseline)**
*Concept: what a frame is, what allocation means*

Starts with an empty frame pool. One process is added with a small page count. Frames fill in one by one. Annotation explains what each frame represents and what "allocation" means physically. No page faults occur.

---

**Scenario 2 — Enough Free Memory**
*Concept: normal allocation, demand paging, no replacement needed*

Two processes are added with moderate page counts that fit comfortably within the frame pool. Both run simultaneously. Annotation explains demand paging — pages are only loaded when accessed, not all at once. Frame grid fills gradually across both process colors.

---

**Scenario 3 — Memory Becomes Full**
*Concept: physical memory limits, what happens at capacity*

Frame pool is set small. Processes are added until every frame is occupied. When the next page reference arrives, the grid flashes and an alert appears: "No free frames available — replacement required." Leads naturally into Scenario 4.

---

**Scenario 4 — Page Fault and Replacement**
*Concept: page fault, the replacement decision, disk-to-memory loading*

Continues from full memory. A page fault occurs. The reference string panel highlights the missing page in red. The replacement thread selects a victim frame (logged in Panel D). The evicted frame flashes and clears, the new page loads. Annotation explains each step: what a fault is, why it's costly, how the victim is chosen.

---

**Scenario 5 — Algorithm Comparison**
*Concept: why algorithm choice matters, FIFO vs LRU performance difference*

The same reference string and frame count is run twice — once with FIFO, once with LRU. Both run side by side in split view. Fault counts update in real time. At the end, the annotation highlights where the two algorithms made different eviction decisions and which performed better. The backend switches algorithm between runs via the `algo` command.

---

**Scenario 6 — Thrashing**
*Concept: what happens when a process needs far more pages than available frames*

Frame pool set to 4. A process is added that needs 12 pages with a reference string that cycles through all of them. The replacement thread runs constantly — nearly every access is a fault. The fault counter climbs rapidly. The frame grid flashes continuously. Annotation appears: "The system spends more time swapping pages than executing. This is thrashing." Hit ratio drops visibly toward zero.

---

## 6. File Structure

```
memory-visualizer/
│
├── backend/
│   ├── src/
│   │   ├── memory_manager.c      ← main entry point
│   │   ├── shared_memory.c       ← frame pool, shmget/shmat
│   │   ├── process_manager.c     ← fork, SIGTERM, SIGCHLD
│   │   ├── replacement.c         ← pthread, FIFO/LRU/Optimal
│   │   ├── sync.c                ← POSIX semaphores
│   │   ├── command_handler.c     ← CLI + named pipe parser
│   │   └── logger.c              ← timestamped terminal output
│   │
│   ├── include/
│   │   ├── memory.h
│   │   ├── process.h
│   │   ├── sync.h
│   │   └── logger.h
│   │
│   └── Makefile
│
├── bridge/
│   ├── bridge.py                 ← Flask + SSE + pipe writer
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── components/
│   │   │   ├── FrameGrid.jsx
│   │   │   ├── ProcessList.jsx
│   │   │   ├── ReferenceViewer.jsx
│   │   │   ├── LogFeed.jsx
│   │   │   └── MemoryBar.jsx
│   │   └── scenarios/
│   │       ├── scenario1.json
│   │       ├── scenario2.json
│   │       ├── scenario3.json
│   │       ├── scenario4.json
│   │       ├── scenario5.json
│   │       └── scenario6.json
│   └── package.json
│
├── scripts/
│   ├── build.sh                  ← compiles backend
│   ├── run.sh                    ← starts backend + bridge
│   └── demo.sh                   ← runs scenario 4 from CLI
│
└── README.md
```

---

## 7. Development Phases

| Phase | What Gets Built | Testable Without UI? |
|---|---|---|
| 1 | Logger + command handler + CLI loop | ✅ Yes |
| 2 | Shared memory + frame pool initialization | ✅ Yes |
| 3 | Process manager (fork, signals, /proc) | ✅ Yes |
| 4 | Synchronization (semaphores) | ✅ Yes |
| 5 | Replacement thread (FIFO, LRU, Optimal) | ✅ Yes |
| 6 | Python bridge (pipe reader, SSE stream) | ✅ Yes (curl) |
| 7 | React UI (Frame grid, panels) | — |
| 8 | Learning mode scenarios | — |

Phases 1–5 produce a fully working, fully demonstrable terminal system. Phases 6–8 add the visualization layer.

---

## 8. Linux Concepts Demonstrated

| Concept | Lab Reference | Where Used |
|---|---|---|
| `fork()` system call | Lab 4, Week 3-4 | Process creation |
| Shared memory IPC | Lab 9, Week 6 | Frame pool |
| POSIX semaphores | Lab 9, Week 6 | Frame access synchronization |
| `pthreads` | Lab 8, Week 10 | Replacement algorithm thread |
| Signal handling | Week 7 | Process termination (SIGTERM/SIGCHLD) |
| Named pipes (FIFO) | Week 6 | UI-to-backend communication |
| `/proc` filesystem | — | Real process memory stats |
| `select()` system call | — | Multiplexing CLI + pipe input |
| Shell scripting | Lab 3-4 | Build and run automation |

---

## 9. What the Examiner Sees

Running `./run.sh` starts the backend. The terminal immediately begins logging:

```
[12:00:00] [SYSTEM]  Memory Manager initialized
[12:00:00] [MEMORY]  shmget() → segment 0x1234 created
[12:00:00] [MEMORY]  Frame pool ready: 8 frames
[12:00:00] [SYNC]    Semaphore /mem_lock created
[12:00:00] [REPLACE] Replacement thread started (algorithm: FIFO)
[12:00:00] [SYSTEM]  Named pipe /tmp/mem_pipe ready
[12:00:00] [SYSTEM]  Awaiting commands...

> add P1 3
[12:00:05] [CMD]     Received: add P1 3
[12:00:05] [PROCESS] fork() called → P1 (PID 4821) created
[12:00:05] [MEMORY]  Frame 0 → P1, Page 0
[12:00:05] [MEMORY]  Frame 1 → P1, Page 1
[12:00:05] [MEMORY]  Frame 2 → P1, Page 2
[12:00:05] [PROC]    /proc/4821/statm → VmRSS: 1.2MB

> add P2 7
[12:00:09] [CMD]     Received: add P2 7
[12:00:09] [PROCESS] fork() called → P2 (PID 4822) created
[12:00:09] [MEMORY]  Frames 3,4,5,6 → P2 (Pages 0-3)
[12:00:10] [REPLACE] Page fault — P2 needs Page 4, no free frames
[12:00:10] [REPLACE] FIFO victim: Frame 0 (P1, Page 0, loaded at t=0)
[12:00:10] [REPLACE] Frame 0 → P2, Page 4 | Faults: 1
[12:00:10] [SYNC]    Lock acquired/released in 1ms
```

The entire system is observable, explainable, and demonstrable without touching the browser.
