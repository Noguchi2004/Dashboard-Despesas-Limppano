import React, { useMemo, useState } from 'react';
import { ProcessedExpense, CategoryType, ComparisonMode } from '../types';
import { formatCompactCurrency, formatCurrency, filterDataByPeriod, getMonthsForPeriod, getPeriodLabel } from '../utils/dataProcessor';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Legend, LineChart, Line, PieChart, Pie, Cell, BarChart, Bar, ComposedChart
} from 'recharts';
import { Info, Target, Calendar, ArrowUpRight, ArrowDownRight, Minus, TrendingUp, ChevronDown, Filter, X, MousePointerClick, Check, Layers, Calculator } from 'lucide-react';

interface GeneralViewProps {
  data: ProcessedExpense[];
  selectedYear: number;
  compareYear: number;
  availableYears: number[];
  selectedMonths: number[];
  setSelectedYear: (year: number) => void;
  setCompareYear: (year: number) => void;
}

const COLORS: Record<string, string> = {
  'DC': '#3b82f6', // Despesas Comerciais (Blue)
  'DL': '#06b6d4', // Despesas Logísticas (Cyan)
  'GGF': '#8b5cf6', // GGF (Purple)
  'DA': '#10b981', // Despesas Administrativas (Emerald/Green)
  'DF': '#f59e0b', // Despesas Financeiras (Amber/Orange)
  'DP': '#ef4444', // Depreciação (Red)
  'ROL': '#2563eb', // ROL (Specific Blue from Screenshot)
  'TOTAL': '#ef4444', // Total Expenses (Specific Red from Screenshot)
  'FIXO': '#3b82f6',
  'VAR': '#10b981'
};

const CATEGORY_LABELS: Record<string, string> = {
  'DC': 'Despesas Comerciais',
  'DL': 'Despesas Logísticas',
  'GGF': 'GGF',
  'DA': 'Despesas Administrativas',
  'DF': 'Despesas Financeiras',
  'DP': 'Depreciação'
};

const GeneralView: React.FC<GeneralViewProps> = ({ 
  data, 
  selectedYear, 
  compareYear, 
  availableYears,
  selectedMonths,
  setSelectedYear,
  setCompareYear
}) => {
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>('BUDGET');
  // Alterado para Array para suportar multi-seleção
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  
  // New States for Pie Chart Filter
  const [showFixedPie, setShowFixedPie] = useState(true);
  const [showVariablePie, setShowVariablePie] = useState(true);

  // 1. Global Filter by Period
  const periodFilteredData = useMemo(() => filterDataByPeriod(data, selectedMonths), [data, selectedMonths]);

  // 2. Separate Current vs Baseline Data
  const currentData = useMemo(() => 
    periodFilteredData.filter(d => d.year === selectedYear && d.dataType === 'REAL'), 
  [periodFilteredData, selectedYear]);

  const baselineData = useMemo(() => {
    if (comparisonMode === 'BUDGET') {
      return periodFilteredData.filter(d => d.year === selectedYear && d.dataType === 'ORCADO');
    } else {
      return periodFilteredData.filter(d => d.year === compareYear && d.dataType === 'REAL');
    }
  }, [periodFilteredData, selectedYear, compareYear, comparisonMode]);

  // 3. ROL Calculation (Level 1)
  const currentROL = useMemo(() => 
    currentData.filter(d => d.category === 'ROL' && d.level === 1).reduce((acc, curr) => acc + curr.amount, 0),
  [currentData]);

  const baselineROL = useMemo(() => 
    baselineData.filter(d => d.category === 'ROL' && d.level === 1).reduce((acc, curr) => acc + curr.amount, 0),
  [baselineData]);

  // 4. Monthly Performance (ROL vs Total Expenses)
  const activeMonths = useMemo(() => getMonthsForPeriod(selectedMonths), [selectedMonths]);
  
  const monthlyPerformanceData = useMemo(() => {
    return activeMonths.map(m => {
      const rol = currentData
        .filter(d => d.month === m.index && d.category === 'ROL' && d.level === 1)
        .reduce((acc, curr) => acc + curr.amount, 0);
      
      const totalExp = currentData
        .filter(d => d.month === m.index && d.category !== 'ROL' && d.level === 5)
        .reduce((acc, curr) => acc + curr.amount, 0);
      
      return {
        name: m.name,
        rol: Math.abs(rol),
        total: Math.abs(totalExp)
      };
    });
  }, [currentData, activeMonths]);

  // 5. Aggregated Categories Analysis (For Top Cards & Line Chart)
  const categoryAnalysis = useMemo(() => {
    const cats: CategoryType[] = ['DC', 'DL', 'GGF', 'DA', 'DF', 'DP'];
    
    return cats.map(cat => {
      const currentVal = currentData
        .filter(d => d.category === cat && d.level === 5)
        .reduce((acc, curr) => acc + curr.amount, 0);
      
      const baselineVal = baselineData
        .filter(d => d.category === cat && d.level === 5)
        .reduce((acc, curr) => acc + curr.amount, 0);

      const currentPercRol = currentROL ? (currentVal / currentROL) * 100 : 0;
      const baselinePercRol = baselineROL ? (baselineVal / baselineROL) * 100 : 0;
      
      // Calculate growth vs Baseline (Absolute Amount)
      const diffAmount = currentVal - baselineVal;
      const percDiff = baselineVal !== 0 ? (diffAmount / baselineVal) * 100 : 0;

      return {
        id: cat,
        label: CATEGORY_LABELS[cat],
        amount: Math.abs(currentVal),
        baselineAmount: Math.abs(baselineVal),
        percentRol: currentPercRol,
        baselinePercentRol: baselinePercRol,
        percDiff: percDiff, // Growth/Shrinkage %
        color: COLORS[cat]
      };
    });
  }, [currentData, baselineData, currentROL, baselineROL]);

  // 6. Monthly Fixed vs Variable (Level 5) - FILTERED BY SELECTION
  const monthlyComposition = useMemo(() => {
    // Se houver filtro, filtra os dados. Se não, usa todos (menos ROL)
    const sourceData = selectedCategories.length > 0
        ? currentData.filter(d => selectedCategories.includes(d.category))
        : currentData;

    return activeMonths.map(m => {
      const fixed = sourceData
        .filter(d => d.month === m.index && d.level === 5 && !d.isVariable && d.category !== 'ROL')
        .reduce((acc, curr) => acc + curr.amount, 0);
      const variable = sourceData
        .filter(d => d.month === m.index && d.level === 5 && d.isVariable && d.category !== 'ROL')
        .reduce((acc, curr) => acc + curr.amount, 0);
      
      return {
        name: m.name.toLowerCase(),
        'Despesas Fixas': Math.abs(fixed),
        'Despesas Variáveis': Math.abs(variable)
      };
    });
  }, [currentData, activeMonths, selectedCategories]);

  // 7. Evolution Data for Category Line Chart
  const evolutionData = useMemo(() => {
    return activeMonths.map(m => {
      const point: any = { name: m.name };
      categoryAnalysis.forEach(cat => {
        const val = currentData
          .filter(d => d.month === m.index && d.category === cat.id && d.level === 5)
          .reduce((acc, curr) => acc + curr.amount, 0);
        point[cat.label] = Math.abs(val);
      });
      return point;
    });
  }, [currentData, activeMonths, categoryAnalysis]);

  // 8a. Global Totals (Static - Always shows total)
  const globalTotals = useMemo(() => {
    const fixed = currentData.filter(d => d.level === 5 && !d.isVariable && d.category !== 'ROL').reduce((acc, curr) => acc + curr.amount, 0);
    const variable = currentData.filter(d => d.level === 5 && d.isVariable && d.category !== 'ROL').reduce((acc, curr) => acc + curr.amount, 0);
    const totalDespesas = fixed + variable;
    const propVar = totalDespesas ? (variable / totalDespesas) * 100 : 0;

    return {
      fixed: Math.abs(fixed),
      variable: Math.abs(variable),
      total: Math.abs(totalDespesas),
      proportion: propVar
    };
  }, [currentData]);

  // 8b. Filtered Totals (Dynamic - Reacts to Pie Chart)
  const filteredTotals = useMemo(() => {
    // Filter by selected categories if any exist, otherwise use all (except ROL)
    const sourceData = selectedCategories.length > 0
      ? currentData.filter(d => selectedCategories.includes(d.category))
      : currentData;

    const fixed = sourceData.filter(d => d.level === 5 && !d.isVariable && d.category !== 'ROL').reduce((acc, curr) => acc + curr.amount, 0);
    const variable = sourceData.filter(d => d.level === 5 && d.isVariable && d.category !== 'ROL').reduce((acc, curr) => acc + curr.amount, 0);
    const totalDespesas = fixed + variable;
    const propVar = totalDespesas ? (variable / totalDespesas) * 100 : 0;

    return {
      fixed: Math.abs(fixed),
      variable: Math.abs(variable),
      total: Math.abs(totalDespesas),
      proportion: propVar
    };
  }, [currentData, selectedCategories]);

  // 9. PIE CHART SPECIFIC DATA (Calculated based on Fixed/Variable Filters)
  const pieData = useMemo(() => {
    const cats: CategoryType[] = ['DC', 'DL', 'GGF', 'DA', 'DF', 'DP'];
    
    // Calculate total for the pie based on filters
    const validRows = currentData.filter(d => 
        d.level === 5 && 
        d.category !== 'ROL' &&
        (
            (d.isVariable && showVariablePie) ||
            (!d.isVariable && showFixedPie)
        )
    );

    const totalFiltered = validRows.reduce((acc, curr) => acc + curr.amount, 0);

    const result = cats.map(cat => {
        const catAmount = validRows
            .filter(d => d.category === cat)
            .reduce((acc, curr) => acc + curr.amount, 0);

        return {
            id: cat,
            label: CATEGORY_LABELS[cat],
            amount: Math.abs(catAmount),
            color: COLORS[cat],
            percentOfTotal: totalFiltered ? (Math.abs(catAmount) / Math.abs(totalFiltered)) * 100 : 0
        };
    }).filter(cat => cat.amount > 0); // Hide zero categories

    return result.sort((a,b) => b.amount - a.amount);

  }, [currentData, showFixedPie, showVariablePie]);

  const periodLabel = useMemo(() => getPeriodLabel(selectedMonths), [selectedMonths]);
  const baselineLabel = comparisonMode === 'BUDGET' ? 'Orçado' : `Real ${compareYear}`;

  // Handler for Multi-select on Pie Chart
  const toggleCategory = (categoryId: string) => {
      setSelectedCategories(prev => {
          if (prev.includes(categoryId)) {
              return prev.filter(c => c !== categoryId);
          } else {
              return [...prev, categoryId];
          }
      });
  };

  const getSelectionLabel = () => {
      if (selectedCategories.length === 0) return 'Geral';
      if (selectedCategories.length === 1) return selectedCategories[0];
      if (selectedCategories.length <= 3) return selectedCategories.join(' + ');
      return `${selectedCategories.length} categorias`;
  }

  return (
    <div className="space-y-6 pb-12 animate-fade-in">
      
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-2">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-3xl font-bold text-white">Visão Geral</h2>
            <span className="bg-slate-700/50 text-blue-400 border border-blue-500/30 px-3 py-1 rounded-full text-xs font-medium">
              {periodLabel}
            </span>
          </div>
          <p className="text-slate-400 text-sm">Resumo executivo de categorias e representatividade sobre o ROL</p>
        </div>

        {/* PERSONALIZED YEAR SELECTOR & COMPARISON TOGGLE */}
        <div className="flex flex-col items-end gap-3">
            <div className="flex items-center gap-1 bg-slate-900/80 border border-slate-800 p-1.5 rounded-lg shadow-sm">
                 <div className="flex items-center gap-2 px-3 border-r border-slate-800 py-1 group">
                    <Calendar size={14} className="text-slate-500 group-hover:text-blue-400 transition-colors" />
                    <div className="relative flex items-center">
                        <select 
                            value={selectedYear}
                            onChange={(e) => setSelectedYear(Number(e.target.value))}
                            className="bg-transparent text-sm font-bold text-white focus:outline-none cursor-pointer appearance-none pr-4"
                        >
                            {availableYears.map(y => <option key={y} value={y} className="bg-slate-900">{y}</option>)}
                        </select>
                        <ChevronDown size={12} className="absolute right-0 text-slate-500 pointer-events-none" />
                    </div>
                 </div>
                 
                 <div className="flex items-center gap-3 px-3 py-1">
                    <span className="text-[10px] font-bold text-slate-600 uppercase">vs</span>
                    <div className="relative flex items-center">
                        <select 
                            value={compareYear}
                            onChange={(e) => setCompareYear(Number(e.target.value))}
                            className="bg-transparent text-sm font-bold text-slate-300 focus:outline-none cursor-pointer appearance-none pr-4"
                        >
                            {availableYears.map(y => <option key={y} value={y} className="bg-slate-900">{y}</option>)}
                        </select>
                        <ChevronDown size={12} className="absolute right-0 text-slate-500 pointer-events-none" />
                    </div>
                 </div>
            </div>

            {/* Comparison Mode Toggle */}
            <div className="bg-slate-800/80 p-1 rounded-lg border border-slate-700 flex items-center">
                <button
                    onClick={() => setComparisonMode('BUDGET')}
                    className={`px-4 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all ${
                        comparisonMode === 'BUDGET' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                    }`}
                >
                    <Target size={14} /> vs Orçado
                </button>
                <button
                    onClick={() => setComparisonMode('YEAR')}
                    className={`px-4 py-1.5 rounded-md text-xs font-bold flex items-center gap-2 transition-all ${
                        comparisonMode === 'YEAR' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
                    }`}
                >
                    <Calendar size={14} /> vs {compareYear}
                </button>
            </div>
        </div>
      </div>

      {/* ROL Card */}
      <div className="bg-blue-900/40 border border-blue-800/50 rounded-xl p-6 shadow-lg backdrop-blur-sm">
         <div className="flex justify-between items-start">
            <div>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Receita Líquida Operacional (ROL) - {selectedYear}</p>
                <h3 className="text-4xl font-bold text-white mb-1">{formatCompactCurrency(currentROL)}</h3>
                <div className="flex items-center gap-2">
                    <span className="text-blue-400 text-sm font-medium">Base: {formatCompactCurrency(baselineROL)}</span>
                    {baselineROL !== 0 && (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                            currentROL >= baselineROL ? 'bg-rose-500/10 text-rose-400' : 'bg-emerald-500/10 text-emerald-400'
                        }`}>
                            {Math.abs((currentROL/baselineROL - 1) * 100).toFixed(1)}% vs {baselineLabel}
                        </span>
                    )}
                </div>
            </div>
            <div className="w-12 h-12 bg-blue-600/20 rounded-xl flex items-center justify-center text-blue-400">
                <TrendingUp size={24} />
            </div>
         </div>
      </div>

      {/* Top Categories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {categoryAnalysis.map((cat) => {
          const isExpenseGrowth = cat.percDiff > 0.05; 
          const isExpenseSaving = cat.percDiff < -0.05;
          
          let badgeColorClass = 'bg-slate-700/30 text-slate-400 border-slate-600/30';
          let BadgeIcon = Minus;

          if (isExpenseGrowth) {
              badgeColorClass = 'bg-rose-500/10 text-rose-400 border-rose-500/20'; 
              BadgeIcon = ArrowUpRight;
          } else if (isExpenseSaving) {
              badgeColorClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'; 
              BadgeIcon = ArrowDownRight;
          }

          return (
            <div key={cat.id} className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6 hover:bg-slate-800/60 transition-all border-l-4" style={{ borderLeftColor: cat.color }}>
               <div className="flex justify-between items-start mb-4">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${cat.color}15` }}>
                      <span className="text-lg font-bold" style={{ color: cat.color }}>$</span>
                  </div>
                  <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${badgeColorClass}`}>
                      <BadgeIcon size={12} />
                      {Math.abs(cat.percDiff).toFixed(1)}% vs {baselineLabel}
                  </div>
               </div>
               
               <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-1">{cat.label}</p>
               <h3 className="text-2xl font-extrabold text-white">{formatCompactCurrency(cat.amount)}</h3>
               <p className="text-xs text-slate-500 font-medium mb-4">
                  {baselineLabel}: <span className="text-slate-300">{formatCompactCurrency(cat.baselineAmount)}</span>
               </p>
               
               <div className="flex items-center justify-between pt-4 border-t border-slate-700/50 mt-2">
                   <div>
                      <p className="text-[10px] text-slate-500 uppercase font-bold">% sobre ROL</p>
                      <p className="text-sm font-bold text-white">{Math.abs(cat.percentRol).toFixed(1)}%</p>
                   </div>
                   <div className="text-right">
                      <p className="text-[10px] text-slate-500 uppercase font-bold">Base {baselineLabel}</p>
                      <p className="text-xs font-medium text-slate-400">{Math.abs(cat.baselinePercentRol).toFixed(1)}% ROL</p>
                   </div>
               </div>
            </div>
          );
        })}
      </div>

      {/* Info Banner */}
      <div className="bg-blue-900/10 border border-blue-800/30 rounded-lg p-3 flex items-center gap-3">
        <Info size={16} className="text-blue-400 shrink-0" />
        <p className="text-[11px] text-slate-300">
          <span className="text-blue-400 font-bold uppercase mr-1">Nota:</span> 
          Despesas Fixas e Variáveis são calculadas com base no detalhamento de <span className="text-white font-bold">Nível 5</span>.
        </p>
      </div>

      {/* GLOBAL KPI Cards (Static - Top) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-6">
            <h4 className="text-blue-400 text-[10px] font-bold uppercase tracking-wider mb-4">Total Despesas Fixas (Geral)</h4>
            <div className="text-3xl font-extrabold text-white mb-1">- {formatCompactCurrency(globalTotals.fixed)}</div>
            <p className="text-[11px] text-slate-500">Período: {periodLabel}</p>
         </div>

         <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-6">
            <h4 className="text-emerald-400 text-[10px] font-bold uppercase tracking-wider mb-4">Total Despesas Variáveis (Geral)</h4>
            <div className="text-3xl font-extrabold text-white mb-1">- {formatCompactCurrency(globalTotals.variable)}</div>
            <p className="text-[11px] text-slate-500">Período: {periodLabel}</p>
         </div>

         <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-6">
            <h4 className="text-fuchsia-400 text-[10px] font-bold uppercase tracking-wider mb-4">Proporção Variável (Geral)</h4>
            <div className="text-3xl font-extrabold text-white mb-1">{globalTotals.proportion.toFixed(1)}%</div>
            <p className="text-[11px] text-slate-500">do total de despesas</p>
         </div>
      </div>

      {/* PRIMARY PERFORMANCE CHART: ROL vs TOTAL */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-white mb-8">Desempenho Mensal: ROL vs Total Despesas ({selectedYear})</h3>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={monthlyPerformanceData} margin={{ left: 10, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} opacity={0.2} />
              <XAxis dataKey="name" stroke="#94a3b8" axisLine={false} tickLine={false} dy={10} fontSize={12} />
              <YAxis 
                stroke="#94a3b8" 
                axisLine={false} 
                tickLine={false} 
                tickFormatter={(val) => `R$${(val/1000000).toFixed(1)}M`} 
                fontSize={12}
                domain={[0, 'auto']}
              />
              <Tooltip 
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}
                itemStyle={{ color: '#fff' }}
                formatter={(value: number) => formatCurrency(value)}
              />
              <Legend 
                verticalAlign="bottom" 
                height={36} 
                iconType="circle" 
                wrapperStyle={{ paddingTop: '20px' }}
              />
              <Line 
                name={`ROL (Real) ${selectedYear}`}
                type="monotone" 
                dataKey="rol" 
                stroke={COLORS.ROL} 
                strokeWidth={3}
                dot={{ r: 4, fill: COLORS.ROL, strokeWidth: 0 }}
                activeDot={{ r: 6 }}
              />
              <Line 
                name={`Total (Real) ${selectedYear}`}
                type="monotone" 
                dataKey="total" 
                stroke={COLORS.TOTAL} 
                strokeWidth={3}
                dot={{ r: 4, fill: COLORS.TOTAL, strokeWidth: 0 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Secondary Evolution Chart (All categories) */}
      <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-6">Evolução Detalhada por Categoria</h3>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={evolutionData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={true} horizontal={true} opacity={0.15} />
              <XAxis dataKey="name" stroke="#94a3b8" axisLine={false} tickLine={false} dy={10} />
              <YAxis stroke="#94a3b8" axisLine={false} tickLine={false} tickFormatter={(val) => `${(val/1000000).toFixed(1)}M`} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff' }}
                itemStyle={{ color: '#fff' }}
                formatter={(value: number) => formatCompactCurrency(value)}
              />
              <Legend verticalAlign="bottom" height={36} iconType="circle" />
              {categoryAnalysis.map(cat => (
                <Line 
                  key={cat.id}
                  type="monotone" 
                  dataKey={cat.label} 
                  stroke={cat.color} 
                  strokeWidth={2}
                  dot={{ r: 3, fill: cat.color, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* FILTERED KPI Cards (Dynamic - Above Pie Chart) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative mt-8">
         {/* Filter Active Indicator */}
         {selectedCategories.length > 0 && (
             <div className="absolute -top-3 right-0 -mt-2 z-10">
                <button 
                    onClick={() => setSelectedCategories([])}
                    className="flex items-center gap-1 bg-blue-600 text-white px-3 py-1 rounded-full text-xs font-bold shadow-lg border border-blue-400 hover:bg-blue-500 transition-colors"
                >
                    <Filter size={12} />
                    Filtro Ativo: {getSelectionLabel()}
                    <X size={12} className="ml-1" />
                </button>
             </div>
         )}

         <div className={`bg-slate-800/40 border rounded-xl p-6 transition-colors ${selectedCategories.length > 0 ? 'border-blue-500/50 bg-blue-900/10' : 'border-slate-700/50'}`}>
            <h4 className="text-blue-400 text-[10px] font-bold uppercase tracking-wider mb-4">
                {selectedCategories.length > 0 ? `Despesas Fixas (${getSelectionLabel()})` : 'Total Despesas Fixas (Geral)'}
            </h4>
            <div className="text-3xl font-extrabold text-white mb-1">- {formatCompactCurrency(filteredTotals.fixed)}</div>
            <p className="text-[11px] text-slate-500">Período: {periodLabel}</p>
         </div>

         <div className={`bg-slate-800/40 border rounded-xl p-6 transition-colors ${selectedCategories.length > 0 ? 'border-emerald-500/50 bg-emerald-900/10' : 'border-slate-700/50'}`}>
            <h4 className="text-emerald-400 text-[10px] font-bold uppercase tracking-wider mb-4">
                {selectedCategories.length > 0 ? `Despesas Variáveis (${getSelectionLabel()})` : 'Total Despesas Variáveis (Geral)'}
            </h4>
            <div className="text-3xl font-extrabold text-white mb-1">- {formatCompactCurrency(filteredTotals.variable)}</div>
            <p className="text-[11px] text-slate-500">Período: {periodLabel}</p>
         </div>

         <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-6">
            <h4 className="text-fuchsia-400 text-[10px] font-bold uppercase tracking-wider mb-4">Proporção Variável</h4>
            <div className="text-3xl font-extrabold text-white mb-1">{filteredTotals.proportion.toFixed(1)}%</div>
            <p className="text-[11px] text-slate-500">do total {selectedCategories.length > 0 ? 'selecionado' : 'de despesas'}</p>
         </div>
      </div>

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Donut Chart: Distribution by Category */}
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6">
           <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
              <h3 className="text-lg font-semibold text-white">Distribuição por Categoria</h3>
              
              {/* Type Filters */}
              <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-700/50">
                  <button 
                    onClick={() => setShowFixedPie(!showFixedPie)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-all ${
                        showFixedPie ? 'bg-purple-600/20 text-purple-300 border border-purple-500/30' : 'text-slate-500 hover:text-white'
                    }`}
                  >
                      <Layers size={12} />
                      Fixas
                      {showFixedPie && <Check size={12} />}
                  </button>
                  <div className="w-px bg-slate-700 mx-1"></div>
                  <button 
                    onClick={() => setShowVariablePie(!showVariablePie)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-bold transition-all ${
                        showVariablePie ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/30' : 'text-slate-500 hover:text-white'
                    }`}
                  >
                      <Calculator size={12} />
                      Variáveis
                      {showVariablePie && <Check size={12} />}
                  </button>
              </div>
           </div>

           <div className="flex items-center gap-1 text-[10px] text-slate-400 bg-slate-900/50 px-2 py-1 rounded border border-slate-800 w-fit mb-4">
                <MousePointerClick size={12} />
                Clique em múltiplas fatias para somar
           </div>
           
           <div className="h-72 w-full flex flex-col md:flex-row items-center">
              <div className="w-full md:w-1/2 h-full">
                <ResponsiveContainer width="100%" height="100%">
                   <PieChart>
                      <Pie
                         data={pieData}
                         dataKey="amount"
                         nameKey="label"
                         cx="50%"
                         cy="50%"
                         innerRadius={60}
                         outerRadius={90}
                         paddingAngle={5}
                         onClick={(data) => toggleCategory(data.id)}
                         cursor="pointer"
                      >
                         {pieData.map((entry, index) => {
                            // Opacity logic:
                            // If nothing selected -> 1
                            // If current item is selected -> 1
                            // If something else is selected -> 0.3
                            const isSelected = selectedCategories.includes(entry.id);
                            const hasSelection = selectedCategories.length > 0;
                            const opacity = (!hasSelection || isSelected) ? 1 : 0.3;
                            
                            return (
                                <Cell 
                                    key={`cell-${index}`} 
                                    fill={entry.color} 
                                    stroke={isSelected ? '#fff' : 'none'}
                                    strokeWidth={isSelected ? 2 : 0}
                                    opacity={opacity}
                                    className="transition-all duration-300 hover:opacity-100"
                                />
                            );
                         })}
                      </Pie>
                      <Tooltip 
                         contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff' }}
                         itemStyle={{ color: '#fff' }}
                         formatter={(val: number) => formatCompactCurrency(val)}
                      />
                   </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="w-full md:w-1/2 mt-4 md:mt-0 space-y-2 overflow-y-auto max-h-60 custom-scrollbar pr-2">
                 {pieData.map((cat) => {
                    const isSelected = selectedCategories.includes(cat.id);
                    const hasSelection = selectedCategories.length > 0;
                    
                    return (
                        <div 
                            key={cat.id} 
                            onClick={() => toggleCategory(cat.id)}
                            className={`flex items-center justify-between py-1 border-b border-slate-700/30 last:border-0 group transition-all cursor-pointer rounded px-2 
                                ${isSelected ? 'bg-slate-700/60 ring-1 ring-slate-500' : 'hover:bg-slate-800/50'}
                                ${hasSelection && !isSelected ? 'opacity-50' : 'opacity-100'}
                            `}
                        >
                        <div className="flex items-center gap-2">
                            <div className="relative">
                                <div className={`w-2.5 h-2.5 rounded-full shadow-sm transition-all ${isSelected ? 'scale-110' : ''}`} style={{ backgroundColor: cat.color }}></div>
                                {isSelected && <Check size={10} className="absolute -top-1 -right-1 text-white bg-slate-900 rounded-full" />}
                            </div>
                            <span className={`text-xs transition-colors ${isSelected ? 'text-white font-bold' : 'text-slate-300 group-hover:text-white'}`}>{cat.label}</span>
                        </div>
                        <div className="text-right">
                            <span className={`text-xs font-bold block leading-none ${isSelected ? 'text-white' : 'text-slate-200'}`}>{cat.percentOfTotal.toFixed(1)}%</span>
                            <span className="text-[10px] text-slate-400 font-medium">{formatCompactCurrency(cat.amount)}</span>
                        </div>
                        </div>
                    );
                 })}
                 {pieData.length === 0 && (
                     <div className="text-center py-8 text-slate-500 text-xs">
                         Nenhum dado com os filtros atuais.
                     </div>
                 )}
              </div>
           </div>
        </div>

        {/* Bar Chart: Fixed vs Variable by Month */}
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6">
           <h3 className="text-lg font-semibold text-white mb-6">
               Despesas Fixas vs Variáveis {selectedCategories.length > 0 ? `(${getSelectionLabel()})` : ''}
           </h3>
           <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={monthlyComposition} margin={{ bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} opacity={0.3} />
                    <XAxis dataKey="name" stroke="#94a3b8" axisLine={false} tickLine={false} dy={10} fontSize={10} />
                    <YAxis stroke="#94a3b8" axisLine={false} tickLine={false} tickFormatter={(val) => `${(val/1000000).toFixed(1)}M`} fontSize={10} />
                    <Tooltip 
                       contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff' }}
                       itemStyle={{ color: '#fff' }}
                       formatter={(val: number) => formatCompactCurrency(val)}
                    />
                    <Legend verticalAlign="bottom" height={36} iconType="rect" />
                    <Bar dataKey="Despesas Fixas" fill={COLORS.FIXO} radius={[2, 2, 0, 0]} />
                    <Bar dataKey="Despesas Variáveis" fill={COLORS.VAR} radius={[2, 2, 0, 0]} />
                 </BarChart>
              </ResponsiveContainer>
           </div>
        </div>
      </div>
    </div>
  );
};

export default GeneralView;