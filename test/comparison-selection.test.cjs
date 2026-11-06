const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const EngineResults = require('../dist/engine-results.js');

function setup() {
  let click;
  const notices = [];
  const alternatives = [
    {id: 'compact', name: 'Compacto', floors: 4, to: 50, gross: 1120, engine: {version: 'demo-1'}},
    {id: 'base', name: 'Base', floors: 6, to: 60, gross: 1200, engine: {version: 'demo-1'}}
  ];
  const select = {A: 'compact', B: 'base'};
  const context = {
    module: {exports: {}}, EngineResults,
    state: {lot: {id: 'fixture', area: 360}, use: 'H3', unitArea: 70},
    document: {
      addEventListener(type, handler) { if (type === 'click') click = handler; },
      getElementById(id) { return {value: select[id.slice(-1)]}; },
      querySelector() { return null; }
    },
    getLotGeometry: () => null,
    scenarioData: () => alternatives,
    guardSelection: () => true,
    render() {},
    notify: message => notices.push(message)
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('dist/comparison-report.js', 'utf8'), context);
  return {
    context, alternatives, select, notices,
    click(action) {
      click({target: {closest: () => ({dataset: {comparisonAction: action}})}});
    },
    stale() { return vm.runInContext('comparisonStale(state.comparisonSelection, scenarioData())', context); }
  };
}

test('atualizar somente A preserva a captura B e recalcula a diferença B menos A', () => {
  const app = setup();
  app.click('capture');
  const savedB = JSON.stringify(app.context.state.comparisonSelection.B);
  app.alternatives[0].gross = 1150;
  assert.equal(app.stale(), true);
  app.click('capture-A');
  assert.deepEqual(app.notices, []);
  const selection = app.context.state.comparisonSelection;
  assert.equal(selection.A.result.gross, 1150);
  assert.equal(JSON.stringify(selection.B), savedB);
  assert.equal(selection.report.differences.find(item => item.key === 'gross').value, 50);
  assert.equal(app.stale(), false);
});

test('atualizar somente B preserva A e a fixture 1200 menos 1120 resulta em 80', () => {
  const app = setup();
  app.click('capture');
  const savedA = JSON.stringify(app.context.state.comparisonSelection.A);
  assert.equal(app.context.state.comparisonSelection.report.differences.find(item => item.key === 'gross').value, 80);
  app.alternatives[1].gross = 1300;
  app.click('capture-B');
  assert.deepEqual(app.notices, []);
  assert.equal(JSON.stringify(app.context.state.comparisonSelection.A), savedA);
  assert.equal(app.context.state.comparisonSelection.B.result.gross, 1300);
});

test('captura individual aceita seleção incompleta e erro de duplicação conserva seleção anterior', () => {
  const app = setup();
  app.click('capture-A');
  assert.deepEqual(app.notices, []);
  assert.equal(app.context.state.comparisonSelection.A.id, 'compact');
  assert.equal(app.context.state.comparisonSelection.report, null);
  app.click('capture-B');
  const before = JSON.stringify(app.context.state.comparisonSelection);
  app.select.A = 'base';
  app.click('capture-A');
  assert.match(app.notices[0], /diferentes/);
  assert.equal(JSON.stringify(app.context.state.comparisonSelection), before);
});

test('atualizar A mantém exportação bloqueada enquanto a escolha de B está pendente', () => {
  const app = setup();
  app.click('capture');
  app.context.state.comparisonSelection.draft = {A: 'compact', B: 'compact'};
  app.select.B = 'compact';
  app.click('capture-A');
  assert.deepEqual(app.notices, []);
  assert.equal(app.context.state.comparisonSelection.B.id, 'base');
  assert.equal(app.stale(), true);
  app.click('json');
  assert.match(app.notices[0], /Atualize/);
});

test('atualizar A após mudança de terreno conserva B e sinaliza divergência até atualizar B', () => {
  const app = setup();
  app.click('capture');
  const savedB = JSON.stringify(app.context.state.comparisonSelection.B);
  app.context.state.lot.id = 'outro-terreno';
  app.click('capture-A');
  assert.equal(JSON.stringify(app.context.state.comparisonSelection.B), savedB);
  assert.equal(app.context.state.comparisonSelection.report.differentParcel, true);
  assert.equal(app.stale(), true);
  app.click('capture-B');
  assert.equal(app.stale(), false);
});
