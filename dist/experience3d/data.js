/**
 * Data boundary for the public 3D experience. Dimensions are metres and areas m².
 * Ratios called occupancy/permeability are percentages; efficiency is 0–1.
 * Source verification records provenance, never permission to build.
 */
const DEMO_SOURCE = Object.freeze({
  kind: 'demonstration',
  reference: 'Cenário ilustrativo ViabilEasy · sem vinculação a um terreno real',
  verified: false,
  url: null,
});

function positive(value, field, { min = 0, max = 100000, integer = false } = {}) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new TypeError(`${field}: informe um número ${integer ? 'inteiro ' : ''}positivo${min ? ` de pelo menos ${min}` : ''} de até ${max}.`);
  }
  return value;
}

function between(value, field, min, max) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new TypeError(`${field}: informe um número entre ${min} e ${max}.`);
  }
  return value;
}

function text(value, field, max = 300) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new TypeError(`${field}: informe um texto de até ${max} caracteres.`);
  }
  return value.trim();
}

function source(input = DEMO_SOURCE) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('source: procedência inválida.');
  const kind = input.kind ?? 'api';
  if (!['demonstration', 'api'].includes(kind)) throw new TypeError('source.kind: use demonstration ou api.');
  const reference = text(input.reference ?? 'Procedência não informada', 'source.reference', 1000);
  let url = null;
  if (input.url != null && input.url !== '') {
    try {
      const parsed = new URL(input.url);
      if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error();
      url = parsed.href;
    } catch { throw new TypeError('source.url: informe uma URL HTTP ou HTTPS.'); }
  }
  return { kind, reference, verified: input.verified === true, url };
}

function rounded(number, precision = 4) {
  return Number(number.toFixed(precision));
}

/**
 * Convert an API payload into renderer-ready, internally coherent scenarios.
 * The current renderer supports a rectangular parcel and one volume per scenario.
 * Derived metrics are recalculated, so stale API totals cannot enter the UI.
 * No legal approval or financial feasibility is inferred by this adapter.
 */
export function prepareExperienceData(input) {
  if (!input || typeof input !== 'object' || !input.parcel || !Array.isArray(input.scenarios) || !input.scenarios.length || input.scenarios.length > 20) {
    throw new TypeError('Informe um terreno e de 1 a 20 cenários.');
  }
  const raw = input.parcel;
  const width = positive(raw.width, 'parcel.width', { min: .1, max: 1000 });
  const depth = positive(raw.depth, 'parcel.depth', { min: .1, max: 1000 });
  const area = rounded(width * depth);
  if (raw.area != null && (typeof raw.area !== 'number' || !Number.isFinite(raw.area) || Math.abs(raw.area - area) > .01)) {
    throw new TypeError('parcel.area: a área deve corresponder à largura × profundidade.');
  }
  if (raw.frontage != null && raw.frontage !== width) throw new TypeError('parcel.frontage: a testada deve corresponder à largura do lote retangular.');
  const setbacks = {
    front: between(raw.setbacks?.front, 'parcel.setbacks.front', 0, depth),
    side: between(raw.setbacks?.side, 'parcel.setbacks.side', 0, width / 2),
    rear: between(raw.setbacks?.rear, 'parcel.setbacks.rear', 0, depth),
  };
  const usableWidth = width - 2 * setbacks.side;
  const usableDepth = depth - setbacks.front - setbacks.rear;
  if (usableWidth <= 0 || usableDepth <= 0) throw new TypeError('Os recuos devem deixar uma área interna positiva.');
  const envelopeHeight = positive(raw.envelopeHeight, 'parcel.envelopeHeight', { max: 500 });
  const parcelSource = source(raw.source ?? input.source);
  const parcel = {
    width, depth, area, frontage: width, setbacks, envelopeHeight,
    northDegrees: between(raw.northDegrees ?? 0, 'parcel.northDegrees', 0, 360),
    permeability: between(raw.permeability ?? 20, 'parcel.permeability', 0, 100),
    source: parcelSource,
    legalValidation: false,
  };
  const ids = new Set();
  const preparedScenarios = input.scenarios.map((rawScenario, index) => {
    if (!rawScenario || typeof rawScenario !== 'object') throw new TypeError(`scenarios[${index}]: cenário inválido.`);
    const id = text(rawScenario.id, 'scenario.id', 40);
    if (!/^[a-z][a-z0-9-]*$/.test(id) || ids.has(id)) throw new TypeError('scenario.id: use identificadores únicos, com letras minúsculas, números e hífen.');
    ids.add(id);
    const floors = positive(rawScenario.floors, 'scenario.floors', { max: 80, integer: true });
    const floorHeight = positive(rawScenario.floorHeight, 'scenario.floorHeight', { min: .1, max: 10 });
    const footprint = {
      width: positive(rawScenario.footprint?.width, 'scenario.footprint.width', { min: .1, max: usableWidth }),
      depth: positive(rawScenario.footprint?.depth, 'scenario.footprint.depth', { min: .1, max: usableDepth }),
    };
    const height = rounded(floors * floorHeight);
    if (height > envelopeHeight) throw new TypeError('A altura do cenário ultrapassa o envelope informado.');
    const footprintArea = rounded(footprint.width * footprint.depth);
    const builtArea = rounded(footprintArea * floors);
    const occupancy = rounded(footprintArea / area * 100);
    const permeability = parcel.permeability;
    if (occupancy + permeability > 100 + 1e-6) throw new TypeError('A ocupação e a área permeável não podem ultrapassar a área do terreno.');
    const efficiency = between(rawScenario.efficiency ?? .75, 'scenario.efficiency', 0, 1);
    const computableArea = between(rawScenario.computableArea ?? builtArea, 'scenario.computableArea', 0, builtArea);
    const color = rawScenario.color ?? '#48a89b';
    if (typeof color !== 'string' || !/^#[a-f\d]{6}$/i.test(color)) throw new TypeError('scenario.color: informe uma cor hexadecimal de seis dígitos.');
    return {
      id,
      name: text(rawScenario.name, 'scenario.name', 80),
      shortName: text(rawScenario.shortName ?? rawScenario.name, 'scenario.shortName', 80),
      description: text(rawScenario.description, 'scenario.description', 600),
      floors, floorHeight, height, footprint,
      units: positive(rawScenario.units, 'scenario.units', { max: 100000, integer: true }),
      unitLabel: text(rawScenario.unitLabel ?? 'unidades', 'scenario.unitLabel', 40),
      efficiency, color, computableArea,
      source: source(rawScenario.source ?? parcelSource),
      legalValidation: false,
      metrics: {
        footprintArea, builtArea, occupancy, permeability, computableArea,
        coefficient: rounded(computableArea / area),
        usableArea: rounded(builtArea * efficiency),
        viability: { label: 'Não avaliada', tone: 'neutral' },
      },
    };
  });
  return { schemaVersion: 1, parcel, scenarios: preparedScenarios, legalValidation: false };
}

const demonstration = prepareExperienceData({
  parcel: {
    width: 30, depth: 40, area: 1200, frontage: 30,
    setbacks: { front: 5, side: 3, rear: 5 },
    envelopeHeight: 27, northDegrees: 0, permeability: 20, source: DEMO_SOURCE,
  },
  scenarios: [
    {
      id: 'house', name: 'Residência unifamiliar', shortName: 'Casa',
      description: 'Uma residência contemporânea, com espaços generosos e jardim no mesmo lote.',
      floors: 2, floorHeight: 3.2, footprint: { width: 18, depth: 16 },
      units: 1, unitLabel: 'residência', efficiency: .84, color: '#46a797',
    },
    {
      id: 'residential', name: 'Edifício residencial', shortName: 'Residencial',
      description: 'Apartamentos distribuídos em pavimentos, com varandas e áreas comuns.',
      floors: 8, floorHeight: 3.05, footprint: { width: 18, depth: 22 },
      units: 32, unitLabel: 'apartamentos', efficiency: .76, color: '#388d83',
    },
    {
      id: 'commercial', name: 'Empreendimento comercial', shortName: 'Comercial',
      description: 'Salas empresariais em uma volumetria horizontal com fachada envidraçada.',
      floors: 5, floorHeight: 3.6, footprint: { width: 22, depth: 24 },
      units: 30, unitLabel: 'salas', efficiency: .8, color: '#609fad',
    },
    {
      id: 'flats', name: 'Flats e hospedagem', shortName: 'Flats',
      description: 'Flat boutique de inspiração tropical, com varandas em arco, tons de areia e terracota, recepção e jardim na cobertura.',
      floors: 6, floorHeight: 3, footprint: { width: 20, depth: 24 },
      units: 60, unitLabel: 'flats', efficiency: .72, color: '#65aa91',
    },
    {
      id: 'mixed', name: 'Empreendimento de uso misto', shortName: 'Uso misto',
      description: 'Comércio no térreo e moradias nos pavimentos superiores, em uma única proposta.',
      floors: 7, floorHeight: 3.4, footprint: { width: 22, depth: 23 },
      units: 40, unitLabel: 'unidades', efficiency: .76, color: '#298c89',
    },
  ],
});

export const demoParcel = demonstration.parcel;
export const scenarios = demonstration.scenarios;
export const demonstrationNotice = 'Parâmetros ilustrativos. Usos, recuos, alturas e viabilidade dependem de análise específica do terreno.';

export function formatNumber(value, maximumFractionDigits = 0) {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits }).format(value);
}

export function formatArea(value) {
  return `${formatNumber(value)} m²`;
}
