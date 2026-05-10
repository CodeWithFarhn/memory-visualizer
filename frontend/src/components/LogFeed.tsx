import React, { useEffect, useRef } from 'react';
import { LogEntry } from '../types';

interface Props {
  logs: LogEntry[];
}

export const LogFeed: React.FC<Props> = ({ logs }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const getModuleColor = (mod: string) => {
    switch (mod) {
      case 'SYSTEM': return 'text-slate-400';
      case 'PROCESS': return 'text-blue-400';
      case 'MEMORY': return 'text-emerald-400';
      case 'SYNC': return 'text-amber-400';
      case 'REPLACE': return 'text-rose-400';
      case 'PROC': return 'text-violet-400';
      case 'CMD': return 'text-gray-400';
      default: return 'text-gray-300';
    }
  };

  return (
    <div className="h-full flex flex-col bg-[#0F172A] border-t border-l border-gray-800">
      <div className="p-2 border-b border-gray-800 flex justify-between items-center">
        <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">System Log Feed</h2>
      </div>
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed log-feed text-gray-300 flex flex-col gap-1">
        {logs.length === 0 ? (
          <div className="text-slate-500 italic">No logs yet...</div>
        ) : (
          logs.map((log, i) => (
            <div key={i} className="flex gap-3 hover:bg-slate-800/50 px-1 py-0.5 rounded">
              <span className="text-slate-500 opacity-60 w-16 shrink-0">
                {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span className={`w-16 shrink-0 font-bold ${getModuleColor(log.module)}`}>
                [{log.module}]
              </span>
              <span className="text-slate-300 break-words">{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
};