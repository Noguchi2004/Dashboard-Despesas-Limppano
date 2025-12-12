import React, { useMemo, useState } from 'react';
import { ProcessedExpense, CategoryType } from '../types';
import { formatCurrency, formatCompactCurrency, filterDataByPeriod, getMonthsForPeriod, getPeriodLabel } from '../utils/dataProcessor';
import { Search, ZoomIn, ArrowLeft, Layers, TrendingUp, DollarSign, Calculator, Info } from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend 
} from 'recharts';
import { PERIODS } from '../constants';

interface MicroViewProps {
  data: ProcessedExpense[];
  selectedYear: number;
  compareYear: number;
  selectedMonths: number[];
}

type LevelOption = 'ALL' | 2 | 3 | 4 | 5;

const MicroView: React.FC<MicroViewProps> = ({ data, selectedYear, compareYear, selectedMonths }) => {
  // State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryType | 'ALL'>('ALL');
  const [selectedLevel, setSelectedLevel] = useState<LevelOption>('ALL');
  const [limit, setLimit] = useState(50);
  
  // Drill Down State
  const [focusedAccount, setFocusedAccount] = useState<ProcessedExpense | null>(null);

  // 1. Filter Data by Period globally
  const periodData = useMemo(() => filterDataByPeriod(data, selectedMonths), [data, selectedMonths]);
  const periodLabel = useMemo(() => getPeriodLabel(selectedMonths), [selectedMonths]);

  // --- CHART DATA PREPARATION (For Focused Account) ---
  const chartData = useMemo(() => {
    if (!focusedAccount) return [];

    const code = focusedAccount.accountCode;
    const activeMonths = getMonthsForPeriod(selectedMonths);

    return activeMonths.map((m) => {
      // 1. Current Expense Value
      const currentVal = periodData
        .filter(d => d.year === selectedYear && d.accountCode === code && d.month === m.index && d.dataType === 'REAL')
        .reduce((sum, item) => sum + item.amount, 0);

      // 2. Previous Expense Value
      const prevVal = periodData
        .filter(d => d.year === compareYear && d.accountCode === code && d.month === m.index && d.dataType === 'REAL')
        .reduce((sum, item) => sum + item.amount, 0);

      // 3. ROL for the specific month (Global, not filtered by account)
      const currentRol = periodData
        .filter(d => d.year === selectedYear && d.category === 'ROL' && d.month === m.index && d.dataType === 'REAL')
        .reduce((sum, item) => sum + item.amount, 0);

      // 4. Calculate % Share of ROL
      // Formula: (Expense / Revenue) * 100. Using abs to ensure magnitude is correct regardless of accounting sign.
      const rolShare = currentRol !== 0 ? (Math.abs(currentVal) / Math.abs(currentRol)) * 100 : 0;

      return {
        name: m.name,
        current: Math.abs(currentVal),
        previous: Math.abs(prevVal),
        rolShare: rolShare
      };
    });
  }, [periodData, focusedAccount, selectedYear, compareYear, selectedMonths]);

  // Calculate totals for the chart header
  const chartTotals = useMemo(() => {
      if(chartData.length === 0) return { current: 0, previous: 0, diff: 0, percent: 0 };
      const current = chartData.reduce((acc, cur) => acc + cur.current, 0);
      const previous = chartData.reduce((acc, cur) => acc + cur.previous, 0);
      const diff = current - previous;
      const percent = previous !== 0 ? (diff / previous) * 100 : 0;
      return { current, previous, diff, percent };
  }, [chartData]);


  // --- KPIS CALCULATION (Independent of Table View) ---
  // Requested: Total Variable must ALWAYS take into account Level 5.
  // We calculate Fixed/Variable based on the entire dataset for the selected period/category,
  // strictly looking at Level 5 to ensure accuracy of the "isVariable" flag.
  const financialKPIs = useMemo(() => {
      const sourceForKPIs = periodData.filter(d => 
          d.year === selectedYear && 
          d.dataType === 'REAL' && 
          d.category !== 'ROL' &&
          d.level === 5 && // STRICTLY LEVEL 5 for KPI calculation
          (selectedCategory === 'ALL' || d.category === selectedCategory)
      );

      let fixed = 0;
      let variable = 0;

      sourceForKPIs.forEach(d => {
          if (d.isVariable) variable += d.amount;
          else fixed += d.amount;
      });
      
      const total = fixed + variable;

      return { fixed, variable, total };
  }, [periodData, selectedYear, selectedCategory]);


  // --- TABLE DATA FILTERING ---
  const filteredData = useMemo(() => {
    let filtered = periodData
      .filter(d => d.year === selectedYear)
      .filter(d => d.dataType === 'REAL');

    // EXPLICITLY EXCLUDE ROL (REVENUE)
    filtered = filtered.filter(d => d.category !== 'ROL');

    // 1. If Focused (Drill Down Active)
    if (focusedAccount) {
        filtered = filtered.filter(d => 
            d.accountCode.startsWith(focusedAccount.accountCode) && 
            d.accountCode !== focusedAccount.accountCode && // Don't show the parent row again
            d.level > focusedAccount.level 
        );
        
        if (selectedLevel !== 'ALL') {
             filtered = filtered.filter(d => d.level === selectedLevel);
        } else {
             // Standard drill down behavior: show immediate children (level + 1)
             filtered = filtered.filter(d => d.level === focusedAccount.level + 1);
        }

    } else {
        // 2. Global View (No Focus)
        
        // Category Filter
        if (selectedCategory !== 'ALL') {
            filtered = filtered.filter(d => d.category === selectedCategory);
        }

        // Level Filter
        if (selectedLevel !== 'ALL') {
            filtered = filtered.filter(d => d.level === selectedLevel);
        } else {
            // REQUESTED CHANGE: When "All Levels" is selected, only show Level 2
            filtered = filtered.filter(d => d.level === 2);
        }
    }

    // Search Filter
    if (searchTerm) {
      filtered = filtered.filter(d => 
        d.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.accountCode.includes(searchTerm)
      );
    }
    
    // Group duplicates if necessary (e.g. multiple entries per account per month) -> Here we list rows.
    const aggregatedMap = new Map<string, ProcessedExpense>();
    filtered.forEach(item => {
        const key = item.accountCode;
        const existing = aggregatedMap.get(key);
        if (existing) {
            existing.amount += item.amount;
        } else {
            // Clone to avoid mutating original data
            aggregatedMap.set(key, { ...item }); 
        }
    });

    const aggregatedList = Array.from(aggregatedMap.values());

    return aggregatedList.sort((a, b) => b.amount - a.amount);
  }, [periodData, selectedYear, searchTerm, selectedCategory, selectedLevel, focusedAccount]);

  const displayedData = filteredData.slice(0, limit);

  // --- HANDLERS ---
  const handleDrillDown = (row: ProcessedExpense) => {
      setFocusedAccount(row);
      setSelectedLevel('ALL'); 
      setLimit(50); // Reset pagination
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
      setFocusedAccount(null);
      setLimit(50);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      
      {/* HEADER */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
           <div className="flex flex-col">
             <h2 className="text-3xl font-bold text-white flex items-center gap-3">
                Visão Micro
                {focusedAccount && (
                    <span className="text-lg font-normal text-slate-400 flex items-center gap-2">
                        <ArrowLeft className="cursor-pointer hover:text-white" onClick={handleBack} />
                        / {focusedAccount.accountCode} - {focusedAccount.description}
                    </span>
                )}
             </h2>
             <span className="text-xs text-blue-400 mt-1 font-medium bg-blue-900/20 px-2 py-0.5 rounded w-fit">
                Dados filtrados por: {periodLabel}
             </span>
           </div>
        </div>

        {/* SUMMARY CARDS - NEW INDICATORS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-800 border border-slate-700 p-4 rounded-xl flex items-center justify-between">
                <div>
                    <p className="text-slate-400 text-xs font-bold uppercase">Total Despesas (Nível 5)</p>
                    <p className="text-xl font-bold text-white mt-1">{formatCompactCurrency(financialKPIs.total)}</p>
                </div>
                <div className="bg-slate-700/50 p-2 rounded-lg text-slate-300">
                    <Calculator size={20} />
                </div>
            </div>
            
            <div className="bg-blue-900/20 border border-blue-800/50 p-4 rounded-xl flex items-center justify-between">
                <div>
                    <p className="text-blue-400 text-xs font-bold uppercase">Total Fixo (Nível 5)</p>
                    <p className="text-xl font-bold text-white mt-1">{formatCompactCurrency(financialKPIs.fixed)}</p>
                </div>
                <div className="bg-blue-600/20 p-2 rounded-lg text-blue-400">
                    <DollarSign size={20} />
                </div>
            </div>

            <div className="bg-emerald-900/20 border border-emerald-800/50 p-4 rounded-xl flex items-center justify-between">
                <div>
                    <p className="text-emerald-400 text-xs font-bold uppercase">Total Variável (Nível 5)</p>
                    <p className="text-xl font-bold text-white mt-1">{formatCompactCurrency(financialKPIs.variable)}</p>
                </div>
                <div className="bg-emerald-600/20 p-2 rounded-lg text-emerald-400">
                    <TrendingUp size={20} />
                </div>
            </div>
        </div>

        {/* Filters Toolbar */}
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-lg flex flex-col lg:flex-row gap-4 items-center justify-between">
             <div className="flex flex-col md:flex-row gap-4 w-full lg:w-auto">
                {/* Search */}
                <div className="relative w-full md:w-80">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500" size={18} />
                <input 
                    type="text" 
                    placeholder="Buscar conta ou descrição..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg pl-10 pr-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                />
                </div>

                {/* Level Select */}
                <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 w-full md:w-48">
                    <Layers size={16} className="text-slate-500" />
                    <select 
                        value={selectedLevel}
                        onChange={(e) => {
                            const val = e.target.value === 'ALL' ? 'ALL' : Number(e.target.value);
                            setSelectedLevel(val as LevelOption);
                        }}
                        className="bg-transparent text-sm text-white w-full focus:outline-none cursor-pointer"
                    >
                        <option value="ALL" className="bg-blue-900 text-white">Todos os Níveis (Mostra L2)</option>
                        <option value="2" className="bg-blue-900 text-white">Nível 2 (Grupo)</option>
                        <option value="3" className="bg-blue-900 text-white">Nível 3 (Subgrupo)</option>
                        <option value="4" className="bg-blue-900 text-white">Nível 4 (Item)</option>
                        <option value="5" className="bg-blue-900 text-white">Nível 5 (Detalhe)</option>
                    </select>
                </div>
            </div>
            
            <div className="flex gap-2 w-full lg:w-auto overflow-x-auto no-scrollbar">
                {(['ALL', 'DC', 'DL', 'DA', 'DF', 'GGF', 'DP'] as const).map(cat => (
                    <button
                        key={cat}
                        onClick={() => setSelectedCategory(cat)}
                        className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors whitespace-nowrap ${
                        selectedCategory === cat 
                        ? 'bg-blue-600 text-white shadow-md' 
                        : 'bg-slate-700/50 text-slate-400 hover:bg-slate-700 hover:text-white'
                        }`}
                    >
                        {cat === 'ALL' ? 'Todos' : cat}
                    </button>
                ))}
            </div>
        </div>
      </div>

      {/* DRILL DOWN CHART SECTION */}
      {focusedAccount && (
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-6 animate-fade-in-up">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                  <div>
                      <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                          <TrendingUp className="text-blue-400" size={20} />
                          Evolução: {focusedAccount.description}
                      </h3>
                      <p className="text-sm text-slate-400 font-mono mt-1">{focusedAccount.accountCode}</p>
                  </div>
                  
                  {/* Summary Stats */}
                  <div className="flex gap-6 bg-slate-900/50 p-3 rounded-lg border border-slate-800">
                      <div>
                          <p className="text-xs text-slate-500 mb-0.5">Total ({periodLabel}) {selectedYear}</p>
                          <p className="text-lg font-bold text-white">{formatCompactCurrency(chartTotals.current)}</p>
                      </div>
                      <div className="w-px bg-slate-700"></div>
                      <div>
                          <p className="text-xs text-slate-500 mb-0.5">Variação vs {compareYear}</p>
                          <p className={`text-lg font-bold ${chartTotals.diff > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                             {chartTotals.diff > 0 ? '+' : ''}{formatCompactCurrency(chartTotals.diff)} ({chartTotals.percent.toFixed(1)}%)
                          </p>
                      </div>
                  </div>
              </div>

              {/* INFO BOX FOR CALCULATION CLARIFICATION */}
              <div className="bg-blue-900/20 border border-blue-800/30 p-3 rounded-lg mb-4 flex gap-3 max-w-2xl">
                 <Info className="text-blue-400 shrink-0 mt-0.5" size={16} />
                 <div className="text-xs text-blue-200">
                    <span className="font-bold">Entenda a linha laranja (% da Receita):</span>
                    <br/>
                    Este indicador mostra quanto esta despesa representou do ROL (Receita Líquida) total da empresa naquele mês.
                    <br/>
                    <span className="font-mono opacity-80 mt-1 block">Fórmula: (Valor da Conta / ROL Total do Mês) × 100</span>
                 </div>
              </div>

              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={true} opacity={0.2} />
                    <XAxis dataKey="name" stroke="#94a3b8" axisLine={false} tickLine={false} dy={10} fontSize={12} />
                    <YAxis yAxisId="left" stroke="#94a3b8" axisLine={false} tickLine={false} tickFormatter={(val) => formatCompactCurrency(val)} fontSize={12} />
                    <YAxis yAxisId="right" orientation="right" stroke="#f59e0b" axisLine={false} tickLine={false} tickFormatter={(val) => `${val.toFixed(1)}%`} fontSize={12} domain={[0, 'auto']} />
                    
                    <Tooltip 
                        contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff' }}
                        formatter={(value: number, name: string) => {
                            if (name === '% da Receita (ROL)') return [`${value.toFixed(2)}%`, name];
                            return [formatCurrency(value), name];
                        }}
                    />
                    <Legend wrapperStyle={{ paddingTop: '10px' }} />
                    <Line 
                        yAxisId="left"
                        name={`Realizado ${selectedYear}`}
                        type="monotone" 
                        dataKey="current" 
                        stroke="#3b82f6" 
                        strokeWidth={3}
                        dot={{ r: 4, fill: '#3b82f6', strokeWidth: 0 }}
                        activeDot={{ r: 6 }}
                    />
                    <Line 
                        yAxisId="left"
                        name={`Realizado ${compareYear}`}
                        type="monotone" 
                        dataKey="previous" 
                        stroke="#94a3b8" 
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        dot={{ r: 3, fill: '#94a3b8', strokeWidth: 0 }}
                        activeDot={{ r: 5 }}
                    />
                    {/* NEW LINE: Percentage of ROL */}
                    <Line 
                        yAxisId="right"
                        name="% da Receita (ROL)"
                        type="monotone" 
                        dataKey="rolShare" 
                        stroke="#f59e0b" 
                        strokeWidth={2}
                        strokeDasharray="3 3"
                        dot={false}
                        activeDot={{ r: 4, fill: '#f59e0b' }}
                    />
                    </LineChart>
                </ResponsiveContainer>
              </div>
          </div>
      )}

      {/* DATA TABLE */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 shadow-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-400">
            <thead className="bg-slate-900 text-slate-200 uppercase font-medium">
              <tr>
                <th className="px-6 py-4 w-32">Conta</th>
                <th className="px-6 py-4">Descrição</th>
                <th className="px-6 py-4 w-24 text-center">Nível</th>
                <th className="px-6 py-4 w-24 text-center">Ação</th>
                <th className="px-6 py-4 text-right">Total ({periodLabel})</th>
                <th className="px-6 py-4 text-center w-32">Classificação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {displayedData.length > 0 ? (
                displayedData.map((row) => (
                  <tr key={row.accountCode} className={`hover:bg-slate-700/50 transition-colors ${focusedAccount?.accountCode === row.accountCode ? 'bg-blue-900/10' : ''}`}>
                    <td className="px-6 py-4 font-mono text-xs text-slate-300">{row.accountCode}</td>
                    <td className="px-6 py-4">
                        <div className="font-medium text-white">{row.description}</div>
                        {focusedAccount && <div className="text-xs text-blue-400 mt-0.5">Filha de {focusedAccount.accountCode}</div>}
                    </td>
                    <td className="px-6 py-4 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold 
                            ${row.level === 1 ? 'bg-slate-600 text-white' : 
                              row.level === 2 ? 'bg-purple-900/40 text-purple-300 border border-purple-800' :
                              row.level === 3 ? 'bg-indigo-900/40 text-indigo-300 border border-indigo-800' :
                              row.level === 4 ? 'bg-blue-900/40 text-blue-300 border border-blue-800' :
                              'bg-slate-800 text-slate-400 border border-slate-700'}
                        `}>
                            L{row.level}
                        </span>
                    </td>
                    
                    {/* Action Column for Drill Down */}
                    <td className="px-6 py-4 text-center">
                        {row.level < 5 ? (
                            <button 
                                onClick={() => handleDrillDown(row)}
                                className="p-1.5 rounded-lg bg-blue-600/10 text-blue-400 hover:bg-blue-600 hover:text-white transition-all group"
                                title="Ver contas filhas e gráfico"
                            >
                                <ZoomIn size={16} />
                            </button>
                        ) : (
                            <button 
                                onClick={() => handleDrillDown(row)} // Even for level 5, we can show the chart
                                className="p-1.5 rounded-lg bg-slate-700/30 text-slate-500 hover:bg-slate-700 hover:text-slate-300 transition-all"
                                title="Ver gráfico individual"
                            >
                                <TrendingUp size={16} />
                            </button>
                        )}
                    </td>

                    <td className="px-6 py-4 text-right font-bold text-white tracking-wide">
                      {formatCurrency(row.amount)}
                    </td>
                    
                    <td className="px-6 py-4 text-center">
                      <span className={`px-2 py-1 rounded text-[10px] font-bold tracking-wider ${
                        row.isVariable 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' 
                          : 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
                      }`}>
                         {row.isVariable ? 'VARIÁVEL' : 'FIXA'}
                      </span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center flex flex-col items-center justify-center">
                    <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center mb-3">
                        <Search className="text-slate-600" />
                    </div>
                    <p className="text-slate-400 font-medium">Nenhum dado encontrado para o período</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {filteredData.length > limit && (
          <div className="p-4 border-t border-slate-700 text-center bg-slate-900/30">
            <button 
              onClick={() => setLimit(prev => prev + 50)}
              className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-blue-400 rounded-full text-sm font-medium transition-colors border border-slate-700"
            >
              Carregar mais linhas ({filteredData.length - limit} restantes)
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default MicroView;