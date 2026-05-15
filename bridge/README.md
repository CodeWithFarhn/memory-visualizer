# Bridge

This directory contains the Python bridge that connects the backend simulation to the React frontend. It exposes a small HTTP API, streams backend events over SSE, and starts the backend process when launched.

## Responsibilities

- Start the backend binary.
- Forward frontend commands to the backend command pipe.
- Stream JSON state updates from `/tmp/mem_state_pipe` to the browser.
- Expose scenario endpoints for the learning mode UI.

## Environment Setup

Create and activate a virtual environment, then install dependencies:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run

```bash
python3 bridge.py
```

The bridge listens on `http://localhost:5001` and expects the backend binary at `../backend/memory_manager`.

## API Surface

### `POST /command`

Body:

```json
{ "command": "add P1 3" }
```

Forwards the command to `/tmp/mem_pipe`.

### `GET /stream`

Server-Sent Events stream containing backend state envelopes.

### `POST /scenario`

Body:

```json
{ "id": 1 }
```

Triggers one of the predefined learning scenarios.

## Runtime Notes

- The bridge uses `/tmp/mem_pipe` for commands.
- The bridge uses `/tmp/mem_state_pipe` for backend events.
- The backend is started with `8 fifo` by default.

## Related Documentation

- [Root README](../README.md)
- [Project proposal](../docs/MemoryVisualizer_Proposal.md)
- [Project report](../docs/PROJECT_REPORT.md)
- [Technical report](../docs/tech_report.md)
