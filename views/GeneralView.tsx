import React, { useMemo } from 'react';
import { ProcessedExpense, CategoryType } from '../types';
import { formatCompactCurrency, formatCurrency, formatPercent, filterDataByPeriod, getMonthsForPeriod, getPeriodLabel } from '../utils/dataProcessor';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  BarChart, Bar, Cell, PieChart, Pie, Legend, LineChart, Line 
} from 'recharts';
import { Info } from 'lucide-react';

interface GeneralViewProps {
  data: ProcessedExpense[];
  selectedYear: number;
  compareYear: number;
  selectedMonths: number[];
}

const COLORS: Record<string, string> = {
  'DC': '#3b82f6', // Despesas Comerciais (Blue)
  'DL': '#06b6d4', // Despesas Logísticas (Cyan)
  'GGF': '#8b5cf6', // GGF (Purple)
  'DA': '#10b981', // Despesas Administrativas (Emerald/Green)
  'DF': '#f59e0b', // Despesas Financeiras (Amber/Orange)
  'DP': '#ef4444', // Depreciação (Red)
  'ROL': '#1e40af', // ROL (Dark Blue)
  'FIXO': '#3b82f6', // Fixed Expenses Bar
  'VAR': '#10b981'   // Variable Expenses Bar
};

const CATEGORY_LABELS: Record<string, string> = {
  'DC': 'Despesas Comerciais',
  'DL': 'Despesas Logísticas',
  'GGF': 'GGF',
  'DA': 'Despesas Administrativas',
  'DF': 'Despesas Financeiras',
  'DP': 'Depreciação'
};

const GeneralView: React.FC<GeneralViewProps> = ({ data, selectedYear, selectedMonths }) => {
  
  // 1. First, Filter Data by Period (Global Filter)
  const periodFilteredData = useMemo(() => filterDataByPeriod(data, selectedMonths), [data, selectedMonths]);

  // 2. Filter Data for the selected year AND ensure only REAL data is used
  const yearData = useMemo(() => periodFilteredData.filter(d => d.year === selectedYear && d.dataType === 'REAL'), [periodFilteredData, selectedYear]);

  // 3. Separate Data Sets
  // ROL: Keep using Level 1 (Synthetic) as Revenue is usually well defined at top level
  // and summing details might be risky without knowing ROL structure.
  const totalROL = yearData.filter(d => d.category === 'ROL' && d.level === 1).reduce((acc, curr) => acc + curr.amount, 0);
  
  // Level 5 for Fixed vs Variable Analysis (Analytical)
  const level5Expenses = useMemo(() => yearData.filter(d => d.level === 5 && d.category !== 'ROL'), [yearData]);
  
  const variableData = useMemo(() => level5Expenses.filter(d => d.isVariable), [level5Expenses]);
  const fixedData = useMemo(() => level5Expenses.filter(d => !d.isVariable), [level5Expenses]);

  // 4. Calculate Aggregates
  
  // Totals per Category (Summing Level 5 - Analytical to ensure accuracy if Level 1 is missing/wrong)
  const categoryTotals = useMemo(() => {
    const cats: CategoryType[] = ['DC', 'DL', 'GGF', 'DA', 'DF', 'DP'];
    return cats.map(cat => {
      const total = yearData.filter(d => d.category === cat && d.level === 5).reduce((acc, curr) => acc + curr.amount, 0);
      return {
        id: cat,
        label: CATEGORY_LABELS[cat],
        amount: total,
        percentRol: totalROL ? (total / totalROL) * 100 : 0,
        color: COLORS[cat]
      };
    });
  }, [yearData, totalROL]);

  // Total Fixed (Defined as Sum of Level 5 Non-Variable Expenses)
  const totalFixed = fixedData.reduce((acc, curr) => acc + curr.amount, 0);

  // Total Variable (Defined as Sum of Level 5 Variable Expenses)
  const totalVariable = variableData.reduce((acc, curr) => acc + curr.amount, 0);
  
  // FIX: Use absolute values for ratio calculation to handle negative expense data
  const absFixed = Math.abs(totalFixed);
  const absVariable = Math.abs(totalVariable);
  const totalAbs = absFixed + absVariable;

  const variableProportion = totalAbs > 0 
    ? (absVariable / totalAbs) * 100 
    : 0;

  // 5. Chart Data Preparation
  // We need to fetch the months relevant to the current period to draw the X-Axis correctly
  const activeMonths = useMemo(() => getMonthsForPeriod(selectedMonths), [selectedMonths]);
  const periodLabel = useMemo(() => getPeriodLabel(selectedMonths), [selectedMonths]);

  // Evolution Line Chart (Categories - Level 5 Sum)
  const evolutionData = useMemo(() => {
    return activeMonths.map(m => {
      const point: any = { name: m.name.toLowerCase() };
      
      categoryTotals.forEach(cat => {
        const val = yearData
          .filter(d => d.category === cat.id && d.month === m.index && d.level === 5)
          .reduce((acc, curr) => acc + curr.amount, 0);
        point[cat.label] = Math.abs(val);
      });
      return point;
    });
  }, [yearData, categoryTotals, activeMonths]);

  // Distribution Pie Chart
  const distributionData = categoryTotals
    .filter(c => Math.abs(c.amount) > 0)
    .map(c => ({ name: c.label, value: Math.abs(c.amount), color: c.color }));

  const totalDistributionValue = distributionData.reduce((acc, curr) => acc + curr.value, 0);

  // Fixed vs Variable Bar Chart (Level 5 Aggregation)
  const fixedVsVariableData = useMemo(() => {
    return activeMonths.map(m => {
      const fixedVal = fixedData
        .filter(d => d.month === m.index)
        .reduce((acc, curr) => acc + curr.amount, 0);
        
      const variableVal = variableData
        .filter(d => d.month === m.index)
        .reduce((acc, curr) => acc + curr.amount, 0);

      return {
        name: m.name.toLowerCase(),
        'Despesas Fixas': Math.abs(fixedVal),
        'Despesas Variáveis': Math.abs(variableVal)
      };
    });
  }, [fixedData, variableData, activeMonths]);


  return (
    <div className="space-y-6 pb-12 animate-fade-in">
      
      {/* Header Section (Custom for General View) */}
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-3xl font-bold text-white">Visão Geral - {selectedYear}</h2>
            <span className="bg-slate-700/50 text-blue-400 border border-blue-500/30 px-3 py-1 rounded-full text-xs font-medium">
              {periodLabel}
            </span>
          </div>
          <p className="text-slate-400 text-sm">Contas agregadas de topo (Baseada em soma analítica Nível 5)</p>
        </div>
        <div className="bg-white text-slate-900 px-4 py-1.5 rounded-md text-sm font-bold shadow-sm">
            Limppano
        </div>
      </div>

      {/* ROL Card */}
      <div className="bg-blue-900/40 border border-blue-800/50 rounded-xl p-6 shadow-lg backdrop-blur-sm">
         <div className="w-10 h-10 bg-blue-600/20 rounded-lg flex items-center justify-center text-blue-400 mb-4">
            <span className="text-xl font-bold">$</span>
         </div>
         <p className="text-slate-400 text-sm font-medium">ROL ({periodLabel})</p>
         <h3 className="text-3xl font-bold text-white mb-1">{formatCompactCurrency(totalROL)}</h3>
         <p className="text-blue-400 text-sm">Receita Líquida Operacional</p>
      </div>

      {/* Categories Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {categoryTotals.map((cat) => (
          <div key={cat.id} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 hover:bg-slate-800 transition-all">
             <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-4" style={{ backgroundColor: `${cat.color}20` }}>
                <span className="text-lg font-bold" style={{ color: cat.color }}>$</span>
             </div>
             <p className="text-slate-400 text-sm font-medium mb-1">{cat.label}</p>
             <h3 className="text-2xl font-bold text-white mb-2">{formatCompactCurrency(cat.amount)}</h3>
             <p className="text-sm opacity-60" style={{ color: cat.color }}>
               {/* Display % relative to ROL. Math.abs used to ensure logical percentage if expense is negative */}
               {Math.abs(cat.percentRol).toFixed(1)}% do ROL
             </p>
          </div>
        ))}
      </div>

      {/* Evolution Chart */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-white mb-6">Evolução por Categoria ({periodLabel})</h3>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={evolutionData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={true} horizontal={true} opacity={0.3} />
              <XAxis dataKey="name" stroke="#94a3b8" axisLine={false} tickLine={false} dy={10} />
              <YAxis stroke="#94a3b8" axisLine={false} tickLine={false} tickFormatter={(val) => `${(val/1000000).toFixed(1)}M`} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff' }}
                formatter={(value: number) => formatCompactCurrency(value)}
              />
              <Legend verticalAlign="bottom" height={36} iconType="circle" />
              {categoryTotals.map(cat => (
                <Line 
                  key={cat.id}
                  type="monotone" 
                  dataKey={cat.label} 
                  stroke={cat.color} 
                  strokeWidth={2}
                  dot={{ r: 3, fill: cat.color, strokeWidth: 0 }}
                  activeDot={{ r: 6 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Split Row: Pie & Bar Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Pie Chart */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-6">Distribuição por Categoria (Nível 5)</h3>
          <div className="h-80 w-full flex items-center justify-center">
            {distributionData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={distributionData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {distributionData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} stroke="rgba(0,0,0,0.2)" />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value: number) => {
                      const percent = totalDistributionValue > 0 ? (value / totalDistributionValue) * 100 : 0;
                      return `${formatCompactCurrency(value)} (${percent.toFixed(1)}%)`;
                    }}
                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#FFFFFF' }}
                    itemStyle={{ color: '#FFFFFF' }}
                  />
                  <Legend 
                    layout="vertical" 
                    verticalAlign="middle" 
                    align="right"
                    formatter={(value, entry: any) => {
                        const val = entry.payload.value;
                        const percent = totalDistributionValue > 0 ? (val / totalDistributionValue) * 100 : 0;
                        return (
                            <span className="text-white ml-2">
                                {value}: {formatPercent(percent)}
                            </span>
                        );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-slate-500 text-sm">Sem dados positivos para exibir no gráfico.</div>
            )}
          </div>
        </div>

        {/* Fixed vs Variable Bar Chart */}
        <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-white mb-6">Despesas Fixas vs Variáveis (Nível 5)</h3>
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fixedVsVariableData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} opacity={0.3} />
                <XAxis dataKey="name" stroke="#94a3b8" axisLine={false} tickLine={false} dy={10} />
                <YAxis stroke="#94a3b8" axisLine={false} tickLine={false} tickFormatter={(val) => `${(val/1000000).toFixed(1)}M`} />
                <Tooltip 
                  cursor={{fill: '#334155', opacity: 0.1}}
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff' }}
                  formatter={(value: number) => formatCompactCurrency(value)}
                />
                <Legend verticalAlign="bottom" height={36} iconType="rect" />
                <Bar name="Despesas Fixas" dataKey="Despesas Fixas" fill={COLORS.FIXO} radius={[4, 4, 0, 0]} />
                <Bar name="Despesas Variáveis" dataKey="Despesas Variáveis" fill={COLORS.VAR} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-900/20 border border-blue-800/30 rounded-lg p-3 flex items-start gap-3">
        <Info size={18} className="text-blue-400 mt-0.5 shrink-0" />
        <p className="text-sm text-blue-200">
          <span className="font-bold text-yellow-400">Nota:</span> Despesas Fixas e Variáveis são calculadas com base no detalhamento de <span className="font-bold">Nível 5</span>.
        </p>
      </div>

      {/* Bottom Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
         <div className="bg-blue-900/30 border border-blue-800/50 rounded-xl p-6">
            <h4 className="text-blue-400 text-sm font-medium mb-2">Total Despesas Fixas (Nível 5)</h4>
            <div className="text-3xl font-bold text-white mb-1">{formatCompactCurrency(totalFixed)}</div>
            <div className="text-xs text-slate-400">Período: {periodLabel}</div>
         </div>

         <div className="bg-emerald-900/20 border border-emerald-800/30 rounded-xl p-6">
            <h4 className="text-emerald-400 text-sm font-medium mb-2">Total Despesas Variáveis (Nível 5)</h4>
            <div className="text-3xl font-bold text-white mb-1">{formatCompactCurrency(totalVariable)}</div>
            <div className="text-xs text-slate-400">Período: {periodLabel}</div>
         </div>

         <div className="bg-purple-900/20 border border-purple-800/30 rounded-xl p-6">
            <h4 className="text-purple-400 text-sm font-medium mb-2">Proporção Variável</h4>
            <div className="text-3xl font-bold text-white mb-1">{variableProportion.toFixed(1)}%</div>
            <div className="text-xs text-slate-400">do total de despesas</div>
         </div>
      </div>

    </div>
  );
};

export default GeneralView;