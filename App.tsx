import React, { useState } from 'react';
import Sidebar from './components/Sidebar';
import FileUpload from './components/FileUpload';
import GeneralView from './views/GeneralView';
import MacroView from './views/MacroView';
import MicroView from './views/MicroView';
import DeviationView from './views/DeviationView';
import PeriodSelector from './components/PeriodSelector';
import { ViewMode, ProcessedExpense } from './types';
import { Calendar, Loader2 } from 'lucide-react';
import { utils, writeFile } from 'xlsx';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

function App() {
  const [view, setView] = useState<ViewMode>(ViewMode.UPLOAD);
  const [data, setData] = useState<ProcessedExpense[]>([]);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  
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

    // Filter data based on current context (Year AND Month)
    const exportData = data
        .filter(d => 
            (d.year === selectedYear || d.year === compareYear) && 
            selectedMonths.includes(d.month)
        )
        .map(item => ({
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

    const ws = utils.json_to_sheet(exportData);
    const wb = utils.book_new();
    utils.book_append_sheet(wb, ws, "Dados Filtrados");
    writeFile(wb, `Limppano_Filtrado_${selectedYear}_${new Date().toISOString().slice(0,10)}.csv`);
  };

  const handleExportPDF = async () => {
    const input = document.getElementById('dashboard-content');
    if (!input) return;

    try {
        setIsExportingPdf(true);
        
        const canvas = await html2canvas(input, {
            scale: 2,
            backgroundColor: '#0f172a',
            logging: false,
            useCORS: true
        });

        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('l', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        
        const imgWidth = canvas.width;
        const imgHeight = canvas.height;
        
        const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
        
        const imgX = (pdfWidth - imgWidth * ratio) / 2;
        const imgY = 10;

        const finalWidth = imgWidth * ratio;
        const finalHeight = imgHeight * ratio;

        pdf.addImage(imgData, 'PNG', imgX, imgY, finalWidth, finalHeight);
        pdf.save(`Limppano_Dashboard_${view}_${selectedYear}.pdf`);
    } catch (error) {
        console.error("Error exporting PDF:", error);
        alert("Erro ao gerar PDF. Tente novamente.");
    } finally {
        setIsExportingPdf(false);
    }
  };

  const renderView = () => {
    switch (view) {
      case ViewMode.UPLOAD:
        return <FileUpload onDataLoaded={handleDataLoaded} />;
      case ViewMode.GENERAL:
        return (
          <GeneralView 
            data={data} 
            selectedYear={selectedYear} 
            compareYear={compareYear} 
            availableYears={availableYears}
            selectedMonths={selectedMonths} 
            setSelectedYear={setSelectedYear}
            setCompareYear={setCompareYear}
          />
        );
      case ViewMode.MACRO:
        return <MacroView 
                  data={data} 
                  selectedYear={selectedYear} 
                  selectedMonths={selectedMonths} 
                  onPeriodChange={setSelectedMonths}
               />;
      case ViewMode.MICRO:
        return <MicroView data={data} selectedYear={selectedYear} compareYear={compareYear} selectedMonths={selectedMonths} />;
      case ViewMode.DEVIATION:
        return <DeviationView data={data} selectedYear={selectedYear} compareYear={compareYear} selectedMonths={selectedMonths} />;
      default:
        return <div>View not found</div>;
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-950 text-slate-200 font-sans">
      
      {isExportingPdf && (
        <div className="fixed inset-0 bg-slate-950/80 z-[100] flex flex-col items-center justify-center backdrop-blur-sm">
            <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
            <h3 className="text-xl font-bold text-white">Gerando PDF...</h3>
            <p className="text-slate-400">Capturando a visualização atual.</p>
        </div>
      )}

      {view !== ViewMode.UPLOAD && (
        <Sidebar 
          currentView={view} 
          onChangeView={setView} 
          onReset={resetApp} 
          onExport={handleExportCSV}
          onExportPDF={handleExportPDF}
        />
      )}

      <main 
        id="dashboard-content" 
        className={`flex-1 p-8 transition-all duration-300 ${view !== ViewMode.UPLOAD ? 'ml-64' : ''}`}
      >
        {view !== ViewMode.UPLOAD && (
          <div className="mb-6 flex flex-col items-end gap-2 animate-fade-in" data-html2canvas-ignore="true">
             
             {view !== ViewMode.MACRO && view !== ViewMode.GENERAL && (
               <>
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
                 </div>
               </>
             )}
             
             {view !== ViewMode.MACRO && (
                <PeriodSelector selectedMonths={selectedMonths} onChange={setSelectedMonths} />
             )}

          </div>
        )}

        {renderView()}
      </main>
    </div>
  );
}

export default App;