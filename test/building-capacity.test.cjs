const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const B=require('../dist/building-capacity.js');
const reference={maxFloors:8,reference:'Certidão de teste · item 4 · 21/10/2026',url:'https://example.test/certidao'};
const plates=n=>Array.from({length:n},(_,i)=>({floor:i+1,area:100}));
test('O teto do simulador e os recuos não viram autorização de pavimentos',()=>{
 for(const lot of [{},{urbanContext:{mode:'catalog',zone:'ZH1'}},{buildingLimit:{maxFloors:8}},{buildingLimit:{maxFloors:'',reference:'Certidão'}},{buildingLimit:{maxFloors:null,reference:'Certidão'}}]){
  const result=B.resolve(lot,{floors:8},plates(8));
  assert.equal(result.status,'pending');assert.equal(result.maxFloors,null);assert.equal(result.legalValidation,false);
 }
});
test('Referência documental compara o cenário sem alterar ou aprovar a massa',()=>{
 const below=B.resolve({buildingLimit:reference},{floors:6},plates(6));
 assert.equal(below.maxFloors,8);assert.equal(below.remaining,2);assert.equal(below.aboveReference,false);assert.equal(below.source.verified,false);
 const over=B.resolve({buildingLimit:reference},{floors:10},plates(10));
 assert.equal(over.aboveReference,true);assert.equal(over.simulatedFloors,10);assert.equal(over.modeledFloors,10);assert.equal(over.legalValidation,false);
 assert.match(B.describe(8),/Térreo \+ 7 andares/);assert.equal(B.describe(1),'Somente térreo');
});
test('Zero é referência explícita de ausência de pavimentos, nunca campo vazio',()=>{
 const result=B.resolve({buildingLimit:{...reference,maxFloors:0}},{floors:1},plates(1));
 assert.equal(result.maxFloors,0);assert.equal(result.aboveReference,true);
 for(const value of [-1,1.5,81,Infinity,'abc'])assert.equal(B.document({...reference,maxFloors:value}),null);
 assert.equal(B.document({...reference,url:'javascript:alert(1)'}).url,null);
});
test('O resumo identifica pavimentos sem área após os recuos',()=>{
 const result=B.resolve({}, {floors:3},[{floor:1,area:120},{floor:2,area:90},{floor:3,area:0}]);
 assert.equal(result.simulatedFloors,3);assert.equal(result.modeledFloors,2);
});
test('Cálculo de um terreno mantém limite documental separado da capacidade geométrica',()=>{
 const ctx={proj4:require('../dist/vendor/geometry/proj4.js'),ClipperLib:require('../dist/vendor/geometry/clipper.js'),module:{exports:{}},BuildingCapacity:B};vm.createContext(ctx);
 vm.runInContext(fs.readFileSync('dist/parcel-geometry.js','utf8')+'\nthis.G=ParcelGeometry;',ctx);
 vm.runInContext(fs.readFileSync('dist/setback-rules.js','utf8'),ctx);
 const app=fs.readFileSync('dist/app.js','utf8');ctx.getLotGeometry=lot=>lot.geometry;
 vm.runInContext(app.slice(app.indexOf('function calc('),app.indexOf('function miniMap('))+'\nthis.calculate=calc;',ctx);
 const lot={area:600,geometry:ctx.G.rectangle(20,30),buildingLimit:{...reference,maxFloors:4},urbanContext:{mode:'catalog',zone:'ZH1',coastal:'outside',regime:'ordinary'}};
 const config={floors:8,to:50,efficiency:76,unitArea:70,use:'H3',price:8200,cost:2700,landPrice:100000,indirect:22,profit:18};
 const result=ctx.calculate(lot,config);assert.equal(result.buildingCapacity.aboveReference,true);assert.equal(result.floorPlates.length,8);
 assert.equal(result.height,24);assert.equal(result.buildingCapacity.source.reference,reference.reference);
 lot.geometry=ctx.G.rectangle(4,6);lot.area=24;assert.equal(ctx.calculate(lot,config).buildingCapacity.modeledFloors,0);
});
