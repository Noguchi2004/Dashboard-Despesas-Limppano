import React, { useMemo, useState } from 'react';
import { ProcessedExpense, CategoryType } from '../types';
import { formatCurrency, formatCompactCurrency, filterDataByPeriod, getMonthsForPeriod, getPeriodLabel } from '../utils/dataProcessor';
import { Search, ZoomIn, ArrowLeft, Layers, TrendingUp, DollarSign, Calculator, Info, FolderTree, ChevronRight, Home, BarChart2 } from 'lucide-react';
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
                               .filter((id: string) => !id.includes('ST')); // EXCLUDE ST

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
                    accountCode: 'Visão Consolidada (Todas as Contas)',
                    description: metaItem.categoryName,
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
    const result = Array.from(aggregatedMap.values()).map(val => {
        let finalAmount = val.amount;

        if (val.meta.level < 5) {
             // Find all Level 5 children for this account code in the FULL dataset
             const childrenSum = periodData
                .filter(d => 
                    d.year === selectedYear && 
                    d.dataType === 'REAL' &&
                    d.level === 5 && 
                    d.category === val.meta.category &&
                    (d.accountCode === val.meta.accountCode || d.accountCode.startsWith(val.meta.accountCode + '.'))
                )
                .reduce((acc, curr) => acc + curr.amount, 0);
             
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
      // Keep Level ALL to start with usually
      setSelectedLevel('ALL');
      setSearchTerm('');
  };

  const handleBreadcrumbClick = (index: number) => {
      if (index === -1) {
          setFocusedAccount(null);
          setHistory([]);
      } else {
          const target = history[index];
          setFocusedAccount(target);
          setHistory(h => h.slice(0, index));
      }
      setSearchTerm('');
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
       {/* Header & Controls */}
       <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
           <div>
               <h2 className="text-3xl font-bold text-white flex items-center gap-2">
                   Visão Micro (Detalhes)
               </h2>
               <p className="text-slate-400 text-sm mt-1">
                   {periodLabel} | {selectedYear} vs {compareYear}
               </p>
           </div>
           
           <div className="flex flex-wrap items-center gap-3">
               {/* Search */}
               <div className="relative group">
                   <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                       <Search size={14} className="text-slate-500 group-focus-within:text-blue-400" />
                   </div>
                   <input 
                       type="text"
                       value={searchTerm}
                       onChange={(e) => setSearchTerm(e.target.value)}
                       placeholder="Buscar conta..."
                       className="bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg pl-9 pr-4 py-2 focus:outline-none focus:border-blue-500 w-48 transition-all"
                   />
               </div>

               {/* Level Selector (Only when drilled down) */}
               {focusedAccount && !focusedAccount.isSyntheticGroup && (
                   <div className="flex items-center bg-slate-900 border border-slate-700 rounded-lg p-1">
                       <span className="text-[10px] text-slate-500 font-bold px-2 uppercase">Nível</span>
                       {[2,3,4,5].map(lvl => (
                           <button
                               key={lvl}
                               onClick={() => setSelectedLevel(lvl === selectedLevel ? 'ALL' : lvl as LevelOption)}
                               className={`px-2 py-1 text-xs font-bold rounded ${selectedLevel === lvl ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                           >
                               {lvl}
                           </button>
                       ))}
                   </div>
               )}
           </div>
       </div>

       {/* Breadcrumbs */}
       <div className="flex items-center gap-2 text-sm bg-slate-800/50 p-3 rounded-xl border border-slate-700/50 overflow-x-auto">
           <button 
               onClick={() => handleBreadcrumbClick(-1)}
               className={`flex items-center gap-1 hover:text-white transition-colors ${!focusedAccount ? 'text-white font-bold' : 'text-slate-400'}`}
           >
               <Home size={14} /> Geral
           </button>
           
           {history.map((item, idx) => (
               <React.Fragment key={item.id}>
                   <ChevronRight size={14} className="text-slate-600" />
                   <button 
                       onClick={() => handleBreadcrumbClick(idx)}
                       className="text-slate-400 hover:text-white transition-colors whitespace-nowrap"
                   >
                       {item.description}
                   </button>
               </React.Fragment>
           ))}

           {focusedAccount && (
               <>
                   <ChevronRight size={14} className="text-slate-600" />
                   <span className="text-blue-400 font-bold whitespace-nowrap bg-blue-900/20 px-2 py-0.5 rounded border border-blue-900/50">
                       {focusedAccount.description}
                   </span>
               </>
           )}
       </div>

       {/* KPIs & Chart Section */}
       {focusedAccount ? (
           <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* KPIs Chart Context */}
                <div className="lg:col-span-1 space-y-4">
                    <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5">
                         <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2">Total {selectedYear}</p>
                         <h3 className="text-3xl font-bold text-white mb-1">{formatCompactCurrency(chartTotals.current)}</h3>
                         <div className={`flex items-center gap-2 text-sm font-bold ${chartTotals.percent > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                             {chartTotals.percent > 0 ? <TrendingUp size={16} /> : <TrendingUp size={16} className="rotate-180" />}
                             {Math.abs(chartTotals.percent).toFixed(1)}% vs {compareYear}
                         </div>
                    </div>
                    
                    <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5">
                         <div className="flex justify-between items-center mb-2">
                            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Histórico {compareYear}</p>
                         </div>
                         <h3 className="text-2xl font-bold text-slate-300">{formatCompactCurrency(chartTotals.previous)}</h3>
                         <p className="text-xs text-slate-500 mt-1">Diferença: {formatCompactCurrency(chartTotals.diff)}</p>
                    </div>
                </div>

                {/* Evolution Chart */}
                <div className="lg:col-span-2 bg-slate-800/40 border border-slate-700/50 rounded-xl p-5 h-64">
                    <h3 className="text-sm font-bold text-slate-300 mb-4">Evolução Mensal: {focusedAccount.description}</h3>
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                             <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} vertical={false} />
                             <XAxis dataKey="name" stroke="#94a3b8" tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                             
                             {/* LEFT AXIS: VALUES */}
                             <YAxis yAxisId="left" stroke="#94a3b8" tickFormatter={formatCompactCurrency} tick={{fontSize: 10}} axisLine={false} tickLine={false} />
                             
                             {/* RIGHT AXIS: PERCENTAGE */}
                             <YAxis yAxisId="right" orientation="right" stroke="#f59e0b" tickFormatter={(v) => `${v.toFixed(1)}%`} tick={{fontSize: 10}} axisLine={false} tickLine={false} domain={[0, 'auto']} />

                             <Tooltip 
                                 contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px' }}
                                 formatter={(val: number, name: string) => {
                                     if (name === '% ROL') return [`${val.toFixed(2)}%`, name];
                                     return [formatCurrency(val), name];
                                 }}
                             />
                             <Legend />
                             
                             <Line yAxisId="left" type="monotone" dataKey="current" name={`${selectedYear}`} stroke="#3b82f6" strokeWidth={3} dot={{r:3}} />
                             <Line yAxisId="left" type="monotone" dataKey="previous" name={`${compareYear}`} stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} />
                             <Line yAxisId="right" type="monotone" dataKey="rolShare" name="% ROL" stroke="#f59e0b" strokeWidth={2} dot={{r:3}} strokeDasharray="3 3" />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
           </div>
       ) : (
           <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5">
                   <div className="flex items-center gap-3 mb-2">
                       <div className="p-2 bg-blue-500/10 rounded-lg text-blue-400"><DollarSign size={20} /></div>
                       <p className="text-slate-400 text-xs font-bold uppercase">Despesas Totais</p>
                   </div>
                   <h3 className="text-2xl font-bold text-white">{formatCompactCurrency(financialKPIs.total)}</h3>
               </div>
               
               <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5">
                   <div className="flex items-center gap-3 mb-2">
                       <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400"><Layers size={20} /></div>
                       <p className="text-slate-400 text-xs font-bold uppercase">Fixas</p>
                   </div>
                   <h3 className="text-2xl font-bold text-white">{formatCompactCurrency(financialKPIs.fixed)}</h3>
               </div>

               <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-5">
                   <div className="flex items-center gap-3 mb-2">
                       <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400"><Calculator size={20} /></div>
                       <p className="text-slate-400 text-xs font-bold uppercase">Variáveis</p>
                   </div>
                   <h3 className="text-2xl font-bold text-white">{formatCompactCurrency(financialKPIs.variable)}</h3>
               </div>
           </div>
       )}

       {/* Table Section */}
       <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden shadow-lg">
           <div className="overflow-x-auto">
               <table className="w-full text-left border-collapse">
                   <thead>
                       <tr className="bg-slate-800/80 text-xs uppercase text-slate-400 border-b border-slate-700">
                           <th className="px-6 py-4 font-bold">Conta / Descrição</th>
                           <th className="px-6 py-4 font-bold text-center">Nível</th>
                           <th className="px-6 py-4 font-bold text-center">Tipo</th>
                           <th className="px-6 py-4 font-bold text-right">Valor ({selectedYear})</th>
                           <th className="px-6 py-4 font-bold text-center">Ação</th>
                       </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-800 text-sm">
                       {displayedData.length > 0 ? displayedData.map((row) => (
                           <tr key={row.id} className="hover:bg-slate-800/50 transition-colors group">
                               <td className="px-6 py-4">
                                   <div className="flex flex-col">
                                       <span className="font-bold text-white group-hover:text-blue-400 transition-colors">
                                            {row.description}
                                       </span>
                                       <span className="text-xs text-slate-500 font-mono mt-0.5">
                                           {row.accountCode}
                                       </span>
                                   </div>
                               </td>
                               <td className="px-6 py-4 text-center text-slate-400">
                                   <span className="bg-slate-800 px-2 py-1 rounded text-xs border border-slate-700">L{row.level}</span>
                               </td>
                               <td className="px-6 py-4 text-center">
                                   {row.isVariable 
                                      ? <span className="text-[10px] bg-emerald-900/30 text-emerald-400 px-2 py-1 rounded border border-emerald-900/50">VAR</span> 
                                      : <span className="text-[10px] bg-purple-900/30 text-purple-400 px-2 py-1 rounded border border-purple-900/50">FIX</span>
                                   }
                               </td>
                               <td className="px-6 py-4 text-right font-mono font-medium text-slate-200">
                                   {formatCurrency(row.amount)}
                               </td>
                               <td className="px-6 py-4 text-center">
                                   <button 
                                      onClick={() => handleDrillDown(row)}
                                      className="text-blue-400 hover:bg-blue-900/30 p-2 rounded-full transition-all"
                                      title={row.level === 5 ? "Visualizar Gráfico" : "Detalhar Nível"}
                                   >
                                       {row.level === 5 || !row.isSyntheticGroup ? <BarChart2 size={16} /> : <ZoomIn size={16} />}
                                   </button>
                               </td>
                           </tr>
                       )) : (
                           <tr>
                               <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                                   <Info size={24} className="mx-auto mb-2 opacity-50" />
                                   Nenhum dado encontrado para os filtros atuais.
                               </td>
                           </tr>
                       )}
                   </tbody>
               </table>
           </div>
           
           {filteredData.length > limit && (
               <div className="p-4 border-t border-slate-800 text-center">
                   <button 
                       onClick={() => setLimit(prev => prev + 50)}
                       className="text-sm text-blue-400 hover:text-blue-300 font-medium"
                   >
                       Carregar mais ({filteredData.length - limit} restantes)
                   </button>
               </div>
           )}
       </div>
    </div>
  );
};

export default MicroView;