export const COMPARISON_METHOD = 'residual-target-margin-v1';

/** Invented inputs for the public demonstration, not market quotations. */
export const demoFinancialAssumptions = Object.freeze({
  method: COMPARISON_METHOD,
  parcelId: 'viabileasy-illustrative-lot-01',
  landPrice: 1800000,
  overheadRate: .20,
  sellingRate: .05,
  targetMargin: .18,
  scenarios: Object.freeze({
    house: Object.freeze({ salePricePerM2: 8700, constructionCostPerM2: 4200 }),
    residential: Object.freeze({ salePricePerM2: 9400, constructionCostPerM2: 3600 }),
    commercial: Object.freeze({ salePricePerM2: 8000, constructionCostPerM2: 3900 }),
    flats: Object.freeze({ salePricePerM2: 11000, constructionCostPerM2: 4100 }),
    mixed: Object.freeze({ salePricePerM2: 9000, constructionCostPerM2: 3800 }),
  }),
});

const potential = {
  house: 'Moradia ou revenda',
  residential: 'Venda de apartamentos',
  commercial: 'Venda de salas comerciais',
  flats: 'Venda de unidades compactas',
  mixed: 'Venda de lojas e moradias',
};
const money = value => Math.round((value + Number.EPSILON) * 100) / 100;
const finite = (value, min = 0, max = Number.MAX_SAFE_INTEGER) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const positive = value => finite(value) && value > 0;

export function formatMoney(value, compact = true) {
  if (!Number.isFinite(value)) return 'A definir';
  if (!compact || Math.abs(value) < 1000000) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: compact ? 0 : 2 }).format(value);
  }
  return `${value < 0 ? '−' : ''}R$ ${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(Math.abs(value) / 1000000)} mi`;
}

export function formatPercent(value) {
  return Number.isFinite(value) ? `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(value)}%` : 'A definir';
}

/**
 * Compare complete alternatives for one parcel using a declared residual method.
 * A missing input keeps the comparison inspectable, but suppresses a winner.
 * Profitability is unlevered profit / total assumed cost, not an annual return.
 */
export function buildComparison(scenarios, assumptions = demoFinancialAssumptions) {
  if (!Array.isArray(scenarios) || !scenarios.length || scenarios.length > 20) {
    throw new TypeError('A comparação precisa de 1 a 20 cenários.');
  }
  const input = assumptions && typeof assumptions === 'object' ? assumptions : {};
  const commonIssues = [];
  if (typeof input.parcelId !== 'string' || !input.parcelId.trim()) commonIssues.push('Terreno de referência não informado.');
  if (!finite(input.landPrice)) commonIssues.push('Valor do terreno não informado ou inválido.');
  if (!finite(input.overheadRate, 0, 1)) commonIssues.push('Taxa de custos indiretos não informada ou inválida.');
  if (!finite(input.sellingRate, 0, 1)) commonIssues.push('Taxa de comercialização não informada ou inválida.');
  if (!finite(input.targetMargin, 0, .99)) commonIssues.push('Margem alvo não informada ou inválida.');
  const seen = new Set();
  const rows = scenarios.map(scenario => {
    const issues = [...commonIssues];
    const id = typeof scenario?.id === 'string' ? scenario.id : '';
    if (!/^[a-z][a-z0-9-]*$/.test(id) || seen.has(id)) throw new TypeError('Cada cenário precisa de um identificador único.');
    seen.add(id);
    if (scenario.parcelId != null && scenario.parcelId !== input.parcelId) issues.push('O cenário pertence a outro terreno.');
    const builtArea = scenario.metrics?.builtArea;
    const efficiency = scenario.efficiency;
    const prices = input.scenarios?.[id] || {};
    if (!positive(builtArea)) issues.push('Área construída não informada ou inválida.');
    if (!finite(efficiency, 0, 1) || efficiency === 0) issues.push('Eficiência vendável não informada ou inválida.');
    if (!positive(prices.salePricePerM2)) issues.push('Preço de venda não informado ou inválido.');
    if (!positive(prices.constructionCostPerM2)) issues.push('Custo de construção não informado ou inválido.');
    const row = {
      id, name: scenario.name || id, shortName: scenario.shortName || scenario.name || id,
      builtArea: positive(builtArea) ? builtArea : null,
      units: positive(scenario.units) ? scenario.units : null,
      floors: positive(scenario.floors) ? scenario.floors : null,
      coefficient: finite(scenario.metrics?.coefficient) ? scenario.metrics.coefficient : null,
      occupancy: finite(scenario.metrics?.occupancy, 0, 100) ? scenario.metrics.occupancy : null,
      investmentPotential: potential[id] || 'Venda das unidades',
      inputs: { salePricePerM2: prices.salePricePerM2, constructionCostPerM2: prices.constructionCostPerM2, efficiency },
      valid: issues.length === 0, issues,
      sellableArea: null, revenue: null, constructionCost: null, overheadCost: null, sellingCost: null,
      costWithoutLand: null, totalCost: null, profit: null, residual: null, profitability: null, margin: null,
      viability: { label: 'Premissas a definir', tone: 'neutral' },
      legalValidation: false,
    };
    if (!row.valid) return row;
    const sellableArea = builtArea * efficiency;
    const revenue = sellableArea * prices.salePricePerM2;
    const constructionCost = builtArea * prices.constructionCostPerM2;
    const overheadCost = constructionCost * input.overheadRate;
    const sellingCost = revenue * input.sellingRate;
    const costWithoutLand = constructionCost + overheadCost + sellingCost;
    const totalCost = costWithoutLand + input.landPrice;
    const profit = revenue - totalCost;
    const residual = revenue - costWithoutLand - input.targetMargin * revenue;
    if (![sellableArea, revenue, constructionCost, overheadCost, sellingCost, costWithoutLand, totalCost, profit, residual].every(value => finite(Math.abs(value)))) {
      row.valid = false;
      row.issues.push('Premissas excedem os limites numéricos da simulação.');
      return row;
    }
    Object.assign(row, {
      sellableArea: money(sellableArea), revenue: money(revenue), constructionCost: money(constructionCost),
      overheadCost: money(overheadCost), sellingCost: money(sellingCost), costWithoutLand: money(costWithoutLand),
      totalCost: money(totalCost), profit: money(profit), residual: money(residual),
      profitability: profit / totalCost * 100, margin: profit / revenue * 100,
      viability: profit < 0
        ? { label: 'Saldo negativo', tone: 'caution' }
        : residual + .005 >= input.landPrice
          ? { label: 'Atinge a margem alvo', tone: 'positive' }
          : { label: 'Abaixo da margem alvo', tone: 'neutral' },
    });
    return row;
  });
  const methodValid = input.method === COMPARISON_METHOD;
  const complete = methodValid && commonIssues.length === 0 && rows.length > 1 && rows.every(row => row.valid);
  const sorted = complete ? [...rows].sort((a, b) => b.residual - a.residual) : [];
  // A tie or failure to cover the assumed land price does not produce a recommendation.
  const winner = sorted.length > 1 && sorted[0].residual >= input.landPrice
    && sorted[0].residual - sorted[1].residual > .01 ? sorted[0] : null;
  return {
    rows, winnerId: winner?.id || null, winner,
    illustrative: true, legalValidation: false,
    methodology: {
      id: methodValid ? COMPARISON_METHOD : null,
      label: 'Maior valor residual do terreno, preservando a margem alvo',
      complete,
      parcelId: typeof input.parcelId === 'string' ? input.parcelId : null,
      landPrice: finite(input.landPrice) ? input.landPrice : null,
      overheadRate: finite(input.overheadRate, 0, 1) ? input.overheadRate : null,
      sellingRate: finite(input.sellingRate, 0, 1) ? input.sellingRate : null,
      targetMargin: finite(input.targetMargin, 0, .99) ? input.targetMargin : null,
      issues: [...commonIssues, ...(!methodValid ? ['Método de comparação não informado ou não reconhecido.'] : [])],
    },
  };
}
