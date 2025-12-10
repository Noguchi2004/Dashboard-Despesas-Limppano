import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import FileUpload from './components/FileUpload';
import GeneralView from './views/GeneralView';
import MacroView from './views/MacroView';
import MicroView from './views/MicroView';
import DeviationView from './views/DeviationView';
import ProjectionView from './views/ProjectionView';
import PeriodSelector from './components/PeriodSelector';
import { ViewMode, ProcessedExpense } from './types';
import { Calendar } from 'lucide-react';
import * as XLSX from 'xlsx';

function App() {
  const [view, setView] = useState<ViewMode>(ViewMode.UPLOAD);
  const [data, setData] = useState<ProcessedExpense[]>([]);
  
  // Global Filters
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [compareYear, setCompareYear] = useState<number>(new Date().getFullYear() - 1);
  const [selectedMonths, setSelectedMonths] = useState<number[]>([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]); // Default ALL
  const [availableYears, setAvailableYears] = useState<number[]>([]);

  const handleDataLoaded = (uploadedData: ProcessedExpense[]) => {
    setData(uploadedData);
    
    // Extract years
    const years = Array.from(new Set(uploadedData.map(d => d.year))).sort((a, b) => b - a);
    setAvailableYears(years);
    
    if (years.length > 0) {
      setSelectedYear(years[0]);
      if (years.length > 1) {
        setCompareYear(years[1]);
      } else {
        setCompareYear(years[0]);
      }
    }
    
    setView(ViewMode.GENERAL);
  };

  const resetApp = () => {
    setData([]);
    setView(ViewMode.UPLOAD);
  };

  const handleExportCSV = () => {
    if (data.length === 0) return;

    // Filter data based on current context if needed, or export all current processed data
    // The user requested "todos os dados do dashboard... com as respectivas filtragens".
    // We will export the global dataset but respect the global Month filter which applies to all views.
    
    const exportData = data.filter(d => selectedMonths.includes(d.month)).map(item => ({
       ID: item.id,
       Tipo: item.dataType,
       Categoria: item.categoryName,
       'Código Conta': item.accountCode,
       'Descrição': item.description,
       'Nível': item.level,
       'Ano': item.year,
       'Mês': item.month,
       'Valor': item.amount,
       'É Variável': item.isVariable ? 'Sim' : 'Não'
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Dados Filtrados");
    XLSX.writeFile(wb, `Limppano_Export_${new Date().toISOString().slice(0,10)}.csv`);
  };

  const renderView = () => {
    switch (view) {
      case ViewMode.UPLOAD:
        return <FileUpload onDataLoaded={handleDataLoaded} />;
      case ViewMode.GENERAL:
        return <GeneralView data={data} selectedYear={selectedYear} compareYear={compareYear} selectedMonths={selectedMonths} />;
      case ViewMode.MACRO:
        // Pass the setter so MacroView can control the global filter if needed, or just read it.
        // We'll pass the PeriodSelector component props logic down if we want full sync
        return <MacroView 
                  data={data} 
                  selectedYear={selectedYear} 
                  selectedMonths={selectedMonths} 
                  onPeriodChange={setSelectedMonths} // Allow MacroView to update global state
               />;
      case ViewMode.MICRO:
        return <MicroView data={data} selectedYear={selectedYear} compareYear={compareYear} selectedMonths={selectedMonths} />;
      case ViewMode.DEVIATION:
        return <DeviationView data={data} selectedYear={selectedYear} compareYear={compareYear} selectedMonths={selectedMonths} />;
      case ViewMode.PROJECTION:
        return <ProjectionView data={data} />;
      default:
        return <div>View not found</div>;
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-200 font-sans">
      {view !== ViewMode.UPLOAD && (
        <Sidebar 
          currentView={view} 
          onChangeView={setView} 
          onReset={resetApp} 
          onExport={handleExportCSV}
        />
      )}

      <main className={`flex-1 p-8 transition-all duration-300 ${view !== ViewMode.UPLOAD ? 'ml-64' : ''}`}>
        {/* Global Filter Bar */}
        {view !== ViewMode.UPLOAD && (
          <div className="mb-6 flex flex-col items-end gap-2 animate-fade-in">
             
             {/* Render Global Filters EXCEPT for Macro View (Requested to be hidden there) */}
             {view !== ViewMode.MACRO && view !== ViewMode.PROJECTION && (
               <>
                 {/* Year Selector floating top right */}
                 <div className="flex items-center gap-3 bg-slate-900/80 backdrop-blur border border-slate-800 p-1.5 rounded-lg shadow-sm">
                     <div className="flex items-center gap-2 px-3 border-r border-slate-800">
                        <Calendar size={14} className="text-slate-400" />
                        <select 
                          value={selectedYear}
                          onChange={(e) => setSelectedYear(Number(e.target.value))}
                          className="bg-transparent text-sm font-medium text-white focus:outline-none cursor-pointer"
                        >
                          {availableYears.map(y => <option key={y} value={y} className="bg-slate-900">{y}</option>)}
                        </select>
                     </div>
                     {view !== ViewMode.GENERAL && (
                       <div className="flex items-center gap-2 px-3">
                          <span className="text-xs text-slate-500">vs</span>
                          <select 
                            value={compareYear}
                            onChange={(e) => setCompareYear(Number(e.target.value))}
                            className="bg-transparent text-sm font-medium text-slate-300 focus:outline-none cursor-pointer"
                          >
                            {availableYears.map(y => <option key={y} value={y} className="bg-slate-900">{y}</option>)}
                          </select>
                       </div>
                     )}
                 </div>

                 {/* Period Selector (Custom Multi-select) */}
                 <PeriodSelector selectedMonths={selectedMonths} onChange={setSelectedMonths} />
               </>
             )}

          </div>
        )}

        {/* Dynamic Content */}
        {renderView()}
      </main>
    </div>
  );
}

export default App;