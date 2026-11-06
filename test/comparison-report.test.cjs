const {test} = require('node:test');
const assert = require('node:assert/strict');
const Report = require('../dist/comparison-report.js');
const result = () => ({engine:{version:'demo-1',execution:'browser-demonstration',rulesetId:null},
  classification:'indeterminado',gross:null,units:0,parkingRules:{legalMinimum:null,capacity:0},
  pendings:[{status:'pending',message:'Uso a confirmar',source:{reference:'Fonte <oficial>',url:'https://example.test'}}]});
const inputs = () => ({lot:{id:'fixture',name:'Terreno <teste>',area:360},scenario:{use:'H3',floors:4}});
function pair() {
  return [Report.capture('compact','Compacto',inputs(),result()),Report.capture('base','Base',inputs(),result())];
}
test('captura conserva entradas e resultados após edição posterior', () => {
  const entry = inputs(), calculated = result();
  const snapshot = Report.capture('compact','Compacto',entry,calculated);
  entry.lot.area = 100; calculated.units = 20;
  assert.equal(snapshot.inputs.lot.area,360); assert.equal(snapshot.result.units,0);
  const [a,b] = pair(), manifest = Report.manifest(a,b);
  a.result.units = 99;
  assert.equal(manifest.alternatives[0].result.units,0);
});
test('diferenças mantêm ausente separado de zero e correspondem aos snapshots', () => {
  const [a,b] = pair(); b.result.units=4;
  const report = Report.manifest(a,b);
  assert.equal(report.differences.find(item=>item.key==='units').value,4);
  assert.equal(report.differences.find(item=>item.key==='gross').value,null);
  assert.deepEqual(JSON.parse(JSON.stringify(report)).alternatives,[a,b]);
});
test('manifesta terrenos e bases divergentes e exige duas alternativas', () => {
  const [a,b] = pair(); b.inputs.lot.id='other'; b.result.engine.version='demo-2';
  const report=Report.manifest(a,b);
  assert.equal(report.differentParcel,true); assert.equal(report.differentRulebase,true);
  assert.throws(()=>Report.manifest(a,a),/diferentes/); assert.throws(()=>Report.manifest(a,null),/Selecione/);
});
test('prévia e documento imprimível compartilham conteúdo escapado e procedência', () => {
  const [a,b] = pair(); b.result.engine.execution='server-demonstration';
  const report=Report.manifest(a,b), html=Report.render(report);
  assert.ok(Report.documentHTML(report).includes(html));
  assert.match(html,/Prévia local/); assert.match(html,/Servidor/);
  assert.match(html,/Pendente/); assert.match(html,/Fonte &lt;oficial&gt;/);
  assert.ok(!html.includes('Terreno <teste>'));
});

test('fixture de diferença de área reproduz 1.200 menos 1.120 igual a 80', () => {
  const [a,b]=pair(); a.result.gross=1120; b.result.gross=1200;
  assert.equal(Report.manifest(a,b).differences.find(item=>item.key==='gross').value,80);
});
