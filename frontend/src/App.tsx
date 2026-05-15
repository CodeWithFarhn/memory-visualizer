import React, { useState, useRef, useCallback } from 'react';
import { useSSE } from './hooks/useSSE';
import { useCommand } from './hooks/useCommand';
import { FrameGrid } from './components/FrameGrid';
import { ProcessList } from './components/ProcessList';
import { ReferenceViewer } from './components/ReferenceViewer';
import { LogFeed } from './components/LogFeed';
import { CommandInput } from './components/CommandInput';
import { LearningModeModal } from './components/LearningModeModal';
import { NarratorPanel } from './components/NarratorPanel';
import { scenarios } from './scenarios';
import { Scenario } from './types';

function App() {
  const { state, lastEventType } = useSSE();
  const { sendCommand, history } = useCommand();
  const [showLearningModal, setShowLearningModal] = useState(false);
  
  const [activeScenario, setActiveScenario] = useState<Scenario | null>(null);
  const [pulseFrameId, setPulseFrameId] = useState<number | null>(null);
  const [highlightFrameIds, setHighlightFrameIds] = useState<number[]>([]);
  const [highlightStat, setHighlightStat] = useState<string | null>(null);
  const [highlightLog, setHighlightLog] = useState(false);

  const frameCardRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  const [connector, setConnector] = useState<{from: {x: number, y: number}, to: {x: number, y: number}, color: string, visible: boolean}>({
    from: {x: 0, y: 0}, to: {x: 0, y: 0}, color: '', visible: false
  });

  const startScenario = (scenarioId: number) => {
    const scenario = scenarios.find(s => s.id === scenarioId);
    if (!scenario) return;

    setShowLearningModal(false);
    setActiveScenario(scenario);
  };

  const closeScenario = () => {
    setActiveScenario(null);
    setHighlightFrameIds([]);
    setHighlightStat(null);
    setHighlightLog(false);
  };

  const handleAlgorithmChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    sendCommand(`algo ${e.target.value.toLowerCase()}`);
  };

  const handleFrameHighlight = (frameId: number) => {
    setPulseFrameId(frameId);
    setTimeout(() => {
      setPulseFrameId(null);
    }, 1000);
  };

  const handleFaultConnector = useCallback((refIndex: number) => {
    // A fault happened, we want to draw a line from the pill to the affected frame.
    // The latest log or frame update would tell us which frame. We guess by the most recently updated frame in stats/refs?
    // Actually, ReferenceViewer doesn't know the frame. Let's just find the frame that has this page right now.
    const lastRef = state.references[state.references.length - 1];
    if (!lastRef) return;
    
    // Slight delay to allow DOM render of the new pill
    setTimeout(() => {
      const pillElement = document.getElementById(`ref-pill-${refIndex}`);
      const frame = state.frames.find(f => f.page === lastRef.page && f.process === lastRef.process);
      if (!pillElement || !frame) return;

      const frameElement = frameCardRefs.current.get(frame.id);
      if (!frameElement) return;

      const pRect = pillElement.getBoundingClientRect();
      const fRect = frameElement.getBoundingClientRect();

      const color = pillElement.style.color || '#E11D48';

      setConnector({
        from: { x: pRect.left + pRect.width / 2, y: pRect.top },
        to: { x: fRect.left + fRect.width / 2, y: fRect.bottom },
        color,
        visible: true
      });

      setTimeout(() => {
        setConnector(c => ({ ...c, visible: false }));
      }, 1500);
    }, 50);
  }, [state.frames, state.references]);

  const usedRamMatch = state.meminfo.used.match(/(\d+\.?\d*)/);
  const totalRamMatch = state.meminfo.total.match(/(\d+\.?\d*)/);
  const usedRam = usedRamMatch ? parseFloat(usedRamMatch[1]) : 0;
  const totalRam = totalRamMatch ? parseFloat(totalRamMatch[1]) : 1;
  const ramPercent = Math.min(100, (usedRam / totalRam) * 100);

  const mainAreaWidth = activeScenario ? 'w-full' : 'w-full'; // layout adjustments
  
  return (
    <div className="h-[100dvh] flex flex-col overflow-hidden bg-[var(--bg)] text-gray-900 font-ui selection:bg-blue-200">
      
      {/* HEADER / MEMORY BAR */}
      <header className="flex-none h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 shadow-sm z-10 bg-gradient-to-b from-white to-gray-50/50">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center shadow-inner">
              <div className="w-2 h-2 bg-white rounded-full"></div>
            </div>
            <h1 className="font-bold text-lg tracking-tight text-gray-900">MemVis</h1>
          </div>
          
          <div className="h-6 w-px bg-gray-200 mx-2"></div>
          
          <div className="flex items-center gap-3 w-64">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">RAM</span>
            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden flex">
              <div className="bg-blue-500 h-full transition-all" style={{ width: `${ramPercent}%` }}></div>
            </div>
            <span className="text-xs font-mono font-medium text-gray-600">{state.meminfo.used} / {state.meminfo.total}</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">Algorithm</span>
            <select 
              value={state.stats.algorithm.toLowerCase()} 
              onChange={handleAlgorithmChange}
              className="bg-gray-50 border border-gray-200 rounded px-2 py-1 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 hover:bg-gray-100 transition-colors"
            >
              <option value="fifo">FIFO</option>
              <option value="lru">LRU</option>
              <option value="opt">OPT</option>
            </select>
          </div>

          <button 
            onClick={() => setShowLearningModal(true)}
            className="flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 px-3 py-1.5 rounded-[var(--radius-btn)] font-bold text-sm transition-colors shadow-sm"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"></path></svg>
            Learning Mode
          </button>

          <div className="flex items-center gap-2 ml-2 pl-4 border-l border-gray-200">
            <div className={`w-2 h-2 rounded-full ${state.connectionStatus === 'connected' ? 'bg-emerald-500' : 'bg-rose-500'}`}></div>
            <span className="text-xs font-medium text-gray-500 capitalize">{state.connectionStatus}</span>
          </div>
        </div>
      </header>

      {/* MAIN LAYOUT */}
      <main className="flex-1 flex min-h-0 relative">
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex h-[55%] min-h-0">
            <div className={`${activeScenario ? 'w-[42%]' : 'w-[60%]'} min-w-0 transition-all duration-300`}>
              <FrameGrid 
                frames={state.frames} 
                references={state.references} 
                pulseFrameId={pulseFrameId}
                highlightFrameIds={highlightFrameIds}
                frameCardRefs={frameCardRefs}
              />
            </div>
            <div className={`${activeScenario ? 'w-[58%]' : 'w-[40%]'} min-w-0 transition-all duration-300`}>
              <ProcessList processes={state.processes} onKill={(name) => sendCommand(`kill ${name}`)} />
            </div>
          </div>
          
          <div className="flex h-[45%] min-h-0">
            <div className={`${activeScenario ? 'w-[42%]' : 'w-[60%]'} min-w-0 transition-all duration-300 relative ${highlightStat ? 'narrator-highlight' : ''}`}>
              <ReferenceViewer 
                references={state.references} 
                stats={state.stats}
                onFaultConnector={handleFaultConnector}
              />
            </div>
            <div className={`${activeScenario ? 'w-[58%]' : 'w-[40%]'} min-w-0 transition-all duration-300 relative ${highlightLog ? 'narrator-highlight z-10' : ''}`}>
              <LogFeed logs={state.logs} onFrameHighlight={handleFrameHighlight} />
            </div>
          </div>
        </div>

        {activeScenario && (
          <NarratorPanel 
            scenario={activeScenario}
            onClose={closeScenario}
            onCommand={sendCommand}
            lastEventType={lastEventType}
            highlightFrameIds={highlightFrameIds}
            setHighlightFrameIds={setHighlightFrameIds}
            highlightStat={highlightStat}
            setHighlightStat={setHighlightStat}
            highlightLog={highlightLog}
            setHighlightLog={setHighlightLog}
          />
        )}
      </main>

      {/* COMMAND BAR */}
      <footer className="flex-none z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] relative">
        <CommandInput onCommand={sendCommand} history={history} processes={state.processes} />
      </footer>

      {/* MODALS */}
      {showLearningModal && (
        <LearningModeModal 
          onClose={() => setShowLearningModal(false)} 
          onStartScenario={startScenario} 
        />
      )}

      {/* SVG CONNECTOR OVERLAY */}
      {connector.visible && (
        <svg className="fixed inset-0 pointer-events-none z-30" style={{width:'100vw',height:'100vh'}}>
          <line 
            x1={connector.from.x} y1={connector.from.y} 
            x2={connector.to.x} y2={connector.to.y}
            stroke={connector.color} strokeWidth="2" strokeDasharray="6 3" opacity="0.8"
            className="connector-line-draw" 
          />
        </svg>
      )}
    </div>
  )
}

export default App;