const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx={URL,proj4:require('../dist/vendor/geometry/proj4.js'),ClipperLib:require('../dist/vendor/geometry/clipper.js'),module:{exports:{}}};vm.createContext(ctx);
for(const file of ['parcel-geometry','setback-rules','building-capacity'])vm.runInContext(fs.readFileSync('dist/'+file+'.js','utf8'),ctx);
vm.runInContext(fs.readFileSync('dist/report-engine.js','utf8'),ctx);
vm.runInContext('this.G=ParcelGeometry;',ctx);ctx.getLotGeometry=l=>l.geometry;
// Synthetic demonstration fixtures use an internal option that the public API never reads from client data.
vm.runInContext('this.calculate=(lot,config)=>ReportEngine.calculate({...lot,geometry:getLotGeometry(lot)},config,{Geometry:ParcelGeometry,Setbacks:SetbackRules,Capacity:BuildingCapacity},{demonstration:true});',ctx);
const fixture=()=>({id:'feedback-12x30',area:360,width:12,depth:30,geometry:ctx.G.rectangle(12,30),urbanContext:{mode:'catalog',zone:'ZH1',coastal:'outside',regime:'ordinary',roadClass:'local',macrozone:'MAD1'}});
const config={floors:6,to:50,efficiency:76,unitArea:70,use:'H3',price:8200,cost:2700,landPrice:100000,indirect:22,profit:18};
test('Relatório não usa CA 2/3 universais e declara a outorga acima do básico',()=>{
 const c=ctx.calculate(fixture(),config);assert.equal(c.baseCa,1);assert.equal(c.maxCa,6);assert.ok(c.outorga.excessArea>0);assert.equal(c.outorga.status,'pending');
});
test('Lâmina do sexto pavimento com 4,8 m não recebe UH; elevador e gerador ficam no orçamento',()=>{
 const c=ctx.calculate(fixture(),config);assert.ok(Math.abs(c.floorPlates[5].width-4.8)<.01);assert.equal(c.floorPlates[5].units,0);
 assert.equal(c.equipment.elevator.required,true);assert.equal(c.equipment.generator.required,true);assert.equal(c.financial.complete,false);
});
test('Nota B é comparada e permeabilidade da ZH1 deixa de ser 20%',()=>{
 const c=ctx.calculate(fixture(),config);assert.equal(c.permeability,10);assert.equal(c.noteB.status,'conditional');
 assert.equal(c.noteB.result.permeability,5);assert.equal(c.noteB.result.floors,4);assert.equal(c.noteB.result.equipment.elevator.required,false);
});
test('Vagas: regra H3 arredonda para cima; meta de produto e capacidade são independentes',()=>{
 vm.runInContext('this.E=ReportEngine;',ctx);
 assert.equal(ctx.E.minimumParking({zone:'ZH-1',use:'H3',units:9,unitArea:70}),5);
 assert.equal(ctx.E.minimumParking({zone:'ZH1',use:'H3',units:9,unitArea:30}),3);
 for(const zone of ['ZCS-1','ZCS-2','ZCS-3','ZCS-4'])assert.equal(ctx.E.minimumParking({zone,use:'H3',units:9,unitArea:70}),0);
 const c=ctx.calculate(fixture(),config);assert.equal(c.parkingRules.capacity,null);assert.equal(c.parkingRules.productTarget,c.units);assert.equal(c.parkingRules.directFrontageIllustration,4);
 const lot=fixture();lot.urbanContext.parkingLayout={capacity:2,reference:'Prancha informada pelo usuário, não validada'};
 const constrained=ctx.calculate(lot,config);assert.ok(constrained.parkingRules.productDeficit>0);assert.match(constrained.classification,/incompatível/);
});
test('Nota B não é aplicada a via arterial ou rodovia; nota C exige frente rodoviária',()=>{
 for(const roadClass of ['arterial','highway','']){const l=fixture();l.urbanContext.roadClass=roadClass;assert.equal(ctx.calculate(l,config).noteB.result,null)}
 const l=fixture();l.urbanContext.roads={0:'highway'};assert.equal(ctx.calculate(l,config).setbackRule.top.values.front,15);
 const b=ctx.calculate(fixture(),config).noteB.result;assert.equal(b.setbackRule.top.values.side,1.5);assert.equal(b.setbackRule.top.values.back,3);
});
test('IA máximo muda por macrozona; falta de macrozona não vira máximo 3',()=>{
 for(const [zone,maximum] of Object.entries({MAD1:6,MAD2:4,MAD3:2,MBD:1,MPA:1})){const l=fixture();l.urbanContext.macrozone=zone;const r=ctx.calculate(l,config);assert.equal(r.maxCa,maximum);assert.ok(r.gross<=360*maximum+1e-6)}
 const l=fixture();delete l.urbanContext.macrozone;const r=ctx.calculate(l,config);assert.equal(r.maxCa,null);assert.ok(r.pendings.some(p=>p.id==='macrozone'));
});
test('Orla é revisão especial, zona não coberta não tem UH, flat e comercial têm uso pendente',()=>{
 const l=fixture();l.coastal=true;const r=ctx.calculate(l,config);assert.equal(r.classification,'revisão especial');assert.equal(r.legalValidation,false);
 for(const zone of ['ZCS1','ZEPA','ZI']){const x=fixture();x.urbanContext.zone=zone;const c=ctx.calculate(x,config);assert.equal(c.gross,null);assert.equal(c.units,null);assert.equal(c.residual,null);assert.equal(c.calculationStatus,'identification_only')}
 for(const use of ['Flats','Comercial'])assert.equal(ctx.calculate(fixture(),{...config,use}).pendings.find(p=>p.id==='use').status,'pending');
});
test('Núcleo fixo substitui eficiência e balanço não é criado implicitamente',()=>{
 const c=ctx.calculate(fixture(),{...config,floors:4});assert.equal(c.coreArea,20);assert.equal(c.floorPlates[0].balconyArea,0);
 assert.equal(c.privateArea,ctx.calculate(fixture(),{...config,floors:4,efficiency:10}).privateArea);
 const b=ctx.calculate(fixture(),{...config,floors:4,balconyProjectionMeters:.5});assert.equal(b.floorPlates[0].balconyArea,0);assert.ok(b.floorPlates[1].balconyArea>0);assert.ok(b.pendings.some(p=>p.id==='balcony'));
});
test('Valor presente exige todos os orçamentos e Selic com data; despesas são conciliadas ao fluxo',()=>{
 const finance={elevatorCost:80000,generatorCost:20000,projectsFloor:10000,registrationCost:8000,outorgaCost:9000,discount:{annualRate:.12,date:'2026-10-01',source:'Referência sintética de teste, não Selic atual'}};
 const c=ctx.calculate(fixture(),{...config,finance}),f=c.financial;assert.equal(f.complete,true);
 assert.ok(Math.abs(f.cashflow.reduce((s,r)=>s+r.expense,0)-f.nonLand)<.01);
 const expected=f.cashflow.reduce((s,r)=>s+(r.revenue-r.expense-r.targetProfit)/1.12**(r.month/12),0)/1.03;
 assert.ok(Math.abs(c.residual-expected)<.01);assert.ok(Math.abs(f.residualStatic-(f.vgv-f.nonLand-f.targetProfit)/1.03)<.01);
 for(const key of ['elevatorCost','generatorCost','projectsFloor','registrationCost','outorgaCost']){const partial={...finance};delete partial[key];const r=ctx.calculate(fixture(),{...config,finance:partial});assert.equal(r.residual,null);assert.equal(r.financial.complete,false)}
 assert.equal(ctx.calculate(fixture(),{...config,finance:{...finance,discount:{annualRate:.12}}}).residual,null);
 assert.equal(ctx.calculate(fixture(),{...config,finance:{...finance,discount:{...finance.discount,date:'2026-02-31'}}}).residual,null);
 assert.throws(()=>ctx.calculate(fixture(),{...config,finance:{...finance,constructionMonths:1.5}}));
});
test('Nota B não mistura TO/TAP especiais com recuos pendentes de orla ou regime',()=>{
 for(const override of [{coastal:''},{coastal:'inside'},{regime:'special'},{mode:'demo'},{mode:'manual',front:7,side:2,back:3,reference:'Documento informado'}]){
  const l=fixture();Object.assign(l.urbanContext,override);const r=ctx.calculate(l,{...config,floors:4,to:55,regimeVariant:'note-b'});
  assert.equal(r.regimeVariant,'general');assert.equal(r.permeability,10);assert.equal(r.toMax,50);assert.equal(r.noteB.result,null);
 }
});
