import React, { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, Loader2 } from 'lucide-react';
import { ProcessedExpense } from '../types';
import { processRawData } from '../utils/dataProcessor';

interface FileUploadProps {
  onDataLoaded: (data: ProcessedExpense[]) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ onDataLoaded }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleFile = useCallback((file: File) => {
    setIsLoading(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        
        // 1. Process "Real" Data (Assume Sheet 0)
        const realSheetName = workbook.SheetNames[0];
        const realWorksheet = workbook.Sheets[realSheetName];
        const realJsonData = XLSX.utils.sheet_to_json(realWorksheet);
        const processedReal = processRawData(realJsonData, 'REAL');

        // 2. Process "Orçado" Data (Look for sheet named "Orçado" or "Orcado")
        let processedBudget: ProcessedExpense[] = [];
        const budgetSheetName = workbook.SheetNames.find(name => 
            name.toLowerCase().includes('orçado') || name.toLowerCase().includes('orcado')
        );

        if (budgetSheetName) {
            const budgetWorksheet = workbook.Sheets[budgetSheetName];
            const budgetJsonData = XLSX.utils.sheet_to_json(budgetWorksheet);
            processedBudget = processRawData(budgetJsonData, 'ORCADO');
        } else {
            console.warn("Aba 'Orçado' não encontrada. Carregando apenas dados reais.");
        }
        
        const combinedData = [...processedReal, ...processedBudget];

        // Simulating a small delay for better UX
        setTimeout(() => {
          onDataLoaded(combinedData);
          setIsLoading(false);
        }, 800);
      } catch (error) {
        console.error("Error parsing file:", error);
        alert("Erro ao ler o arquivo. Verifique se o formato está correto e se as abas existem.");
        setIsLoading(false);
      }
    };
    reader.readAsBinaryString(file);
  }, [onDataLoaded]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, [handleFile]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] animate-fade-in">
       <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-white mb-2">Dashboard de Despesas</h1>
          <p className="text-slate-400">Análise completa de gastos Limppano (Real vs Orçado)</p>
       </div>

      <div
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        className={`
          w-full max-w-2xl h-80 rounded-xl border-2 border-dashed transition-all duration-300 flex flex-col items-center justify-center cursor-pointer
          ${isDragging 
            ? 'border-blue-500 bg-blue-500/10 scale-[1.02]' 
            : 'border-slate-600 bg-slate-800/50 hover:border-slate-500 hover:bg-slate-800'
          }
        `}
      >
        {isLoading ? (
          <div className="flex flex-col items-center text-blue-400">
            <Loader2 className="w-16 h-16 animate-spin mb-4" />
            <span className="text-lg font-medium">Processando dados...</span>
          </div>
        ) : (
          <>
            <div className="w-20 h-20 bg-blue-600/20 rounded-full flex items-center justify-center mb-6 text-blue-500">
              <FileSpreadsheet className="w-10 h-10" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">Arraste seu arquivo Excel aqui</h3>
            <p className="text-slate-400 mb-6">Certifique-se de que existem abas para Real e Orçado</p>
            
            <label className="relative">
              <input 
                type="file" 
                accept=".xlsx, .xls" 
                className="hidden" 
                onChange={(e) => e.target.files && handleFile(e.target.files[0])}
              />
              <span className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition-colors cursor-pointer">
                Selecionar Arquivo
              </span>
            </label>
          </>
        )}
      </div>
    </div>
  );
};

export default FileUpload;