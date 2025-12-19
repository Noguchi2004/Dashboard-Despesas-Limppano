import React, { useMemo, useState } from 'react';
import { ProcessedExpense, CategoryType, ComparisonMode } from '../types';
import { formatCompactCurrency, formatCurrency, filterDataByPeriod, getMonthsForPeriod, getPeriodLabel } from '../utils/dataProcessor';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  Legend, LineChart, Line, PieChart, Pie, Cell, BarChart, Bar, ComposedChart
} from 'recharts';
import { Info, Target, Calendar, ArrowUpRight, ArrowDownRight, Minus, TrendingUp, ChevronDown } from 'lucide-react';

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

  // 4. Monthly Performance (ROL vs Total Expenses) - THE NEW CHART DATA
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

  // 5. Aggregated Categories Analysis
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

  // 6. Monthly Fixed vs Variable (Level 5)
  const monthlyComposition = useMemo(() => {
    return activeMonths.map(m => {
      const fixed = currentData
        .filter(d => d.month === m.index && d.level === 5 && !d.isVariable && d.category !== 'ROL')
        .reduce((acc, curr) => acc + curr.amount, 0);
      const variable = currentData
        .filter(d => d.month === m.index && d.level === 5 && d.isVariable && d.category !== 'ROL')
        .reduce((acc, curr) => acc + curr.amount, 0);
      
      return {
        name: m.name.toLowerCase(),
        'Despesas Fixas': Math.abs(fixed),
        'Despesas Variáveis': Math.abs(variable)
      };
    });
  }, [currentData, activeMonths]);

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

  // 8. Global Totals
  const totals = useMemo(() => {
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

  const periodLabel = useMemo(() => getPeriodLabel(selectedMonths), [selectedMonths]);
  const baselineLabel = comparisonMode === 'BUDGET' ? 'Orçado' : `Real ${compareYear}`;

  const pieData = useMemo(() => {
    const total = categoryAnalysis.reduce((acc, curr) => acc + curr.amount, 0);
    return categoryAnalysis.map(cat => ({
      ...cat,
      percentOfTotal: total ? (cat.amount / total) * 100 : 0
    }));
  }, [categoryAnalysis]);

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

      {/* ROL Card - REVENUE LOGIC: Increase is GOOD (Green) */}
      <div className="bg-blue-900/40 border border-blue-800/50 rounded-xl p-6 shadow-lg backdrop-blur-sm">
         <div className="flex justify-between items-start">
            <div>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Receita Líquida Operacional (ROL) - {selectedYear}</p>
                <h3 className="text-4xl font-bold text-white mb-1">{formatCompactCurrency(currentROL)}</h3>
                <div className="flex items-center gap-2">
                    <span className="text-blue-400 text-sm font-medium">Base: {formatCompactCurrency(baselineROL)}</span>
                    {baselineROL !== 0 && (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                            currentROL >= baselineROL ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                        }`}>
                            {currentROL >= baselineROL ? '+' : ''}{((currentROL/baselineROL - 1) * 100).toFixed(1)}% vs {baselineLabel}
                        </span>
                    )}
                </div>
            </div>
            <div className="w-12 h-12 bg-blue-600/20 rounded-xl flex items-center justify-center text-blue-400">
                <TrendingUp size={24} />
            </div>
         </div>
      </div>

      {/* Top Categories Grid - EXPENSE LOGIC: Increase is BAD (Red), Decrease is GOOD (Green) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {categoryAnalysis.map((cat) => {
          // COLOR LOGIC FOR EXPENSES:
          // Growth (> 0) = Bad = Red
          // Shrinkage (< 0) = Good = Green
          // Neutral (approx 0) = Gray
          
          const isExpenseGrowth = cat.percDiff > 0.05; // Consider > 0.05% as growth
          const isExpenseSaving = cat.percDiff < -0.05; // Consider < -0.05% as saving
          
          let badgeColorClass = 'bg-slate-700/30 text-slate-400 border-slate-600/30';
          let BadgeIcon = Minus;

          if (isExpenseGrowth) {
              badgeColorClass = 'bg-rose-500/10 text-rose-400 border-rose-500/20'; // Bad
              BadgeIcon = ArrowUpRight;
          } else if (isExpenseSaving) {
              badgeColorClass = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'; // Good
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
                      <p className="text-sm font-bold text-white">{cat.percentRol.toFixed(1)}%</p>
                   </div>
                   <div className="text-right">
                      <p className="text-[10px] text-slate-500 uppercase font-bold">Base {baselineLabel}</p>
                      <p className="text-xs font-medium text-slate-400">{cat.baselinePercentRol.toFixed(1)}% ROL</p>
                   </div>
               </div>
            </div>
          );
        })}
      </div>

      {/* PRIMARY PERFORMANCE CHART: ROL vs TOTAL (MATCHING SCREENSHOT) */}
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

      {/* Main Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Donut Chart: Distribution by Category */}
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6">
           <h3 className="text-lg font-semibold text-white mb-6">Distribuição por Categoria (Nível 5)</h3>
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
                      >
                         {pieData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                         ))}
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
                 {pieData.map((cat) => (
                    <div key={cat.id} className="flex items-center justify-between py-1 border-b border-slate-700/30 last:border-0 group transition-colors">
                       <div className="flex items-center gap-2">
                          <div className="w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(0,0,0,0.3)]" style={{ backgroundColor: cat.color }}></div>
                          <span className="text-slate-100 text-xs group-hover:text-white">{cat.label}</span>
                       </div>
                       <div className="text-right">
                          <span className="text-white text-xs font-bold block leading-none">{cat.percentOfTotal.toFixed(1)}%</span>
                          <span className="text-[10px] text-slate-400 font-medium">{formatCompactCurrency(cat.amount)}</span>
                       </div>
                    </div>
                 ))}
              </div>
           </div>
        </div>

        {/* Bar Chart: Fixed vs Variable by Month */}
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-2xl p-6">
           <h3 className="text-lg font-semibold text-white mb-6">Despesas Fixas vs Variáveis (Nível 5)</h3>
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

      {/* Info Banner */}
      <div className="bg-blue-900/10 border border-blue-800/30 rounded-lg p-3 flex items-center gap-3">
        <Info size={16} className="text-blue-400 shrink-0" />
        <p className="text-[11px] text-slate-300">
          <span className="text-blue-400 font-bold uppercase mr-1">Nota:</span> 
          Despesas Fixas e Variáveis são calculadas com base no detalhamento de <span className="text-white font-bold">Nível 5</span>.
        </p>
      </div>

      {/* Bottom KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
         <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-6">
            <h4 className="text-blue-400 text-[10px] font-bold uppercase tracking-wider mb-4">Total Despesas Fixas (Nível 5)</h4>
            <div className="text-3xl font-extrabold text-white mb-1">- {formatCompactCurrency(totals.fixed)}</div>
            <p className="text-[11px] text-slate-500">Período: {periodLabel}</p>
         </div>

         <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-6">
            <h4 className="text-emerald-400 text-[10px] font-bold uppercase tracking-wider mb-4">Total Despesas Variáveis (Nível 5)</h4>
            <div className="text-3xl font-extrabold text-white mb-1">- {formatCompactCurrency(totals.variable)}</div>
            <p className="text-[11px] text-slate-500">Período: {periodLabel}</p>
         </div>

         <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-6">
            <h4 className="text-fuchsia-400 text-[10px] font-bold uppercase tracking-wider mb-4">Proporção Variável</h4>
            <div className="text-3xl font-extrabold text-white mb-1">{totals.proportion.toFixed(1)}%</div>
            <p className="text-[11px] text-slate-500">do total de despesas</p>
         </div>
      </div>

    </div>
  );
};

export default GeneralView;