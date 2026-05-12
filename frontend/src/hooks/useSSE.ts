import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState } from '../types';
import { Annotation } from '../scenarios';

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

  // Expose a way for LearningMode to register its current expected annotations
  const expectedAnnotationsRef = useRef<Annotation[]>([]);

  const setExpectedAnnotations = useCallback((annotations: Annotation[]) => {
    expectedAnnotationsRef.current = annotations;
  }, []);

  useEffect(() => {
    const eventSource = new EventSource('/stream');

    eventSource.onopen = () => {
      setState(s => ({ ...s, connectionStatus: 'connected' }));
    };

    eventSource.onerror = () => {
      setState(s => ({ ...s, connectionStatus: 'disconnected' }));
    };

    eventSource.onmessage = (e) => {
      try {
        const envelope = JSON.parse(e.data);
        const { type, data } = envelope;
        
        setState(prev => {
          let newState = { ...prev };
          
          switch (type) {
            case 'bridge_connect':
              newState.connectionStatus = 'connected';
              break;
            case 'bridge_disconnect':
              newState.connectionStatus = 'disconnected';
              break;
            case 'status':
              if (data.frames) {
                newState.frames = data.frames.map((f: any) => ({
                  id: f.frame_id,
                  process: f.process_name || null,
                  page: f.page_number === -1 ? null : f.page_number,
                  status: f.occupied ? 'occupied' : 'free'
                }));
              }
              newState.stats = {
                ...prev.stats,
                total: data.fault_count + data.hit_count,
                hits: data.hit_count,
                faults: data.fault_count,
                algorithm: data.algorithm || prev.stats.algorithm
              };
              checkAnnotation('frame_update');
              break;
            case 'alloc':
              // Handle both hit and initial allocation
              if (data.type === 'hit') {
                newState.references = [...prev.references, { 
                  page: data.page_number, 
                  process: data.process_name, 
                  type: 'hit' 
                }];
                newState.stats = { ...prev.stats, total: prev.stats.total + 1, hits: prev.stats.hits + 1 };
              } else {
                // Initial load
                newState.references = [...prev.references, { 
                  page: data.page_number, 
                  process: data.process_name, 
                  type: 'fault' 
                }];
                newState.stats = { ...prev.stats, total: prev.stats.total + 1, hits: prev.stats.hits + 1 }; // C backend counts first load as hit
              }
              newState.currentRefIndex = newState.references.length - 1;
              checkAnnotation(data.type === 'hit' ? 'hit' : 'fault');
              break;
            case 'fault':
              newState.references = [...prev.references, { 
                page: data.page_number, 
                process: data.process_name, 
                type: 'fault' 
              }];
              newState.currentRefIndex = newState.references.length - 1;
              newState.stats = { ...prev.stats, total: prev.stats.total + 1, faults: prev.stats.faults + 1 };
              checkAnnotation('fault');
              break;
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
            case 'terminate':
              newState.processes = prev.processes.filter(p => p.name !== data.process_name);
              break;
            case 'proc':
              newState.processes = prev.processes.map(p => 
                p.name === data.process_name 
                ? { ...p, rss: `${data.real_rss_kb}KB`, frames_held: data.sim_frames } 
                : p
              );
              break;
            case 'log':
              const newLog = { 
                module: data.module, 
                message: data.message, 
                timestamp: new Date().toISOString() 
              };
              newState.logs = [...prev.logs, newLog].slice(-200);
              break;
            case 'algo':
              newState.stats = { ...prev.stats, algorithm: data.algorithm.toUpperCase() };
              break;
            case 'reset':
              newState = {
                ...prev,
                frames: [],
                processes: [],
                logs: [...prev.logs, { module: 'SYSTEM', message: 'Simulation reset', timestamp: new Date().toISOString() }],
                references: [],
                currentRefIndex: -1,
                stats: { total: 0, hits: 0, faults: 0, algorithm: prev.stats.algorithm }
              };
              break;
          }
          
          return newState;
        });
      } catch (err) {
        console.error("Error parsing SSE data", err, e.data);
      }
    };

    const checkAnnotation = (triggerType: string) => {
      const match = expectedAnnotationsRef.current.find(a => a.trigger === triggerType);
      if (match) {
        setActiveAnnotation(match);
        activeAnnotationRef.current = match;
      }
    };

    return () => {
      eventSource.close();
    };
  }, []);

  return { state, activeAnnotation, setExpectedAnnotations, clearActiveAnnotation: () => setActiveAnnotation(null) };
}