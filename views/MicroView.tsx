import React, { useMemo, useState } from 'react';
import { ProcessedExpense, CategoryType } from '../types';
import { formatCurrency, formatCompactCurrency, filterDataByPeriod, getMonthsForPeriod, getPeriodLabel } from '../utils/dataProcessor';
import { Search, ZoomIn, ArrowLeft, Layers, TrendingUp, DollarSign, Calculator, Info, FolderTree, ChevronRight, Home } from 'lucide-react';
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

// Helper interface to handle the dynamic aggregation stages
interface AggregatedRow extends ProcessedExpense {
    isSyntheticGroup?: boolean; // True if this is a Top-Level ID Group (e.g. "DL AN" total)
}

const MicroView: React.FC<MicroViewProps> = ({ data, selectedYear, compareYear, selectedMonths }) => {
  // State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryType | 'ALL'>('ALL');
  const [selectedLevel, setSelectedLevel] = useState<LevelOption>('ALL');
  const [limit, setLimit] = useState(50);
  
  // Drill Down State & History
  const [focusedAccount, setFocusedAccount] = useState<AggregatedRow | null>(null);
  const [history, setHistory] = useState<AggregatedRow[]>([]);

  // 1. Filter Data by Period globally
  const periodData = useMemo(() => filterDataByPeriod(data, selectedMonths), [data, selectedMonths]);
  const periodLabel = useMemo(() => getPeriodLabel(selectedMonths), [selectedMonths]);

  // --- CHART DATA PREPARATION ---
  const chartData = useMemo(() => {
    if (!focusedAccount) return [];

    const targetId = focusedAccount.idCtactb;
    const targetCode = focusedAccount.accountCode;
    const targetCategory = focusedAccount.category;
    const isGroupView = focusedAccount.isSyntheticGroup;
    
    const activeMonths = getMonthsForPeriod(selectedMonths);

    return activeMonths.map((m) => {
      
      const calculateTotal = (year: number) => {
          // Pre-filter for efficiency
          const relevantItems = periodData.filter(d => 
            d.year === year && 
            d.month === m.index && 
            d.dataType === 'REAL'
          );

          if (isGroupView) {
              // MODE: Top Level Group (e.g. "DL AN", "DF AN")
              // Priority 1: Check if Level 2 rows have data
              const l2Sum = relevantItems
                .filter(d => d.idCtactb === targetId && d.level === 2)
                .reduce((sum, item) => sum + item.amount, 0);
              
              if (Math.abs(l2Sum) > 0.01) return l2Sum;

              // Priority 2: Fallback to Level 5 Sum if Level 2 is zero/empty
              return relevantItems
                .filter(d => d.idCtactb === targetId && d.level === 5)
                .reduce((sum, item) => sum + item.amount, 0);

          } else {
              // MODE: Specific Account Drill Down (e.g. "4.1" or "4.3.02")
              // CRITICAL FIX: Always sum Level 5 children for chart accuracy.
              // Synthetic rows in Excel (L3, L4) often have incorrect or zeroed totals.
              // We reconstruct the total from the bottom up (Analytical Level 5).
              
              return relevantItems
                 .filter(d => d.category === targetCategory && 
                        d.level === 5 &&
                        (d.accountCode === targetCode || d.accountCode.startsWith(targetCode + '.'))
                 )
                 .reduce((sum, item) => sum + item.amount, 0);
          }
      };

      const currentVal = calculateTotal(selectedYear);
      const prevVal = calculateTotal(compareYear);
      
      const currentRol = periodData
        .filter(d => d.year === selectedYear && d.category === 'ROL' && d.month === m.index && d.dataType === 'REAL')
        .reduce((sum, item) => sum + item.amount, 0);

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
  const financialKPIs = useMemo(() => {
      const sourceForKPIs = periodData.filter(d => 
          d.year === selectedYear && 
          d.dataType === 'REAL' && 
          d.category !== 'ROL' &&
          d.level === 5 && 
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


  // --- TABLE DATA FILTERING & DRILL DOWN LOGIC ---
  const filteredData = useMemo(() => {
    // 1. Base Filter
    let candidates = periodData
      .filter(d => d.year === selectedYear)
      .filter(d => d.dataType === 'REAL')
      .filter(d => d.category !== 'ROL');

    // Category Filter (Always applies)
    if (selectedCategory !== 'ALL') {
        candidates = candidates.filter(d => d.category === selectedCategory);
    }

    // --- VIEW MODE LOGIC ---

    // MODE 1: ROOT VIEW (No Focus) - Display Groups like "DL AN", "DF AN"
    if (!focusedAccount) {
        // FILTER OUT 'ST' IDs HERE
        const uniqueIds = Array.from(new Set(candidates.map(d => d.idCtactb)))
                               .filter(id => !id.includes('ST')); // EXCLUDE ST

        const result: AggregatedRow[] = [];

        uniqueIds.forEach(id => {
            const groupItems = candidates.filter(d => d.idCtactb === id);
            
            // Priority 1: Use Level 2 sum if available
            const l2Items = groupItems.filter(d => d.level === 2);
            let total = l2Items.reduce((acc, curr) => acc + curr.amount, 0);

            // Priority 2: Fallback to Level 5 sum if Level 2 is zero
            if (Math.abs(total) < 0.01) {
                const l5Items = groupItems.filter(d => d.level === 5);
                total = l5Items.reduce((acc, curr) => acc + curr.amount, 0);
            }

            // Use metadata from first available item (prefer L2)
            const metaItem = l2Items.length > 0 ? l2Items[0] : groupItems[0];
            
            if (metaItem) {
                result.push({
                    ...metaItem,
                    amount: total,
                    accountCode: metaItem.categoryName, // Display Category Name in "Conta" column
                    description: 'Visão Consolidada (Todas as Contas)',
                    isSyntheticGroup: true
                });
            }
        });
        
        let sortedResult = result.sort((a,b) => b.amount - a.amount);
        
        // Search Filter at Root
        if (searchTerm) {
            const lower = searchTerm.toLowerCase();
            sortedResult = sortedResult.filter(d => d.idCtactb.toLowerCase().includes(lower) || d.categoryName.toLowerCase().includes(lower));
        }
        return sortedResult;
    }

    // MODE 2: INSIDE A GROUP (Clicked "DL AN") - Display Level 2 Accounts
    if (focusedAccount.isSyntheticGroup) {
        const groupItems = candidates.filter(d => d.idCtactb === focusedAccount.idCtactb);
        
        // Identify all unique Level 2 accounts
        // Strategy: Use L2 rows if present. If not, this logic might need L5 inferrence, 
        // but typically L2 rows exist in structure even if amount is 0.
        const l2Rows = groupItems.filter(d => d.level === 2);
        
        // Map to aggregate amounts by Account Code
        const tempMap = new Map<string, { meta: ProcessedExpense, l2Amount: number }>();

        l2Rows.forEach(row => {
            if (!tempMap.has(row.accountCode)) {
                tempMap.set(row.accountCode, { meta: row, l2Amount: 0 });
            }
            tempMap.get(row.accountCode)!.l2Amount += row.amount;
        });

        const result: ProcessedExpense[] = [];
        
        // For each L2 account, determine the correct amount
        tempMap.forEach((val, key) => {
             let finalAmount = val.l2Amount;
             
             // If L2 row amount is zero, sum the children (L5)
             if (Math.abs(finalAmount) < 0.01) {
                 finalAmount = groupItems
                    .filter(d => d.level === 5 && d.accountCode.startsWith(key))
                    .reduce((acc, curr) => acc + curr.amount, 0);
             }
             
             result.push({ ...val.meta, amount: finalAmount });
        });

        let finalResult = result;
        if (searchTerm) {
             finalResult = finalResult.filter(d => d.description.toLowerCase().includes(searchTerm.toLowerCase()) || d.accountCode.includes(searchTerm));
        }
        return finalResult.sort((a,b) => b.amount - a.amount);
    }

    // MODE 3: STANDARD HIERARCHY DRILL DOWN (Clicked "4.3")
    // Goal: Show children (Level 3, 4, 5)
    candidates = candidates.filter(d => 
        d.category === focusedAccount.category && 
        d.accountCode.startsWith(focusedAccount.accountCode) &&
        d.level > focusedAccount.level
    );

    // Auto Level Logic
    if (selectedLevel === 'ALL') {
         const availableLevels = candidates.map(d => d.level);
         if (availableLevels.length > 0) {
             const nextLevel = Math.min(...availableLevels);
             candidates = candidates.filter(d => d.level === nextLevel);
         }
    } else {
         candidates = candidates.filter(d => d.level === selectedLevel);
    }

    if (searchTerm) {
        const lower = searchTerm.toLowerCase();
        candidates = candidates.filter(d => d.description.toLowerCase().includes(lower) || d.accountCode.includes(lower));
    }
    
    // Aggregate Standard Children
    const aggregatedMap = new Map<string, { meta: ProcessedExpense, amount: number }>();
    
    candidates.forEach(item => {
        const key = `${item.level}|${item.accountCode}`; 
        if(!aggregatedMap.has(key)) aggregatedMap.set(key, { meta: item, amount: 0 });
        aggregatedMap.get(key)!.amount += item.amount;
    });

    // FINAL AMOUNT RECALCULATION
    // For every row we display, if it is NOT Level 5, we must recalculate its total 
    // by summing its Level 5 descendants from the FULL periodData.
    // This fixes the issue where intermediate Excel rows (L3, L4) have wrong/zero values.
    const result = Array.from(aggregatedMap.values()).map(val => {
        let finalAmount = val.amount;

        if (val.meta.level < 5) {
             // Find all Level 5 children for this account code in the FULL dataset
             // Check for exact code match OR child match (e.g. 4.3 matches 4.3.01)
             const childrenSum = periodData
                .filter(d => 
                    d.year === selectedYear && 
                    d.dataType === 'REAL' &&
                    d.level === 5 && 
                    d.category === val.meta.category &&
                    (d.accountCode === val.meta.accountCode || d.accountCode.startsWith(val.meta.accountCode + '.'))
                )
                .reduce((acc, curr) => acc + curr.amount, 0);
             
             // If we found children data, use it as the source of truth
             // Using > 0.01 check to avoid overriding with 0 if somehow children are missing but parent has data (rare fallback)
             // But usually, trust children sum.
             if (Math.abs(childrenSum) > 0.01 || Math.abs(val.amount) < 0.01) {
                 finalAmount = childrenSum;
             }
        }
        return { ...val.meta, amount: finalAmount };
    });

    return result.sort((a, b) => b.amount - a.amount);

  }, [periodData, selectedYear, searchTerm, selectedCategory, selectedLevel, focusedAccount]);

  const displayedData = filteredData.slice(0, limit);

  // --- HANDLERS WITH HISTORY LOGIC ---

  const handleDrillDown = (row: AggregatedRow) => {
      // 1. Push current parent to history (if exists)
      if (focusedAccount) {
          setHistory(prev => [...prev, focusedAccount]);
      }
      // 2. Set new focus
      setFocusedAccount(row);
      
      // Reset view params
      setSelectedLevel('ALL'); 
      setLimit(50);
      setSearchTerm('');
      window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
      if (history.length > 0) {
          // 1. Pop the last item from history
          const previousAccount = history[history.length - 1];
          const newHistory = history.slice(0, -1);
          
          setHistory(newHistory);
          setFocusedAccount(previousAccount);
      } else {
          // 2. If history is empty, go to Root
          setFocusedAccount(null);
          setHistory([]);
      }
      setSelectedLevel('ALL');
      setLimit(50);
  };

  const handleResetToRoot = () => {
      setFocusedAccount(null);
      setHistory([]);
      setSelectedLevel('ALL');
      setLimit(50);
  };

  const handleCategorySelect = (cat: CategoryType | 'ALL') => {
      setSelectedCategory(cat);
      handleResetToRoot(); // Clear drill down when changing main tabs
  };

  const handleJumpToHistory = (index: number) => {
      const targetAccount = history[index];
      const newHistory = history.slice(0, index);
      setHistory(newHistory);
      setFocusedAccount(targetAccount);
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      
      {/* HEADER & BREADCRUMBS */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
           <div className="flex flex-col w-full">
             
             {/* Main Title Row */}
             <div className="flex items-center gap-3 mb-2">
                 {focusedAccount ? (
                     <button 
                        onClick={handleBack}
                        className="p-2 rounded-full bg-slate-800 hover:bg-slate-700 text-white transition-colors border border-slate-700 shadow-sm group"
                        title="Voltar um nível"
                     >
                         <ArrowLeft size={20} className="group-hover:-translate-x-0.5 transition-transform" />
                     </button>
                 ) : (
                     <div className="p-2">
                         <Layers size={24} className="text-blue-500" />
                     </div>
                 )}
                 <h2 className="text-3xl font-bold text-white">Visão Micro</h2>
             </div>

             {/* Breadcrumb Navigation Bar */}
             <div className="flex items-center gap-2 text-sm text-slate-400 bg-slate-900/50 p-2 rounded-lg border border-slate-800/50 flex-wrap">
                <button 
                    onClick={handleResetToRoot}
                    className={`flex items-center gap-1 hover:text-white transition-colors ${!focusedAccount ? 'text-blue-400 font-bold' : ''}`}
                >
                    <Home size={14} /> Início
                </button>

                {history.map((item, index) => (
                    <React.Fragment key={`${item.idCtactb}-${index}`}>
                        <ChevronRight size={14} className="text-slate-600" />
                        <button 
                            onClick={() => handleJumpToHistory(index)}
                            className="hover:text-white hover:underline transition-colors"
                        >
                            {item.isSyntheticGroup ? item.idCtactb : item.accountCode}
                        </button>
                    </React.Fragment>
                ))}

                {focusedAccount && (
                    <>
                        <ChevronRight size={14} className="text-slate-600" />
                        <span className="text-white font-bold px-2 py-0.5 bg-blue-600/20 rounded text-blue-200 border border-blue-600/30">
                            {focusedAccount.isSyntheticGroup ? focusedAccount.idCtactb : focusedAccount.accountCode}
                        </span>
                    </>
                )}
             </div>

             <span className="text-xs text-blue-400 mt-2 font-medium w-fit ml-1">
                Dados filtrados por: {periodLabel}
             </span>
           </div>
        </div>

        {/* SUMMARY CARDS */}
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
                    placeholder="Buscar ID, conta ou descrição..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 text-white rounded-lg pl-10 pr-4 py-2 focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                />
                </div>

                {/* Level Select - Only show when NOT at root or synthetic group level */}
                {focusedAccount && !focusedAccount.isSyntheticGroup && (
                    <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 w-full md:w-48 animate-fade-in">
                        <Layers size={16} className="text-slate-500" />
                        <select 
                            value={selectedLevel}
                            onChange={(e) => {
                                const val = e.target.value === 'ALL' ? 'ALL' : Number(e.target.value);
                                setSelectedLevel(val as LevelOption);
                            }}
                            className="bg-transparent text-sm text-white w-full focus:outline-none cursor-pointer"
                        >
                            <option value="ALL" className="bg-blue-900 text-white">Automático</option>
                            <option value="3" className="bg-blue-900 text-white">Nível 3</option>
                            <option value="4" className="bg-blue-900 text-white">Nível 4</option>
                            <option value="5" className="bg-blue-900 text-white">Nível 5</option>
                        </select>
                    </div>
                )}
            </div>
            
            <div className="flex gap-2 w-full lg:w-auto overflow-x-auto no-scrollbar">
                {(['ALL', 'DC', 'DL', 'DA', 'DF', 'GGF', 'DP'] as const).map(cat => (
                    <button
                        key={cat}
                        onClick={() => handleCategorySelect(cat)}
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
                          Evolução: {focusedAccount.isSyntheticGroup ? focusedAccount.categoryName : focusedAccount.description}
                      </h3>
                      <p className="text-sm text-slate-400 font-mono mt-1">
                          {focusedAccount.idCtactb} 
                          {focusedAccount.isSyntheticGroup 
                            ? ' • Visão Agrupada (Todas as Contas)' 
                            : ` • Conta: ${focusedAccount.accountCode}`
                          }
                      </p>
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
                <th className="px-6 py-4 w-40">ID_CTACTB</th>
                <th className="px-6 py-4 w-48">{!focusedAccount ? 'Categoria (Agrupado)' : 'Conta Contábil'}</th>
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
                  <tr key={`${row.idCtactb}-${row.level}-${row.accountCode}`} className={`hover:bg-slate-700/50 transition-colors ${focusedAccount?.idCtactb === row.idCtactb ? 'bg-blue-900/10' : ''}`}>
                    <td className="px-6 py-4 font-mono text-xs text-blue-300 font-bold">{row.idCtactb}</td>
                    
                    {/* Dynamic Account Code Column */}
                    <td className="px-6 py-4 font-mono text-xs text-slate-300">
                        {(row as AggregatedRow).isSyntheticGroup ? (
                            <span className="text-white font-bold">{row.categoryName}</span>
                        ) : (
                            row.accountCode
                        )}
                    </td>

                    <td className="px-6 py-4">
                        <div className="font-medium text-white">{row.description}</div>
                        {(row as AggregatedRow).isSyntheticGroup && <div className="text-xs text-slate-500 mt-0.5">Clique para ver contas (3.1, 4.x...)</div>}
                    </td>
                    
                    <td className="px-6 py-4 text-center">
                        {(row as AggregatedRow).isSyntheticGroup ? (
                            <span className="inline-block px-2 py-0.5 rounded text-xs font-bold bg-indigo-900/40 text-indigo-300 border border-indigo-800">
                                GRUPO
                            </span>
                        ) : (
                            <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold 
                                ${row.level === 1 ? 'bg-slate-600 text-white' : 
                                row.level === 2 ? 'bg-purple-900/40 text-purple-300 border border-purple-800' :
                                row.level === 3 ? 'bg-indigo-900/40 text-indigo-300 border border-indigo-800' :
                                row.level === 4 ? 'bg-blue-900/40 text-blue-300 border border-blue-800' :
                                'bg-slate-800 text-slate-400 border border-slate-700'}
                            `}>
                                L{row.level}
                            </span>
                        )}
                    </td>
                    
                    <td className="px-6 py-4 text-center">
                        {((row as AggregatedRow).isSyntheticGroup || row.level < 5) ? (
                            <button 
                                onClick={() => handleDrillDown(row)}
                                className="p-1.5 rounded-lg bg-blue-600/10 text-blue-400 hover:bg-blue-600 hover:text-white transition-all group"
                                title={(row as AggregatedRow).isSyntheticGroup ? "Abrir Grupo" : "Ver filhas"}
                            >
                                {(row as AggregatedRow).isSyntheticGroup ? <FolderTree size={16} /> : <ZoomIn size={16} />}
                            </button>
                        ) : (
                            <button 
                                onClick={() => handleDrillDown(row)} 
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
                  <td colSpan={7} className="px-6 py-12 text-center flex flex-col items-center justify-center">
                    <div className="w-12 h-12 bg-slate-800 rounded-full flex items-center justify-center mb-3">
                        <Search className="text-slate-600" />
                    </div>
                    <p className="text-slate-400 font-medium">
                       {focusedAccount ? 'Nenhuma conta filha encontrada neste nível.' : 'Nenhum dado encontrado.'}
                    </p>
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