#!/usr/bin/env python3
"""
bridge.py — Memory Allocation Visualizer Bridge

Acts as the middleman between the C backend (named pipes) and the Vite/React
frontend (Server-Sent Events & HTTP API).

Responsibilities:
1. Spawns and manages the C backend process (`memory_manager`).
2. Reads the /tmp/mem_state_pipe non-blocking and streams JSON to SSE clients.
3. Provides a REST API to accept commands and writes them to /tmp/mem_pipe.
4. Manages preset scenarios.
"""

import os
import sys
import time
import json
import fcntl
import signal
import subprocess
from flask import Flask, Response, request, jsonify
from flask_cors import CORS

# Configuration
BACKEND_BIN = "../backend/memory_manager"
CMD_PIPE = "/tmp/mem_pipe"
STATE_PIPE = "/tmp/mem_state_pipe"

app = Flask(__name__)
CORS(app)

backend_proc = None
state_pipe_fd = None

# --- Process Management ---


def cleanup(signum=None, frame=None):
    """Cleanly shut down the backend and close pipes."""
    print("\n[Bridge] Shutting down...")
    if state_pipe_fd is not None:
        try:
            os.close(state_pipe_fd)
        except OSError:
            pass

    if backend_proc is not None:
        print(f"[Bridge] Terminating backend (PID {backend_proc.pid})...")
        try:
            # Send exit command gracefully if possible
            if os.path.exists(CMD_PIPE):
                with open(CMD_PIPE, "w") as f:
                    f.write("exit\n")
            time.sleep(0.5)
            if backend_proc.poll() is None:
                backend_proc.terminate()
                backend_proc.wait(timeout=2)
        except Exception as e:
            print(f"[Bridge] Error terminating backend: {e}")
            if backend_proc.poll() is None:
                backend_proc.kill()
    sys.exit(0)


signal.signal(signal.SIGINT, cleanup)
signal.signal(signal.SIGTERM, cleanup)


def start_backend():
    """Start the C backend process."""
    global backend_proc
    if not os.path.exists(BACKEND_BIN):
        print(f"[Bridge] Error: Backend binary not found at {BACKEND_BIN}")
        print("[Bridge] Please compile the backend first (cd ../backend && make)")
        sys.exit(1)

    print(f"[Bridge] Starting backend: {BACKEND_BIN} 8 fifo")
    # We must pipe stdin, otherwise the C backend receives EOF immediately
    # from the shell and shuts down thinking it's interactive exit.
    backend_proc = subprocess.Popen(
        [BACKEND_BIN, "8", "fifo"],
        stdin=subprocess.PIPE
    )
    time.sleep(0.5)  # Give it time to create the pipes

    if backend_proc.poll() is not None:
        print("[Bridge] Error: Backend failed to start.")
        sys.exit(1)


def open_state_pipe():
    """Open the state pipe for non-blocking reads."""
    global state_pipe_fd
    if not os.path.exists(STATE_PIPE):
        print(f"[Bridge] Waiting for state pipe: {STATE_PIPE}")
        for _ in range(10):
            if os.path.exists(STATE_PIPE):
                break
            time.sleep(0.5)

    if not os.path.exists(STATE_PIPE):
        print("[Bridge] Error: State pipe never created by backend.")
        cleanup()

    try:
        # Open in non-blocking mode
        state_pipe_fd = os.open(STATE_PIPE, os.O_RDONLY | os.O_NONBLOCK)
        print(f"[Bridge] State pipe opened (fd {state_pipe_fd})")
    except OSError as e:
        print(f"[Bridge] Failed to open state pipe: {e}")
        cleanup()

# --- Server-Sent Events (SSE) Generator ---


def sse_stream():
    """Generator that yields JSON events as SSE messages."""
    raw_buffer = b""
    # Send an initial connect event
    yield f"data: {json.dumps({'type': 'bridge_connect', 'data': {}})}\n\n"

    while True:
        if backend_proc.poll() is not None:
            # Backend died
            print("[Bridge] Backend process died unexpectedly.")
            yield f"data: {json.dumps({'type': 'bridge_disconnect', 'data': {'reason': 'backend crashed'}})}\n\n"
            break

        try:
            # Read raw bytes first to avoid UnicodeDecodeError on partial characters
            chunk = os.read(state_pipe_fd, 65536)
            if chunk:
                # Append bytes to buffer
                raw_buffer += chunk

                # Process complete lines
                while b'\n' in raw_buffer:
                    line_bytes, raw_buffer = raw_buffer.split(b'\n', 1)
                    if line_bytes.strip():
                        try:
                            line = line_bytes.decode('utf-8')
                            print(f"[SSE] Sending: {line.strip()}")
                            yield f"data: {line}\n\n"
                        except UnicodeDecodeError as e:
                            print(f"[Bridge] Skipping invalid UTF-8 line: {e}")
        except BlockingIOError:
            # No data available right now
            pass
        except OSError as e:
            print(f"[Bridge] Pipe read error: {e}")
            break

        time.sleep(0.05)  # ~20Hz poll rate, light on CPU

# --- API Endpoints ---


@app.route('/stream')
def stream():
    """SSE endpoint for the frontend to subscribe to state updates."""
    return Response(sse_stream(), mimetype='text/event-stream')


@app.route('/command', methods=['POST'])
def send_command():
    """Accepts commands from the frontend and forwards them to the C backend."""
    data = request.json
    cmd_str = data.get('command')

    if not cmd_str:
        return jsonify({'error': 'Missing command'}), 400

    print(f"[Bridge] Frontend → Backend: {cmd_str}")

    try:
        # Write to the command pipe
        # We open and close it per command to let C's select() trigger cleanly
        with open(CMD_PIPE, "w") as f:
            f.write(cmd_str + "\n")
        # Emit a lightweight 'scenario_start' event into the state pipe
        try:
            envelope = {
                'type': 'scenario_start',
                'ts': int(time.time() * 1000),
                'data': {'id': scenario_id}
            }
            # Open the state pipe for writing and write one JSON line
            try:
                fd = os.open(STATE_PIPE, os.O_WRONLY | os.O_NONBLOCK)
                os.write(fd, (json.dumps(envelope) + "\n").encode('utf-8'))
                os.close(fd)
                print(f"[Bridge] Emitted scenario_start for id={scenario_id}")
            except OSError as e:
                # Non-fatal: if we can't write to the pipe, just log and continue
                print(f"[Bridge] Could not emit scenario_start: {e}")
        except Exception as e:
            print(f"[Bridge] Error composing scenario_start event: {e}")

        return jsonify({'status': 'ok'})
    except Exception as e:
        print(f"[Bridge] Error writing to command pipe: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/scenario', methods=['POST'])
def run_scenario():
    """Handles predefined scenarios."""
    data = request.json
    scenario_id = data.get('id')

    if scenario_id is None:
        return jsonify({'error': 'Missing scenario id'}), 400

    try:
        # Step 1: Reset the environment
        with open(CMD_PIPE, "w") as f:
            f.write("reset\n")
        time.sleep(0.5)  # Wait for cleanup

        # Step 2: Run the specific scenario
        if scenario_id == 1:
            # FIFO Belady's Anomaly Demo - 3 frames
            with open(CMD_PIPE, "w") as f:
                f.write("frames 3\n")
                f.write("algo fifo\n")
                f.write("refs P1 1 2 3 4 1 2 5 1 2 3 4 5\n")
                f.write("add P1 5\n")

        elif scenario_id == 2:
            # LRU Effectiveness Demo
            with open(CMD_PIPE, "w") as f:
                f.write("frames 3\n")
                f.write("algo lru\n")
                f.write("refs P1 1 2 3 4 1 2 5 1 2 3 4 5\n")
                f.write("add P1 5\n")

        elif scenario_id == 3:
            # Optimal (OPT) Demo
            with open(CMD_PIPE, "w") as f:
                f.write("frames 3\n")
                f.write("algo opt\n")
                f.write("refs P1 1 2 3 4 1 2 5 1 2 3 4 5\n")
                f.write("add P1 5\n")

        elif scenario_id == 4:
            # Multi-process Contention
            with open(CMD_PIPE, "w") as f:
                f.write("frames 4\n")
                f.write("algo lru\n")
                f.write("refs P1 1 2 3 1 2\n")
                f.write("refs P2 4 5 4 5\n")
                f.write("add P1 3\n")
                time.sleep(0.5)
                f.write("add P2 2\n")

        elif scenario_id == 5:
            # Sequential comparison (FIFO -> LRU -> OPT)
            # This is complex to drive entirely from the backend without a massive script.
            # We'll just run them back to back here. The frontend needs to be ready to graph this.
            # The backend will just run them.
            # We send a special 'scenario' command to the backend so it can emit a 'scenario_start' event.
            with open(CMD_PIPE, "w") as f:
                f.write("scenario 5\n")
            # We don't script the whole sequential comparison here; the frontend handles driving it
            # by calling the individual endpoints or we can orchestrate it via a background thread.
            # For simplicity, we just trigger it and let the frontend drive the 3 stages via API calls.

        else:
            return jsonify({'error': 'Unknown scenario'}), 400

        return jsonify({'status': 'ok'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    print("[Bridge] Initializing...")
    # Ensure pipes exist before opening
    for pipe in [CMD_PIPE, STATE_PIPE]:
        if not os.path.exists(pipe):
            print(f"[Bridge] Creating pipe: {pipe}")
            os.mkfifo(pipe)
            os.chmod(pipe, 0o666)

    open_state_pipe()
    start_backend()
    print("[Bridge] Starting Flask server on http://localhost:5001")
    # Use threaded=True to allow SSE and REST requests to run concurrently
    app.run(host='0.0.0.0', port=5001, threaded=True)
