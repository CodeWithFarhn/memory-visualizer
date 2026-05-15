# Frontend

This directory contains the React + TypeScript frontend for Memory Allocation Visualizer. It renders the live simulation state, sends commands to the bridge, and presents guided learning scenarios.

## Features

- Live frame grid
- Process list with kill controls
- Reference string visualization
- Real-time log feed
- Learning mode scenarios and annotations
- Algorithm selector for FIFO, LRU, and OPT

## Install

```bash
npm install
```

## Run

```bash
npm run dev
```

The dev server runs on `http://localhost:5000` and proxies backend-related requests to the bridge on port 5001.

## Build

```bash
npm run build
```

## Main Entry Points

- `src/main.tsx`: React bootstrap
- `src/App.tsx`: application layout and state wiring
- `src/hooks/useSSE.ts`: live backend event handling
- `src/hooks/useCommand.ts`: command submission
- `src/scenarios/index.ts`: learning mode scenarios

## Related Documentation

- [Root README](../README.md)
- [Project proposal](../docs/MemoryVisualizer_Proposal.md)
- [Project report](../docs/PROJECT_REPORT.md)
- [Technical report](../docs/tech_report.md)
