import React, { useEffect, useState } from 'react';
import { FrameState, PROCESS_COLORS, PROCESS_BGS } from '../types';

interface Props {
  frames: FrameState[];
  references: any[];
}

export const FrameGrid: React.FC<Props> = ({ frames, references }) => {
  const [animatedFrames, setAnimatedFrames] = useState<Record<number, 'hit' | 'fault'>>({});

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

  return (
    <div className="h-full flex flex-col p-4 gap-4">
      <h2 className="text-sm font-bold text-gray-600 uppercase tracking-wider">Frame Grid</h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-3 flex-1 content-start overflow-y-auto">
        {frames.map(frame => {
          const isFree = frame.status === 'free' || !frame.process;
          const color = isFree ? '#9CA3AF' : (PROCESS_COLORS[frame.process as string] || '#374151');
          const bg = isFree ? '#F3F4F6' : (PROCESS_BGS[frame.process as string] || '#E5E7EB');
          const animationClass = animatedFrames[frame.id] === 'fault' ? 'frame-card-fault' : 
                                 animatedFrames[frame.id] === 'hit' ? 'frame-card-hit' : 
                                 (!isFree ? 'frame-card-enter' : '');

          return (
            <div 
              key={frame.id}
              className={`relative flex flex-col justify-between p-3 rounded-[var(--radius-card)] border-2 transition-all duration-300 min-h-[100px] ${animationClass}`}
              style={{
                borderColor: isFree ? 'transparent' : color,
                backgroundColor: bg,
                borderStyle: isFree ? 'dashed' : 'solid',
                borderWidth: isFree ? '2px' : '1px'
              }}
            >
              <div className="font-mono text-xs opacity-70" style={{ color: isFree ? '#9CA3AF' : color }}>
                #{frame.id}
              </div>
              <div className="text-center font-bold text-lg" style={{ color: isFree ? '#D1D5DB' : color }}>
                {isFree ? 'FREE' : frame.process}
              </div>
              <div className="text-right font-mono text-xs font-semibold" style={{ color: isFree ? '#9CA3AF' : color }}>
                {isFree ? '--' : `PG ${frame.page}`}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};