import React, { useState } from 'react';
import { useSSE } from './hooks/useSSE';
import { useCommand } from './hooks/useCommand';
import { FrameGrid } from './components/FrameGrid';
import { ProcessList } from './components/ProcessList';
import { ReferenceViewer } from './components/ReferenceViewer';
import { LogFeed } from './components/LogFeed';
import { CommandInput } from './components/CommandInput';
import { LearningModeModal } from './components/LearningModeModal';
import { scenarios } from './scenarios';

function App() {
  const { state, activeAnnotation, setExpectedAnnotations, clearActiveAnnotation } = useSSE();
  const { sendCommand, history } = useCommand();
  const [showLearningModal, setShowLearningModal] = useState(false);
  const startScenario = (scenarioId: number) => {
    const scenario = scenarios.find(s => s.id === scenarioId);
    if (!scenario) return;

    setShowLearningModal(false);
    setExpectedAnnotations(scenario.annotations);
    clearActiveAnnotation();

    // Execute commands with their specified delays
    scenario.commands.forEach(({ cmd, delay }) => {
      setTimeout(() => {
        sendCommand(cmd);
      }, delay);
    });
  };

  const handleAlgorithmChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    sendCommand(`algo ${e.target.value.toLowerCase()}`);
  };

  const usedRamMatch = state.meminfo.used.match(/(\d+\.?\d*)/);
  const totalRamMatch = state.meminfo.total.match(/(\d+\.?\d*)/);
  const usedRam = usedRamMatch ? parseFloat(usedRamMatch[1]) : 0;
  const totalRam = totalRamMatch ? parseFloat(totalRamMatch[1]) : 1;
  const ramPercent = Math.min(100, (usedRam / totalRam) * 100);

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
      <main className="flex-1 flex flex-col min-h-0 relative">
        <div className="flex h-[55%] min-h-0">
          <div className="w-[60%] min-w-0">
            <FrameGrid frames={state.frames} references={state.references} />
          </div>
          <div className="w-[40%] min-w-0">
            <ProcessList processes={state.processes} onKill={(name) => sendCommand(`kill ${name}`)} />
          </div>
        </div>
        
        <div className="flex h-[45%] min-h-0">
          <div className="w-[60%] min-w-0">
            <ReferenceViewer references={state.references} stats={state.stats} />
          </div>
          <div className="w-[40%] min-w-0">
            <LogFeed logs={state.logs} />
          </div>
        </div>

        {/* ACTIVE ANNOTATION OVERLAY */}
        {activeAnnotation && (
          <div className="absolute right-6 top-6 max-w-sm bg-indigo-600 text-white p-4 rounded-xl shadow-2xl animate-in slide-in-from-right fade-in border border-indigo-500 z-20">
            <div className="flex justify-between items-start mb-2 gap-4">
              <div className="flex items-center gap-2">
                <span className="bg-indigo-500 text-xs font-bold px-2 py-0.5 rounded uppercase tracking-wider text-indigo-50">{activeAnnotation.trigger}</span>
              </div>
              <button onClick={clearActiveAnnotation} className="text-indigo-300 hover:text-white transition-colors">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
              </button>
            </div>
            <p className="text-sm font-medium leading-relaxed">{activeAnnotation.text}</p>
          </div>
        )}
      </main>

      {/* COMMAND BAR */}
      <footer className="flex-none z-10 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <CommandInput onCommand={sendCommand} history={history} />
      </footer>

      {/* MODALS */}
      {showLearningModal && (
        <LearningModeModal 
          onClose={() => setShowLearningModal(false)} 
          onStartScenario={startScenario} 
        />
      )}
    </div>
  )
}

export default App
