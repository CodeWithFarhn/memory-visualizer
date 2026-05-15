import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState } from '../types';
import { Annotation } from '../scenarios';

type FrameEntry = { id: number; process: string | null; page: number | null; status: 'free' | 'occupied' | 'fault' | 'hit' };

export function useSSE() {
  const [state, setState] = useState<AppState>({
    frames: [],
    processes: [],
    logs: [],
    references: [],
    currentRefIndex: -1,
    stats: { total: 0, hits: 0, faults: 0, algorithm: 'FIFO' },
    meminfo: { total: '0GB', used: '0GB', free: '0GB' },
    connectionStatus: 'disconnected'
  });

  const [activeAnnotation, setActiveAnnotation] = useState<Annotation | null>(null);
  const activeAnnotationRef = useRef<Annotation | null>(null);
  const expectedAnnotationsRef = useRef<Annotation[]>([]);

  const setExpectedAnnotations = useCallback((annotations: Annotation[]) => {
    expectedAnnotationsRef.current = annotations;
  }, []);

  // Expose latest SSE event type for scenario step advancement
  const lastEventRef = useRef<string | null>(null);
  const [lastEventType, setLastEventType] = useState<string | null>(null);

  // Maintain frames as a Map<frame_id, FrameEntry> so we can update
  // incrementally from alloc/evict/release/terminate events.
  // The backend only sends a full "status" snapshot on explicit `status` cmd;
  // normal operation only sends individual alloc/evict events.
  const framesMapRef = useRef<Map<number, FrameEntry>>(new Map());
  const totalFramesRef = useRef<number>(0);

  const snapshotFrames = (): FrameEntry[] =>
    Array.from(framesMapRef.current.values()).sort((a, b) => a.id - b.id);

  useEffect(() => {
    const eventSource = new EventSource('/stream');

    eventSource.onopen = () => {
      setState(s => ({ ...s, connectionStatus: 'connected' }));
    };

    eventSource.onerror = () => {
      setState(s => ({ ...s, connectionStatus: 'disconnected' }));
    };

    const checkAnnotation = (triggerType: string) => {
      const match = expectedAnnotationsRef.current.find(a => a.trigger === triggerType);
      if (match) {
        setActiveAnnotation(match);
        activeAnnotationRef.current = match;
      }
    };

    eventSource.onmessage = (e) => {
      try {
        const envelope = JSON.parse(e.data);
        const { type, data } = envelope;

        // Map backend event types to scenario-level events used by the narrator.
        // Many backend events update frames — treat them as `frame_update` for scenarios.
        let mappedType = type;
        if (type === 'alloc') {
          if (data && data.type === 'hit') mappedType = 'hit';
          else mappedType = 'frame_update';
        } else if (type === 'evict' || type === 'release' || type === 'status' || type === 'terminate' || type === 'proc') {
          mappedType = 'frame_update';
        }

        // Debug: expose mapping in browser console for troubleshooting Learning Mode
        try {
          // eslint-disable-next-line no-console
          console.debug(`[useSSE] incoming event: ${type} → mapped: ${mappedType}`);
        } catch (err) {}

        const significantEvents = ['spawn', 'alloc', 'evict', 'release', 'status', 'terminate', 'proc', 'hit', 'fault', 'frame_update', 'reset', 'algo'];
        if (significantEvents.includes(mappedType)) {
          setLastEventType(mappedType);
          lastEventRef.current = mappedType;
        }

        setState(prev => {
          let newState = { ...prev };

          switch (type) {
            // ── Connection ──────────────────────────────────────────────
            case 'bridge_connect':
              newState.connectionStatus = 'connected';
              break;
            case 'bridge_disconnect':
              newState.connectionStatus = 'disconnected';
              break;

            // ── Full snapshot (only on explicit `status` command) ────────
            case 'status': {
              if (data.frames && Array.isArray(data.frames)) {
                framesMapRef.current = new Map();
                data.frames.forEach((f: any) => {
                  framesMapRef.current.set(f.frame_id, {
                    id: f.frame_id,
                    process: f.occupied && f.process_name ? f.process_name : null,
                    page: f.page_number === -1 ? null : f.page_number,
                    status: f.occupied ? 'occupied' : 'free'
                  });
                });
                totalFramesRef.current = data.total_frames || data.frames.length;
              } else if (data.total_frames) {
                // Initial status with no frames array — seed empty slots
                totalFramesRef.current = data.total_frames;
                framesMapRef.current = new Map();
                for (let i = 0; i < data.total_frames; i++) {
                  if (!framesMapRef.current.has(i)) {
                    framesMapRef.current.set(i, { id: i, process: null, page: null, status: 'free' });
                  }
                }
              }
              newState.frames = snapshotFrames();
              newState.stats = {
                ...prev.stats,
                total: (data.fault_count ?? 0) + (data.hit_count ?? 0),
                hits: data.hit_count ?? prev.stats.hits,
                faults: data.fault_count ?? prev.stats.faults,
                algorithm: data.algorithm || prev.stats.algorithm
              };
              // Populate processes list if backend included it in status
              if (data.processes && Array.isArray(data.processes)) {
                const procList = (data.processes as any[]).map(p => {
                  // count frames held by this process
                  const framesHeld = Array.from(framesMapRef.current.values()).filter(f => f.process === p.process_name).length;
                  return {
                    name: p.process_name,
                    pid: p.pid ?? 0,
                    pages_requested: p.page_count ?? p.pages_requested ?? 0,
                    frames_held: framesHeld,
                    rss: p.real_rss_kb ? `${p.real_rss_kb}KB` : undefined
                  };
                });
                newState.processes = procList;
              }
              checkAnnotation('frame_update');
              break;
            }

            // ── Page loaded into a frame (hit or initial load) ──────────
            case 'alloc': {
              const fid = data.frame_id;
              if (fid !== undefined) {
                framesMapRef.current.set(fid, {
                  id: fid,
                  process: data.process_name || null,
                  page: data.page_number ?? null,
                  status: data.type === 'hit' ? 'hit' : 'occupied'
                });
                newState.frames = snapshotFrames();
              }
              if (data.type === 'hit') {
                newState.references = [...prev.references, {
                  page: data.page_number, process: data.process_name, type: 'hit'
                }];
                newState.stats = { ...prev.stats, total: prev.stats.total + 1, hits: prev.stats.hits + 1 };
              } else {
                // Initial page load — backend counts it as a hit internally
                newState.references = [...prev.references, {
                  page: data.page_number, process: data.process_name, type: 'fault'
                }];
                newState.stats = { ...prev.stats, total: prev.stats.total + 1, hits: prev.stats.hits + 1 };
              }
              newState.currentRefIndex = newState.references.length - 1;
              checkAnnotation(data.type === 'hit' ? 'hit' : 'fault');
              break;
            }

            // ── Replacement thread evicted a page ───────────────────────
            case 'evict': {
              const fid = data.frame_id;
              if (fid !== undefined) {
                framesMapRef.current.set(fid, { id: fid, process: null, page: null, status: 'free' });
                newState.frames = snapshotFrames();
              }
              checkAnnotation('frame_update');
              break;
            }

            // ── Page fault (no free frame — waiting for replacement) ─────
            case 'fault': {
              newState.references = [...prev.references, {
                page: data.page_number, process: data.process_name, type: 'fault'
              }];
              newState.currentRefIndex = newState.references.length - 1;
              newState.stats = { ...prev.stats, total: prev.stats.total + 1, faults: prev.stats.faults + 1 };
              checkAnnotation('fault');
              break;
            }

            // ── Frames explicitly released (e.g. process killed) ─────────
            case 'release': {
              if (data.freed_frames && Array.isArray(data.freed_frames)) {
                (data.freed_frames as number[]).forEach(fid => {
                  framesMapRef.current.set(fid, { id: fid, process: null, page: null, status: 'free' });
                });
                newState.frames = snapshotFrames();
              }
              break;
            }

            // ── Process spawned ─────────────────────────────────────────
            case 'spawn':
              if (!prev.processes.find(p => p.name === data.process_name)) {
                newState.processes = [...prev.processes, {
                  name: data.process_name,
                  pid: data.pid,
                  pages_requested: data.page_count,
                  frames_held: 0
                }];
              }
              break;

            // ── Process terminated ──────────────────────────────────────
            case 'terminate': {
              newState.processes = prev.processes.filter(p => p.name !== data.process_name);
              // Clear any frames still attributed to this process
              framesMapRef.current.forEach((frame, id) => {
                if (frame.process === data.process_name) {
                  framesMapRef.current.set(id, { id, process: null, page: null, status: 'free' });
                }
              });
              newState.frames = snapshotFrames();
              break;
            }

            // ── Process stats update ────────────────────────────────────
            case 'proc':
              newState.processes = prev.processes.map(p =>
                p.name === data.process_name
                  ? { ...p, rss: `${data.real_rss_kb}KB`, frames_held: data.sim_frames }
                  : p
              );
              break;

            // ── Log line ────────────────────────────────────────────────
            case 'log': {
              const newLog = {
                module: data.module,
                message: data.message,
                timestamp: new Date().toISOString()
              };
              newState.logs = [...prev.logs, newLog].slice(-200);
              break;
            }

            // ── Algorithm change ────────────────────────────────────────
            case 'algo':
              newState.stats = { ...prev.stats, algorithm: data.algorithm.toUpperCase() };
              break;

            // ── Full reset ──────────────────────────────────────────────
            case 'reset': {
              framesMapRef.current = new Map();
              for (let i = 0; i < totalFramesRef.current; i++) {
                framesMapRef.current.set(i, { id: i, process: null, page: null, status: 'free' });
              }
              newState = {
                ...prev,
                frames: snapshotFrames(),
                processes: [],
                logs: [...prev.logs, {
                  module: 'SYSTEM',
                  message: 'Simulation reset',
                  timestamp: new Date().toISOString()
                }],
                references: [],
                currentRefIndex: -1,
                stats: { total: 0, hits: 0, faults: 0, algorithm: prev.stats.algorithm }
              };
              break;
            }
          }

          return newState;
        });
      } catch (err) {
        console.error('[useSSE] Error parsing SSE data', err, e.data);
      }
    };

    return () => {
      eventSource.close();
    };
  }, []);

  return {
    state,
    lastEventType,
    activeAnnotation,
    setExpectedAnnotations,
    clearActiveAnnotation: () => setActiveAnnotation(null)
  };
}
