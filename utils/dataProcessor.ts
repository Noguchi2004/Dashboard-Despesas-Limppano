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
    case 'GGF': return 'Gerais, Gestão & Facilities';
    case 'DP': return 'Depreciação';
    case 'ROL': return 'Receita Líquida Operacional';
    default: return 'Outras';
  }
};

export const processRawData = (data: any[], type: DataType = 'REAL'): ProcessedExpense[] => {
  return data.map((row, index) => {
    // Basic validation to ensure row has necessary fields
    const idCtactb = String(row['ID_CTACTB'] || '');
    const ctactb = String(row['CTACTB'] || '');
    const category = determineCategory(idCtactb);
    
    // Check for Variable Expense
    // Clean string comparison just in case of whitespace
    const isVariable = VARIABLE_EXPENSES_CODES.some(code => ctactb.trim() === code);

    // Check for Synthetic vs Analytical
    const isSynthetic = idCtactb.includes('ST') || row['Nível'] === 1;

    return {
      id: `${type.toLowerCase()}-row-${index}-${Math.random().toString(36).substr(2, 9)}`,
      dataType: type,
      category,
      categoryName: determineCategoryName(category),
      accountCode: ctactb,
      description: row['Descrição'] || 'Sem Descrição',
      level: Number(row['Nível'] || 5),
      month: Number(row['Mês'] || 1),
      year: Number(row['Ano'] || 2024),
      amount: Number(row['Total'] || 0),
      isVariable,
      isSynthetic
    };
  });
};

// --- PERIOD FILTERING UTILITIES ---

/**
 * Filters data based on an array of month indices (1-12)
 */
export const filterDataByPeriod = (data: ProcessedExpense[], months: number[]): ProcessedExpense[] => {
  if (!months || months.length === 0) return data;
  return data.filter(d => months.includes(d.month));
};

/**
 * Returns month objects for chart axes based on selected month indices
 */
export const getMonthsForPeriod = (months: number[]): { name: string, index: number }[] => {
  // Sort months to ensure chronological order in charts
  const sortedMonths = [...months].sort((a, b) => a - b);
  
  return sortedMonths.map(m => ({
    name: MONTH_NAMES[m - 1], // MONTH_NAMES is 0-indexed
    index: m
  }));
};

/**
 * Helper to generate a label for a custom set of months
 */
export const getPeriodLabel = (months: number[]): string => {
    if (months.length === 12) return 'Ano Completo';
    if (months.length === 0) return 'Nenhum Mês';
    
    // Check if it matches a known period preset
    const preset = Object.values(PERIODS).find(p => 
        p.months.length === months.length && 
        p.months.every(m => months.includes(m))
    );
    
    if (preset) return preset.label;

    // Custom Labels
    if (months.length === 1) return MONTH_NAMES[months[0]-1];
    if (months.length <= 3) {
        return months.sort((a,b) => a-b).map(m => MONTH_NAMES[m-1]).join(', ');
    }
    
    return `${months.length} Meses Selecionados`;
};

// --- FORMATTERS ---

export const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0
  }).format(value);
};

export const formatCompactCurrency = (value: number) => {
   return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    notation: "compact",
    maximumFractionDigits: 1
  }).format(value);
}

export const formatPercent = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(value / 100);
};

// --- DEVIATION ANALYSIS UTILITIES ---

const getStatus = (percDev: number, config: ThresholdConfig): DeviationStatus => {
  if (percDev <= config.healthyMax) return 'HEALTHY';
  if (percDev >= config.criticalMin) return 'CRITICAL';
  return 'WARNING';
};

/**
 * Aggregates Real vs Budget data by Category or Account
 */
export const calculateDeviations = (
  data: ProcessedExpense[], 
  groupBy: 'CATEGORY' | 'ACCOUNT',
  thresholds: ThresholdConfig
): DeviationData[] => {
  const map = new Map<string, DeviationData>();

  data.forEach(item => {
    if (item.category === 'ROL') return; // Exclude ROL from expenses
    
    // Key Generation
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
        status: 'HEALTHY'
      });
    }

    const entry = map.get(key)!;
    if (item.dataType === 'REAL') {
      entry.real += item.amount;
    } else {
      entry.budget += item.amount;
    }
  });

  // Calculate Derivatives
  return Array.from(map.values()).map(item => {
    const absDeviation = item.real - item.budget;
    // Handle division by zero or small numbers
    const percDeviation = item.budget !== 0 
      ? (absDeviation / item.budget) * 100 
      : (item.real > 0 ? 100 : 0);

    return {
      ...item,
      absDeviation,
      percDeviation,
      status: getStatus(percDeviation, thresholds)
    };
  });
};

export const generatePareto = (deviations: DeviationData[]): ParetoItem[] => {
  // 1. Filter only items with POSITIVE deviation (over budget) for typical pareto (Cost Reduction)
  // Or absolute deviation? Usually "Where did we miss the most?" implies absolute magnitude.
  const sorted = [...deviations]
    .filter(d => d.absDeviation > 0) // Focus on overspending
    .sort((a, b) => b.absDeviation - a.absDeviation);

  const totalDeviation = sorted.reduce((acc, curr) => acc + curr.absDeviation, 0);
  let accumulated = 0;

  return sorted.map(d => {
    accumulated += d.absDeviation;
    return {
      name: d.description,
      value: d.absDeviation,
      percent: (d.absDeviation / totalDeviation) * 100,
      cumulativePercent: totalDeviation > 0 ? (accumulated / totalDeviation) * 100 : 0
    };
  }).slice(0, 10); // Return Top 10
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
      // FIX: Use Level 5 (Analytical) sum to ensure total expense accuracy for Heatmap
      const real = data
        .filter(d => d.month === m.index && d.category === cat && d.dataType === 'REAL' && d.level === 5)
        .reduce((sum, item) => sum + item.amount, 0);
        
      const budget = data
        .filter(d => d.month === m.index && d.category === cat && d.dataType === 'ORCADO' && d.level === 5)
        .reduce((sum, item) => sum + item.amount, 0);

      const diff = real - budget;
      const perc = budget !== 0 ? (diff / budget) * 100 : 0;
      
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

  // Insight 1: General Status
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

  // Insight 2: Pareto / Main Cause
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

  // Insight 3: Biggest single deviation
  const biggest = deviations.reduce((prev, current) => (prev.absDeviation > current.absDeviation) ? prev : current, deviations[0]);
  if (biggest && biggest.absDeviation > 0) {
    insights.push({
      type: 'warning',
      title: 'Maior Estouro Absoluto',
      message: `A categoria "${biggest.description}" estourou o orçamento em ${formatCompactCurrency(biggest.absDeviation)} (${biggest.percDeviation.toFixed(1)}%).`
    });
  }

  return insights;
};