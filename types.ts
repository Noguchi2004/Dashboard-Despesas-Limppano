
export interface ExpenseRawData {
  ID_CTACTB: string;
  Nível: number;
  CTACTB: string;
  Descrição: string;
  Mês: number;
  Ano: number;
  Total: number;
}

export type CategoryType = 'DC' | 'DL' | 'DA' | 'DF' | 'GGF' | 'DP' | 'ROL' | 'OUTROS';
export type DataType = 'REAL' | 'ORCADO';
export type PeriodKey = 
  | 'ALL' 
  | 'Q1' | 'Q2' | 'Q3' | 'Q4' 
  | 'S1' | 'S2'
  | 'M1' | 'M2' | 'M3' | 'M4' | 'M5' | 'M6' 
  | 'M7' | 'M8' | 'M9' | 'M10' | 'M11' | 'M12';

export interface ProcessedExpense {
  id: string;
  dataType: DataType; // New field to distinguish Real vs Budget
  category: CategoryType;
  categoryName: string;
  idCtactb: string; // NEW: Unique Structural ID
  accountCode: string; // CTACTB
  description: string;
  level: number;
  month: number;
  year: number;
  amount: number;
  isVariable: boolean;
  isSynthetic: boolean;
}

export interface KPI {
  totalExpense: number;
  totalROL: number;
  variableExpense: number;
  fixedExpense: number;
  rolPercentage: number;
}

export interface ChartDataPoint {
  name: string;
  [key: string]: number | string;
}

export enum ViewMode {
  UPLOAD = 'UPLOAD',
  GENERAL = 'GENERAL',
  MACRO = 'MACRO',
  MICRO = 'MICRO',
  DEVIATION = 'DEVIATION',
}

// --- NEW DEVIATION ANALYSIS TYPES ---

export type ComparisonMode = 'BUDGET' | 'YEAR';

export interface ThresholdConfig {
  healthyMax: number; // Agora representa o limite do "Amarelo" (Tolerância)
  criticalMin: number; // Representa o início do "Vermelho" (Crítico)
}

export type DeviationStatus = 'SAVING' | 'HEALTHY' | 'WARNING' | 'CRITICAL';

export interface DeviationData {
  id: string;
  description: string; // Category or Account Name
  category: CategoryType;
  accountCode?: string;
  level: number;
  budget: number;
  real: number;
  absDeviation: number; // Real - Budget
  percDeviation: number; // (Real - Budget) / Budget
  status: DeviationStatus;
}

export interface ParetoItem {
  name: string;
  value: number; // Absolute Deviation
  percent: number; // % of Total Deviation
  cumulativePercent: number; // Cumulative %
}

export interface InsightItem {
  type: 'info' | 'warning' | 'success';
  title: string;
  message: string;
}
