import React, { useMemo, useState, useEffect } from 'react';
import { ProcessedExpense, PeriodKey, ThresholdConfig, CategoryType, DeviationData, DeviationStatus, ComparisonMode } from '../types';
import { 
  formatCurrency, formatCompactCurrency, filterDataByPeriod, getMonthsForPeriod, 
  calculateDeviations, generatePareto, generateHeatmapData 
} from '../utils/dataProcessor';
import { PERIODS, CATEGORY_MAP, MONTH_NAMES } from '../constants';
import { 
  AlertTriangle, CheckCircle2, Settings2, BarChart3, PieChart as PieIcon,
  TrendingUp, Save, RotateCcw, ArrowRight, MinusCircle, Calendar, Target, X, ZoomIn
} from 'lucide-react';
import { 
  ComposedChart, Line, Bar, BarChart, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, Cell, Scatter
} from 'recharts';

interface DeviationViewProps {
  data: ProcessedExpense[];
  selectedYear: number;
  compareYear: number;
  selectedMonths: number[];
}

const DEFAULT_THRESHOLDS: ThresholdConfig = {
  healthyMax: 10,
  criticalMin: 20
};

const CATEGORIES: CategoryType[] = ['DC', 'DL', 'GGF', 'DA', 'DF', 'DP'];

// Interface for Heatmap Selection
interface HeatmapSelection {
    category: CategoryType;
    categoryName: string;
    monthIndex: number;
    monthName: string;
}

const DeviationView: React.FC<DeviationViewProps> = ({ data, selectedYear, compareYear, selectedMonths }) => {
  // --- STATE ---
  const [thresholds, setThresholds] = useState<ThresholdConfig>(DEFAULT_THRESHOLDS);
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [drillDownCategory, setDrillDownCategory] = useState<CategoryType | null>(null);
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>('BUDGET');
  const [heatmapSelection, setHeatmapSelection] = useState<HeatmapSelection | null>(null);

  // --- DATA PROCESSING LOGIC ---
  
  // 1. Prepare "Analysis Data" based on comparison mode
  // This logic "normalizes" the data so the rest of the component works the same way
  // regardless of whether we are comparing against Budget or Previous Year.
  const analysisData = useMemo(() => {
      // Base: Real data from Selected Year
      const currentReal = data.filter(d => d.year === selectedYear && d.dataType === 'REAL');

      let baselineData: ProcessedExpense[] = [];

      if (comparisonMode === 'BUDGET') {
          // Compare against Budget of Selected Year
          baselineData = data.filter(d => d.year === selectedYear && d.dataType === 'ORCADO');
      } else {
          // Compare against Real of Previous Year
          // TRICK: We map previous year data to 'ORCADO' type and 'selectedYear' 
          // so the aggregator functions treat them as the baseline for the current year.
          baselineData = data
            .filter(d => d.year === compareYear && d.dataType === 'REAL')
            .map(d => ({
                ...d,
                dataType: 'ORCADO', // Pretend to be budget for calculation purposes
                year: selectedYear  // Align year for month-matching
            }));
      }

      // Combine and apply Period Filter
      const combined = [...currentReal, ...baselineData];
      return filterDataByPeriod(combined, selectedMonths);
  }, [data, selectedYear, compareYear, comparisonMode, selectedMonths]);


  // 2. Aggregations (using the normalized analysisData)
  
  // A. Deviation by Category
  // FIX: Using Level 5 (Analytical) sum instead of Level 1 (Synthetic) to ensure we capture all expenses.
  const categoryDeviations = useMemo(() => {
    return calculateDeviations(
      analysisData.filter(d => d.level === 5), 
      'CATEGORY', 
      thresholds
    );
  }, [analysisData, thresholds]);

  // B. Deviation by Account (Level 5 - for Pareto and Drilldown)
  const accountDeviations = useMemo(() => {
    // STRICTLY LEVEL 5 as requested for targeted analysis
    const filtered = drillDownCategory 
       ? analysisData.filter(d => d.category === drillDownCategory && d.level === 5) 
       : analysisData.filter(d => d.level === 5); 
       
    return calculateDeviations(filtered, 'ACCOUNT', thresholds);
  }, [analysisData, thresholds, drillDownCategory]);

  // C. KPIs
  const kpis = useMemo(() => {
    const totalReal = categoryDeviations.reduce((acc, curr) => acc + curr.real, 0);
    const totalBudget = categoryDeviations.reduce((acc, curr) => acc + curr.budget, 0);
    const totalDiff = totalReal - totalBudget;
    const totalPerc = totalBudget ? (totalDiff / totalBudget) * 100 : 0;
    
    // Status Logic for Global KPI
    let globalStatus: DeviationStatus = 'HEALTHY';
    if (totalPerc > thresholds.criticalMin) globalStatus = 'CRITICAL';
    else if (totalPerc > thresholds.healthyMax) globalStatus = 'WARNING';

    const criticalCount = accountDeviations.filter(d => d.status === 'CRITICAL').length;
    
    return { totalReal, totalBudget, totalDiff, totalPerc, criticalCount, globalStatus };
  }, [categoryDeviations, accountDeviations, thresholds]);

  // D. Timeline Data (Real vs Baseline)
  // FIX: Summing Level 5 (Analytical) items to match the correct totals (~18.7M) instead of Level 1 (~7M)
  const timelineData = useMemo(() => {
    const months = getMonthsForPeriod(selectedMonths);
    return months.map(m => {
      const real = analysisData
        .filter(d => d.month === m.index && d.dataType === 'REAL' && d.category !== 'ROL' && d.level === 5)
        .reduce((sum, item) => sum + item.amount, 0);
      const budget = analysisData
        .filter(d => d.month === m.index && d.dataType === 'ORCADO' && d.category !== 'ROL' && d.level === 5)
        .reduce((sum, item) => sum + item.amount, 0);
      
      const diffPerc = budget ? ((real - budget) / budget) * 100 : 0;
      const isCritical = diffPerc > thresholds.criticalMin;

      return { name: m.name, Realizado: real, Orcado: budget, diffPerc, isCritical };
    });
  }, [analysisData, selectedMonths, thresholds]);

  // E. Pareto Data
  const paretoData = useMemo(() => generatePareto(accountDeviations), [accountDeviations]);

  // F. Heatmap Data
  const heatmapData = useMemo(() => {
    const months = getMonthsForPeriod(selectedMonths);
    return generateHeatmapData(analysisData, months, CATEGORIES);
  }, [analysisData, selectedMonths]);

  // G. Heatmap Drill-Down Data (Accounts causing the deviation in selected cell)
  const heatmapDrillData = useMemo(() => {
      if (!heatmapSelection) return [];

      // Filter level 5 accounts for that specific category and month
      const relevantData = analysisData.filter(d => 
          d.category === heatmapSelection.category &&
          d.month === heatmapSelection.monthIndex &&
          d.level === 5 // STRICTLY LEVEL 5 as requested
      );

      // Aggregate by Account Code
      const dev = calculateDeviations(relevantData, 'ACCOUNT', thresholds);
      
      // Sort by greatest absolute deviation (Positive first - "Who overspent?")
      return dev.sort((a, b) => b.absDeviation - a.absDeviation);

  }, [analysisData, heatmapSelection, thresholds]);


  // --- HANDLERS ---
  const handleThresholdChange = (key: keyof ThresholdConfig, val: string) => {
    setThresholds(prev => ({ ...prev, [key]: Number(val) }));
  };

  const resetThresholds = () => setThresholds(DEFAULT_THRESHOLDS);

  const handleHeatmapClick = (category: CategoryType, categoryName: string, monthIndex: number, monthName: string) => {
      setHeatmapSelection({ category, categoryName, monthIndex, monthName });
      // Scroll to detail slightly
      setTimeout(() => {
          document.getElementById('heatmap-detail')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
  };

  // --- COLOR HELPERS (Now consistently based on Status) ---

  const getStatusColorHex = (status: DeviationStatus) => {
    switch(status) {
        case 'CRITICAL': return '#ef4444'; // rose-500
        case 'WARNING': return '#eab308'; // yellow-500
        default: return '#10b981'; // emerald-500
    }
  };

  const getTextColorClass = (status: DeviationStatus) => {
    switch(status) {
        case 'CRITICAL': return 'text-rose-400';
        case 'WARNING': return 'text-yellow-400';
        default: return 'text-emerald-400';
    }
  };
  
  const getBadgeClass = (status: DeviationStatus) => {
    switch(status) {
        case 'CRITICAL': return 'bg-rose-500/20 text-rose-400 border-rose-500/50';
        case 'WARNING': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
        default: return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50';
    }
  };

  const baselineLabel = comparisonMode === 'BUDGET' ? 'Orçado' : `Real ${compareYear}`;

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      
      {/* HEADER & CONFIG */}
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 mb-2">
        <div>
           <h2 className="text-3xl font-bold text-white flex items-center gap-2">
              Análise de Desvios
              {drillDownCategory && (
                  <span className="text-xl font-normal text-slate-400 flex items-center gap-1">
                      <ArrowRight size={18} /> {CATEGORY_MAP[drillDownCategory]}
                      <button onClick={() => setDrillDownCategory(null)} className="ml-2 text-xs bg-slate-800 px-2 py-1 rounded hover:bg-slate-700">Limpar Filtro</button>
                  </span>
              )}
           </h2>
           <p className="text-slate-400 text-sm">
               Comparando <span className="text-white font-bold">{selectedYear}</span> contra <span className="text-white font-bold">{comparisonMode === 'BUDGET' ? 'Orçamento' : compareYear}</span>.
           </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
            {/* COMPARISON TOGGLE */}
            <div className="bg-slate-800 p-1 rounded-lg border border-slate-700 flex items-center">
                <button
                    onClick={() => setComparisonMode('BUDGET')}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all ${
                        comparisonMode === 'BUDGET' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                    }`}
                >
                    <Target size={14} /> vs Orçado
                </button>
                <button
                    onClick={() => setComparisonMode('YEAR')}
                    className={`px-3 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all ${
                        comparisonMode === 'YEAR' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                    }`}
                >
                    <Calendar size={14} /> vs {compareYear}
                </button>
            </div>

            {/* CONFIG TOGGLE */}
            <div className="relative">
                <button 
                    onClick={() => setIsConfigOpen(!isConfigOpen)}
                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-lg transition-colors border border-slate-700 h-[38px]"
                >
                    <Settings2 size={18} />
                    <span className="text-sm font-medium hidden md:inline">Critérios</span>
                </button>

                {isConfigOpen && (
                    <div className="absolute right-0 top-full mt-2 w-72 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 p-4 animate-fade-in-up">
                        <h4 className="text-sm font-bold text-white mb-3">Configurar Limiares (%)</h4>
                        
                        <div className="space-y-3 mb-4">
                            <div>
                                <label className="text-xs text-emerald-400 font-medium mb-1 block">Até que % é "Saudável"? (Verde)</label>
                                <input 
                                    type="number" 
                                    value={thresholds.healthyMax}
                                    onChange={(e) => handleThresholdChange('healthyMax', e.target.value)}
                                    className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-white text-sm"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-rose-400 font-medium mb-1 block">A partir de que % é "Crítico"? (Vermelho)</label>
                                <input 
                                    type="number" 
                                    value={thresholds.criticalMin}
                                    onChange={(e) => handleThresholdChange('criticalMin', e.target.value)}
                                    className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-white text-sm"
                                />
                            </div>
                            <div className="text-xs text-yellow-500 bg-yellow-900/10 p-2 rounded">
                                Entre {thresholds.healthyMax}% e {thresholds.criticalMin}% será considerado "Atenção" (Amarelo).
                            </div>
                        </div>

                        <div className="flex gap-2">
                            <button onClick={() => setIsConfigOpen(false)} className="flex-1 bg-blue-600 hover:bg-blue-700 text-white text-xs py-2 rounded font-bold flex items-center justify-center gap-1">
                                <Save size={14} /> Aplicar
                            </button>
                            <button onClick={resetThresholds} className="bg-slate-700 hover:bg-slate-600 text-slate-300 px-3 rounded" title="Restaurar Padrão">
                                <RotateCcw size={14} />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
      </div>

      {/* KPIS Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
         <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
            <p className="text-slate-400 text-xs uppercase font-bold tracking-wider">Total {baselineLabel}</p>
            <div className="text-2xl font-bold text-white mt-1">{formatCompactCurrency(kpis.totalBudget)}</div>
         </div>
         <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
            <p className="text-slate-400 text-xs uppercase font-bold tracking-wider">Total Realizado</p>
            <div className={`text-2xl font-bold mt-1 ${getTextColorClass(kpis.globalStatus)}`}>
                {formatCompactCurrency(kpis.totalReal)}
            </div>
         </div>
         <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4">
            <p className="text-slate-400 text-xs uppercase font-bold tracking-wider">Desvio Total</p>
            <div className="flex items-end gap-2 mt-1">
                 <span className={`text-2xl font-bold ${getTextColorClass(kpis.globalStatus)}`}>
                    {kpis.totalDiff > 0 ? '+' : ''}{formatCompactCurrency(kpis.totalDiff)}
                 </span>
                 <span className={`text-sm font-medium mb-1 ${getTextColorClass(kpis.globalStatus)}`}>
                    ({kpis.totalPerc.toFixed(1)}%)
                 </span>
            </div>
         </div>
         <div className={`border rounded-xl p-4 flex items-center gap-4 ${kpis.criticalCount > 0 ? 'bg-rose-900/10 border-rose-800' : 'bg-emerald-900/10 border-emerald-800'}`}>
            <div className={`p-3 rounded-full ${kpis.criticalCount > 0 ? 'bg-rose-500/20 text-rose-500' : 'bg-emerald-500/20 text-emerald-500'}`}>
                {kpis.criticalCount > 0 ? <AlertTriangle size={24} /> : <CheckCircle2 size={24} />}
            </div>
            <div>
                 <div className={`text-2xl font-bold ${kpis.criticalCount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {kpis.criticalCount}
                 </div>
                 <p className="text-slate-400 text-xs uppercase font-bold">Categorias Críticas (Nível 5)</p>
            </div>
         </div>
      </div>

      {/* MAIN ANALYSIS ROW: TIMELINE ONLY */}
      <div className="w-full">
         
         {/* Timeline Chart */}
         <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-lg">
            <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                <TrendingUp size={20} className="text-blue-400" />
                Evolução ({baselineLabel} vs Realizado)
            </h3>
            <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={timelineData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={true} horizontal={true} opacity={0.3} />
                        <XAxis dataKey="name" stroke="#94a3b8" axisLine={false} tickLine={false} dy={10} />
                        <YAxis stroke="#94a3b8" axisLine={false} tickLine={false} tickFormatter={(val) => formatCompactCurrency(val)} />
                        <Tooltip 
                            contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff' }}
                            formatter={(value: number) => formatCurrency(value)}
                        />
                        <Legend verticalAlign="top" height={36} />
                        <Area type="monotone" dataKey="Orcado" name={baselineLabel} fill="#3b82f6" fillOpacity={0.1} stroke="#3b82f6" strokeWidth={2} />
                        <Line type="monotone" dataKey="Realizado" stroke="#ef4444" strokeWidth={3} dot={{r:4}} activeDot={{r:6}} name="Realizado" />
                    </ComposedChart>
                </ResponsiveContainer>
            </div>
         </div>

      </div>

      {/* PARETO & CATEGORY DEVIATION */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Category Deviation Bars */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-lg">
             <h3 className="text-lg font-semibold text-white mb-6">Desvio por Categoria</h3>
             <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categoryDeviations} layout="vertical" margin={{ left: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#334155" opacity={0.3} />
                        <XAxis type="number" stroke="#94a3b8" tickFormatter={formatCompactCurrency} />
                        <YAxis type="category" dataKey="id" stroke="#94a3b8" width={40} />
                        
                        {/* CUSTOM TOOLTIP to enforce white text and show % */}
                        <Tooltip 
                            cursor={{fill: '#334155', opacity: 0.2}}
                            content={({ active, payload, label }) => {
                                if (active && payload && payload.length) {
                                    const data = payload[0].payload;
                                    return (
                                        <div className="bg-slate-950 border border-slate-700 p-3 rounded shadow-xl">
                                            <p className="font-bold text-white mb-2 text-sm">{label} - {CATEGORY_MAP[label as string]}</p>
                                            <div className="space-y-1">
                                                <div className="flex justify-between gap-4 text-xs">
                                                    <span className="text-slate-400">Desvio Absoluto:</span>
                                                    <span className="text-white font-mono font-medium">{formatCurrency(data.absDeviation)}</span>
                                                </div>
                                                <div className="flex justify-between gap-4 text-xs">
                                                    <span className="text-slate-400">Desvio %:</span>
                                                    <span className={`font-mono font-bold ${getTextColorClass(data.status)}`}>
                                                        {data.percDeviation.toFixed(1)}%
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }
                                return null;
                            }}
                        />
                        
                        <Bar dataKey="absDeviation" name="Desvio" radius={[0, 4, 4, 0]}>
                            {categoryDeviations.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={getStatusColorHex(entry.status)} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
             </div>
             <p className="text-xs text-slate-500 text-center mt-2">Clique nas barras para detalhar (Implementação futura)</p>
          </div>

          {/* Pareto Chart */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-lg">
             <h3 className="text-lg font-semibold text-white mb-2 flex items-center justify-between">
                 <span>Pareto de Desvios (Top 10)</span>
                 <span className="text-xs font-normal text-slate-400 bg-slate-900 px-2 py-1 rounded">Foco: {drillDownCategory ? drillDownCategory : 'Geral'}</span>
             </h3>
             <p className="text-xs text-slate-400 mb-4">Itens que mais contribuem para o estouro do orçamento (80/20) - Nível 5</p>
             
             <div className="h-72 w-full">
                {paretoData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={paretoData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} />
                            <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} interval={0} angle={-45} textAnchor="end" height={60} />
                            <YAxis yAxisId="left" stroke="#ef4444" tickFormatter={formatCompactCurrency} />
                            <YAxis yAxisId="right" orientation="right" stroke="#3b82f6" tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                            <Tooltip 
                                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff' }}
                                labelStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                                formatter={(value: number, name: string) => {
                                    if (name === '% Acumulado') return [`${value.toFixed(1)}%`, name];
                                    return [formatCurrency(value), name];
                                }}
                            />
                            <Bar yAxisId="left" dataKey="value" fill="#ef4444" name="Desvio Absoluto" barSize={30} radius={[4, 4, 0, 0]} />
                            <Line yAxisId="right" type="monotone" dataKey="cumulativePercent" stroke="#3b82f6" strokeWidth={2} dot={{r:3}} name="% Acumulado" />
                        </ComposedChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="h-full flex items-center justify-center text-slate-500">
                        Nenhum desvio positivo significativo para gerar Pareto.
                    </div>
                )}
             </div>
          </div>
      </div>

      {/* HEATMAP SECTION */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 overflow-x-auto shadow-lg">
          <h3 className="text-lg font-semibold text-white mb-2">Mapa de Calor: Desvio % por Categoria e Mês</h3>
          <p className="text-xs text-slate-400 mb-6">Clique nas células para ver quais contas causaram o desvio.</p>
          <div className="min-w-[800px]">
               {/* Header Row */}
               <div className="grid grid-cols-[150px_repeat(auto-fit,minmax(60px,1fr))] gap-1 mb-2">
                   <div className="font-bold text-slate-400 text-xs uppercase">Categoria</div>
                   {heatmapData.length > 0 && Object.keys(heatmapData[0])
                        .filter(k => k !== 'category' && k !== 'categoryName')
                        .map(month => (
                            <div key={month} className="text-center font-bold text-slate-400 text-xs uppercase">{month}</div>
                        ))
                   }
               </div>
               
               {/* Data Rows */}
               {heatmapData.map(row => (
                   <div key={row.category} className="grid grid-cols-[150px_repeat(auto-fit,minmax(60px,1fr))] gap-1 mb-1 items-center">
                       <div className="text-sm font-medium text-white truncate pr-2" title={row.categoryName}>{row.categoryName}</div>
                       {Object.keys(row)
                            .filter(k => k !== 'category' && k !== 'categoryName')
                            .map(month => {
                                const cell = row[month];
                                // Heatmap Color Logic using Status Thresholds
                                let bgClass = 'bg-slate-700/30';
                                if (cell.perc > thresholds.criticalMin) bgClass = 'bg-rose-600 text-white shadow-lg ring-1 ring-rose-500 z-10';
                                else if (cell.perc > thresholds.healthyMax) bgClass = 'bg-yellow-600 text-white'; // Warning -> Yellow
                                else if (cell.perc < 0) bgClass = 'bg-emerald-600/80 text-white'; // Savings
                                else bgClass = 'bg-emerald-600/50 text-white'; // Small deviation = Healthy

                                // Interactive selection
                                const isSelected = heatmapSelection?.category === row.category && heatmapSelection?.monthName === month;
                                if (isSelected) bgClass += ' ring-2 ring-white scale-110 z-20';

                                return (
                                    <button 
                                        key={month} 
                                        onClick={() => handleHeatmapClick(row.category, row.categoryName, MONTH_NAMES.indexOf(month) + 1, month)}
                                        className={`h-10 flex items-center justify-center rounded text-xs font-bold transition-all hover:scale-105 ${bgClass}`}
                                        title={`Real: ${formatCompactCurrency(cell.real)}\nBase: ${formatCompactCurrency(cell.budget)}\nDif: ${cell.perc.toFixed(1)}%`}
                                    >
                                        {cell.perc.toFixed(0)}%
                                    </button>
                                );
                            })
                       }
                   </div>
               ))}
          </div>
      </div>

      {/* HEATMAP DRILL-DOWN PANEL */}
      {heatmapSelection && (
          <div id="heatmap-detail" className="bg-slate-900 border-2 border-slate-700 rounded-xl p-6 animate-fade-in-up scroll-mt-24 shadow-2xl relative">
              <button 
                onClick={() => setHeatmapSelection(null)}
                className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors"
              >
                  <X size={20} />
              </button>

              <div className="flex items-center gap-3 mb-6">
                 <div className="p-3 bg-blue-900/30 rounded-lg border border-blue-800 text-blue-400">
                     <ZoomIn size={24} />
                 </div>
                 <div>
                     <h3 className="text-xl font-bold text-white">
                         Detalhamento: {heatmapSelection.categoryName} em {heatmapSelection.monthName}
                     </h3>
                     <p className="text-slate-400 text-sm">Contas (Nível 5) que contribuíram para este resultado.</p>
                 </div>
              </div>

              <div className="overflow-x-auto max-h-[400px] custom-scrollbar rounded-lg border border-slate-700">
                  <table className="w-full text-left text-sm text-slate-400">
                      <thead className="bg-slate-800 text-slate-200 uppercase font-bold sticky top-0 z-10">
                          <tr>
                              <th className="px-6 py-3">Conta / Descrição</th>
                              <th className="px-6 py-3 text-right">{baselineLabel}</th>
                              <th className="px-6 py-3 text-right">Realizado</th>
                              <th className="px-6 py-3 text-right">Desvio R$</th>
                              <th className="px-6 py-3 text-right">Desvio %</th>
                              <th className="px-6 py-3 text-center">Status</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 bg-slate-900/50">
                          {heatmapDrillData.length > 0 ? (
                              heatmapDrillData.map((item, idx) => (
                                  <tr key={`${item.id}-${idx}`} className="hover:bg-slate-800 transition-colors">
                                      <td className="px-6 py-3">
                                          <div className="font-medium text-white">{item.description}</div>
                                          <div className="text-xs text-slate-500 font-mono">{item.accountCode}</div>
                                      </td>
                                      <td className="px-6 py-3 text-right">{formatCompactCurrency(item.budget)}</td>
                                      <td className="px-6 py-3 text-right">{formatCompactCurrency(item.real)}</td>
                                      
                                      <td className={`px-6 py-3 text-right font-medium ${getTextColorClass(item.status)}`}>
                                          {item.absDeviation > 0 ? '+' : ''}{formatCompactCurrency(item.absDeviation)}
                                      </td>
                                      <td className={`px-6 py-3 text-right ${getTextColorClass(item.status)}`}>
                                          {item.percDeviation.toFixed(1)}%
                                      </td>
                                      
                                      <td className="px-6 py-3 text-center">
                                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${getBadgeClass(item.status)}`}>
                                              {item.status === 'HEALTHY' ? 'OK' : item.status === 'WARNING' ? 'ATENÇÃO' : 'CRÍTICO'}
                                          </span>
                                      </td>
                                  </tr>
                              ))
                          ) : (
                              <tr>
                                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                                      Nenhuma conta analítica de Nível 5 encontrada para esta seleção.
                                  </td>
                              </tr>
                          )}
                      </tbody>
                  </table>
              </div>
          </div>
      )}

      {/* DETAILED TABLE (GENERAL) */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-lg overflow-hidden">
          <div className="p-4 border-b border-slate-700 bg-slate-900/50 flex justify-between items-center">
              <h3 className="text-lg font-semibold text-white">Detalhamento Geral (Nível 5)</h3>
              <div className="flex gap-2">
                  <button 
                    onClick={() => setDrillDownCategory(null)}
                    className={`px-3 py-1 rounded text-xs font-bold transition-colors ${!drillDownCategory ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'}`}
                  >
                    Todas
                  </button>
                  {CATEGORIES.map(cat => (
                      <button 
                        key={cat}
                        onClick={() => setDrillDownCategory(cat)}
                        className={`px-3 py-1 rounded text-xs font-bold transition-colors ${drillDownCategory === cat ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-400'}`}
                      >
                        {cat}
                      </button>
                  ))}
              </div>
          </div>
          <div className="overflow-x-auto max-h-[500px] custom-scrollbar">
              <table className="w-full text-left text-sm text-slate-400">
                  <thead className="bg-slate-900 text-slate-200 uppercase font-medium sticky top-0 z-10">
                      <tr>
                          <th className="px-6 py-3">Conta / Descrição</th>
                          <th className="px-6 py-3 text-right">{baselineLabel}</th>
                          <th className="px-6 py-3 text-right">Realizado</th>
                          <th className="px-6 py-3 text-right">Desvio R$</th>
                          <th className="px-6 py-3 text-right">Desvio %</th>
                          <th className="px-6 py-3 text-center">Status</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                      {accountDeviations.map((item, idx) => (
                          <tr key={`${item.id}-${idx}`} className="hover:bg-slate-700/50 transition-colors">
                              <td className="px-6 py-3">
                                  <div className="font-medium text-white">{item.description}</div>
                                  <div className="text-xs text-slate-500 font-mono">{item.accountCode || item.category}</div>
                              </td>
                              <td className="px-6 py-3 text-right">{formatCompactCurrency(item.budget)}</td>
                              <td className="px-6 py-3 text-right">{formatCompactCurrency(item.real)}</td>
                              
                              <td className={`px-6 py-3 text-right font-medium ${getTextColorClass(item.status)}`}>
                                  {item.absDeviation > 0 ? '+' : ''}{formatCompactCurrency(item.absDeviation)}
                              </td>
                              <td className={`px-6 py-3 text-right ${getTextColorClass(item.status)}`}>
                                  {item.percDeviation.toFixed(1)}%
                              </td>
                              
                              <td className="px-6 py-3 text-center">
                                  <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold border ${getBadgeClass(item.status)}`}>
                                      {item.status === 'HEALTHY' ? 'OK' : item.status === 'WARNING' ? 'ATENÇÃO' : 'CRÍTICO'}
                                  </span>
                              </td>
                          </tr>
                      ))}
                  </tbody>
              </table>
          </div>
      </div>

    </div>
  );
};

export default DeviationView;