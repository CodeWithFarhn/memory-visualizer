import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { FrameState, PROCESS_COLORS, PROCESS_BGS } from '../types';

interface Props {
  frames: FrameState[];
  references: any[];
  pulseFrameId?: number | null;
  highlightFrameIds?: number[];
  frameCardRefs?: React.MutableRefObject<Map<number, HTMLDivElement>>;
}

export const FrameGrid: React.FC<Props> = ({ frames, references, pulseFrameId, highlightFrameIds = [], frameCardRefs }) => {
  const [animatedFrames, setAnimatedFrames] = useState<Record<number, 'hit' | 'fault'>>({});
  const [focusMode, setFocusMode] = useState(false);

  useEffect(() => {
    if (references.length > 0) {
      const newAnimated: Record<number, 'hit' | 'fault'> = {};
      frames.forEach(f => {
        if (f.status === 'hit' || f.status === 'fault') {
          newAnimated[f.id] = f.status;
        }
      });
      
      if (Object.keys(newAnimated).length > 0) {
        setAnimatedFrames(newAnimated);
        setTimeout(() => {
          setAnimatedFrames({});
        }, 400);
      }
    }
  }, [frames, references]);

  const setRef = useCallback((node: HTMLDivElement | null, id: number) => {
    if (frameCardRefs) {
      if (node) {
        frameCardRefs.current.set(id, node);
      } else {
        frameCardRefs.current.delete(id);
      }
    }
  }, [frameCardRefs]);

  const occupiedCount = frames.filter(f => f.status !== 'free' && f.process).length;
  const freeCount = frames.length - occupiedCount;

  // Render normal mode grid
  const renderGrid = (enlarged: boolean) => (
    <div className={`grid ${enlarged ? 'grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4' : 'grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3'} flex-1 content-start overflow-y-auto pr-2`}>
      {frames.map(frame => {
        const isFree = frame.status === 'free' || !frame.process;
        const color = isFree ? '#9CA3AF' : (PROCESS_COLORS[frame.process as string] || '#374151');
        const bg = isFree ? '#F3F4F6' : (PROCESS_BGS[frame.process as string] || '#E5E7EB');
        
        let animationClass = '';
        if (animatedFrames[frame.id] === 'fault') animationClass = 'frame-card-fault';
        else if (animatedFrames[frame.id] === 'hit') animationClass = enlarged ? 'focus-hit-glow' : 'frame-card-hit';
        else if (!isFree) animationClass = enlarged ? 'focus-slide-in' : 'frame-card-enter';

        const extraClass = pulseFrameId === frame.id ? 'frame-pulse' : (highlightFrameIds.includes(frame.id) ? 'narrator-highlight' : '');

        return (
          <div 
            key={frame.id}
            ref={(node) => setRef(node, frame.id)}
            className={`relative flex flex-col justify-between ${enlarged ? 'p-4 min-h-[140px]' : 'p-3 min-h-[100px]'} rounded-[var(--radius-card)] border-2 transition-all duration-300 group ${animationClass} ${extraClass}`}
            style={{
              borderColor: isFree ? 'transparent' : color,
              backgroundColor: bg,
              borderStyle: isFree ? 'dashed' : 'solid',
              borderWidth: isFree ? '2px' : '1px'
            }}
          >
            {/* Tooltip */}
            {!enlarged && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-max max-w-[180px] bg-white text-gray-800 text-[10px] font-bold px-2 py-1 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 text-center border border-gray-100">
                {isFree ? `Frame ${frame.id} · Available` : `Frame ${frame.id} · Holds Page ${frame.page} of ${frame.process}`}
              </div>
            )}

            <div className="font-mono text-xs opacity-70" style={{ color: isFree ? '#9CA3AF' : color }}>
              #{frame.id}
            </div>
            <div className={`text-center font-bold ${enlarged ? 'text-2xl' : 'text-lg'}`} style={{ color: isFree ? '#D1D5DB' : color }}>
              {isFree ? 'EMPTY' : frame.process}
            </div>
            <div className="text-right font-mono text-xs font-semibold" style={{ color: isFree ? '#9CA3AF' : color }}>
              {isFree ? '--' : `PG ${frame.page}`}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <>
      <div className="h-full flex flex-col p-4 gap-3 bg-white relative">
        <div className="flex justify-between items-end">
          <div>
            <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wider">Frame Grid</h2>
            <div className="text-xs text-gray-500 font-medium mt-0.5">
              {frames.length > 0 ? `${occupiedCount} of ${frames.length} frames occupied · ${freeCount} free` : 'No frames allocated'}
            </div>
          </div>
          <button
            onClick={() => setFocusMode(true)}
            className="text-gray-400 hover:text-blue-600 transition-colors bg-gray-50 hover:bg-blue-50 px-2 py-1 rounded text-xs font-bold border border-gray-200"
          >
            ⛶ Focus Mode
          </button>
        </div>

        {frames.length === 0 && !localStorage.getItem('memvis_onboarding_dismissed') && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center p-6 text-center animate-in fade-in">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Welcome to MemVis</h3>
            <p className="text-gray-600 mb-4 text-sm max-w-sm">
              Start by creating a process:<br/>
              Type <code className="bg-gray-100 px-1.5 py-0.5 rounded font-bold text-blue-600">add P1 4</code> in the command bar, or use Visual mode below.
            </p>
            <button 
              onClick={() => {
                localStorage.setItem('memvis_onboarding_dismissed', 'true');
                // Force re-render to hide
                setFocusMode(false);
              }}
              className="text-xs font-bold text-gray-400 hover:text-gray-600"
            >
              Dismiss
            </button>
          </div>
        )}

        {renderGrid(false)}
      </div>

      {focusMode && (
        <div className="fixed inset-0 z-50 bg-gray-50 flex flex-col animate-in fade-in zoom-in-95 duration-200">
          <div className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 shadow-sm flex-none">
            <h2 className="font-bold text-lg text-gray-900">Focus Mode: Memory State</h2>
            <button 
              onClick={() => setFocusMode(false)}
              className="text-gray-500 hover:bg-gray-100 p-2 rounded-full transition-colors"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
          <div className="flex-1 flex overflow-hidden p-6 gap-6">
            <div className="w-[65%] flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 p-6 overflow-hidden">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Physical Frames</h3>
              {renderGrid(true)}
            </div>
            <div className="w-[35%] flex flex-col bg-white rounded-xl shadow-sm border border-gray-200 p-6 overflow-hidden">
              <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">Live Page Table (Resident)</h3>
              <div className="flex-1 overflow-y-auto pr-2">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-gray-100 text-xs font-bold text-gray-400 uppercase">
                      <th className="py-2 pl-2">Process</th>
                      <th className="py-2">Page</th>
                      <th className="py-2 text-right">Frame</th>
                    </tr>
                  </thead>
                  <tbody>
                    {frames.filter(f => !f.status.includes('free') && f.process).sort((a, b) => (a.process || '').localeCompare(b.process || '')).map(frame => {
                      const color = PROCESS_COLORS[frame.process as string] || '#374151';
                      return (
                        <tr key={`${frame.process}-${frame.page}`} className="border-b border-gray-50 hover:bg-gray-50 transition-colors animate-in slide-in-from-left-4 fade-in">
                          <td className="py-2.5 pl-2 font-bold flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }}></div>
                            <span style={{ color }}>{frame.process}</span>
                          </td>
                          <td className="py-2.5 font-mono text-sm text-gray-600">{frame.page}</td>
                          <td className="py-2.5 text-right font-mono text-sm text-gray-500">#{frame.id}</td>
                        </tr>
                      );
                    })}
                    {occupiedCount === 0 && (
                      <tr>
                        <td colSpan={3} className="py-8 text-center text-gray-400 text-sm italic">No pages currently resident</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};