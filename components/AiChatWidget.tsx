import React, { useState, useEffect, useRef } from 'react';
import { ProcessedExpense } from '../types';
import { GoogleGenAI } from "@google/genai";
import { formatCurrency, formatCompactCurrency } from '../utils/dataProcessor';
import { Send, Bot, User, Sparkles, Loader2, Info, AlertTriangle, Database, X, MessageCircle, Minimize2, Maximize2 } from 'lucide-react';

interface AiChatWidgetProps {
  data: ProcessedExpense[];
}

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
  isError?: boolean;
}

const AiChatWidget: React.FC<AiChatWidgetProps> = ({ data }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false); // For expanding height/width
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'model',
      text: 'Olá! Sou o assistente virtual do dashboard. Tenho acesso aos totais exatos e ao detalhamento mensal por categoria. Como posso ajudar?',
      timestamp: new Date()
    }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState<{rows: number, years: number[]}>({ rows: 0, years: [] });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    if (isOpen) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Update stats on data load
  useEffect(() => {
    if(data.length > 0) {
        const uniqueYears = Array.from(new Set(data.map(d => d.year))).sort();
        setStats({
            rows: data.length,
            years: uniqueYears
        });
    }
  }, [data]);

  // Helper: Calculate High-Level Summaries (The "Answer Key" for the AI)
  const getFinancialSummary = () => {
      const years = Array.from(new Set(data.map(d => d.year))).sort();
      
      let summaryText = "RESUMO FINANCEIRO CALCULADO (FONTE DA VERDADE - USE ESTES VALORES PARA TOTAIS):\n\n";
      
      // 1. Yearly Totals
      summaryText += "--- TOTAIS ANUAIS ---\n";
      years.forEach(year => {
          // ROL Real (Nível 1)
          const rolReal = data
            .filter(d => d.year === year && d.category === 'ROL' && d.level === 1 && d.dataType === 'REAL')
            .reduce((acc, curr) => acc + curr.amount, 0);

          // ROL Orçado (Nível 1)
          const rolOrcado = data
            .filter(d => d.year === year && d.category === 'ROL' && d.level === 1 && d.dataType === 'ORCADO')
            .reduce((acc, curr) => acc + curr.amount, 0);
          
          // Despesas Real (Nível 5 - para evitar duplicação)
          const despReal = data
            .filter(d => d.year === year && d.category !== 'ROL' && d.level === 5 && d.dataType === 'REAL')
            .reduce((acc, curr) => acc + curr.amount, 0);

          // Despesas Orçado (Nível 5)
          const despOrcado = data
            .filter(d => d.year === year && d.category !== 'ROL' && d.level === 5 && d.dataType === 'ORCADO')
            .reduce((acc, curr) => acc + curr.amount, 0);

          summaryText += `[ANO ${year}]\n`;
          summaryText += `- Receita Líquida (ROL) REAL: ${formatCurrency(rolReal)} (Meta: ${formatCurrency(rolOrcado)})\n`;
          summaryText += `- Despesas Totais REAL: ${formatCurrency(despReal)} (Budget: ${formatCurrency(despOrcado)})\n`;
          summaryText += `- Resultado Operacional Aprox: ${formatCurrency(rolReal - despReal)}\n\n`;
      });

      // 2. Monthly Breakdown by Category (Crucial for "Evolution" questions)
      summaryText += "--- DETALHAMENTO MENSAL REALIZADO (PREFERÊNCIA ABSOLUTA PARA PERGUNTAS DE EVOLUÇÃO) ---\n";
      summaryText += "Formato: ANO | MÊS | CATEGORIA | VALOR REAL\n";

      years.forEach(year => {
        for (let m = 1; m <= 12; m++) {
            // Group by category to avoid huge text, but giving enough granularity
            const monthlyData = data.filter(d => d.year === year && d.month === m && d.dataType === 'REAL');
            if (monthlyData.length === 0) continue;

            // ROL (Level 1)
            const rol = monthlyData.filter(d => d.category === 'ROL' && d.level === 1).reduce((s, c) => s + c.amount, 0);
            if (Math.abs(rol) > 0.01) summaryText += `${year} | ${m} | ROL | ${formatCurrency(rol)}\n`;

            // Expenses (Level 5)
            const categories = ['DC', 'DL', 'DA', 'DF', 'GGF', 'DP'];
            categories.forEach(cat => {
                const val = monthlyData
                    .filter(d => d.category === cat && d.level === 5)
                    .reduce((s, c) => s + c.amount, 0);
                
                if (Math.abs(val) > 0.01) {
                    summaryText += `${year} | ${m} | ${cat} | ${formatCurrency(val)}\n`;
                }
            });
        }
      });

      return summaryText;
  };

  // Optimize Data Context: Aggregate Rows and Convert to CSV
  const getContextString = () => {
    if (!data || data.length === 0) {
      return { csv: "", truncated: false, totalAggregatedRows: 0, rawRows: 0 };
    }

    // 1. Aggregation Map: Key = DataType|Year|Month|AccountCode
    const aggregated = new Map<string, {
        dataType: string;
        year: number;
        month: number;
        category: string;
        accountCode: string;
        description: string;
        amount: number;
        isVariable: boolean;
        level: number;
    }>();

    data.forEach(d => {
        // Regra ROL
        if (d.category === 'ROL' && d.level !== 1) return; 

        const key = `${d.dataType}|${d.year}|${d.month}|${d.accountCode}`;
        
        if (!aggregated.has(key)) {
            aggregated.set(key, {
                dataType: d.dataType === 'REAL' ? 'R' : 'O',
                year: d.year,
                month: d.month,
                category: d.category,
                accountCode: d.accountCode,
                description: d.description, 
                amount: 0,
                isVariable: d.isVariable,
                level: d.level
            });
        }
        aggregated.get(key)!.amount += d.amount;
    });

    // 2. Convert to CSV
    let csv = "T,Y,M,C,A,D,V,F,L\n";
    
    // Sort Chronological -> Account
    const sortedItems = Array.from(aggregated.values()).sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        if (a.month !== b.month) return a.month - b.month;
        return 0;
    });

    const nonZeroItems = sortedItems.filter(i => Math.abs(i.amount) > 0.01); // Better precision filter
    const MAX_ROWS = 100000; 
    const totalAggregatedRows = nonZeroItems.length;
    
    let itemsToProcess = nonZeroItems;
    let truncated = false;

    if (totalAggregatedRows > MAX_ROWS) {
        const startIndex = totalAggregatedRows - MAX_ROWS;
        itemsToProcess = nonZeroItems.slice(startIndex);
        truncated = true;
        console.warn(`Dataset truncated. Sending last ${MAX_ROWS} rows of ${totalAggregatedRows}.`);
    }

    itemsToProcess.forEach(item => {
        const cleanDesc = item.description.replace(/,/g, ' ').substring(0, 30).trim();
        // Removed Math.round to keep cents precision
        const row = `${item.dataType},${item.year},${item.month},${item.category},${item.accountCode},${cleanDesc},${item.amount.toFixed(2)},${item.isVariable ? 'V' : 'F'},${item.level}`;
        csv += row + "\n";
    });

    return { csv, truncated, totalAggregatedRows: itemsToProcess.length, rawRows: data.length };
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // --- DETECÇÃO ROBUSTA DA API KEY ---
      let apiKey = "";

      // 1. Tentar VITE (Padrão moderno)
      try {
        // @ts-ignore
        if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_KEY) {
             // @ts-ignore
             apiKey = import.meta.env.VITE_API_KEY;
        }
      } catch (e) {}

      // 2. Tentar Process Env (CRA / Next.js / Padrão)
      if (!apiKey && typeof process !== 'undefined' && process.env) {
          apiKey = process.env.REACT_APP_API_KEY || 
                   process.env.NEXT_PUBLIC_API_KEY || 
                   process.env.VITE_API_KEY ||
                   process.env.API_KEY || 
                   "";
      }

      if (!apiKey) {
          console.error("DEBUG: Nenhuma chave encontrada em import.meta.env ou process.env");
          throw new Error("MISSING_API_KEY");
      }

      const ai = new GoogleGenAI({ apiKey });
      
      const { csv, truncated, totalAggregatedRows, rawRows } = getContextString();
      const summary = getFinancialSummary();

      // Construct System Instruction with SUMMARY FIRST
      const systemInstruction = `
        ATUE COMO O CFO DA LIMPPANO.
        
        >>> INSTRUÇÃO MESTRA (PRIORIDADE MÁXIMA) <<<
        1. Para **TOTAIS** (Anuais ou Mensais por Categoria): Use **EXCLUSIVAMENTE** os dados da seção "RESUMO FINANCEIRO CALCULADO" abaixo.
           NÃO tente recalcular totais somando as linhas do CSV. O CSV serve APENAS para detalhar contas específicas (drill-down).
        
        ${summary}
        
        --- FIM DO RESUMO ---

        ESTATÍSTICAS DOS DADOS BRUTOS (CSV):
        - Total de linhas brutas: ${rawRows.toLocaleString()}
        - Linhas no CSV abaixo: ${totalAggregatedRows.toLocaleString()}
        ${truncated ? "- AVISO: Dados CSV truncados (mas o Resumo acima considera tudo)." : "- Dados completos."}

        FORMATO CSV (T,Y,M,C,A,D,V,F,L):
        T: Tipo (R=Real, O=Orçado) | Y: Ano | M: Mês | C: Categoria | A: Conta | D: Descrição | V: Valor | F: Fixo/Var | L: Nível

        👇 CSV DETALHADO (Use APENAS para identificar contas específicas/ofensores) 👇
        ${csv}
        👆 FIM CSV 👆

        INSTRUÇÕES DE RESPOSTA:
        1. Se o usuário perguntar "Qual a evolução mensal de DP?", copie os valores da tabela "RESUMO FINANCEIRO". Não some o CSV.
        2. Se o usuário perguntar "Quais contas compõem DP?", aí sim consulte o CSV (Nível 5) para listar os itens.
        3. Para Despesas no CSV: Use Nível 5 (L=5).
        4. Responda em Português e use Markdown.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3-pro-preview',
        contents: [
            ...messages.filter(m => !m.isError).map(m => ({
                role: m.role,
                parts: [{ text: m.text }]
            })),
            { role: 'user', parts: [{ text: userMessage.text }] }
        ],
        config: {
            systemInstruction: systemInstruction,
            temperature: 0.1, 
        }
      });

      const aiText = response.text || "Não consegui gerar uma resposta com base nos dados.";

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: aiText,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, aiMessage]);

    } catch (error: any) {
      console.error("Gemini API Error:", error);
      
      let errorText = "Erro ao conectar com a IA.";
      
      if (error.message === "MISSING_API_KEY") {
          errorText = "Nenhuma Chave de API encontrada. Verifique se `VITE_API_KEY` ou `REACT_APP_API_KEY` estão configuradas no Vercel.";
      }
      else if (error.message?.includes("400")) errorText = "O volume de dados é muito grande. Tente ser mais específico.";
      else if (error.message?.includes("API key")) errorText = "A Chave de API fornecida é inválida.";
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: `⚠️ **Erro**: ${errorText}`,
        timestamp: new Date(),
        isError: true
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (data.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
        {/* CHAT POPUP WINDOW */}
        {isOpen && (
            <div className={`
                bg-slate-900 border border-slate-700 shadow-2xl rounded-2xl overflow-hidden flex flex-col mb-4 transition-all duration-300 origin-bottom-right
                ${isExpanded ? 'w-[600px] h-[80vh]' : 'w-96 h-[550px]'}
            `}>
                {/* HEADER */}
                <div className="bg-slate-800 border-b border-slate-700 p-4 flex justify-between items-center shrink-0">
                    <div className="flex items-center gap-2">
                        <div className="bg-indigo-600 p-1.5 rounded-lg">
                            <Sparkles size={16} className="text-white" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-white">Assistente IA</h3>
                            <p className="text-[10px] text-slate-400">Powered by Gemini 3 Pro</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        <button 
                           onClick={() => setIsExpanded(!isExpanded)} 
                           className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors"
                           title={isExpanded ? "Restaurar tamanho" : "Expandir"}
                        >
                            {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                        </button>
                        <button 
                           onClick={() => setIsOpen(false)} 
                           className="p-1.5 hover:bg-slate-700 rounded text-slate-400 hover:text-white transition-colors"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>

                {/* MESSAGES */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar bg-slate-900/95">
                    {messages.map((msg) => (
                        <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                             <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-lg mt-1 ${
                                 msg.isError ? 'bg-rose-600 text-white' : 
                                 msg.role === 'model' ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300'
                             }`}>
                                 {msg.isError ? <AlertTriangle size={14} /> : (msg.role === 'model' ? <Bot size={14} /> : <User size={14} />)}
                             </div>

                             <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                                 msg.isError ? 'bg-rose-900/50 border border-rose-700 text-rose-200' :
                                 msg.role === 'model' 
                                   ? 'bg-slate-800 text-slate-200 border border-slate-700' 
                                   : 'bg-blue-600 text-white'
                             }`}>
                                 <div className="whitespace-pre-wrap">{msg.text}</div>
                             </div>
                        </div>
                    ))}
                    
                    {isLoading && (
                        <div className="flex gap-3">
                            <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0">
                                <Bot size={14} />
                            </div>
                            <div className="bg-slate-800 rounded-2xl px-4 py-3 border border-slate-700 flex items-center gap-2 text-slate-400 text-xs">
                                <Loader2 size={14} className="animate-spin" />
                                <span>Analisando dados...</span>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* INPUT */}
                <div className="p-3 bg-slate-800 border-t border-slate-700 shrink-0">
                    <div className="relative flex items-center gap-2 bg-slate-900 p-2 rounded-xl border border-slate-700 focus-within:border-blue-500/50 transition-all">
                        <input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="Pergunte sobre os dados..."
                            className="w-full bg-transparent text-white text-sm focus:outline-none px-2"
                        />
                        <button 
                            onClick={handleSend}
                            disabled={isLoading || !input.trim()}
                            className="p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <Send size={16} />
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* FLOATING ACTION BUTTON (FAB) */}
        <button
            onClick={() => setIsOpen(!isOpen)}
            className={`
                flex items-center justify-center w-14 h-14 rounded-full shadow-[0_0_20px_rgba(37,99,235,0.3)] transition-all duration-300 z-50
                ${isOpen ? 'bg-slate-700 text-slate-300 rotate-90' : 'bg-blue-600 text-white hover:bg-blue-500 hover:scale-105'}
            `}
        >
            {isOpen ? <X size={24} /> : <MessageCircle size={28} />}
        </button>
    </div>
  );
};

export default AiChatWidget;