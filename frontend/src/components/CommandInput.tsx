import React, { useState } from 'react';

interface Props {
  onCommand: (cmd: string) => void;
  history: string[];
}

export const CommandInput: React.FC<Props> = ({ onCommand, history }) => {
  const [input, setInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim()) {
      onCommand(input.trim());
      setInput('');
    }
  };

  return (
    <div className="w-full bg-white border-t border-gray-200 p-3 flex flex-col gap-2">
      {history.length > 0 && (
        <div className="flex gap-2 px-1">
          {history.slice(0, 5).map((cmd, i) => (
            <button
              key={i}
              onClick={() => setInput(cmd)}
              className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 px-2 py-1 rounded-full font-mono transition-colors"
            >
              {cmd}
            </button>
          ))}
        </div>
      )}
      <form onSubmit={handleSubmit} className="flex gap-2">
        <div className="flex-1 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-mono font-bold">$</span>
          <input 
            type="text" 
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="add P1 3 | kill P1 | algo lru | frames 8 | reset"
            className="w-full bg-gray-50 border border-gray-300 rounded-[var(--radius-btn)] py-2 pl-8 pr-4 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
          />
        </div>
        <button 
          type="submit"
          disabled={!input.trim()}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-bold py-2 px-6 rounded-[var(--radius-btn)] transition-colors"
        >
          Run
        </button>
      </form>
    </div>
  );
};