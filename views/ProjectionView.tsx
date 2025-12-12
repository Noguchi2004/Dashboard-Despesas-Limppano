import React, { useMemo } from 'react';
import { ProcessedExpense } from '../types';
import { generateForecast } from '../utils/forecasting';
import { formatCompactCurrency, formatCurrency } from '../utils/dataProcessor';
import { 
  ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, Cell
} from 'recharts';
import { TrendingUp, Calendar, AlertTriangle, TrendingDown, BrainCircuit, Target, ArrowRight } from 'lucide-react';

interface ProjectionViewProps {
  data: ProcessedExpense[];
}

const ProjectionView: React.FC<ProjectionViewProps> = ({ data }) => {
  // Generate Forecast Data (Memoized to avoid recalc on re-renders)
  const forecast = useMemo(() => generateForecast(data, 12), [data]);

  // Extract key metrics
  const historicalData = forecast.chartData.filter(d => !d.isProjected);
  const lastHistoricalPoint = historicalData[historicalData.length - 1];
  
  const currentMonthlyAvg = lastHistoricalPoint ? lastHistoricalPoint.historical! : 0; // Rough approx
  const projectedAvg = forecast.nextYearTotal.base / 12;
  const growthTrend = currentMonthlyAvg ? ((projectedAvg - currentMonthlyAvg) / currentMonthlyAvg) * 100 : 0;

  // Determine top risk
  const topRiskMonth = forecast.seasonalityInsights.length > 0 ? forecast.seasonalityInsights[0] : null;

  return (
    <div className="space-y-6 animate-fade-in pb-12">
      
      {/* HEADER */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-2">
         <div>
            <h2 className="text-3xl font-bold text-white flex items-center gap-2">
               <BrainCircuit className="text-fuchsia-500" /> Projeções Inteligentes
            </h2>
            <p className="text-slate-400 text-sm mt-1">
               Previsão de despesas para os próximos 12 meses utilizando regressão linear e sazonalidade histórica.
            </p>
         </div>
         <div className="bg-fuchsia-900/20 border border-fuchsia-800/50 px-4 py-2 rounded-lg text-xs text-fuchsia-300 font-mono">
            Modelo: Tendência + Sazonalidade
         </div>
      </div>

      {/* KPI CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-slate-800 border border-slate-700 p-5 rounded-xl">
             <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Total Projetado (12 Meses)</p>
             <div className="text-2xl font-bold text-white mt-2">{formatCompactCurrency(forecast.nextYearTotal.base)}</div>
             <p className="text-xs text-slate-500 mt-1">Cenário Base</p>
          </div>

          <div className="bg-slate-800 border border-slate-700 p-5 rounded-xl">
             <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Tendência Geral</p>
             <div className={`text-2xl font-bold mt-2 flex items-center gap-2 ${growthTrend > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                {growthTrend > 0 ? <TrendingUp size={24} /> : <TrendingDown size={24} />}
                {Math.abs(growthTrend).toFixed(1)}%
             </div>
             <p className="text-xs text-slate-500 mt-1">Sobre a média atual</p>
          </div>

          <div className="bg-slate-800 border border-slate-700 p-5 rounded-xl">
             <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Mês de Maior Risco</p>
             <div className="text-2xl font-bold text-white mt-2">{topRiskMonth ? topRiskMonth.month : 'N/A'}</div>
             <p className="text-xs text-rose-400 mt-1">
                {topRiskMonth ? `+${((topRiskMonth.factor-1)*100).toFixed(0)}% Sazonalidade` : ''}
             </p>
          </div>

          <div className="bg-slate-800 border border-slate-700 p-5 rounded-xl">
             <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Volatilidade (Incerteza)</p>
             <div className="text-2xl font-bold text-white mt-2">
                ± {formatCompactCurrency((forecast.nextYearTotal.pessimistic - forecast.nextYearTotal.base))}
             </div>
             <p className="text-xs text-slate-500 mt-1">Range Otimista/Pessimista</p>
          </div>
      </div>

      {/* MAIN PROJECTION CHART */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 shadow-lg">
         <div className="flex justify-between items-center mb-6">
             <h3 className="text-lg font-bold text-white">Projeção de Cenários</h3>
             <div className="flex gap-4 text-xs font-medium">
                 <div className="flex items-center gap-1"><div className="w-3 h-3 bg-blue-500 rounded-full"></div> Histórico</div>
                 <div className="flex items-center gap-1"><div className="w-3 h-3 bg-fuchsia-500 rounded-full"></div> Base</div>
                 <div className="flex items-center gap-1"><div className="w-3 h-3 bg-emerald-500/50 rounded-full"></div> Otimista</div>
                 <div className="flex items-center gap-1"><div className="w-3 h-3 bg-rose-500/50 rounded-full"></div> Pessimista</div>
             </div>
         </div>
         
         <div className="h-[400px] w-full">
            <ResponsiveContainer width="100%" height="100%">
               <ComposedChart data={forecast.chartData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.3} vertical={false} />
                  <XAxis dataKey="dateKey" stroke="#94a3b8" tick={{fontSize: 12}} />
                  <YAxis stroke="#94a3b8" tickFormatter={formatCompactCurrency} tick={{fontSize: 12}} />
                  <Tooltip 
                     contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff' }}
                     formatter={(value: number, name: string) => {
                        const labels: any = {
                           historical: 'Realizado',
                           scenarioBase: 'Projeção Base',
                           scenarioOptimistic: 'Cenário Otimista',
                           scenarioPessimistic: 'Cenário Pessimista'
                        };
                        return [formatCurrency(value), labels[name] || name];
                     }}
                     labelFormatter={(label) => `Período: ${label}`}
                  />
                  
                  {/* Historical Line */}
                  <Line type="monotone" dataKey="historical" stroke="#3b82f6" strokeWidth={3} dot={{r:4, fill:'#3b82f6'}} activeDot={{r:6}} />
                  
                  {/* Confidence Interval (Area) */}
                  <Area type="monotone" dataKey="scenarioPessimistic" stroke="transparent" fill="#f43f5e" fillOpacity={0.1} />
                  <Area type="monotone" dataKey="scenarioBase" stroke="#d946ef" strokeWidth={2} strokeDasharray="5 5" fill="transparent" dot={false} />
                  <Area type="monotone" dataKey="scenarioOptimistic" stroke="transparent" fill="#10b981" fillOpacity={0.1} />
               </ComposedChart>
            </ResponsiveContainer>
         </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
         
         {/* INSIGHTS & DRIVERS */}
         <div className="space-y-6">
            
            {/* Drivers of Growth */}
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
               <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <Target size={20} className="text-blue-400" />
                  Principais Ofensores (Tendência de Alta)
               </h3>
               <div className="space-y-3">
                  {forecast.drivers.slice(0, 4).map((driver, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-700/50">
                          <div>
                              <p className="text-sm font-bold text-white">{driver.categoryName}</p>
                              <p className="text-xs text-slate-500">Volume Total: {formatCompactCurrency(driver.totalImpact)}</p>
                          </div>
                          <div className="text-right">
                              <p className={`text-sm font-bold ${driver.trendSlope > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                 {driver.trendSlope > 0 ? '+' : ''}{formatCurrency(driver.trendSlope)}/mês
                              </p>
                              <p className="text-[10px] text-slate-500 uppercase font-medium">Crescimento Médio</p>
                          </div>
                      </div>
                  ))}
               </div>
            </div>

            {/* Managerial Insights */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 border border-slate-700 rounded-xl p-6">
               <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                  <AlertTriangle size={20} className="text-yellow-400" />
                  Insights Gerenciais
               </h3>
               <ul className="space-y-4">
                  <li className="flex gap-3 text-sm text-slate-300">
                     <span className="bg-rose-900/30 text-rose-400 w-6 h-6 rounded-full flex items-center justify-center shrink-0 font-bold border border-rose-800">1</span>
                     <span>
                        <strong className="text-white block mb-1">Pico de Sazonalidade:</strong> 
                        As despesas tendem a aumentar significativamente em <span className="text-white font-bold">{topRiskMonth?.month}</span>. Recomenda-se antecipar negociações ou revisar budget para este período.
                     </span>
                  </li>
                  <li className="flex gap-3 text-sm text-slate-300">
                     <span className="bg-blue-900/30 text-blue-400 w-6 h-6 rounded-full flex items-center justify-center shrink-0 font-bold border border-blue-800">2</span>
                     <span>
                        <strong className="text-white block mb-1">Foco de Redução:</strong> 
                        A categoria <span className="text-white font-bold">{forecast.drivers[0]?.categoryName}</span> é a que mais impulsiona o crescimento mensal. Uma redução de 5% aqui teria o maior impacto no resultado anual.
                     </span>
                  </li>
                  <li className="flex gap-3 text-sm text-slate-300">
                     <span className="bg-emerald-900/30 text-emerald-400 w-6 h-6 rounded-full flex items-center justify-center shrink-0 font-bold border border-emerald-800">3</span>
                     <span>
                        <strong className="text-white block mb-1">Previsibilidade:</strong> 
                        O desvio padrão do modelo sugere uma volatilidade de <span className="text-white font-bold">{(forecast.nextYearTotal.pessimistic / forecast.nextYearTotal.base * 100 - 100).toFixed(1)}%</span>. Mantenha uma reserva de contingência para flutuações.
                     </span>
                  </li>
               </ul>
            </div>
         </div>

         {/* PROJECTION TABLE */}
         <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden flex flex-col">
            <div className="p-4 bg-slate-900 border-b border-slate-700">
               <h3 className="text-lg font-bold text-white">Detalhamento Mensal (Próximos 12 meses)</h3>
            </div>
            <div className="overflow-auto custom-scrollbar flex-1">
               <table className="w-full text-left text-sm text-slate-400">
                  <thead className="bg-slate-900 text-slate-200 font-bold sticky top-0 z-10">
                     <tr>
                        <th className="px-4 py-3">Mês</th>
                        <th className="px-4 py-3 text-right text-emerald-400">Otimista</th>
                        <th className="px-4 py-3 text-right text-fuchsia-400">Base</th>
                        <th className="px-4 py-3 text-right text-rose-400">Pessimista</th>
                     </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700">
                     {forecast.chartData.filter(d => d.isProjected).map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-700/30 transition-colors">
                           <td className="px-4 py-3 font-medium text-white">{row.monthName}/{row.year}</td>
                           <td className="px-4 py-3 text-right font-mono text-emerald-200">{formatCompactCurrency(row.scenarioOptimistic)}</td>
                           <td className="px-4 py-3 text-right font-mono text-white font-bold">{formatCompactCurrency(row.scenarioBase)}</td>
                           <td className="px-4 py-3 text-right font-mono text-rose-200">{formatCompactCurrency(row.scenarioPessimistic)}</td>
                        </tr>
                     ))}
                  </tbody>
                  <tfoot className="bg-slate-900 font-bold text-white">
                     <tr>
                        <td className="px-4 py-3">TOTAL ANUAL</td>
                        <td className="px-4 py-3 text-right text-emerald-400">{formatCompactCurrency(forecast.nextYearTotal.optimistic)}</td>
                        <td className="px-4 py-3 text-right text-fuchsia-400">{formatCompactCurrency(forecast.nextYearTotal.base)}</td>
                        <td className="px-4 py-3 text-right text-rose-400">{formatCompactCurrency(forecast.nextYearTotal.pessimistic)}</td>
                     </tr>
                  </tfoot>
               </table>
            </div>
         </div>

      </div>

    </div>
  );
};

export default ProjectionView;