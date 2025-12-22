import React, { useMemo, useState } from 'react';
import { ProcessedExpense, ThresholdConfig, CategoryType, DeviationStatus, ComparisonMode } from '../types';
import { 
  formatCurrency, formatCompactCurrency, filterDataByPeriod, getMonthsForPeriod, 
  calculateDeviations, generatePareto 
} from '../utils/dataProcessor';
import { CATEGORY_MAP } from '../constants';
import { 
  AlertTriangle, Settings2, TrendingUp, RotateCcw, ArrowUpDown, X, Filter, Save, CheckCircle2
} from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  Cell, BarChart, Bar, ReferenceLine
} from 'recharts';

interface DeviationViewProps {
  data: ProcessedExpense[];
  selectedYear: number;
  compareYear: number;
  selectedMonths: number[];
}

const DEFAULT_THRESHOLDS: ThresholdConfig = {
  healthyMax: 10,   // "Saudável" (Amarelo) até 10%
  criticalMin: 20   // "Crítico" (Vermelho) acima de 20%
  // Implícito: "Atenção" (Laranja) entre 10% e 20%
};

const CATEGORIES: CategoryType[] = ['DC', 'DL', 'GGF', 'DA', 'DF', 'DP'];

type SortField = 'description' | 'budget' | 'real' | 'absDeviation' | 'percDeviation';
type SortOrder = 'asc' | 'desc';

const DeviationView: React.FC<DeviationViewProps> = ({ data, selectedYear, compareYear, selectedMonths }) => {
  // Estado real aplicado aos cálculos
  const [thresholds, setThresholds] = useState<ThresholdConfig>(DEFAULT_THRESHOLDS);
  
  // Estado temporário para o formulário (inputs)
  const [tempThresholds, setTempThresholds] = useState<ThresholdConfig>(DEFAULT_THRESHOLDS);
  const [isSaved, setIsSaved] = useState(false);

  const [drillDownCategory, setDrillDownCategory] = useState<CategoryType | null>(null);
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>('BUDGET');
  const [selectedLevel, setSelectedLevel] = useState<number>(5);
  const [sortField, setSortField] = useState<SortField>('absDeviation');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  // Função para Salvar Critérios
  const handleSaveThresholds = () => {
    setThresholds(tempThresholds);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000); // Feedback visual temporário
  };

  // Função para Restaurar Padrões
  const handleRestoreDefaults = () => {
    setTempThresholds(DEFAULT_THRESHOLDS);
    setThresholds(DEFAULT_THRESHOLDS);
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  // 1. Dados Base
  const analysisData = useMemo(() => {
      const currentReal = data.filter(d => d.year === selectedYear && d.dataType === 'REAL');
      let baselineData = comparisonMode === 'BUDGET' 
        ? data.filter(d => d.year === selectedYear && d.dataType === 'ORCADO')
        : data.filter(d => d.year === compareYear && d.dataType === 'REAL').map(d => ({ ...d, dataType: 'ORCADO' as const }));

      return filterDataByPeriod([...currentReal, ...baselineData], selectedMonths);
  }, [data, selectedYear, compareYear, comparisonMode, selectedMonths]);

  // 2. Dados por Categoria (Gráfico)
  const categoryDeviations = useMemo(() => {
    return calculateDeviations(analysisData.filter(d => d.level === selectedLevel), 'CATEGORY', thresholds);
  }, [analysisData, thresholds, selectedLevel]);

  // 2.1 Dados Preparados para o Gráfico de Barras (Inversão Visual)
  const barChartData = useMemo(() => {
    return categoryDeviations.map(d => ({
        ...d,
        visualDeviation: d.absDeviation * -1
    }));
  }, [categoryDeviations]);

  // 3. Tabela Detalhada
  const tableData = useMemo(() => {
    let filtered = analysisData.filter(d => d.level === selectedLevel);
    if (drillDownCategory) {
      filtered = filtered.filter(d => d.category === drillDownCategory);
    }
    const results = calculateDeviations(filtered, 'ACCOUNT', thresholds);
    
    return [...results].sort((a, b) => {
        let valA = a[sortField];
        let valB = b[sortField];
        
        if (sortField === 'description') {
           valA = (valA as string).toLowerCase();
           valB = (valB as string).toLowerCase();
        } else if (typeof valA === 'number' && typeof valB === 'number') {
            if (sortField === 'absDeviation') {
                valA = Math.abs(valA); 
                valB = Math.abs(valB);
            }
        }
        if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
        if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
        return 0;
    });
  }, [analysisData, thresholds, drillDownCategory, selectedLevel, sortField, sortOrder]);

  // 4. KPIs
  const kpis = useMemo(() => {
    const totalReal = categoryDeviations.reduce((acc, curr) => acc + curr.real, 0);
    const totalBudget = categoryDeviations.reduce((acc, curr) => acc + curr.budget, 0);
    const diff = totalReal - totalBudget;
    return { 
        real: totalReal, budget: totalBudget, diff, 
        perc: totalBudget ? (diff/totalBudget)*100 : 0,
        critical: tableData.filter(d => d.status === 'CRITICAL').length 
    };
  }, [categoryDeviations, tableData]);

  // 5. Timeline
  const timelineData = useMemo(() => {
    return getMonthsForPeriod(selectedMonths).map(m => ({
        name: m.name,
        Realizado: Math.abs(analysisData.filter(d => d.month === m.index && d.dataType === 'REAL' && d.category !== 'ROL' && d.level === selectedLevel).reduce((s, i) => s + i.amount, 0)),
        Orcado: Math.abs(analysisData.filter(d => d.month === m.index && d.dataType === 'ORCADO' && d.category !== 'ROL' && d.level === selectedLevel).reduce((s, i) => s + i.amount, 0))
    }));
  }, [analysisData, selectedMonths, selectedLevel]);

  // Helper de Cores
  const getStatusColor = (status: DeviationStatus) => {
      switch(status) {
          case 'SAVING': return 'text-emerald-500';
          case 'HEALTHY': return 'text-yellow-400'; // Amarelo
          case 'WARNING': return 'text-orange-500'; // Laranja
          case 'CRITICAL': return 'text-rose-500';  // Vermelho
          default: return 'text-slate-400';
      }
  };

  const getStatusBg = (status: DeviationStatus) => {
      switch(status) {
          case 'SAVING': return 'bg-emerald-900/30 border-emerald-900';
          case 'HEALTHY': return 'bg-yellow-900/30 border-yellow-900';
          case 'WARNING': return 'bg-orange-900/30 border-orange-900';
          case 'CRITICAL': return 'bg-rose-900/30 border-rose-900';
          default: return 'bg-slate-800 border-slate-700';
      }
  };

  const getStatusLabel = (status: DeviationStatus) => {
      switch(status) {
          case 'SAVING': return 'ECONOMIA';
          case 'HEALTHY': return 'TOLERÂNCIA';
          case 'WARNING': return 'ATENÇÃO';
          case 'CRITICAL': return 'CRÍTICO';
          default: return '-';
      }
  };

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      
      // -- CASO 1: Gráfico de Linha (Timeline) --
      if (d.Realizado !== undefined) {
         const real = d.Realizado;
         const budget = d.Orcado;
         const abs = real - budget;
         const perc = budget !== 0 ? (abs / budget) * 100 : 0;
         
         const isBad = abs > 0;
         const valueColor = isBad ? 'text-rose-400' : 'text-emerald-400';

         return (
            <div className="bg-[#0f172a] border border-[#334155] p-4 rounded-lg shadow-2xl min-w-[200px]">
              <p className="font-bold text-white mb-2">{label}</p>
              <div className="text-xs text-slate-400 mb-2 flex justify-between gap-4">
                 <span>Real: {formatCompactCurrency(real)}</span>
                 <span>Base: {formatCompactCurrency(budget)}</span>
              </div>
              <div className="text-sm border-t border-slate-700/50 pt-2 flex justify-between gap-4">
                 <span className="text-slate-400">Desvio: </span>
                 <span className={`font-mono font-bold ${valueColor}`}>
                    {formatCompactCurrency(Math.abs(abs))}
                 </span>
              </div>
               <div className="text-sm flex justify-between gap-4">
                 <span className="text-slate-400">%: </span>
                 <span className={`font-mono font-bold ${valueColor}`}>
                    {perc > 0 ? '+' : ''}{perc.toFixed(1)}%
                 </span>
              </div>
            </div>
         );
      }

      // -- CASO 2: Gráfico de Barras / Pareto --
      const title = d.description || d.categoryName || CATEGORY_MAP[label] || label;
      const abs = d.absDeviation !== undefined ? d.absDeviation : (d.value || 0);
      const perc = d.percDeviation !== undefined ? d.percDeviation : (d.percent || 0);
      const status: DeviationStatus = d.status || (abs <= 0 ? 'SAVING' : (perc <= thresholds.healthyMax ? 'HEALTHY' : (perc < thresholds.criticalMin ? 'WARNING' : 'CRITICAL')));

      return (
        <div className="bg-[#0f172a] border border-[#334155] p-4 rounded-lg shadow-2xl min-w-[200px]">
          <p className="font-bold text-white mb-2">{title}</p>
          <div className="text-sm flex justify-between gap-4">
             <span className="text-slate-400">Desvio R$: </span>
             <span className={`font-mono font-bold ${getStatusColor(status)}`}>{formatCurrency(abs)}</span>
          </div>
          <div className="text-sm flex justify-between gap-4">
             <span className="text-slate-400">Desvio %: </span>
             <span className={`font-mono font-bold ${getStatusColor(status)}`}>
                {perc > 0 ? '+' : ''}{perc.toFixed(1)}%
             </span>
          </div>
          <p className="text-[10px] text-slate-500 mt-2 italic uppercase">
              {getStatusLabel(status)}
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      <div className="flex flex-col xl:flex-row justify-between items-start xl:items-center gap-4 mb-2">
        <h2 className="text-3xl font-bold text-white">Análise de Desvios</h2>
        
        {/* Controles Principais */}
        <div className="flex flex-wrap items-center gap-3">
            <div className="bg-slate-800 p-1 rounded-lg border border-slate-700 flex items-center shadow-inner">
                <button onClick={() => setComparisonMode('BUDGET')} className={`px-4 py-1.5 rounded-md text-xs font-bold ${comparisonMode === 'BUDGET' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>vs Orçado</button>
                <button onClick={() => setComparisonMode('YEAR')} className={`px-4 py-1.5 rounded-md text-xs font-bold ${comparisonMode === 'YEAR' ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>vs {compareYear}</button>
            </div>
            <div className="bg-slate-900/60 p-1.5 rounded-lg border border-slate-800 flex gap-1.5">
                {[2, 3, 4, 5].map(lvl => (
                    <button key={lvl} onClick={() => { setSelectedLevel(lvl); setDrillDownCategory(null); }} className={`px-3 py-1.5 rounded-md font-bold text-xs transition-all ${selectedLevel === lvl ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500'}`}>L{lvl}</button>
                ))}
            </div>
        </div>
      </div>

      {/* PAINEL DE CONFIGURAÇÃO DE CRITÉRIOS (NOVO REQUISITO) */}
      <div className="bg-slate-800/80 border border-slate-700 p-4 rounded-xl flex flex-col md:flex-row gap-6 items-end justify-between shadow-lg">
           <div className="flex gap-6 items-end">
               <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2 mb-1">
                      <div className="w-2 h-2 rounded-full bg-yellow-400"></div>
                      <label className="text-xs text-yellow-400 font-bold uppercase">Tolerância (Saudável)</label>
                  </div>
                  <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded px-2">
                      <span className="text-xs text-slate-500">Até</span>
                      <input 
                        type="number" 
                        value={tempThresholds.healthyMax} 
                        onChange={e => setTempThresholds(p => ({...p, healthyMax: Number(e.target.value)}))} 
                        className="bg-transparent text-sm text-white w-12 py-1.5 text-center focus:outline-none font-bold" 
                      />
                      <span className="text-xs text-slate-500">%</span>
                  </div>
               </div>

               <div className="flex flex-col gap-1">
                   {/* Zona de Atenção é calculada automaticamente */}
                   <div className="flex items-center gap-2 mb-1">
                       <div className="w-2 h-2 rounded-full bg-orange-500"></div>
                       <label className="text-xs text-orange-500 font-bold uppercase">Atenção (Automático)</label>
                   </div>
                   <div className="bg-slate-900/50 border border-slate-700/50 rounded px-3 py-1.5 text-xs text-slate-400 font-mono">
                       Entre {tempThresholds.healthyMax}% e {tempThresholds.criticalMin}%
                   </div>
               </div>

               <div className="flex flex-col gap-1">
                   <div className="flex items-center gap-2 mb-1">
                       <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                       <label className="text-xs text-rose-500 font-bold uppercase">Crítico</label>
                   </div>
                   <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded px-2">
                       <span className="text-xs text-slate-500">Acima de</span>
                       <input 
                            type="number" 
                            value={tempThresholds.criticalMin} 
                            onChange={e => setTempThresholds(p => ({...p, criticalMin: Number(e.target.value)}))} 
                            className="bg-transparent text-sm text-white w-12 py-1.5 text-center focus:outline-none font-bold" 
                        />
                       <span className="text-xs text-slate-500">%</span>
                   </div>
               </div>
           </div>

           <div className="flex items-center gap-3">
               <button 
                  onClick={handleRestoreDefaults} 
                  className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
               >
                   <RotateCcw size={14} /> Restaurar Padrão
               </button>
               <button 
                  onClick={handleSaveThresholds} 
                  className={`flex items-center gap-2 px-6 py-2 rounded-lg text-xs font-bold text-white transition-all shadow-lg ${isSaved ? 'bg-emerald-600' : 'bg-blue-600 hover:bg-blue-500'}`}
               >
                   {isSaved ? <CheckCircle2 size={16} /> : <Save size={16} />}
                   {isSaved ? 'Salvo!' : 'Salvar Critérios'}
               </button>
           </div>
      </div>

      {/* KPIS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
         <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 shadow-sm">
            <p className="text-slate-500 text-[10px] uppercase font-black tracking-widest">Base {comparisonMode === 'BUDGET' ? 'Orçado' : compareYear}</p>
            <div className="text-2xl font-bold text-white mt-1">{formatCompactCurrency(kpis.budget)}</div>
         </div>
         <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 shadow-sm">
            <p className="text-slate-500 text-[10px] uppercase font-black tracking-widest">Realizado</p>
            <div className="text-2xl font-bold text-white mt-1">{formatCompactCurrency(kpis.real)}</div>
         </div>
         <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-4 shadow-sm">
            <p className="text-slate-500 text-[10px] uppercase font-black tracking-widest">Desvio Total</p>
            <div className={`text-2xl font-bold mt-1 ${kpis.perc > thresholds.healthyMax ? 'text-rose-400' : 'text-emerald-400'}`}>{kpis.perc.toFixed(1)}%</div>
         </div>
         <div className={`border rounded-xl p-4 flex items-center gap-4 shadow-sm ${kpis.critical > 0 ? 'bg-rose-900/10 border-rose-800/50' : 'bg-emerald-900/10 border-emerald-800/50'}`}>
            <div className={`p-3 rounded-xl ${kpis.critical > 0 ? 'bg-rose-500/20 text-rose-400' : 'bg-emerald-500/20 text-emerald-400'}`}><AlertTriangle size={24} /></div>
            <div>
                <div className={`text-2xl font-bold ${kpis.critical > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>{kpis.critical}</div>
                <p className="text-slate-500 text-[10px] uppercase font-black tracking-tighter">Itens Críticos</p>
            </div>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* GRÁFICO DE BARRAS - VISUAL INVERTIDO E CORES ATUALIZADAS */}
          <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-6 shadow-xl">
             <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-bold text-white">Desvio por Categoria</h3>
                {drillDownCategory && (
                    <button onClick={() => setDrillDownCategory(null)} className="text-xs bg-blue-600/20 text-blue-400 px-2 py-1 rounded border border-blue-500/30 flex items-center gap-1 hover:bg-blue-600/30 transition-colors">
                        <X size={12} /> Limpar Filtro: {drillDownCategory}
                    </button>
                )}
             </div>
             <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barChartData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#334155" opacity={0.2} />
                        <XAxis type="number" stroke="#94a3b8" tickFormatter={(val) => formatCompactCurrency(Math.abs(val))} fontSize={10} hide />
                        <YAxis type="category" dataKey="id" stroke="#94a3b8" width={40} fontSize={11} fontWeight="bold" />
                        <Tooltip cursor={{fill: 'rgba(255,255,255,0.05)'}} content={<CustomTooltip />} />
                        <ReferenceLine x={0} stroke="#475569" />
                        <Bar dataKey="visualDeviation" radius={[4, 4, 4, 4]} onClick={(d: any) => setDrillDownCategory(prev => prev === d.id ? null : d.id)}>
                            {barChartData.map((entry, index) => {
                                // Mapeamento de cor para o gráfico
                                let color = '#10b981'; // Green (Saving)
                                if (entry.status === 'HEALTHY') color = '#facc15'; // Yellow
                                if (entry.status === 'WARNING') color = '#f97316'; // Orange
                                if (entry.status === 'CRITICAL') color = '#ef4444'; // Red

                                return (
                                <Cell 
                                    key={index} 
                                    fill={color}
                                    cursor="pointer" 
                                    opacity={drillDownCategory && drillDownCategory !== entry.id ? 0.3 : 1} 
                                />
                            )})}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
             </div>
             <div className="flex flex-wrap justify-center gap-4 mt-2 text-[10px] text-slate-500">
                <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-emerald-500"></div>Saving (Direita)</span>
                <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-yellow-400"></div>Tolerância (Amarelo)</span>
                <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-orange-500"></div>Atenção (Laranja)</span>
                <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-rose-500"></div>Crítico (Vermelho)</span>
             </div>
          </div>

          <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-6 shadow-xl">
             <h3 className="text-lg font-bold text-white mb-6">Pareto de Ofensores {drillDownCategory ? `(${drillDownCategory})` : '(Geral)'}</h3>
             <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={generatePareto(tableData)}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.2} vertical={false} />
                        <XAxis dataKey="name" stroke="#94a3b8" fontSize={9} angle={-30} textAnchor="end" height={60} />
                        <YAxis yAxisId="left" stroke="#ef4444" tickFormatter={formatCompactCurrency} />
                        <YAxis yAxisId="right" orientation="right" stroke="#3b82f6" tickFormatter={(v) => `${v}%`} domain={[0, 100]} />
                        <Tooltip content={<CustomTooltip />} />
                        <Line yAxisId="left" type="monotone" dataKey="value" stroke="#ef4444" strokeWidth={3} dot={{r:4, fill:'#ef4444'}} />
                        <Line yAxisId="right" type="monotone" dataKey="cumulativePercent" stroke="#3b82f6" strokeWidth={3} dot={{r:4, fill:'#3b82f6'}} />
                    </LineChart>
                </ResponsiveContainer>
             </div>
          </div>
      </div>

      {/* TABELA UNIFICADA */}
      <div className="bg-[#0f172a] border border-slate-700/50 rounded-xl shadow-2xl overflow-hidden mt-6">
          <div className="p-5 bg-[#0f172a] border-b border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="flex items-center gap-3">
                  <h3 className="text-lg font-bold text-white">
                     {drillDownCategory ? `Detalhamento: ${CATEGORY_MAP[drillDownCategory]}` : 'Detalhamento Geral'} (Nível {selectedLevel})
                  </h3>
                  {drillDownCategory && (
                      <span className="px-2 py-0.5 rounded bg-blue-900/30 text-blue-400 text-xs font-bold border border-blue-800">
                          Filtrado
                      </span>
                  )}
              </div>
              
              <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700">
                  <button onClick={() => setDrillDownCategory(null)} className={`px-4 py-1.5 rounded-md text-[10px] font-black tracking-widest ${!drillDownCategory ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}>TODAS</button>
                  {CATEGORIES.map(cat => (
                      <button 
                        key={cat} 
                        onClick={() => setDrillDownCategory(cat)} 
                        className={`px-4 py-1.5 rounded-md text-[10px] font-black tracking-widest ${drillDownCategory === cat ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'}`}
                      >
                          {cat}
                      </button>
                  ))}
              </div>
          </div>

          <div className="overflow-x-auto max-h-[600px] custom-scrollbar">
              <table className="w-full text-left text-sm text-slate-400">
                  <thead className="bg-[#0f172a] text-slate-300 uppercase font-black text-[10px] sticky top-0 z-10 border-b border-slate-800">
                      <tr>
                          <th className="px-6 py-4 cursor-pointer" onClick={() => handleSort('description')}>CONTA / DESCRIÇÃO <ArrowUpDown size={10} className="inline ml-1 opacity-40" /></th>
                          <th className="px-6 py-4 text-right cursor-pointer" onClick={() => handleSort('budget')}>
                              {comparisonMode === 'BUDGET' ? 'ORÇADO' : `REALIZADO ${compareYear}`} <ArrowUpDown size={10} className="inline ml-1 opacity-40" />
                          </th>
                          <th className="px-6 py-4 text-right cursor-pointer" onClick={() => handleSort('real')}>REALIZADO <ArrowUpDown size={10} className="inline ml-1 opacity-40" /></th>
                          <th className="px-6 py-4 text-right cursor-pointer" onClick={() => handleSort('absDeviation')}>DESVIO R$ <ArrowUpDown size={10} className="inline ml-1 opacity-40" /></th>
                          <th className="px-6 py-4 text-center">STATUS</th>
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                      {tableData.length > 0 ? tableData.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-800/40 transition-colors group">
                              <td className="px-6 py-4 font-bold text-white group-hover:text-blue-400 transition-colors flex items-center">
                                  <span className="text-slate-600 mr-1 opacity-50">..........</span>{item.description}
                              </td>
                              <td className="px-6 py-4 text-right font-mono text-slate-400">-{formatCompactCurrency(Math.abs(item.budget))}</td>
                              <td className="px-6 py-4 text-right font-mono text-slate-400">-{formatCompactCurrency(Math.abs(item.real))}</td>
                              
                              <td className={`px-6 py-4 text-right font-mono font-bold ${getStatusColor(item.status)}`}>
                                  {item.absDeviation > 0 ? '' : ''}{formatCompactCurrency(item.absDeviation)}
                              </td>

                              <td className="px-6 py-4 text-center">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-black border tracking-wider ${getStatusBg(item.status)} ${getStatusColor(item.status)}`}>
                                      {getStatusLabel(item.status)}
                                  </span>
                              </td>
                          </tr>
                      )) : (
                        <tr>
                            <td colSpan={5} className="px-6 py-8 text-center text-slate-500">
                                <Filter size={24} className="mx-auto mb-2 opacity-50" />
                                Nenhuma conta encontrada para o filtro atual.
                            </td>
                        </tr>
                      )}
                  </tbody>
              </table>
          </div>
      </div>
    </div>
  );
};

export default DeviationView;
