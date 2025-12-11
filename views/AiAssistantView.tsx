import React, { useState, useEffect, useRef } from 'react';
import { ProcessedExpense } from '../types';
import { GoogleGenAI } from "@google/genai";
import { Send, Bot, User, Sparkles, Loader2, Info, AlertTriangle, Database } from 'lucide-react';
import { formatCompactCurrency } from '../utils/dataProcessor';

interface AiAssistantViewProps {
  data: ProcessedExpense[];
}

interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
  isError?: boolean;
}

const AiAssistantView: React.FC<AiAssistantViewProps> = ({ data }) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'model',
      text: 'Olá! Sou seu assistente financeiro Limppano. Tenho acesso aos dados (Realizado e Orçado). \n\n**Regras de Análise:**\n• **Receita (ROL):** Analiso exclusivamente o Nível 1 (Sintético).\n• **Despesas:** Analiso Totais (Nível 1) e Detalhes (Nível 5).\n\nComo posso ajudar?',
      timestamp: new Date()
    }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState<{rows: number, years: number[]}>({ rows: 0, years: [] });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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

  // Optimize Data Context: Aggregate Rows and Convert to CSV
  const getContextString = () => {
    if (!data || data.length === 0) {
      return { csv: "", truncated: false, totalRows: 0, processedRows: 0 };
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
        // --- REGRA DE NEGÓCIO CRÍTICA ---
        // Para RECEITA (ROL), considerar APENAS o Nível 1 (Conta Sintética).
        // Ignorar qualquer detalhamento de nível inferior para ROL para evitar duplicação ou ruído.
        if (d.category === 'ROL' && d.level !== 1) {
            return; 
        }

        // Create a unique key for aggregation
        const key = `${d.dataType}|${d.year}|${d.month}|${d.accountCode}`;
        
        if (!aggregated.has(key)) {
            aggregated.set(key, {
                dataType: d.dataType === 'REAL' ? 'R' : 'O',
                year: d.year,
                month: d.month,
                category: d.category,
                accountCode: d.accountCode,
                description: d.description, // Keep the first description found for this account
                amount: 0,
                isVariable: d.isVariable,
                level: d.level
            });
        }
        aggregated.get(key)!.amount += d.amount;
    });

    // 2. Convert to CSV Format
    // Header: TIPO,ANO,MES,CAT,CONTA,DESC,VAL,FIX,NIVEL
    let csv = "T,Y,M,C,A,D,V,F,L\n";
    
    // Sort Chronological -> Account
    const sortedItems = Array.from(aggregated.values()).sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        if (a.month !== b.month) return a.month - b.month;
        return 0;
    });

    // FILTER ZEROS: Remove rows with 0 value to save space
    const nonZeroItems = sortedItems.filter(i => Math.round(i.amount) !== 0);

    // LIMIT STRATEGY: 
    // If we exceed MAX_ROWS, we cut from the START (Oldest data) to preserve the END (Newest/2025 data).
    const MAX_ROWS = 30000; 
    const totalRows = nonZeroItems.length;
    
    let itemsToProcess = nonZeroItems;
    let truncated = false;

    if (totalRows > MAX_ROWS) {
        const startIndex = totalRows - MAX_ROWS;
        itemsToProcess = nonZeroItems.slice(startIndex);
        truncated = true;
        console.warn(`Dataset truncated. Sending last ${MAX_ROWS} rows of ${totalRows}.`);
    }

    itemsToProcess.forEach(item => {
        // Clean description to remove commas
        const cleanDesc = item.description.replace(/,/g, ' ').substring(0, 30).trim();
        const row = `${item.dataType},${item.year},${item.month},${item.category},${item.accountCode},${cleanDesc},${Math.round(item.amount)},${item.isVariable ? 'V' : 'F'},${item.level}`;
        csv += row + "\n";
    });

    return { csv, truncated, totalRows, processedRows: itemsToProcess.length };
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
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });
      
      const { csv, truncated, totalRows, processedRows } = getContextString();

      // Construct System Instruction
      const systemInstruction = `
        ATUE COMO O CFO DA LIMPPANO.
        Você está analisando dados financeiros em CSV.
        
        ESTATÍSTICAS DOS DADOS:
        - Total de linhas disponíveis: ${totalRows}
        - Linhas enviadas para análise: ${processedRows}
        ${truncated ? "- AVISO: Dados truncados. Prioridade para dados RECENTES (2025/2024)." : "- Dados completos."}
        - Anos na base: ${stats.years.join(', ')}

        FORMATO CSV (T,Y,M,C,A,D,V,F,L):
        T: Tipo (R=Real, O=Orçado) | Y: Ano | M: Mês | C: Categoria | A: Conta | D: Descrição | V: Valor | F: Fixo/Var | L: Nível

        REGRAS RÍGIDAS DE AGREGAÇÃO POR CATEGORIA:

        1. **PARA RECEITA (ROL)**:
           - O CSV contém APENAS linhas de **Nível 1 (L=1)** para a categoria ROL.
           - Ignore a coluna 'L' para ROL e use o valor diretamente. Este valor representa a Conta Sintética Total.
           - Não tente procurar detalhes ou "filhas" para ROL, pois foram removidas intencionalmente.

        2. **PARA DEMAIS DESPESAS (DC, DL, GGF, DA, etc)**:
           - Existem múltiplos níveis (L1 a L5).
           - **Para TOTAIS GERAIS** (ex: "Qual o total de despesas?", "Quanto gastamos em Logística?"): 
             >> Use SOMENTE as linhas onde **L=1**.
             >> NUNCA some L1 com L5, pois isso duplicará os valores.
           - **Para DETALHAMENTO/OFENSORES** (ex: "O que compõe esse gasto?", "Quais as maiores contas?"):
             >> Use as linhas onde **L=5** (Analíticas).

        INSTRUÇÕES:
        1. Responda em Português, Markdown.
        2. Analise TODOS os anos disponíveis.
        3. Seja extremamente cuidadoso para não somar L1 e L5 nas despesas.
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
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
      if (error.message?.includes("400")) errorText = "O volume de dados é muito grande. Tente ser mais específico.";
      if (error.message?.includes("API key")) errorText = "Chave de API inválida.";
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        text: `⚠️ **Erro**: ${errorText} \n\n*A IA tentou processar ${stats.rows} linhas.*`,
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

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] animate-fade-in pb-4">
      {/* HEADER */}
      <div className="mb-4 flex justify-between items-end">
        <div>
            <h2 className="text-3xl font-bold text-white flex items-center gap-2">
            <Sparkles className="text-blue-400" /> Assistente IA Limppano
            </h2>
            <p className="text-slate-400 text-sm mt-1">
            Análise Inteligente: ROL (Nível 1 Sintético) vs Despesas (Hierarquia Completa).
            </p>
        </div>
        {stats.rows > 0 && (
            <div className="text-right">
                <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-900/50 px-3 py-1.5 rounded-lg border border-slate-800">
                    <Database size={12} />
                    <span>{stats.rows.toLocaleString()} linhas</span>
                    <span className="text-slate-700">|</span>
                    <span>Anos: {stats.years.join(', ')}</span>
                </div>
            </div>
        )}
      </div>

      {/* CHAT CONTAINER */}
      <div className="flex-1 bg-slate-900 border border-slate-700 rounded-xl overflow-hidden flex flex-col shadow-2xl relative">
          
          {/* MESSAGES AREA */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
             {messages.map((msg) => (
                 <div key={msg.id} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                     {/* Avatar */}
                     <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 shadow-lg ${
                         msg.isError ? 'bg-rose-600 text-white' : 
                         msg.role === 'model' ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300'
                     }`}>
                         {msg.isError ? <AlertTriangle size={20} /> : (msg.role === 'model' ? <Bot size={20} /> : <User size={20} />)}
                     </div>

                     {/* Bubble */}
                     <div className={`max-w-[85%] rounded-2xl px-5 py-4 text-sm leading-relaxed shadow-md ${
                         msg.isError ? 'bg-rose-900/50 border border-rose-700 text-rose-200' :
                         msg.role === 'model' 
                           ? 'bg-slate-800 text-slate-200 border border-slate-700' 
                           : 'bg-blue-600 text-white'
                     }`}>
                         <div className="whitespace-pre-wrap">{msg.text}</div>
                         <div className={`text-[10px] mt-2 opacity-60 ${msg.role === 'user' ? 'text-blue-100' : 'text-slate-400'}`}>
                            {msg.timestamp.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                         </div>
                     </div>
                 </div>
             ))}
             
             {isLoading && (
                 <div className="flex gap-4">
                     <div className="w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0">
                         <Bot size={20} />
                     </div>
                     <div className="bg-slate-800 rounded-2xl px-5 py-4 border border-slate-700 flex items-center gap-2 text-slate-400 text-sm">
                         <Loader2 size={16} className="animate-spin" />
                         <span>Processando: ROL (L1) e Despesas (Hierárquico)...</span>
                     </div>
                 </div>
             )}
             <div ref={messagesEndRef} />
          </div>

          {/* INPUT AREA */}
          <div className="p-4 bg-slate-900 border-t border-slate-700">
             <div className="relative flex items-end gap-2 bg-slate-800 p-2 rounded-xl border border-slate-700 focus-within:border-blue-500/50 focus-within:ring-1 focus-within:ring-blue-500/50 transition-all">
                 <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ex: Qual o ROL total em 2025 comparado às despesas de Logística (DL)?"
                    className="w-full bg-transparent text-white text-sm resize-none focus:outline-none max-h-32 min-h-[44px] py-3 px-2 custom-scrollbar"
                    rows={1}
                 />
                 <button 
                    onClick={handleSend}
                    disabled={isLoading || !input.trim()}
                    className="p-3 bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg"
                 >
                    <Send size={18} />
                 </button>
             </div>
             <p className="text-[10px] text-slate-600 text-center mt-2 flex items-center justify-center gap-1">
                 <Info size={10} /> IA configurada: ROL somente Nível 1 (Sintético). Outras contas com hierarquia completa.
             </p>
          </div>
      </div>
    </div>
  );
};

export default AiAssistantView;