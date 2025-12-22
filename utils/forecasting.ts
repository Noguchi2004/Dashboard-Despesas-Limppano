import { ProcessedExpense, CategoryType } from '../types';
import { MONTH_NAMES, CATEGORY_MAP } from '../constants';

// --- TYPES FOR FORECASTING ---
export interface ForecastPoint {
  dateKey: string; // YYYY-MM
  monthIndex: number; // 1-12
  year: number;
  monthName: string;
  historical?: number;
  scenarioBase: number;
  scenarioOptimistic: number;
  scenarioPessimistic: number;
  isProjected: boolean;
}

export interface CategoryDriver {
  category: CategoryType;
  categoryName: string;
  trendSlope: number; // Growth per month
  totalImpact: number; // Total volume
  correlation: number; // 0-1 how consistent is the growth
}

export interface ForecastResult {
  chartData: ForecastPoint[];
  monthlyProjections: Record<string, number>; // MonthKey -> Base Value
  nextYearTotal: {
    base: number;
    optimistic: number;
    pessimistic: number;
  };
  drivers: CategoryDriver[];
  seasonalityInsights: { month: string; factor: number; description: string }[];
}

// --- MATH HELPERS ---

const getLinearRegression = (y: number[]) => {
  const n = y.length;
  const x = Array.from({ length: n }, (_, i) => i);
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((a, b, i) => a + b * y[i], 0);
  const sumXX = x.reduce((a, b) => a + b * b, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
};

const getStandardDeviation = (arr: number[]) => {
    const n = arr.length;
    if (n === 0) return 0;
    const mean = arr.reduce((a, b) => a + b) / n;
    return Math.sqrt(arr.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b) / n);
};

// --- MAIN ENGINE ---

export const generateForecast = (data: ProcessedExpense[], projectionMonths: number = 12): ForecastResult => {
  // 1. Prepare Time Series Data (Aggregated by Month)
  // We need a continuous array of monthly totals.
  const expenses = data.filter(d => d.dataType === 'REAL' && d.category !== 'ROL');
  
  if (expenses.length === 0) {
      return { chartData: [], monthlyProjections: {}, nextYearTotal: { base:0, optimistic:0, pessimistic:0 }, drivers: [], seasonalityInsights: [] };
  }

  // Find range
  const years = Array.from(new Set(expenses.map(d => d.year))).sort();
  const startYear = years[0];
  const endYear = years[years.length - 1];

  // Group totals by "Year-Month" key
  const monthlyTotals = new Map<string, number>();
  // Also track by category for driver analysis
  const categoryMonthlyTotals = new Map<CategoryType, Map<string, number>>();

  expenses.forEach(d => {
      const key = `${d.year}-${String(d.month).padStart(2, '0')}`;
      monthlyTotals.set(key, (monthlyTotals.get(key) || 0) + d.amount);

      if(!categoryMonthlyTotals.has(d.category)) {
          categoryMonthlyTotals.set(d.category, new Map());
      }
      const catMap = categoryMonthlyTotals.get(d.category)!;
      catMap.set(key, (catMap.get(key) || 0) + d.amount);
  });

  // Create continuous timeline array (filling gaps with 0 or previous known?)
  // For financial data, gaps usually mean 0 expense.
  const timeSeries: { t: number; val: number; month: number; year: number; key: string }[] = [];
  let t = 0;
  
  // Iterate from first month of startYear to last month of endYear
  for (let y = startYear; y <= endYear; y++) {
      for (let m = 1; m <= 12; m++) {
          const key = `${y}-${String(m).padStart(2, '0')}`;
          // Only add if we have data or if it's between start/end range of data availability
          // For simplicity, let's assume datasets are somewhat complete.
          // Better approach: check boundaries
          if (monthlyTotals.has(key)) {
              timeSeries.push({
                  t: t++,
                  val: monthlyTotals.get(key)!,
                  month: m,
                  year: y,
                  key
              });
          }
      }
  }

  // 2. Trend Analysis (Linear Regression)
  const values = timeSeries.map(ts => ts.val);
  const { slope, intercept } = getLinearRegression(values);

  // 3. Seasonality Analysis
  // Calculate "Seasonal Indices": Ratio of Actual / Trend
  const seasonalRatios: Record<number, number[]> = {};
  for(let i=1; i<=12; i++) seasonalRatios[i] = [];

  timeSeries.forEach(point => {
      const trendValue = slope * point.t + intercept;
      const ratio = trendValue !== 0 ? point.val / trendValue : 1;
      seasonalRatios[point.month].push(ratio);
  });

  const seasonalIndices: Record<number, number> = {};
  const seasonalityInsights: { month: string; factor: number; description: string }[] = [];

  for(let i=1; i<=12; i++) {
      const ratios = seasonalRatios[i];
      // Average ratio for this month index
      const avgRatio = ratios.length > 0 ? ratios.reduce((a,b)=>a+b,0) / ratios.length : 1;
      seasonalIndices[i] = avgRatio;

      if (avgRatio > 1.05) {
          seasonalityInsights.push({
              month: MONTH_NAMES[i-1],
              factor: avgRatio,
              description: `Historicamente, ${MONTH_NAMES[i-1]} apresenta despesas ${(avgRatio * 100 - 100).toFixed(1)}% acima da média anual.`
          });
      }
  }

  // Sort insights by impact
  seasonalityInsights.sort((a,b) => b.factor - a.factor);


  // 4. Calculate Volatility (for Scenarios)
  // Standard deviation of the residuals (Actual - (Trend * Seasonality))
  const residuals = timeSeries.map(point => {
      const expected = (slope * point.t + intercept) * seasonalIndices[point.month];
      return point.val - expected;
  });
  const stdDev = getStandardDeviation(residuals);


  // 5. Generate Projections
  const chartData: ForecastPoint[] = [];
  const nextYearTotal = { base: 0, optimistic: 0, pessimistic: 0 };
  const monthlyProjections: Record<string, number> = {};

  // 5a. Add Historical Data to Chart
  timeSeries.forEach(pt => {
      chartData.push({
          dateKey: pt.key,
          monthIndex: pt.month,
          year: pt.year,
          monthName: MONTH_NAMES[pt.month-1],
          historical: pt.val,
          scenarioBase: pt.val, // Align for continuous line
          scenarioOptimistic: pt.val,
          scenarioPessimistic: pt.val,
          isProjected: false
      });
  });

  // 5b. Project Future
  // We assume the dataset ends at the last point of timeSeries. 
  // We project 'projectionMonths' ahead.
  const lastT = timeSeries[timeSeries.length - 1].t;
  const lastYear = timeSeries[timeSeries.length - 1].year;
  const lastMonth = timeSeries[timeSeries.length - 1].month;

  for (let i = 1; i <= projectionMonths; i++) {
      const futureT = lastT + i;
      
      // Calculate future month/year
      let futureMonth = lastMonth + i;
      let futureYear = lastYear;
      while (futureMonth > 12) {
          futureMonth -= 12;
          futureYear++;
      }

      const trend = slope * futureT + intercept;
      const seasonal = seasonalIndices[futureMonth];
      
      // Base Scenario
      const baseVal = Math.max(0, trend * seasonal);

      // Scenarios (using StdDev confidence)
      // Optimistic: Expense is lower (subtract deviation)
      // Pessimistic: Expense is higher (add deviation)
      // We assume distribution widens slightly over time (uncertainty cone)
      const uncertainty = stdDev * (1 + (i * 0.05)); 
      
      const optVal = Math.max(0, baseVal - uncertainty); // Lower expense is optimistic
      const pessVal = Math.max(0, baseVal + uncertainty); // Higher expense is pessimistic

      chartData.push({
          dateKey: `${futureYear}-${String(futureMonth).padStart(2,'0')}`,
          monthIndex: futureMonth,
          year: futureYear,
          monthName: MONTH_NAMES[futureMonth-1],
          scenarioBase: baseVal,
          scenarioOptimistic: optVal,
          scenarioPessimistic: pessVal,
          isProjected: true
      });

      // Accumulate totals for the NEXT 12 months
      nextYearTotal.base += baseVal;
      nextYearTotal.optimistic += optVal;
      nextYearTotal.pessimistic += pessVal;
      
      monthlyProjections[`${futureYear}-${futureMonth}`] = baseVal;
  }

  // 6. Driver Analysis (Category Trends)
  const drivers: CategoryDriver[] = [];
  categoryMonthlyTotals.forEach((map, cat) => {
      // Build mini time series for this category
      const catValues: number[] = [];
      timeSeries.forEach(pt => {
          catValues.push(map.get(pt.key) || 0);
      });
      
      const catReg = getLinearRegression(catValues);
      const totalVol = catValues.reduce((a,b)=>a+b,0);
      
      // Calculate correlation (R-squared proxy or simple consistency)
      // Simple logic: Slope relative to average volume
      const avg = totalVol / catValues.length;
      const normalizedGrowth = avg > 0 ? catReg.slope / avg : 0;

      drivers.push({
          category: cat,
          categoryName: CATEGORY_MAP[cat] || cat,
          trendSlope: catReg.slope,
          totalImpact: totalVol,
          correlation: normalizedGrowth
      });
  });

  // Sort drivers by Slope (Growth amount) descending
  drivers.sort((a,b) => b.trendSlope - a.trendSlope);

  return {
      chartData,
      monthlyProjections,
      nextYearTotal,
      drivers,
      seasonalityInsights
  };
};