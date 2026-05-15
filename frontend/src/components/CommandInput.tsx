import React, { useState, useEffect } from 'react';
import { ProcessState } from '../types';

interface Props {
  onCommand: (cmd: string) => void;
  history: string[];
  processes: ProcessState[];
}

export const CommandInput: React.FC<Props> = ({ onCommand, history, processes }) => {
  const [mode, setMode] = useState<'Visual' | 'Terminal'>('Visual');
  const [terminalInput, setTerminalInput] = useState('');
  
  const [visualAction, setVisualAction] = useState('Add Process');
  const [addName, setAddName] = useState('P1');
  const [addPages, setAddPages] = useState(4);
  const [killName, setKillName] = useState('');
  const [framesValue, setFramesValue] = useState(8);

  useEffect(() => {
    if (processes.length > 0 && !killName) {
      setKillName(processes[0].name);
    }
  }, [processes, killName]);

  const handleSwitchMode = (newMode: 'Visual' | 'Terminal') => {
    if (newMode === 'Terminal' && mode === 'Visual') {
      if (visualAction === 'Add Process') {
        setTerminalInput(`add ${addName || 'P1'} ${addPages}`);
      } else if (visualAction === 'Kill Process') {
        setTerminalInput(`kill ${killName || (processes.length > 0 ? processes[0].name : 'P1')}`);
      } else if (visualAction === 'Set Algorithm') {
        setTerminalInput('algo fifo');
      } else if (visualAction === 'Resize Memory') {
        setTerminalInput(`frames ${framesValue}`);
      }
    }
    setMode(newMode);
  };

  const handleVisualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (visualAction === 'Add Process') {
      onCommand(`add ${addName || 'P1'} ${addPages}`);
    } else if (visualAction === 'Kill Process') {
      if (killName) onCommand(`kill ${killName}`);
    } else if (visualAction === 'Resize Memory') {
      onCommand(`frames ${framesValue}`);
    }
  };

  const handleTerminalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (terminalInput.trim()) {
      onCommand(terminalInput.trim());
      setTerminalInput('');
    }
  };

  return (
    <div className="w-full bg-white border-t border-gray-200 p-3 flex flex-col gap-2 relative">
      {/* Mode toggle */}
      <div className="absolute left-3 top-[-16px] bg-white border border-gray-200 rounded-full flex overflow-hidden shadow-sm shadow-[0_-2px_4px_rgba(0,0,0,0.05)] text-xs font-bold">
        <button 
          onClick={() => handleSwitchMode('Visual')}
          className={`px-3 py-1 transition-colors ${mode === 'Visual' ? 'bg-blue-50 text-blue-700' : 'bg-transparent text-gray-500 hover:bg-gray-50'}`}
        >
          Visual
        </button>
        <button 
          onClick={() => handleSwitchMode('Terminal')}
          className={`px-3 py-1 transition-colors ${mode === 'Terminal' ? 'bg-blue-50 text-blue-700' : 'bg-transparent text-gray-500 hover:bg-gray-50'}`}
        >
          Terminal
        </button>
      </div>

      <div className="pt-2">
        {mode === 'Visual' ? (
          <form onSubmit={handleVisualSubmit} className="flex gap-4 items-center animate-in fade-in slide-in-from-left-2 duration-200">
            <select 
              value={visualAction}
              onChange={e => setVisualAction(e.target.value)}
              className="bg-gray-50 border border-gray-300 rounded-[var(--radius-btn)] py-2 px-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            >
              <option value="Add Process">Add Process</option>
              <option value="Kill Process">Kill Process</option>
              <option value="Set Algorithm">Set Algorithm</option>
              <option value="Resize Memory">Resize Memory</option>
            </select>

            <div className="flex-1 flex gap-4 items-center">
              {visualAction === 'Add Process' && (
                <>
                  <input 
                    type="text" 
                    value={addName} 
                    onChange={e => setAddName(e.target.value)} 
                    placeholder="P1" 
                    className="w-24 bg-gray-50 border border-gray-300 rounded py-1.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" 
                  />
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-600">Pages:</span>
                    <input 
                      type="number" 
                      min="1" max="32" 
                      value={addPages} 
                      onChange={e => setAddPages(parseInt(e.target.value) || 1)} 
                      className="w-16 bg-gray-50 border border-gray-300 rounded py-1.5 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" 
                    />
                  </div>
                  <button type="submit" className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-1.5 px-6 rounded transition-colors ml-auto">
                    Create
                  </button>
                </>
              )}

              {visualAction === 'Kill Process' && (
                <>
                  <select 
                    value={killName}
                    onChange={e => setKillName(e.target.value)}
                    className="bg-gray-50 border border-gray-300 rounded py-1.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {processes.map(p => (
                      <option key={p.name} value={p.name}>{p.name}</option>
                    ))}
                    {processes.length === 0 && <option value="" disabled>No processes</option>}
                  </select>
                  <button type="submit" disabled={!killName} className="bg-rose-600 hover:bg-rose-700 disabled:bg-rose-300 text-white font-bold py-1.5 px-6 rounded transition-colors ml-auto">
                    Kill
                  </button>
                </>
              )}

              {visualAction === 'Set Algorithm' && (
                <div className="flex gap-2 bg-gray-100 p-1 rounded-full border border-gray-200">
                  {['FIFO', 'LRU', 'OPT'].map(algo => (
                    <button
                      key={algo}
                      type="button"
                      onClick={() => onCommand(`algo ${algo.toLowerCase()}`)}
                      className="px-4 py-1 rounded-full text-sm font-bold bg-white shadow-sm border border-gray-200 text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                    >
                      {algo}
                    </button>
                  ))}
                </div>
              )}

              {visualAction === 'Resize Memory' && (
                <>
                  <input 
                    type="range" 
                    min="1" max="32" 
                    value={framesValue}
                    onChange={e => setFramesValue(parseInt(e.target.value))}
                    className="flex-1 accent-blue-600"
                  />
                  <span className="font-mono font-bold text-gray-700 w-8">{framesValue}</span>
                  <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-6 rounded transition-colors ml-auto">
                    Apply
                  </button>
                </>
              )}
            </div>
          </form>
        ) : (
          <div className="flex flex-col gap-2 animate-in fade-in slide-in-from-right-2 duration-200">
            {history.length > 0 && (
              <div className="flex gap-2 px-1">
                {history.slice(0, 5).map((cmd, i) => (
                  <button
                    key={i}
                    onClick={() => setTerminalInput(cmd)}
                    className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-2 py-1 rounded-full font-mono transition-colors"
                  >
                    {cmd}
                  </button>
                ))}
              </div>
            )}
            <form onSubmit={handleTerminalSubmit} className="flex gap-2">
              <div className="flex-1 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-mono font-bold">$</span>
                <input 
                  type="text" 
                  value={terminalInput}
                  onChange={e => setTerminalInput(e.target.value)}
                  placeholder="add P1 3 | kill P1 | algo lru | frames 8 | reset"
                  className="w-full bg-gray-50 border border-gray-300 rounded-[var(--radius-btn)] py-2 pl-8 pr-4 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                />
              </div>
              <button 
                type="submit"
                disabled={!terminalInput.trim()}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-bold py-2 px-6 rounded-[var(--radius-btn)] transition-colors"
              >
                Run
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
