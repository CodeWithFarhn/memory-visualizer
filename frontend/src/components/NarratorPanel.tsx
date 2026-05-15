import React, { useEffect, useState, useRef } from 'react';
import { Scenario, AppState } from '../types';

const matchesWaitEvent = (wait: string | null, eventType: string | null) => {
  if (!wait || !eventType) return false;
  if (wait === eventType) return true;
  
  const frameEvents = ['alloc', 'evict', 'release', 'status', 'proc', 'hit', 'fault', 'frame_update'];
  
  if (wait === 'frame_update') {
    return frameEvents.includes(eventType);
  }
  
  if (wait === 'spawn') {
    return ['spawn', ...frameEvents].includes(eventType);
  }

  if (wait === 'fault') {
    return ['fault', 'hit', 'frame_update', 'alloc'].includes(eventType);
  }

  return false;
};

interface Props {
  scenario: Scenario | null;
  state: AppState;
  onClose: () => void;
  onCommand: (cmd: string) => void;
  lastEventType: string | null;
  highlightFrameIds: number[];
  setHighlightFrameIds: (ids: number[]) => void;
  highlightStat: string | null;
  setHighlightStat: (stat: string | null) => void;
  highlightLog: boolean;
  setHighlightLog: (v: boolean) => void;
}

export const NarratorPanel: React.FC<Props> = ({ 
  scenario, state, onClose, onCommand, lastEventType,
  setHighlightFrameIds, setHighlightStat, setHighlightLog
}) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [speed, setSpeed] = useState<'Manual' | 'Auto'>('Manual');
  const [isWaiting, setIsWaiting] = useState(false);
  const currentStepRef = useRef(currentStep);

  useEffect(() => {
    currentStepRef.current = currentStep;
  }, [currentStep]);

  useEffect(() => {
    if (!scenario) return;
    const step = scenario.steps[currentStep];
    if (!step) return;

    // Apply highlights
    setHighlightFrameIds(step.highlight.highlight_frame || []);
    setHighlightStat(step.highlight.highlight_stat || null);
    setHighlightLog(step.highlight.highlight_log || false);

    // Fire commands
    let maxDelay = 0;
    step.commands.forEach(({ cmd, delay }) => {
      setTimeout(() => {
        onCommand(cmd);
      }, delay);
      if (delay > maxDelay) maxDelay = delay;
    });

    if (step.wait_for_event) {
      // If the required event already occurred, don't enter waiting state.
      if (matchesWaitEvent(step.wait_for_event, lastEventType)) {
        setIsWaiting(false);
      } else {
        setIsWaiting(true);
      }
    } else {
      setIsWaiting(false);
    }

  }, [scenario, currentStep, onCommand, setHighlightFrameIds, setHighlightStat, setHighlightLog]);

  useEffect(() => {
    if (!scenario) return;
    const step = scenario.steps[currentStep];
    if (!step) return;

    if (isWaiting && step.wait_for_event && matchesWaitEvent(step.wait_for_event, lastEventType)) {
      setIsWaiting(false);
    }
  }, [lastEventType, isWaiting, scenario, currentStep]);

  useEffect(() => {
    if (speed === 'Auto' && !isWaiting && scenario && currentStep < scenario.steps.length - 1) {
      const timer = setTimeout(() => {
        setCurrentStep(s => s + 1);
      }, 2500); // 1.5s + some buffer
      return () => clearTimeout(timer);
    }
  }, [speed, isWaiting, currentStep, scenario]);

  if (!scenario) return null;

  const step = scenario.steps[currentStep];
  const isLast = currentStep === scenario.steps.length - 1;

  const interpolateText = (text: string) => {
    if (!text) return text;
    let interpolated = text;
    interpolated = interpolated.replace(/{{stats\.faults}}/g, state.stats.faults.toString());
    interpolated = interpolated.replace(/{{stats\.hits}}/g, state.stats.hits.toString());
    const hitRatio = state.stats.total > 0 ? Math.round((state.stats.hits / state.stats.total) * 100) : 0;
    interpolated = interpolated.replace(/{{stats\.hit_ratio}}/g, `${hitRatio}%`);
    const freeFrames = state.frames.filter(f => f.status === 'free').length;
    interpolated = interpolated.replace(/{{frames\.free}}/g, freeFrames.toString());
    return interpolated;
  };

  return (
    <div className="h-full w-[280px] bg-white border-l border-gray-200 flex flex-col shadow-[-4px_0_12px_rgba(0,0,0,0.03)] narrator-panel-enter z-50 relative shrink-0">
      <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-indigo-50">
        <h2 className="font-bold text-indigo-900 truncate pr-2">{scenario.name}</h2>
        <button onClick={onClose} className="text-indigo-400 hover:text-indigo-700 transition-colors">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>
      </div>

      <div className="p-4 border-b border-gray-100 flex justify-between items-center">
        <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Speed</div>
        <div className="flex bg-gray-100 p-0.5 rounded-full text-xs font-bold border border-gray-200">
          <button 
            onClick={() => setSpeed('Manual')}
            className={`px-3 py-1 rounded-full transition-colors ${speed === 'Manual' ? 'bg-white shadow-sm text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Manual
          </button>
          <button 
            onClick={() => setSpeed('Auto')}
            className={`px-3 py-1 rounded-full transition-colors ${speed === 'Auto' ? 'bg-white shadow-sm text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Auto
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-6">
        {isLast && !isWaiting && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-center animate-in fade-in slide-in-from-top-2">
            <div className="text-emerald-500 mb-2">
              <svg className="w-8 h-8 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <h3 className="font-bold text-emerald-800 text-lg">Complete!</h3>
            <p className="text-sm text-emerald-600 mt-1">You've finished this scenario.</p>
          </div>
        )}

        <div>
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-bold text-indigo-600 tracking-wide uppercase">Step {currentStep + 1} of {scenario.steps.length}</span>
          </div>
          <div className="w-full bg-gray-100 h-1.5 rounded-full overflow-hidden mb-4">
            <div className="bg-indigo-500 h-full transition-all duration-300" style={{ width: `${((currentStep + 1) / scenario.steps.length) * 100}%` }}></div>
          </div>

          <h3 className="text-xl font-bold text-gray-900 mb-3 leading-tight">{step.narration_heading}</h3>
          <p className="text-gray-700 text-sm leading-[1.6] mb-4">
            {interpolateText(step.narration_body)}
          </p>

          {step.commands.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {step.commands.map((c, i) => (
                <div key={i} className="bg-gray-800 text-gray-200 text-xs font-mono px-2 py-1 rounded shadow-inner">
                  &gt; {c.cmd}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="p-4 border-t border-gray-100 bg-gray-50 flex flex-col gap-2">
        {isWaiting ? (
          <div className="flex items-center justify-center gap-2 text-indigo-600 text-sm font-bold py-2 animate-pulse">
            <div className="w-2 h-2 bg-indigo-600 rounded-full"></div>
            Waiting for simulation...
          </div>
        ) : (
          !isLast && speed === 'Manual' ? (
            <button 
              onClick={() => setCurrentStep(s => s + 1)}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-[var(--radius-btn)] transition-colors shadow-sm animate-in fade-in"
            >
              Next Step →
            </button>
          ) : isLast && (
            <button 
              onClick={onClose}
              className="w-full bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2.5 rounded-[var(--radius-btn)] transition-colors"
            >
              Close Learning Mode
            </button>
          )
        )}
      </div>
    </div>
  );
};