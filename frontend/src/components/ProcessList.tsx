import React from 'react';
import { ProcessState, PROCESS_COLORS } from '../types';

interface Props {
  processes: ProcessState[];
  onKill: (name: string) => void;
}

export const ProcessList: React.FC<Props> = ({ processes, onKill }) => {
  return (
    <div className="h-full flex flex-col p-4 gap-4 bg-white border-l border-gray-200">
      <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wider">Processes</h2>
      <div className="flex-1 overflow-y-auto flex flex-col gap-3">
        {processes.length === 0 ? (
          <div className="text-gray-400 text-sm italic py-4">No active processes</div>
        ) : (
          processes.map(proc => {
            const color = PROCESS_COLORS[proc.name] || '#6B7280';
            const progress = proc.pages_requested > 0 ? (proc.frames_held / proc.pages_requested) * 100 : 0;
            
            return (
              <div 
                key={proc.name}
                className="group relative bg-white border border-gray-200 rounded-[var(--radius-card)] p-3 shadow-sm process-card-enter flex flex-col gap-2 overflow-hidden"
                style={{ borderLeftWidth: '4px', borderLeftColor: color }}
              >
                <div className="flex justify-between items-center">
                  <div className="font-mono font-bold text-gray-800">
                    {proc.name} <span className="text-xs text-gray-400 font-normal">PID:{proc.pid}</span>
                  </div>
                  {proc.rss && <div className="text-xs text-gray-400">{proc.rss}</div>}
                  <button 
                    onClick={() => onKill(proc.name)}
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-xs bg-rose-50 text-rose-600 px-2 py-1 rounded hover:bg-rose-100 font-bold"
                  >
                    Kill
                  </button>
                </div>
                
                <div className="text-xs text-gray-500">
                  {proc.pages_requested} pages requested / {proc.frames_held} frames held
                </div>
                
                <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden">
                  <div 
                    className="h-full transition-all duration-300"
                    style={{ width: `${Math.min(100, progress)}%`, backgroundColor: color }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};