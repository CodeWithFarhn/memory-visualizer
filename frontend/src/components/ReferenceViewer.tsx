import React, { useRef, useEffect } from 'react';
import { ReferenceEntry, Stats, PROCESS_COLORS } from '../types';

interface Props {
  references: ReferenceEntry[];
  stats: Stats;
  frameRefs?: React.MutableRefObject<Map<number, HTMLDivElement>>;
  onFaultConnector?: (refIndex: number, frameIndex?: number) => void;
}

export const ReferenceViewer: React.FC<Props> = ({ references, stats, frameRefs, onFaultConnector }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [references]);

  useEffect(() => {
    if (references.length > 0) {
      const lastRef = references[references.length - 1];
      if (lastRef.type === 'fault') {
        onFaultConnector?.(references.length - 1);
      }
    }
  }, [references.length, onFaultConnector, references]);

  const hitRatio = stats.total > 0 ? Math.round((stats.hits / stats.total) * 100) : 0;
  
  let ratioColor = 'text-red-600';
  let barColor = 'bg-red-500';
  let interpretation = 'High fault rate — memory is under pressure';
  if (hitRatio > 75) {
    ratioColor = 'text-emerald-600';
    barColor = 'bg-emerald-500';
    interpretation = 'Efficient — most pages found in memory';
  } else if (hitRatio >= 50) {
    ratioColor = 'text-amber-600';
    barColor = 'bg-amber-500';
    interpretation = 'Moderate performance — some unnecessary loads occurring';
  }

  return (
    <div className="h-full flex flex-col p-4 border-t border-gray-200 bg-white">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wider">Reference String</h2>
        <div className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded border border-blue-100 font-bold tracking-wide mr-1">
          {stats.algorithm || 'FIFO'}
        </div>
      </div>
      
      {references.length > 0 && (
        <div className="flex gap-4 items-center text-xs font-medium text-gray-500 mb-2">
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> Hit — page already in memory (fast)</div>
          <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-rose-500"></div> Fault — page not in memory, had to load it (slow)</div>
        </div>
      )}

      <div 
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto pb-4 flex-1 items-center scroll-smooth scrollbar-thin mt-2"
      >
        {references.length === 0 ? (
          <div className="text-gray-400 text-sm italic">Waiting for page references...</div>
        ) : (
          references.map((ref, idx) => {
            const isLast = idx === references.length - 1;
            const color = PROCESS_COLORS[ref.process] || '#6B7280';
            const isFault = ref.type === 'fault';
            
            return (
              <div key={idx} className={`flex flex-col items-center gap-1.5 min-w-fit ${isLast && isFault ? 'frame-card-fault' : ''}`}>
                {isLast && (
                  <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider -mb-1">▼ current</div>
                )}
                <div 
                  className={`w-2.5 h-2.5 rounded-full ${isFault ? 'bg-rose-500' : 'bg-emerald-500'} ${!isLast ? 'opacity-60' : ''}`}
                  title={ref.type}
                />
                <div 
                  id={`ref-pill-${idx}`}
                  className={`font-mono text-sm px-4 py-1.5 rounded-full border transition-all ${isLast ? 'shadow-md scale-110 font-bold' : 'opacity-60'}`}
                  style={{
                    borderColor: color,
                    backgroundColor: isLast ? color : 'transparent',
                    color: isLast ? 'white' : color,
                    borderWidth: isLast ? '0' : '2px'
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
          <div className="flex justify-between items-end">
            <span className="text-gray-400 text-xs">Hit Ratio (<span className={ratioColor}>{hitRatio}%</span>)</span>
          </div>
          <div className="w-full bg-gray-100 h-2 rounded-full mt-1 overflow-hidden flex">
            <div className={`${barColor} h-full transition-all`} style={{ width: stats.total > 0 ? `${hitRatio}%` : '0%' }} />
            <div className="bg-gray-200 h-full transition-all" style={{ width: stats.total > 0 ? `${100 - hitRatio}%` : '0%' }} />
          </div>
          {stats.total > 0 && (
            <div className={`text-xs mt-1 font-medium ${ratioColor}`}>
              {interpretation}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};