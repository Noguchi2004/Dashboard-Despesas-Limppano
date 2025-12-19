import React, { useMemo, useState, useEffect } from 'react';
import { ProcessedExpense, CategoryType } from '../types';
import { formatCompactCurrency, filterDataByPeriod, getMonthsForPeriod, getPeriodLabel } from '../utils/dataProcessor';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LineChart, Line 
} from 'recharts';
import { BarChart3, TrendingUp, Calendar, Percent, CheckSquare, Settings } from 'lucide-react';
import { PERIODS, CATEGORY_MAP } from '../constants';
import PeriodSelector from '../components/PeriodSelector';

interface MacroViewProps {
  data: ProcessedExpense[];
  selectedYear: number;
  selectedMonths: number[];
  onPeriodChange: (months: number[]) => void;
}

// Internal ID system for checkboxes
// REAL_CAT_DC, BUDGET_CAT_DC, REAL_AGG_TOTAL, MOD_ABS, MOD_PERC
type CheckboxId = string;

const MacroView: React.FC<MacroViewProps> = ({ data, selectedYear: initialGlobalYear, selectedMonths, onPeriodChange }) => {
  // --- STATE ---
  const [selectedIds, setSelectedIds] = useState<Set<CheckboxId>>(new Set(['REAL_CAT_ROL', 'REAL_AGG_TOTAL', 'MOD_ABS']));
  const [selectedYears, setSelectedYears] = useState<Set<number>>(new Set([initialGlobalYear]));

  // Ensure global year is initially selected
  useEffect(() => {
    if (!selectedYears.has(initialGlobalYear)) {
      const newSet = new Set(selectedYears);
      newSet.add(initialGlobalYear);
      setSelectedYears(newSet);
    }
  }, [initialGlobalYear]);

  // --- FILTERED DATA ---
  const periodData = useMemo(() => filterDataByPeriod(data, selectedMonths), [data, selectedMonths]);
  
  const availableYears = useMemo(() => {
    return Array.from(new Set(periodData.map(d => d.year))).sort((a: number, b: number) => b - a);
  }, [periodData]);

  // --- HANDLERS ---
  const toggleId = (id: CheckboxId) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const toggleYear = (year: number) => {
    const newSet = new Set(selectedYears);
    if (newSet.has(year)) {
      if (newSet.size > 1) newSet.delete(year);
    } else {
      newSet.add(year);
    }
    setSelectedYears(newSet);
  };

  // --- OPTIONS DEFINITION ---
  const categories: CategoryType[] = ['DC', 'DL', 'GGF', 'DA', 'DF', 'DP'];
  
  // --- CHART DATA GENERATION ---
  const chartData = useMemo(() => {
    if (selectedYears.size === 0) return [];
    
    const yearsToProcess = Array.from(selectedYears).sort();
    const activeMonths = getMonthsForPeriod(selectedMonths);
    
    // Flags
    const showAbs = selectedIds.has('MOD_ABS');
    const showPercRol = selectedIds.has('MOD_PERC');

    // 1. Identify Active Scopes (Categories) and Modifiers (Types)
    const activeRealCats = categories.filter(c => selectedIds.has(`REAL_CAT_${c}`));
    const activeOrcadoCats = categories.filter(c => selectedIds.has(`ORCADO_CAT_${c}`));
    
    // Types: 'TOTAL', 'FIXED', 'VAR'
    const activeRealTypes: string[] = [];
    if (selectedIds.has('REAL_AGG_TOTAL')) activeRealTypes.push('TOTAL');
    if (selectedIds.has('REAL_AGG_FIXED')) activeRealTypes.push('FIXED');
    if (selectedIds.has('REAL_AGG_VAR')) activeRealTypes.push('VAR');

    const activeOrcadoTypes: string[] = [];
    if (selectedIds.has('ORCADO_AGG_TOTAL')) activeOrcadoTypes.push('TOTAL');
    if (selectedIds.has('ORCADO_AGG_FIXED')) activeOrcadoTypes.push('FIXED');
    if (selectedIds.has('ORCADO_AGG_VAR')) activeOrcadoTypes.push('VAR');


    return activeMonths.map((m) => {
        const point: any = { name: m.name };

        yearsToProcess.forEach(year => {
            const yearData = periodData.filter(d => d.year === year && d.month === m.index);
            
            // Calculate Base ROL (Level 1) for % Calculation
            const rolRealVal = yearData
                .filter(d => d.dataType === 'REAL' && d.category === 'ROL' && d.level === 1)
                .reduce((sum, item) => sum + item.amount, 0);

            const rolOrcadoVal = yearData
                .filter(d => d.dataType === 'ORCADO' && d.category === 'ROL' && d.level === 1)
                .reduce((sum, item) => sum + item.amount, 0);

            // --- HELPER TO ADD SERIES ---
            const addValue = (key: string, val: number, isBudget: boolean) => {
                const absVal = Math.abs(val);
                const rolBase = isBudget ? rolOrcadoVal : rolRealVal;

                if (showAbs || (!showAbs && !showPercRol)) {
                    point[key] = absVal;
                }
                if (showPercRol) {
                    // FIX: Don't show % ROL for ROL itself (always 100%)
                    if (!key.startsWith('ROL')) {
                        const perc = rolBase ? (absVal / Math.abs(rolBase)) * 100 : 0;
                        point[`% ${key}`] = perc;
                    }
                }
            };

            // --- 1. ROL (Always Independent) ---
            if (selectedIds.has('REAL_CAT_ROL')) {
                addValue(`ROL (Real) ${year}`, rolRealVal, false);
            }
            if (selectedIds.has('ORCADO_CAT_ROL')) {
                addValue(`ROL (Orç) ${year}`, rolOrcadoVal, true);
            }

            // --- 2. LOGIC FOR EXPENSES (REAL) ---
            
            // Scenario A: No Specific Categories Selected -> Use Types as Global Aggregates
            if (activeRealCats.length === 0) {
                if (activeRealTypes.includes('TOTAL')) {
                    const val = yearData.filter(d => d.dataType === 'REAL' && d.category !== 'ROL' && d.level === 5).reduce((s,i) => s+i.amount, 0);
                    addValue(`Total (Real) ${year}`, val, false);
                }
                if (activeRealTypes.includes('FIXED')) {
                    const val = yearData.filter(d => d.dataType === 'REAL' && d.category !== 'ROL' && d.level === 5 && !d.isVariable).reduce((s,i) => s+i.amount, 0);
                    addValue(`Despesas Fixas (Real) ${year}`, val, false);
                }
                if (activeRealTypes.includes('VAR')) {
                    const val = yearData.filter(d => d.dataType === 'REAL' && d.category !== 'ROL' && d.level === 5 && d.isVariable).reduce((s,i) => s+i.amount, 0);
                    addValue(`Despesas Variáveis (Real) ${year}`, val, false);
                }
            } 
            // Scenario B: Specific Categories Selected -> Use Types as Modifiers for those Categories
            else {
                activeRealCats.forEach(cat => {
                    const catLabel = CATEGORY_MAP[cat];
                    
                    // If NO type is selected, default to TOTAL for that category
                    const effectiveTypes = activeRealTypes.length === 0 ? ['TOTAL'] : activeRealTypes;

                    effectiveTypes.forEach(type => {
                        let val = 0;
                        let suffix = '';

                        if (type === 'TOTAL') {
                            val = yearData.filter(d => d.dataType === 'REAL' && d.category === cat && d.level === 5).reduce((s,i) => s+i.amount, 0);
                            suffix = ''; // Default name "Despesas Comerciais" implies total
                        } else if (type === 'FIXED') {
                            val = yearData.filter(d => d.dataType === 'REAL' && d.category === cat && d.level === 5 && !d.isVariable).reduce((s,i) => s+i.amount, 0);
                            suffix = ' (Fixo)';
                        } else if (type === 'VAR') {
                            val = yearData.filter(d => d.dataType === 'REAL' && d.category === cat && d.level === 5 && d.isVariable).reduce((s,i) => s+i.amount, 0);
                            suffix = ' (Variável)';
                        }
                        
                        addValue(`${catLabel}${suffix} (Real) ${year}`, val, false);
                    });
                });
            }

            // --- 3. LOGIC FOR EXPENSES (ORÇADO) ---
            // (Same logic mirrored)
            if (activeOrcadoCats.length === 0) {
                if (activeOrcadoTypes.includes('TOTAL')) {
                    const val = yearData.filter(d => d.dataType === 'ORCADO' && d.category !== 'ROL' && d.level === 5).reduce((s,i) => s+i.amount, 0);
                    addValue(`Total (Orç) ${year}`, val, true);
                }
                if (activeOrcadoTypes.includes('FIXED')) {
                    const val = yearData.filter(d => d.dataType === 'ORCADO' && d.category !== 'ROL' && d.level === 5 && !d.isVariable).reduce((s,i) => s+i.amount, 0);
                    addValue(`Fixo (Orç) ${year}`, val, true);
                }
                if (activeOrcadoTypes.includes('VAR')) {
                    const val = yearData.filter(d => d.dataType === 'ORCADO' && d.category !== 'ROL' && d.level === 5 && d.isVariable).reduce((s,i) => s+i.amount, 0);
                    addValue(`Variável (Orç) ${year}`, val, true);
                }
            } else {
                activeOrcadoCats.forEach(cat => {
                    const catLabel = CATEGORY_MAP[cat];
                    const effectiveTypes = activeOrcadoTypes.length === 0 ? ['TOTAL'] : activeOrcadoTypes;

                    effectiveTypes.forEach(type => {
                        let val = 0;
                        let suffix = '';
                        if (type === 'TOTAL') {
                            val = yearData.filter(d => d.dataType === 'ORCADO' && d.category === cat && d.level === 5).reduce((s,i) => s+i.amount, 0);
                            suffix = '';
                        } else if (type === 'FIXED') {
                            val = yearData.filter(d => d.dataType === 'ORCADO' && d.category === cat && d.level === 5 && !d.isVariable).reduce((s,i) => s+i.amount, 0);
                            suffix = ' (Fixo)';
                        } else if (type === 'VAR') {
                            val = yearData.filter(d => d.dataType === 'ORCADO' && d.category === cat && d.level === 5 && d.isVariable).reduce((s,i) => s+i.amount, 0);
                            suffix = ' (Variável)';
                        }
                        addValue(`${catLabel}${suffix} (Orç) ${year}`, val, true);
                    });
                });
            }

        });
        return point;
    });

  }, [periodData, selectedYears, selectedIds, selectedMonths]);

  // --- ACTIVE KEYS & COLORS ---
  const activeKeys = useMemo(() => {
     const keys: any[] = [];
     const years = Array.from(selectedYears).sort();
     const newestYear = years[years.length - 1];

     const getColor = (baseKey: string, type: 'REAL' | 'BUDGET') => {
        // Base color map
        const map: Record<string, string> = {
            'ROL': '#2563eb', // Blue
            'Total': '#ef4444', // Red
            'Fixo': '#7c3aed', // Purple
            'Variável': '#059669', // Green
            'Despesas Fixas': '#7c3aed',
            'Despesas Variáveis': '#059669',
            [CATEGORY_MAP['DC']]: '#3b82f6',
            [CATEGORY_MAP['DL']]: '#06b6d4',
            [CATEGORY_MAP['GGF']]: '#8b5cf6',
            [CATEGORY_MAP['DA']]: '#10b981',
            [CATEGORY_MAP['DF']]: '#f59e0b',
            [CATEGORY_MAP['DP']]: '#ef4444',
        };
        
        // Find best match for key (start of string)
        const match = Object.keys(map).find(k => baseKey.startsWith(k));
        const c = match ? map[match] : '#94a3b8';
        return c; 
     };

     if (chartData.length === 0) return [];
     
     // Inspect the first data point to determine what keys actually exist
     const availableKeys = Object.keys(chartData[0]).filter(k => k !== 'name');

     availableKeys.forEach(dataKey => {
         // Parse key structure: "% Name (Type) Year" or "Name (Type) Year"
         const isPerc = dataKey.startsWith('%');
         const cleanKey = isPerc ? dataKey.substring(2) : dataKey;
         
         // Extract Year (last 4 digits)
         const yearMatch = cleanKey.match(/(\d{4})$/);
         const year = yearMatch ? parseInt(yearMatch[1]) : 0;
         
         const isHistorical = years.length > 1 && year !== newestYear;
         const isBudget = cleanKey.includes('(Orç)');
         
         // Extract Base Name for Color (everything before (Real/Orc))
         const namePart = cleanKey.replace(/\s\((Real|Orç)\)\s\d{4}/, '');

         // Color Logic
         const color = getColor(namePart, isBudget ? 'BUDGET' : 'REAL');
         const opacity = isHistorical ? '66' : '';

         keys.push({
            key: dataKey,
            color: `${color}${opacity}`,
            yAxisId: isPerc ? 'right' : 'left',
            strokeDash: isBudget ? '5 5' : (isPerc ? '2 2' : undefined),
            strokeWidth: isBudget || isPerc ? 2 : (isHistorical ? 2 : 3),
            dotRadius: isHistorical ? 3 : 4,
            name: cleanKey // Simpler name for legend? Or keep full key?
         });
     });

     return keys;
  }, [selectedYears, chartData]);

  // Checkbox Component Helper
  const CheckBox: React.FC<{ id: string, label: string, color?: string }> = ({ id, label, color }) => (
    <label className="flex items-center gap-2 cursor-pointer group p-1.5 rounded hover:bg-slate-800/50 transition-colors">
        <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${selectedIds.has(id) ? 'bg-blue-600 border-blue-600' : 'border-slate-600 group-hover:border-slate-500'}`}>
            {selectedIds.has(id) && <CheckSquare size={12} className="text-white" />}
        </div>
        <input type="checkbox" className="hidden" onChange={() => toggleId(id)} checked={selectedIds.has(id)} />
        <span className={`text-xs ${selectedIds.has(id) ? 'text-white font-medium' : 'text-slate-400'}`} style={{ color: selectedIds.has(id) ? color : undefined }}>
            {label}
        </span>
    </label>
  );

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <div className="flex items-center gap-3 mb-2">
        <h2 className="text-3xl font-bold text-white">Visão Macro Personalizável</h2>
      </div>

      {/* NEW GRID CONFIGURATION */}
      {/* FIXED: Removed overflow-hidden and added relative z-index management so Dropdowns can float out */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-lg relative z-20">
        <div className="bg-slate-800/50 px-6 py-3 border-b border-slate-700 flex justify-between items-center rounded-t-xl">
          <h3 className="font-semibold text-white flex items-center gap-2"><Settings size={16} /> Configurar Visualização</h3>
          <span className="text-xs text-slate-400">{selectedIds.size} itens selecionados</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-slate-800">
            
            {/* COL 1: REAL METRICS */}
            <div className="p-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Métricas (Real)</h4>
                <div className="space-y-1">
                    <CheckBox id="REAL_CAT_ROL" label="ROL" color="#60a5fa" />
                    {categories.map(cat => (
                        <CheckBox key={cat} id={`REAL_CAT_${cat}`} label={CATEGORY_MAP[cat]} />
                    ))}
                </div>
            </div>

            {/* COL 2: TYPES */}
            <div className="p-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Tipos (Real)</h4>
                <div className="space-y-1">
                    <CheckBox id="REAL_AGG_TOTAL" label="Total" color="#f87171" />
                    <CheckBox id="REAL_AGG_FIXED" label="Despesas Fixas" color="#a78bfa" />
                    <CheckBox id="REAL_AGG_VAR" label="Despesas Variáveis" color="#34d399" />
                </div>
            </div>

            {/* COL 3: MODIFIERS & PERIOD - HIGHER Z-INDEX FOR DROPDOWN */}
            <div className="p-4 space-y-6 bg-slate-900/50 relative z-30">
                
                {/* Modifiers */}
                <div>
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Exibir</h4>
                    <div className="space-y-1">
                        <CheckBox id="MOD_ABS" label="Valor Absoluto (R$)" />
                        <CheckBox id="MOD_PERC" label="% ROL" color="#f59e0b" />
                    </div>
                </div>

                {/* Filters moved here */}
                <div>
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
                         <Calendar size={12} /> Anos
                    </h4>
                    <div className="flex flex-wrap gap-2 mb-4">
                        {availableYears.map(year => (
                        <button 
                            key={year}
                            onClick={() => toggleYear(year)}
                            className={`px-3 py-1 text-xs rounded-full border transition-all ${
                                selectedYears.has(year) 
                                ? 'bg-indigo-600 border-indigo-500 text-white shadow-sm' 
                                : 'bg-transparent border-slate-700 text-slate-400 hover:border-slate-500'
                            }`}
                        >
                            {year}
                        </button>
                        ))}
                    </div>

                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Período</h4>
                    <PeriodSelector selectedMonths={selectedMonths} onChange={onPeriodChange} className="w-full" />
                </div>
            </div>

            {/* COL 4: BUDGET (ORÇADO) */}
            <div className="p-4 space-y-3 bg-slate-900/30">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Orçado</h4>
                <div className="space-y-1 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                    <CheckBox id="ORCADO_CAT_ROL" label="ROL (Orç)" />
                    {categories.map(cat => (
                        <CheckBox key={cat} id={`ORCADO_CAT_${cat}`} label={CATEGORY_MAP[cat]} />
                    ))}
                    <div className="h-px bg-slate-800 my-2"></div>
                    <CheckBox id="ORCADO_AGG_TOTAL" label="Total (Orç)" />
                    <CheckBox id="ORCADO_AGG_FIXED" label="Fixo (Orç)" />
                    <CheckBox id="ORCADO_AGG_VAR" label="Variável (Orç)" />
                </div>
            </div>

        </div>
      </div>

      {/* CHART SECTION */}
      {/* Lower z-index so dropdowns from above can overlap it */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 min-h-[400px] shadow-lg relative z-10">
          <div className="w-full h-96">
             {activeKeys.length > 0 ? (
                 <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 30, left: 20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={true} horizontal={true} opacity={0.3} />
                        <XAxis dataKey="name" stroke="#94a3b8" axisLine={false} tickLine={false} dy={10} />
                        <YAxis yAxisId="left" stroke="#94a3b8" axisLine={false} tickLine={false} tickFormatter={(val) => `R$${(val/1000000).toFixed(1)}M`} />
                        <YAxis yAxisId="right" orientation="right" stroke="#94a3b8" axisLine={false} tickLine={false} tickFormatter={(val) => `${val}%`} domain={[0, 'auto']} hide={!activeKeys.some(k => k.yAxisId === 'right')} />
                        <Tooltip 
                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff' }}
                            labelStyle={{ color: '#94a3b8', marginBottom: '0.5rem', fontWeight: 'bold' }}
                            labelFormatter={(label) => `Mês: ${label}`}
                            formatter={(value: number, name: string) => {
                                if (name.includes('%')) return [`${value.toFixed(1)}%`, name];
                                return [formatCompactCurrency(value), name];
                            }}
                        />
                        <Legend wrapperStyle={{ paddingTop: '20px' }} />
                        {activeKeys.map((k) => (
                            <Line 
                                key={k.key} 
                                yAxisId={k.yAxisId} 
                                type="monotone" 
                                dataKey={k.key} 
                                stroke={k.color} 
                                strokeWidth={k.strokeWidth}
                                strokeDasharray={k.strokeDash}
                                dot={{r: k.dotRadius, fill: k.color, strokeWidth: 0}} 
                                activeDot={{r: k.dotRadius + 2}}
                            />
                        ))}
                    </LineChart>
                 </ResponsiveContainer>
             ) : (
                 <div className="h-full w-full flex flex-col items-center justify-center text-slate-500">
                     <div className="p-4 bg-slate-800 rounded-xl mb-4">
                        <BarChart3 size={48} className="opacity-50" />
                     </div>
                     <h4 className="text-lg font-medium text-slate-400">Nenhum dado selecionado</h4>
                     <p className="text-sm">Selecione métricas e o modo de exibição (Absoluto ou %)</p>
                 </div>
             )}
          </div>
      </div>
    </div>
  );
};

export default MacroView;