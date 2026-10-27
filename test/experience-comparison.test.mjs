import test from 'node:test';
import assert from 'node:assert/strict';
import { demoParcel, scenarios, prepareExperienceData } from '../dist/experience3d/data.js';
import { buildComparison, demoFinancialAssumptions, formatMoney, formatPercent } from '../dist/experience3d/comparison.js';
import { renderComparison } from '../dist/experience3d/comparison-ui.js';
import { createIntroTour } from '../dist/experience3d/tour.js';
import { createBuilding } from '../dist/experience3d/buildings.js';
import { Box3 } from '../dist/vendor/three/three.module.js';

const data = prepareExperienceData({ parcel: demoParcel, scenarios });
const assumptions = () => structuredClone(demoFinancialAssumptions);

test('residual reserves target profit and excludes land acquisition; return includes land', () => {
  const result = buildComparison(data.scenarios);
  const residential = result.rows.find(row => row.id === 'residential');
  assert.equal(residential.revenue, 22632192);
  assert.equal(residential.totalCost, 16617369.6);
  assert.equal(residential.residual, 3741027.84);
  assert.equal(residential.profit, 6014822.4);
  assert.ok(Math.abs(residential.profitability - 36.195995785) < .000001);
  assert.equal(result.winnerId, 'residential');
  assert.ok(result.rows.find(row => row.id === 'mixed').builtArea > residential.builtArea);
  assert.equal(result.illustrative, true);
  assert.equal(result.legalValidation, false);
  assert.ok(result.rows.every(row => row.legalValidation === false));
  assert.equal(result.rows.find(row => row.id === 'house').viability.label, 'Saldo negativo');
});

test('winner responds to financial inputs, instead of a fixed scenario or largest area', () => {
  const input = assumptions();
  input.scenarios.residential.constructionCostPerM2 = 5000;
  assert.equal(buildComparison(data.scenarios, input).winnerId, 'flats');
});

test('incomplete, non-finite, mismatched parcel or unknown method suppress a winner', () => {
  for (const mutate of [
    input => { delete input.landPrice; },
    input => { input.targetMargin = null; },
    input => { input.sellingRate = Infinity; },
    input => { delete input.scenarios.house.salePricePerM2; },
    input => { input.scenarios.flats.constructionCostPerM2 = -1; },
    input => { input.method = 'largest-area'; },
  ]) {
    const input = assumptions(); mutate(input);
    const result = buildComparison(data.scenarios, input);
    assert.equal(result.winnerId, null);
    assert.equal(result.methodology.complete, false);
  }
  const foreign = structuredClone(data.scenarios);
  foreign[0].parcelId = 'another-lot';
  assert.equal(buildComparison(foreign).winnerId, null);
  assert.equal(buildComparison(data.scenarios, null).winnerId, null);
});

test('equal residuals, a single alternative and unaffordable land have no winner', () => {
  const equal = [data.scenarios[1], { ...data.scenarios[1], id: 'alternative', name: 'Alternativa' }];
  const input = assumptions();
  input.scenarios.alternative = { ...input.scenarios.residential };
  assert.equal(buildComparison(equal, input).winnerId, null);
  assert.equal(buildComparison([data.scenarios[1]], input).winnerId, null);
  input.landPrice = 100000000;
  assert.equal(buildComparison(data.scenarios, input).winnerId, null);
});

test('missing methodology rates are displayed as undefined, never as zero', () => {
  const root = { classList: { add() {} }, setAttribute() {}, innerHTML: '' };
  renderComparison(root, buildComparison(data.scenarios, null));
  assert.match(root.innerHTML, /Preservando A definir/);
  assert.doesNotMatch(root.innerHTML, /Preservando 0%/);
  assert.equal(formatMoney(null), 'A definir');
  assert.equal(formatPercent(null), 'A definir');
});

test('the residence presentation shows only the completed building', () => {
  const tour = createIntroTour(data.scenarios);
  assert.equal(data.scenarios[tour[0].scenario].id, 'house');
  assert.ok(tour.every(step => step.layer === 'building'));
  assert.ok(tour.every(step => !step.assembly && !step.constructionStage && !step.exploded));
  assert.equal(createIntroTour([data.scenarios[0]])[0].scenario, 0);
});

test('explosion and staggered assembly restore exact building geometry for every alternative', () => {
  for (const scenario of data.scenarios.filter(item => item.id !== 'house')) {
    const building = createBuilding(scenario);
    try {
      const original = new Box3().setFromObject(building.root);
      building.setSpread(1);
      assert.ok(building.floors.every((floor, index) => floor.position.y > index * scenario.floorHeight));
      assert.ok(new Box3().setFromObject(building.root).max.y > original.max.y);
      building.setAssembly(.5);
      assert.ok(building.floors.every(floor => floor.visible && floor.scale.y === 1));
      building.setAssembly(1);
      const restored = new Box3().setFromObject(building.root);
      assert.ok(restored.min.distanceTo(original.min) < 1e-9);
      assert.ok(restored.max.distanceTo(original.max) < 1e-9);
      building.setSpread(1);
      building.setSpread(0);
      assert.ok(new Box3().setFromObject(building.root).max.distanceTo(original.max) < 1e-9);
      assert.ok(building.floors.every(floor => floor.rotation.y === 0));
    } finally { building.dispose(); }
  }
});

test('architectural details preserve floor counts, footprint and height limits in every alternative', () => {
  for (const scenario of data.scenarios) {
    const building = createBuilding(scenario);
    try {
      building.setGrowth(0);
      assert.ok(building.floors.every(floor => !floor.visible));
      building.setGrowth(1);
      assert.equal(building.floors.length, scenario.floors);
      assert.ok(building.floors.every(floor => floor.visible));
      const box = new Box3().setFromObject(building.root);
      assert.ok(box.min.x >= -scenario.footprint.width / 2 - 1e-6, scenario.id);
      assert.ok(box.max.x <= scenario.footprint.width / 2 + 1e-6, scenario.id);
      assert.ok(box.min.z >= -scenario.footprint.depth / 2 - 1e-6, scenario.id);
      assert.ok(box.max.z <= scenario.footprint.depth / 2 + 1e-6, scenario.id);
      assert.ok(box.min.y >= -1e-6 && box.max.y <= scenario.height + 1e-6, scenario.id);
    } finally { building.dispose(); }
  }
});

test('house builds in place, reveals actual openings and restores exact geometry after replay', () => {
  const building = createBuilding(data.scenarios[0]);
  try {
    const original = new Box3().setFromObject(building.root);
    const visibleNames = progress => {
      building.setAssembly(progress);
      const names = [];
      building.root.traverseVisible(object => { if (object.isGroup) names.push(object.name); });
      return names;
    };
    assert.ok(!visibleNames(0).some(name => name.startsWith('Estrutura')));
    assert.ok(visibleNames(.34).some(name => name.startsWith('Estrutura')));
    assert.ok(!visibleNames(.34).some(name => name.startsWith('Esquadrias')));
    assert.ok(visibleNames(.82).some(name => name.startsWith('Esquadrias')));
    assert.ok(!visibleNames(.82).includes('Jardim e acesso'));
    assert.ok(visibleNames(1).includes('Jardim e acesso'));
    for (const progress of [.7, 0, .15, .5, 1]) {
      building.setAssembly(progress);
      assert.deepEqual(building.floors.map(floor => floor.position.y), [0, data.scenarios[0].floorHeight]);
    }
    const restored = new Box3().setFromObject(building.root);
    assert.ok(restored.min.distanceTo(original.min) < 1e-9);
    assert.ok(restored.max.distanceTo(original.max) < 1e-9);
    building.setStyle({ opacity: .1, technical: true });
    building.setStyle({ opacity: 1, technical: false });
    building.root.traverse(object => {
      if (object.isMesh && object.material.userData.kind === 'plaster') {
        assert.equal(object.material.opacity, 1);
        assert.equal(object.material.transparent, false);
        assert.equal(object.material.wireframe, false);
      }
    });
  } finally { building.dispose(); }
});

test('boutique flats have recessed arched loggias, a patio and instanced repeated details', () => {
  const scenario = data.scenarios.find(item => item.id === 'flats');
  const building = createBuilding(scenario);
  try {
    let draws = 0;
    let instanced = 0;
    building.root.traverse(object => { if (object.isMesh) draws++; if (object.isInstancedMesh) instanced++; });
    assert.ok(instanced > scenario.floors, 'repeated façade details use instancing');
    assert.ok(draws < 140, 'draw count remains bounded despite individual balcony railings');
    for (const floor of building.floors) {
      const portals = floor.getObjectByName('Pórticos das varandas');
      assert.equal(portals.geometry.type, 'ExtrudeGeometry');
      assert.ok(portals.count >= 8);
    }
    const original = new Box3().setFromObject(building.root);
    building.setStyle({ technical: true, transparent: true, opacity: .2 });
    building.setStyle({ technical: false, transparent: false, opacity: 1 });
    building.root.traverse(object => {
      if (object.isMesh && object.material.userData.kind === 'plaster') {
        assert.equal(object.material.opacity, 1);
        assert.equal(object.material.transparent, false);
        assert.equal(object.material.wireframe, false);
      }
    });
    const restored = new Box3().setFromObject(building.root);
    assert.ok(restored.min.distanceTo(original.min) < 1e-9);
    assert.ok(restored.max.distanceTo(original.max) < 1e-9);
  } finally { building.dispose(); }
});
