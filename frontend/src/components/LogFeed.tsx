import React, { useEffect, useRef, useState, useMemo } from 'react';
import { LogEntry } from '../types';

interface Props {
  logs: LogEntry[];
  onFrameHighlight?: (frameId: number) => void;
}

const MODULES = [
  { id: 'SYSTEM', icon: '⚙', label: 'System', color: 'text-slate-400', bg: 'bg-slate-400/20', border: 'border-slate-400/50' },
  { id: 'PROCESS', icon: '⚡', label: 'Process', color: 'text-blue-400', bg: 'bg-blue-400/20', border: 'border-blue-400/50' },
  { id: 'MEMORY', icon: '🗂', label: 'Memory', color: 'text-emerald-400', bg: 'bg-emerald-400/20', border: 'border-emerald-400/50' },
  { id: 'SYNC', icon: '🔒', label: 'Sync', color: 'text-amber-400', bg: 'bg-amber-400/20', border: 'border-amber-400/50' },
  { id: 'REPLACE', icon: '🔄', label: 'Replaced', color: 'text-rose-400', bg: 'bg-rose-400/20', border: 'border-rose-400/50' },
  { id: 'PROC', icon: '📊', label: 'Stats', color: 'text-violet-400', bg: 'bg-violet-400/20', border: 'border-violet-400/50' },
  { id: 'CMD', icon: '⌨', label: 'Command', color: 'text-gray-400', bg: 'bg-gray-400/20', border: 'border-gray-400/50' }
];

export const LogFeed: React.FC<Props> = ({ logs, onFrameHighlight }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeModules, setActiveModules] = useState<Set<string>>(new Set(MODULES.map(m => m.id)));
  const [devView, setDevView] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isScrolledUp, setIsScrolledUp] = useState(false);

  useEffect(() => {
    if (scrollRef.current && !isHovered && !isScrolledUp) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, isHovered, isScrolledUp]);

  const handleScroll = () => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      setIsScrolledUp(scrollHeight - scrollTop - clientHeight > 20);
    }
  };

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      setIsScrolledUp(false);
    }
  };

  const toggleModule = (mod: string) => {
    const next = new Set(activeModules);
    if (next.has(mod)) {
      next.delete(mod);
    } else {
      next.add(mod);
    }
    setActiveModules(next);
  };

  const filteredLogs = useMemo(() => {
    return logs.filter(log => activeModules.has(log.module));
  }, [logs, activeModules]);

  const translateMessage = (msg: string) => {
    let plain = msg;
    plain = plain.replace(/fork\(\)\s*->\s*(\w+)\s*\(PID\s*(\d+)\)/i, "$1 was created (PID $2)");
    plain = plain.replace(/FIFO victim.*Frame\s*(\d+)/i, "Frame $1 was evicted — it was the oldest page in memory");
    plain = plain.replace(/LRU victim.*Frame\s*(\d+)/i, "Frame $1 was evicted — it was the least recently used page");
    plain = plain.replace(/sem_wait acquired by PID\s*(\d+)/i, "A process is now accessing memory (PID $1)");
    plain = plain.replace(/Page fault triggered by\s*(\w+)/i, "$1 tried to access a page that wasn't loaded — loading now");
    plain = plain.replace(/Page\s+(\d+)\s+loaded into Frame\s*(\d+)/i, "Page $1 loaded into Frame $2");
    return plain;
  };

  const renderMessageText = (msg: string) => {
    const parts = msg.split(/(Frame \d+)/i);
    return (
      <>
        {parts.map((part, i) => {
          const match = part.match(/Frame (\d+)/i);
          if (match) {
            const num = parseInt(match[1], 10);
            return (
              <span 
                key={i}
                className="bg-rose-900/40 text-rose-300 px-1 rounded cursor-pointer hover:bg-rose-800/60 transition-colors mx-1"
                onClick={() => onFrameHighlight?.(num)}
              >
                {part}
              </span>
            );
          }
          return <React.Fragment key={i}>{part}</React.Fragment>;
        })}
      </>
    );
  };

  return (
    <div className="h-full flex flex-col bg-[#0F172A] border-t border-l border-gray-800 relative">
      <div className="p-3 border-b border-gray-800 flex flex-col gap-3">
        <div className="flex justify-between items-center">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">System Log Feed</h2>
          <button 
            onClick={() => setDevView(!devView)}
            className={`text-[10px] font-bold px-2 py-1 rounded transition-colors ${devView ? 'bg-slate-700 text-slate-200' : 'text-slate-500 hover:text-slate-300'}`}
          >
            {devView ? 'Dev View ●' : 'Dev View'}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {MODULES.map(m => {
            const active = activeModules.has(m.id);
            return (
              <button
                key={m.id}
                onClick={() => toggleModule(m.id)}
                className={`text-[10px] px-2 py-0.5 rounded border log-chip-active font-medium flex items-center gap-1.5 ${
                  active ? `${m.bg} ${m.color} ${m.border}` : 'border-slate-700 text-slate-500 opacity-60 hover:opacity-100 hover:border-slate-600'
                }`}
              >
                <span>{m.icon}</span>
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      <div 
        ref={scrollRef} 
        onScroll={handleScroll}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="flex-1 overflow-y-auto p-3 font-mono text-[11px] leading-relaxed log-feed text-gray-300 flex flex-col gap-1 pb-10"
      >
        {filteredLogs.length === 0 ? (
          <div className="text-slate-500 italic">No logs match the current filters...</div>
        ) : (
          filteredLogs.map((log, i) => {
            const modInfo = MODULES.find(m => m.id === log.module) || MODULES[0];
            const msg = devView ? log.message : translateMessage(log.message);
            return (
              <div key={i} className="flex gap-3 hover:bg-slate-800/50 px-1 py-1 rounded">
                <span className="text-slate-500 opacity-60 w-16 shrink-0">
                  {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
                <span className={`w-20 shrink-0 font-bold ${modInfo.color} flex items-center gap-1.5`}>
                  {devView ? `[${log.module}]` : <>{modInfo.icon} {modInfo.label}</>}
                </span>
                <span className="text-slate-300 break-words flex-1 leading-relaxed">
                  {renderMessageText(msg)}
                </span>
              </div>
            );
          })
        )}
      </div>

      {isHovered && (
        <div className="absolute bottom-8 left-0 right-0 text-center pointer-events-none">
          <span className="bg-slate-800/90 text-slate-400 text-[10px] px-3 py-1 rounded-full border border-slate-700 shadow-lg backdrop-blur-sm">
            Scrolling paused — move mouse away to resume
          </span>
        </div>
      )}

      {isScrolledUp && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-4 right-4 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-3 py-1.5 rounded shadow-lg border border-blue-500 transition-colors animate-in fade-in zoom-in"
        >
          ↓ Latest
        </button>
      )}
    </div>
  );
};