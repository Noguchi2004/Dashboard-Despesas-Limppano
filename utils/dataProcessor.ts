import { ExpenseRawData, ProcessedExpense, CategoryType, DataType, PeriodKey, DeviationData, ThresholdConfig, ParetoItem, InsightItem, DeviationStatus } from '../types';
import { VARIABLE_EXPENSES_CODES, PERIODS, MONTH_NAMES, CATEGORY_MAP } from '../constants';

export const determineCategory = (idCtactb: string): CategoryType => {
  if (!idCtactb) return 'OUTROS';
  const upperId = idCtactb.toUpperCase();
  if (upperId.includes('DC')) return 'DC';
  if (upperId.includes('DL')) return 'DL';
  if (upperId.includes('DA')) return 'DA';
  if (upperId.includes('DF')) return 'DF';
  if (upperId.includes('GGF')) return 'GGF';
  if (upperId.includes('DP')) return 'DP';
  if (upperId.includes('ROL') || upperId.includes('RECEITA')) return 'ROL';
  return 'OUTROS';
};

export const determineCategoryName = (cat: CategoryType): string => {
  switch (cat) {
    case 'DC': return 'Despesas Comerciais';
    case 'DL': return 'Despesas Logísticas';
    case 'DA': return 'Despesas Administrativas';
    case 'DF': return 'Despesas Financeiras';
    case 'GGF': return 'Gastos Gerais de Fabricação';
    case 'DP': return 'Depreciação';
    case 'ROL': return 'Receita Líquida Operacional';
    default: return 'Outras';
  }
};

const parseMonth = (val: any): number => {
    if (val === undefined || val === null) return 1;
    if (typeof val === 'number') {
        if (val >= 1 && val <= 12) return Math.floor(val);
        if (val > 20000) {
           const date = new Date((val - 25569) * 86400 * 1000);
           return date.getUTCMonth() + 1;
        }
    }
    const str = String(val).trim();
    const lowerStr = str.toLowerCase();
    const num = parseInt(str);
    if (!isNaN(num) && num >= 1 && num <= 12) return num;
    const ptMonths = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    const idx = ptMonths.findIndex(m => lowerStr.startsWith(m));
    if (idx >= 0) return idx + 1;
    const enMonths = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const enIdx = enMonths.findIndex(m => lowerStr.startsWith(m));
    if (enIdx >= 0) return enIdx + 1;
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d.getMonth() + 1;
    return 1;
};

const parseYear = (val: any): number => {
    if (val === undefined || val === null) return 2024;
    if (typeof val === 'number') {
        if (val > 1900 && val < 2100) return Math.floor(val);
        if (val > 20000) {
             const date = new Date((val - 25569) * 86400 * 1000);
             return date.getUTCFullYear();
        }
    }
    const str = String(val).trim();
    const num = parseInt(str);
    if (!isNaN(num) && num > 1900 && num < 2100) return num;
    const d = new Date(str);
    if (!isNaN(d.getTime())) return d.getFullYear();
    return 2024;
};

export const processRawData = (data: any[], type: DataType = 'REAL'): ProcessedExpense[] => {
  return data.map((row, index) => {
    const safeRow: any = {};
    Object.keys(row).forEach(key => {
        safeRow[key.trim()] = row[key];
    });
    const idCtactb = String(safeRow['ID_CTACTB'] || '').trim();
    const ctactb = String(safeRow['CTACTB'] || '').trim();
    const description = String(safeRow['Descrição'] || safeRow['Descricao'] || 'Sem Descrição').trim();
    const rawMonth = safeRow['Mês'] || safeRow['Mes'] || safeRow['Month'];
    const month = parseMonth(rawMonth);
    const rawYear = safeRow['Ano'] || safeRow['Year'] || safeRow['Exercise'];
    const year = parseYear(rawYear);
    const level = Number(safeRow['Nível'] || safeRow['Nivel'] || safeRow['Level'] || 5);
    const category = determineCategory(idCtactb);
    const isVariable = VARIABLE_EXPENSES_CODES.some(code => ctactb === code);
    const isSynthetic = idCtactb.includes('ST') || level === 1;
    let rawAmount = safeRow['Total'] || safeRow['Valor'] || safeRow['Amount'];
    let amount = 0;
    if (typeof rawAmount === 'number' && !isNaN(rawAmount)) {
        amount = rawAmount;
    } else {
        const strVal = String(rawAmount || '').trim();
        if (strVal) {
             let num = Number(strVal);
             if (isNaN(num)) num = Number(strVal.replace(/\./g, '').replace(',', '.'));
             if (!isNaN(num)) amount = num;
        }
    }
    return {
      id: `${type.toLowerCase()}-row-${index}-${Math.random().toString(36).substr(2, 9)}`,
      dataType: type,
      category,
      categoryName: determineCategoryName(category),
      idCtactb: idCtactb,
      accountCode: ctactb,
      description: description,
      level: level,
      month: month,
      year: year,
      amount: amount,
      isVariable,
      isSynthetic
    };
  });
};

export const filterDataByPeriod = (data: ProcessedExpense[], months: number[]): ProcessedExpense[] => {
  if (!months || months.length === 0) return data;
  return data.filter(d => months.includes(d.month));
};

export const getMonthsForPeriod = (months: number[]): { name: string, index: number }[] => {
  const sortedMonths = [...months].sort((a, b) => a - b);
  return sortedMonths.map(m => ({
    name: MONTH_NAMES[m - 1],
    index: m
  }));
};

export const getPeriodLabel = (months: number[]): string => {
    if (months.length === 12) return 'Ano Completo';
    if (months.length === 0) return 'Nenhum Mês';
    const preset = Object.values(PERIODS).find(p => 
        p.months.length === months.length && 
        p.months.every(m => months.includes(m))
    );
    if (preset) return preset.label;
    if (months.length === 1) return MONTH_NAMES[months[0]-1];
    if (months.length <= 3) return months.sort((a,b) => a-b).map(m => MONTH_NAMES[m-1]).join(', ');
    return `${months.length} Meses Selecionados`;
};

export const formatCurrency = (value: number) => {
  if (isNaN(value)) return 'R$ 0';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0
  }).format(value);
};

export const formatCompactCurrency = (value: number) => {
   if (isNaN(value)) return 'R$ 0';
   return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}

export const formatPercent = (value: number) => {
  if (isNaN(value)) return '0%';
  return new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(value / 100);
};

// ATUALIZADO: Lógica de Status (4 Faixas)
const getStatus = (percDev: number, config: ThresholdConfig): DeviationStatus => {
  if (percDev <= 0) return 'SAVING';        // Verde (Economia)
  if (percDev <= config.healthyMax) return 'HEALTHY'; // Amarelo (Tolerância: 0 a X%)
  if (percDev < config.criticalMin) return 'WARNING'; // Laranja (Atenção: X% a Y%)
  return 'CRITICAL';                        // Vermelho (Crítico: >= Y%)
};

export const calculateDeviations = (
  data: ProcessedExpense[], 
  groupBy: 'CATEGORY' | 'ACCOUNT',
  thresholds: ThresholdConfig
): DeviationData[] => {
  const map = new Map<string, DeviationData>();

  data.forEach(item => {
    if (item.category === 'ROL') return;
    const key = groupBy === 'CATEGORY' ? item.category : item.accountCode;
    const desc = groupBy === 'CATEGORY' ? item.categoryName : item.description;

    if (!map.has(key)) {
      map.set(key, {
        id: key,
        description: desc,
        category: item.category,
        accountCode: groupBy === 'ACCOUNT' ? item.accountCode : undefined,
        level: item.level,
        budget: 0,
        real: 0,
        absDeviation: 0,
        percDeviation: 0,
        status: 'HEALTHY' // Default temporary
      });
    }

    const entry = map.get(key)!;
    const safeAmount = (typeof item.amount === 'number' && !isNaN(item.amount)) ? item.amount : 0;
    
    if (item.dataType === 'REAL') {
      entry.real += safeAmount;
    } else {
      entry.budget += safeAmount;
    }
  });

  return Array.from(map.values()).map(item => {
    // CORREÇÃO CRÍTICA: Usar Magnitude Absoluta para comparar despesas.
    // Isso evita problemas quando o Excel traz números negativos ou mistos.
    // Maior magnitude = Maior Gasto.
    const expenseReal = Math.abs(item.real);
    const expenseBudget = Math.abs(item.budget);

    // 1. Cálculo de Performance (Para Status)
    // Se Real > Budget = Ruim (+Diff). Se Real < Budget = Bom (-Diff).
    const performanceDiff = expenseReal - expenseBudget;
    
    const percDeviation = expenseBudget !== 0 
      ? (performanceDiff / expenseBudget) * 100 
      : (expenseReal > 0 ? 100 : 0);

    // 2. Cálculo para Exibição (Economia Gerada)
    // Invertemos o sinal para o usuário: Positivo = Economia, Negativo = Estouro.
    // Isso alinha com a expectativa visual (Verde = Positivo, Vermelho = Negativo).
    const displayDeviation = performanceDiff * -1;

    return {
      ...item,
      absDeviation: displayDeviation, // Valor exibido na tabela (Positivo = Bom)
      percDeviation, // Percentual de performance (Negativo = Bom, usado no getStatus)
      status: getStatus(percDeviation, thresholds)
    };
  });
};

export const generatePareto = (deviations: DeviationData[]): ParetoItem[] => {
  // Para o Pareto, queremos focar nos "Estouros" (Status Crítico/Warning).
  // Como invertemos o absDeviation para exibição (onde Negativo = Ruim),
  // filtramos os valores MENORES que 0 e usamos seu valor absoluto para o gráfico.
  const sorted = [...deviations]
    .filter(d => d.absDeviation < 0) // Pega apenas os estouros
    .sort((a, b) => a.absDeviation - b.absDeviation); // Ordena do mais negativo para o menos negativo

  const totalDeviation = sorted.reduce((acc, curr) => acc + Math.abs(curr.absDeviation), 0);
  let accumulated = 0;
  
  return sorted.map(d => {
    const val = Math.abs(d.absDeviation);
    accumulated += val;
    return {
      name: d.description,
      value: val,
      percent: (val / totalDeviation) * 100,
      cumulativePercent: totalDeviation > 0 ? (accumulated / totalDeviation) * 100 : 0
    };
  }).slice(0, 10);
};

export const generateHeatmapData = (
  data: ProcessedExpense[], 
  months: {name: string, index: number}[],
  categories: CategoryType[]
) => {
  const matrix: any[] = [];

  categories.forEach(cat => {
    const row: any = { category: cat, categoryName: CATEGORY_MAP[cat] || cat };
    
    months.forEach(m => {
      const real = data
        .filter(d => d.month === m.index && d.category === cat && d.dataType === 'REAL')
        .reduce((sum, item) => sum + (item.amount || 0), 0);
        
      const budget = data
        .filter(d => d.month === m.index && d.category === cat && d.dataType === 'ORCADO')
        .reduce((sum, item) => sum + (item.amount || 0), 0);

      // Same logic as deviation: Magnitude Comparison
      const realMag = Math.abs(real);
      const budgetMag = Math.abs(budget);
      const diff = realMag - budgetMag;
      
      const perc = budgetMag !== 0 ? (diff / budgetMag) * 100 : 0;
      
      row[m.name] = { diff, perc, real, budget };
    });
    
    matrix.push(row);
  });

  return matrix;
};

export const generateInsights = (
  deviations: DeviationData[], 
  pareto: ParetoItem[], 
  periodLabel: string
): InsightItem[] => {
  const insights: InsightItem[] = [];
  const criticalCount = deviations.filter(d => d.status === 'CRITICAL').length;
  if (criticalCount > 0) {
    insights.push({
      type: 'warning',
      title: 'Atenção Necessária',
      message: `${criticalCount} categorias/contas estão em estado CRÍTICO (acima do limite definido).`
    });
  } else {
    insights.push({
      type: 'success',
      title: 'Orçamento Saudável',
      message: 'Nenhuma categoria ultrapassou o limite crítico neste período.'
    });
  }
  if (pareto.length > 0) {
    const top3 = pareto.slice(0, 3);
    const top3Cumulative = top3[top3.length - 1].cumulativePercent;
    const names = top3.map(i => i.name).join(', ');
    insights.push({
      type: 'info',
      title: 'Princípio de Pareto (80/20)',
      message: `As contas "${names}" são responsáveis por ${top3Cumulative.toFixed(0)}% do desvio total de orçamento (excedente). Focar nestes itens trará o maior retorno.`
    });
  }
  return insights;
};