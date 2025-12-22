import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Clock, ChevronDown, Check, MousePointerClick } from 'lucide-react';
import { PeriodKey } from '../types';
import { PERIODS } from '../constants';
import { getPeriodLabel } from '../utils/dataProcessor';

interface PeriodSelectorProps {
  selectedMonths: number[];
  onChange: (months: number[]) => void;
  className?: string; // Allow custom styling
}

const PeriodSelector: React.FC<PeriodSelectorProps> = ({ selectedMonths, onChange, className }) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isPresetActive = (presetKey: PeriodKey) => {
    const targetMonths = PERIODS[presetKey].months;
    if (targetMonths.length !== selectedMonths.length) return false;
    return targetMonths.every(m => selectedMonths.includes(m));
  };

  const handlePresetSelect = (key: PeriodKey) => {
    onChange(PERIODS[key].months);
  };

  const toggleMonth = (monthIndex: number) => {
    let newSelection = [...selectedMonths];
    if (newSelection.includes(monthIndex)) {
      newSelection = newSelection.filter(m => m !== monthIndex);
    } else {
      newSelection.push(monthIndex);
    }
    newSelection.sort((a, b) => a - b);
    onChange(newSelection);
  };

  const label = useMemo(() => getPeriodLabel(selectedMonths), [selectedMonths]);

  const renderQuarterRow = (qKey: PeriodKey, monthKeys: PeriodKey[]) => (
    <div className="flex items-center gap-2 mb-1">
      <button
        onClick={() => handlePresetSelect(qKey)}
        className={`flex-1 text-left text-xs px-2 py-1.5 rounded transition-colors ${
          isPresetActive(qKey) ? 'bg-blue-600/20 text-blue-400 font-bold border border-blue-600/50' : 'text-slate-300 hover:bg-slate-700'
        }`}
      >
        {PERIODS[qKey].label}
      </button>
      <div className="flex gap-1">
        {monthKeys.map(mKey => {
           const mIndex = PERIODS[mKey].months[0];
           const isSelected = selectedMonths.includes(mIndex);
           return (
              <button
                key={mKey}
                onClick={() => toggleMonth(mIndex)}
                className={`w-8 text-center text-[10px] py-1.5 rounded transition-colors border ${
                  isSelected 
                    ? 'bg-blue-600 text-white font-bold border-blue-500' 
                    : 'bg-slate-800 text-slate-400 border-slate-700 hover:bg-slate-700 hover:text-white'
                }`}
                title={PERIODS[mKey].label}
              >
                {PERIODS[mKey].label.substr(0, 3)}
              </button>
           );
        })}
      </div>
    </div>
  );

  return (
    <div className={`relative ${className || ''}`} ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 bg-slate-900/80 backdrop-blur border border-slate-800 p-1.5 rounded-lg shadow-sm hover:border-slate-600 transition-colors w-full min-w-[160px] justify-between group"
      >
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-slate-400 ml-1 group-hover:text-blue-400 transition-colors" />
          <span className="text-sm font-medium text-blue-200 truncate max-w-[180px]">
            {label}
          </span>
        </div>
        <ChevronDown size={14} className={`text-slate-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden animate-fade-in ring-1 ring-white/10">
          <div className="p-3">
             <div className="flex items-center justify-between px-1 mb-2">
                 <span className="text-[10px] uppercase text-slate-500 font-bold">Filtro de Período</span>
                 <span className="text-[10px] text-blue-400 flex items-center gap-1">
                     <MousePointerClick size={10} /> Clique nos meses para somar
                 </span>
             </div>

            <div className="mb-3">
               <button
                  onClick={() => handlePresetSelect('ALL')}
                  className={`w-full text-left text-xs px-2 py-2 rounded transition-colors flex justify-between items-center ${
                    isPresetActive('ALL') ? 'bg-blue-600 text-white font-bold' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  Ano Completo
                  {isPresetActive('ALL') && <Check size={12} />}
                </button>
            </div>

            <div className="mb-3 grid grid-cols-2 gap-2">
                 {['S1', 'S2'].map((key) => (
                   <button
                    key={key}
                    onClick={() => handlePresetSelect(key as PeriodKey)}
                    className={`text-center text-xs px-2 py-1.5 rounded transition-colors ${
                      isPresetActive(key as PeriodKey) ? 'bg-blue-600 text-white font-bold' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                    }`}
                   >
                     {PERIODS[key as PeriodKey].label}
                   </button>
                 ))}
            </div>

            <div className="space-y-1">
                {renderQuarterRow('Q1', ['M1', 'M2', 'M3'])}
                {renderQuarterRow('Q2', ['M4', 'M5', 'M6'])}
                {renderQuarterRow('Q3', ['M7', 'M8', 'M9'])}
                {renderQuarterRow('Q4', ['M10', 'M11', 'M12'])}
            </div>
            
            <div className="mt-3 pt-3 border-t border-slate-800 text-center">
                 <p className="text-[10px] text-slate-500">
                     {selectedMonths.length === 0 
                        ? 'Nenhum mês selecionado' 
                        : `${selectedMonths.length} meses selecionados`}
                 </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PeriodSelector;