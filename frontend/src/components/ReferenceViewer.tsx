import React, { useRef, useEffect } from 'react';
import { ReferenceEntry, Stats, PROCESS_COLORS } from '../types';

interface Props {
  references: ReferenceEntry[];
  stats: Stats;
}

export const ReferenceViewer: React.FC<Props> = ({ references, stats }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [references]);

  const hitRatio = stats.total > 0 ? Math.round((stats.hits / stats.total) * 100) : 0;

  return (
    <div className="h-full flex flex-col p-4 border-t border-gray-200 bg-white">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wider">Reference String</h2>
        <div className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded border border-blue-100 font-bold tracking-wide mr-1">
          {stats.algorithm || 'FIFO'}
        </div>
      </div>
      
      <div 
        ref={scrollRef}
        className="flex gap-2 overflow-x-auto pb-4 flex-1 items-center scroll-smooth scrollbar-thin"
      >
        {references.length === 0 ? (
          <div className="text-gray-400 text-sm italic">Waiting for page references...</div>
        ) : (
          references.map((ref, idx) => {
            const isLast = idx === references.length - 1;
            const color = PROCESS_COLORS[ref.process] || '#6B7280';
            
            return (
              <div key={idx} className="flex flex-col items-center gap-1 min-w-fit">
                <div 
                  className={`w-2 h-2 rounded-full ${ref.type === 'fault' ? 'bg-rose-500' : 'bg-emerald-500'}`}
                  title={ref.type}
                />
                <div 
                  className={`font-mono text-sm px-3 py-1.5 rounded-full border transition-all ${isLast ? 'shadow-md scale-110 font-bold' : 'opacity-80'}`}
                  style={{
                    borderColor: color,
                    backgroundColor: isLast ? color : 'transparent',
                    color: isLast ? 'white' : color,
                    borderWidth: isLast ? '0' : '1px'
                  }}
                >
                  {ref.page}
                </div>
              </div>
            );
          })
        )}
      </div>
      
      <div className="flex items-center gap-6 text-sm mt-auto pt-4 border-t border-gray-100">
        <div className="flex flex-col">
          <span className="text-gray-400 text-xs">Total Accesses</span>
          <span className="font-mono font-bold text-gray-700">{stats.total}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-gray-400 text-xs">Hits</span>
          <span className="font-mono font-bold text-emerald-600">{stats.hits}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-gray-400 text-xs">Faults</span>
          <span className="font-mono font-bold text-rose-600">{stats.faults}</span>
        </div>
        <div className="flex flex-col flex-1">
          <span className="text-gray-400 text-xs">Hit Ratio ({hitRatio}%)</span>
          <div className="w-full bg-gray-100 h-2 rounded-full mt-1 overflow-hidden flex">
            <div className="bg-emerald-500 h-full transition-all" style={{ width: stats.total > 0 ? `${hitRatio}%` : '0%' }} />
            <div className="bg-rose-500 h-full transition-all" style={{ width: stats.total > 0 ? `${100 - hitRatio}%` : '0%' }} />
          </div>
        </div>
      </div>
    </div>
  );
};