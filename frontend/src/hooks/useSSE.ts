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
        const data = JSON.parse(e.data);
        
        setState(prev => {
          let newState = { ...prev };
          
          if (data.type === 'bridge_connect') {
            newState.connectionStatus = 'connected';
          } else if (data.type === 'bridge_disconnect') {
            newState.connectionStatus = 'disconnected';
          } else if (data.type === 'frame_update') {
            newState.frames = data.frames;
            checkAnnotation('frame_update');
          } else if (data.type === 'process_update') {
            newState.processes = data.processes;
            checkAnnotation('process_update');
          } else if (data.type === 'fault') {
            const process = newState.frames.find(f => f.id === data.frame_id)?.process || 'Unknown';
            newState.references = [...prev.references, { page: data.loaded_page, process, type: 'fault' }];
            newState.currentRefIndex = newState.references.length - 1;
            newState.stats = { ...prev.stats, total: prev.stats.total + 1, faults: prev.stats.faults + 1 };
            checkAnnotation('fault');
          } else if (data.type === 'hit') {
            const process = newState.frames.find(f => f.id === data.frame_id)?.process || 'Unknown';
            // Find the page number by looking at the frame
            const frame = prev.frames.find(f => f.id === data.frame_id);
            const page = frame ? frame.page || 0 : 0;
            newState.references = [...prev.references, { page, process, type: 'hit' }];
            newState.currentRefIndex = newState.references.length - 1;
            newState.stats = { ...prev.stats, total: prev.stats.total + 1, hits: prev.stats.hits + 1 };
            checkAnnotation('hit');
          } else if (data.type === 'log') {
            const newLog = { module: data.module, message: data.message, timestamp: data.timestamp || new Date().toISOString() };
            newState.logs = [...prev.logs, newLog].slice(-200);
            if (data.message.toLowerCase().includes('algorithm set to')) {
              const algo = data.message.split('to')[1].trim().toUpperCase();
              newState.stats = { ...prev.stats, algorithm: algo };
            }
          } else if (data.type === 'meminfo') {
            newState.meminfo = { total: data.total, used: data.used, free: data.free };
          }
          
          return newState;
        });
      } catch (err) {
        console.error("Error parsing SSE data", err);
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