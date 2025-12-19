import React from 'react';
import { LayoutDashboard, BarChart3, Search, AlertCircle, RefreshCw, Download, FileText } from 'lucide-react';
import { ViewMode } from '../types';

interface SidebarProps {
  currentView: ViewMode;
  onChangeView: (view: ViewMode) => void;
  onReset: () => void;
  onExport: () => void;
  onExportPDF: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, onChangeView, onReset, onExport, onExportPDF }) => {
  const menuItems = [
    { id: ViewMode.GENERAL, label: 'Visão Geral', icon: LayoutDashboard },
    { id: ViewMode.MACRO, label: 'Visão Macro', icon: BarChart3 },
    { id: ViewMode.MICRO, label: 'Visão Micro', icon: Search },
    { id: ViewMode.DEVIATION, label: 'Análise de Desvios', icon: AlertCircle },
  ];

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 flex flex-col h-screen fixed left-0 top-0 z-10">
      <div className="p-6">
        <h1 className="text-2xl font-bold tracking-wider text-white">LIMPPANO</h1>
        <p className="text-slate-500 text-sm mt-1">Dashboard</p>
        <p className="text-slate-600 text-xs">Análise de Despesas</p>
      </div>

      <nav className="flex-1 px-4 space-y-1 mt-2">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onChangeView(item.id)}
              className={`
                w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all
                ${isActive 
                  ? 'bg-blue-600/10 text-blue-400 border-l-2 border-blue-500' 
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }
              `}
            >
              <Icon size={20} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800 space-y-2">
        <button 
          onClick={onExportPDF}
          className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 hover:border-slate-600 py-2.5 rounded-lg transition-colors text-sm font-medium"
        >
          <FileText size={16} />
          Exportar PDF
        </button>

        <button 
          onClick={onExport}
          className="w-full flex items-center justify-center gap-2 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 border border-emerald-600/30 py-2.5 rounded-lg transition-colors text-sm font-medium"
        >
          <Download size={16} />
          Exportar CSV
        </button>

        <button 
          onClick={onReset}
          className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-300 py-3 rounded-lg transition-colors text-sm font-medium"
        >
          <RefreshCw size={16} />
          Trocar Arquivo
        </button>
        <div className="text-center mt-2 text-xs text-slate-600">
          Versão 1.4.0
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;