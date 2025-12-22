import { CategoryType, PeriodKey } from "./types";

export const VARIABLE_EXPENSES_CODES = [
  "4.3.02.01.0004", // Frete De Compras - Comercial
  "4.3.02.01.0001", // Fretes De Vendas
  "4.3.02.01.0002", // Fretes - Pf
  "4.3.07.01.0003", // Comissões Sobre Venda ( Representantes )
  "4.3.07.01.0004", // Prêmio Representante
  "4.3.09.01.0015", // Contrato Condicional
  "4.3.09.01.0001", // Contrato Incondicional
  "4.3.09.01.0016", // Despesa Com Bonificação/Brinde
  "4.3.99.01.0028", // Prêmio - Comercial
  "3.1.02.08.0001", // Desc. E/Ou Abatimentos Concedidos
  "3.1.02.08.0002", // Prov.Desc. E/Ou Abatimentos Concedidos
  "4.1.02.02.0010", // Gás
  "4.1.02.02.0003", // Energia Elétrica
  "4.1.02.02.0004", // Água E Esgoto
];

export const CATEGORY_MAP: Record<string, string> = {
  'DC': 'Despesas Comerciais',
  'DL': 'Despesas Logísticas',
  'DA': 'Despesas Administrativas',
  'DF': 'Despesas Financeiras',
  'GGF': 'Gastos Gerais de Fabricação',
  'DP': 'Depreciação',
  'ROL': 'Receita Líquida Operacional'
};

export const MONTH_NAMES = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", 
  "Jul", "Ago", "Set", "Out", "Nov", "Dez"
];

export const PERIODS: Record<PeriodKey, { label: string, months: number[] }> = {
  'ALL': { label: 'Ano Completo', months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
  
  'Q1': { label: '1º Trimestre', months: [1, 2, 3] },
  'Q2': { label: '2º Trimestre', months: [4, 5, 6] },
  'Q3': { label: '3º Trimestre', months: [7, 8, 9] },
  'Q4': { label: '4º Trimestre', months: [10, 11, 12] },
  
  'S1': { label: '1º Semestre', months: [1, 2, 3, 4, 5, 6] },
  'S2': { label: '2º Semestre', months: [7, 8, 9, 10, 11, 12] },

  // Individual Months
  'M1': { label: 'Janeiro', months: [1] },
  'M2': { label: 'Fevereiro', months: [2] },
  'M3': { label: 'Março', months: [3] },
  'M4': { label: 'Abril', months: [4] },
  'M5': { label: 'Maio', months: [5] },
  'M6': { label: 'Junho', months: [6] },
  'M7': { label: 'Julho', months: [7] },
  'M8': { label: 'Agosto', months: [8] },
  'M9': { label: 'Setembro', months: [9] },
  'M10': { label: 'Outubro', months: [10] },
  'M11': { label: 'Novembro', months: [11] },
  'M12': { label: 'Dezembro', months: [12] },
};