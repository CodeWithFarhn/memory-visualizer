import React from 'react';
import { scenarios } from '../scenarios';

interface Props {
  onClose: () => void;
  onStartScenario: (scenarioId: number) => void;
}

export const LearningModeModal: React.FC<Props> = ({ onClose, onStartScenario }) => {
  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {scenarios.map(scenario => {
              let badgeColor = 'bg-emerald-100 text-emerald-700';
              if (scenario.difficulty === 'Intermediate') badgeColor = 'bg-amber-100 text-amber-700';
              if (scenario.difficulty === 'Advanced') badgeColor = 'bg-rose-100 text-rose-700';

              return (
                <div 
                  key={scenario.id} 
                  className="bg-white border border-gray-200 rounded-[var(--radius-card)] p-5 shadow-sm hover:shadow-lg transition-all flex flex-col gap-3 group"
                >
                  <div className="flex justify-between items-start">
                    <span className="bg-blue-50 border border-blue-100 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-full tracking-wide">
                      {scenario.concept_tag}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${badgeColor}`}>
                      {scenario.difficulty}
                    </span>
                  </div>
                  
                  <div className="mt-1">
                    <h3 className="font-bold text-xl text-gray-900 leading-tight group-hover:text-blue-600 transition-colors">{scenario.name}</h3>
                    <p className="text-sm text-gray-500 mt-1">{scenario.estimated_time}</p>
                  </div>
                  
                  <p className="text-sm text-gray-700 flex-1 leading-relaxed mt-2 border-t border-gray-50 pt-3">{scenario.description}</p>
                  
                  <button 
                    onClick={() => onStartScenario(scenario.id)}
                    className="w-full mt-4 bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 font-bold py-2.5 rounded-[var(--radius-btn)] transition-colors shadow-sm"
                  >
                    Start Scenario
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};