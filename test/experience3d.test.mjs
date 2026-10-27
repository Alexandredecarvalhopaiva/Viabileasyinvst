import test from 'node:test';
import assert from 'node:assert/strict';
import { demoParcel, scenarios, prepareExperienceData } from '../dist/experience3d/data.js';
import { getSetbackDimensions } from '../dist/experience3d/setback-dimensions.js';

const payload = () => structuredClone({ parcel: demoParcel, scenarios });

test('setback dimensions measure the envelope, independently of a narrower building', () => {
  const dimensions = getSetbackDimensions(demoParcel);
  assert.deepEqual(dimensions.map(item => item.value), [5, 5, 3, 3]);
  for (const item of dimensions) {
    const distance = Math.hypot(...item.end.map((value, index) => value - item.start[index]));
    assert.equal(distance, item.value);
  }
  const residential = scenarios.find(item => item.id === 'residential');
  assert.equal((demoParcel.width - residential.footprint.width) / 2, 6);
  assert.equal(dimensions.find(item => item.id === 'left').value, 3);
});

test('front and rear dimensions retain their identity with asymmetric setbacks', () => {
  const dimensions = getSetbackDimensions({ ...demoParcel, setbacks: { front: 7, rear: 2, side: 3.25 } });
  assert.deepEqual(dimensions[0].start, [0, .18, 20]);
  assert.deepEqual(dimensions[0].end, [0, .18, 13]);
  assert.deepEqual(dimensions[1].start, [0, .18, -20]);
  assert.deepEqual(dimensions[1].end, [0, .18, -18]);
  assert.deepEqual(dimensions[2].end, [-11.75, .18, -2.5]);
  assert.deepEqual(dimensions[3].end, [11.75, .18, -2.5]);
});

test('zero setbacks remain zero-length dimensions rather than substituted defaults', () => {
  for (const dimension of getSetbackDimensions({ ...demoParcel, setbacks: { front: 0, rear: 0, side: 0 } })) {
    assert.equal(dimension.value, 0);
    assert.deepEqual(dimension.start, dimension.end);
    assert.ok(dimension.end.every(Number.isFinite));
  }
});

test('five alternatives share one rectangular parcel and derive coherent estimated quantities', () => {
  assert.deepEqual(scenarios.map(item => item.id), ['house', 'residential', 'commercial', 'flats', 'mixed']);
  assert.equal(demoParcel.area, 1200);
  assert.equal(demoParcel.frontage, 30);
  for (const scenario of scenarios) {
    const footprintArea = scenario.footprint.width * scenario.footprint.depth;
    assert.equal(scenario.metrics.builtArea, footprintArea * scenario.floors);
    assert.ok(Math.abs(scenario.metrics.occupancy - footprintArea / 1200 * 100) < .0001);
    assert.ok(Math.abs(scenario.metrics.coefficient - scenario.metrics.computableArea / 1200) < .0001);
    assert.equal(scenario.metrics.permeability, 20);
    assert.ok(scenario.footprint.width <= 24 && scenario.footprint.depth <= 30);
    assert.ok(scenario.height <= 27);
    assert.equal(scenario.metrics.viability.label, 'Não avaliada');
    assert.equal(scenario.legalValidation, false);
  }
});

test('adapter recalculates stale API totals and preserves explicit non-computable area', () => {
  const input = payload();
  input.scenarios[0].computableArea = 400;
  input.scenarios[0].metrics = { builtArea: 99999, occupancy: 100, coefficient: 100, viability: { label: 'Aprovado' } };
  const result = prepareExperienceData(input);
  assert.equal(result.scenarios[0].metrics.builtArea, 576);
  assert.equal(result.scenarios[0].metrics.computableArea, 400);
  assert.equal(result.scenarios[0].metrics.coefficient, .3333);
  assert.equal(result.scenarios[0].metrics.viability.label, 'Não avaliada');
  assert.equal(input.scenarios[0].metrics.builtArea, 99999, 'does not mutate an API response');
  assert.deepEqual(prepareExperienceData(result), result, 'can safely revalidate prepared data');
});

test('verified source provenance never becomes legal approval or financial feasibility', () => {
  const input = payload();
  const source = { kind: 'api', reference: 'Análise urbanística futura #42', verified: true, url: 'https://example.test/analyses/42' };
  input.parcel.source = source;
  input.parcel.legalValidation = true;
  for (const scenario of input.scenarios) {
    delete scenario.source;
    scenario.legalValidation = true;
  }
  const result = prepareExperienceData(input);
  assert.deepEqual(result.parcel.source, source);
  assert.equal(result.legalValidation, false);
  assert.equal(result.parcel.legalValidation, false);
  for (const scenario of result.scenarios) {
    assert.deepEqual(scenario.source, source);
    assert.equal(scenario.legalValidation, false);
    assert.deepEqual(scenario.metrics.viability, { label: 'Não avaliada', tone: 'neutral' });
  }
});

test('rejects impossible geometry, ambiguous frontage and incoherent area', () => {
  for (const modify of [
    input => { input.parcel.width = -10; },
    input => { input.parcel.width = Number.MIN_VALUE; },
    input => { input.parcel.depth = Infinity; },
    input => { input.parcel.area = 1100; },
    input => { input.parcel.frontage = 40; },
    input => { input.parcel.setbacks.side = 15; },
    input => { input.parcel.setbacks.front = 40; },
    input => { input.scenarios[0].footprint.width = 25; },
    input => { input.scenarios[0].footprint.depth = 31; },
    input => { input.parcel.permeability = 90; },
  ]) {
    const input = payload();
    modify(input);
    assert.throws(() => prepareExperienceData(input), TypeError);
  }
});

test('rejects invalid floor counts, heights, units and computed areas', () => {
  for (const modify of [
    input => { input.scenarios[0].floors = 0; },
    input => { input.scenarios[0].floors = 2.5; },
    input => { input.scenarios[0].floors = 81; },
    input => { input.scenarios[0].floorHeight = NaN; },
    input => { input.scenarios[1].floorHeight = 4; },
    input => { input.scenarios[0].units = '1'; },
    input => { input.scenarios[0].efficiency = 1.5; },
    input => { input.scenarios[0].computableArea = 577; },
    input => { input.scenarios[0].computableArea = -1; },
  ]) {
    const input = payload();
    modify(input);
    assert.throws(() => prepareExperienceData(input), TypeError);
  }
});

test('rejects unbounded collections, duplicate ids and unsafe source URLs', () => {
  assert.throws(() => prepareExperienceData({ parcel: demoParcel, scenarios: [] }), TypeError);
  assert.throws(() => prepareExperienceData({ parcel: demoParcel, scenarios: Array(21).fill(scenarios[0]) }), TypeError);
  const duplicated = payload();
  duplicated.scenarios[1].id = duplicated.scenarios[0].id;
  assert.throws(() => prepareExperienceData(duplicated), TypeError);
  const unsafe = payload();
  unsafe.parcel.source.url = 'javascript:alert(1)';
  assert.throws(() => prepareExperienceData(unsafe), TypeError);
});
