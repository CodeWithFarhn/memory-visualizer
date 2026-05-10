import React from 'react';
import { scenarios } from '../scenarios';

interface Props {
  onClose: () => void;
  onStartScenario: (scenarioId: number) => void;
}

export const LearningModeModal: React.FC<Props> = ({ onClose, onStartScenario }) => {
  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Learning Scenarios</h2>
            <p className="text-gray-500 mt-1">Select a scenario to watch memory allocation concepts in action.</p>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-2 rounded-full hover:bg-gray-100"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto bg-gray-50/30">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {scenarios.map(scenario => (
              <div 
                key={scenario.id} 
                className="bg-white border border-gray-200 rounded-[var(--radius-card)] p-5 shadow-sm hover:shadow-md transition-shadow flex flex-col gap-3 group"
              >
                <div className="flex items-center gap-2">
                  <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded">Scenario {scenario.id}</span>
                </div>
                <h3 className="font-bold text-lg text-gray-900 leading-tight group-hover:text-blue-600 transition-colors">{scenario.name}</h3>
                <p className="text-sm text-gray-600 flex-1">{scenario.description}</p>
                <button 
                  onClick={() => onStartScenario(scenario.id)}
                  className="w-full mt-2 bg-white border border-gray-300 text-gray-700 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 font-medium py-2 rounded-[var(--radius-btn)] transition-colors"
                >
                  Start Scenario
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};