import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateAnalysis} from '../server/calculate.mjs';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);

const input = () => ({
  lot: {id: 'real-lot', custom: true, zone: 'ZH1', width: 20, depth: 30},
  scenario: {floors: 4, to: 50, unitArea: 30, use: 'H3', price: 8200, cost: 2700, profit: 18}
});

test('AUT-04/07 mantém áreas construtivas, unidades e valores derivados pendentes', () => {
  const result = calculateAnalysis(input());
  for (const field of ['gross', 'units', 'privateArea', 'sellable', 'footprint', 'totalBuilt',
    'vgv', 'residual', 'direct', 'indirect', 'ca', 'height', 'baseCa', 'maxCa', 'setbackArea']) {
    assert.equal(result[field], null, field);
  }
  assert.equal(result.calculationStatus, 'pending_rules');
  assert.equal(result.classification, 'indeterminado');
  assert.equal(result.geometry.area, 600);
  assert.equal(result.geometry.perimeter, 100);
  assert.deepEqual(result.floorPlates, []);
  assert.equal(result.financial.vgv, null);
  assert.equal(result.financial.nonLandKnown, null);
  assert.equal(result.parkingRules.legalMinimum, null);
  assert.equal(result.outorga.excessArea, null);
  assert.equal(result.noteB.result, null);
  assert.equal(result.legalValidation, false);
});

test('Estudos antigos e indicadores do cliente não habilitam regra homologada', () => {
  for (const extra of [{custom: undefined}, {custom: false},
    {legalValidation: true, normativeSnapshot: {status: 'validated', fields: {ca: 5}}},
    {urbanContext: {mode: 'manual', front: 1, side: 1, back: 1, reference: 'Documento'}}]) {
    const data = input();Object.assign(data.lot, extra);
    assert.equal(calculateAnalysis(data).units, null);
  }
});

test('Somente exemplos cadastrados produzem estimativas explicitamente demonstrativas',()=>{
 const data=input();
 data.lot={id:'024',width:30,depth:40,lat:-7.0816,lng:-34.8368};
 const example=calculateAnalysis(data);
 assert.equal(example.engine.demonstration,true);
 assert.equal(example.calculationStatus,'demonstration');
 assert.ok(example.units>0);
 assert.equal(example.legalValidation,false);
 for(const changed of [{...data.lot,custom:true},{...data.lot,width:20},
  {...data.lot,lat:-7.1},{...data.lot,id:'real-lot'}]){
  assert.equal(calculateAnalysis({...data,lot:changed}).units,null);
 }
});

test('Fallback local e JSON mantêm o mesmo snapshot e resultados pendentes da API',()=>{
 const ctx={URL,proj4:require('../dist/vendor/geometry/proj4.js'),ClipperLib:require('../dist/vendor/geometry/clipper.js')};
 vm.createContext(ctx);
 for(const name of ['parcel-geometry','setback-rules','building-capacity','normative-context','report-engine']){
  vm.runInContext(readFileSync('dist/'+name+'.js','utf8'),ctx);
 }
 vm.runInContext('this.G=ParcelGeometry;',ctx);
 ctx.getLotGeometry=l=>l.geometry;
 const app=readFileSync('dist/app.js','utf8');
 vm.runInContext(app.slice(app.indexOf('function calc('),app.indexOf('function miniMap('))+'\nthis.calculate=calc;',ctx);
 const data=input();data.lot.geometry=ctx.G.rectangle(20,30);
 data.scenario.analysisDate='2026-11-05';data.scenario.sourceVersions={fixture:{version:'v1',hash:'synthetic-v1'}};
 const local=JSON.parse(JSON.stringify(ctx.calculate(data.lot,data.scenario)));
 const api=calculateAnalysis(JSON.parse(JSON.stringify(data)));
 assert.equal(local.units,null);assert.equal(api.units,null);
 assert.deepEqual(local.normativeSnapshot,api.normativeSnapshot);
 assert.deepEqual(local.geometry,api.geometry);
 const restored=JSON.parse(JSON.stringify({lot:{...data.lot,normativeSnapshot:local.normativeSnapshot},scenario:data.scenario}));
 assert.deepEqual(calculateAnalysis(restored).normativeSnapshot,api.normativeSnapshot);
 const form=readFileSync('dist/parcel-form.js','utf8');
 const start=form.indexOf('function parcelMetricsView('),end=form.indexOf('\nfunction ',start+1);
 ctx.number=value=>value==null?'Pendente':String(value);
 ctx.state={...data.scenario,lot:data.lot};
 vm.runInContext(form.slice(start,end)+'\nthis.metrics=parcelMetricsView;',ctx);
 assert.doesNotMatch(ctx.metrics(data.lot),/recuos eliminam/i);
});
