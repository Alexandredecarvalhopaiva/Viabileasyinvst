const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function harness(width=15){
 const geometry=w=>({valid:true,area:w*30,frontage:w,depth:30,vertices:[[0,0],[w,0],[w,30],[0,30]],front:0,back:2,crs:'LOCAL_METERS'});
 const originalFinance={outorgaCost:9000,projectsFloor:10000};let cleared=0;
 const ctx={state:{lot:{id:'previous',custom:true,width:12,depth:30,area:360,geometry:geometry(12)},finance:{...originalFinance},regimeVariant:'note-b',balconyProjectionMeters:.5,savedCustom:{previous:{scenario:{finance:{...originalFinance}}}}},
  lots:[{id:'example'}],document:{addEventListener(){}},newParcelDraft:()=>({}),EngineResults:{retry(){cleared++}},parcelDraftGeometry:()=>geometry(width),parcelDraft:()=>({name:'Terreno revisado',mode:'rectangle'}),
  simplePoint:()=>null,parcelMapSvgPoints:()=>[],closeModal(){},refreshUrbanLookup:async()=>{},render(){},focusMain(){},window:{ViabilUsage:{run:fn=>fn()}}};
 vm.createContext(ctx);vm.runInContext(fs.readFileSync('dist/urban-lookup.js','utf8'),ctx);
 vm.runInContext(fs.readFileSync('dist/simple-flow.js','utf8'),ctx);
 // Registration obtains its point from the actual global function; this fixture has no location.
 vm.runInContext('simplePoint=()=>null',ctx);
 const s=fs.readFileSync('dist/parcel-form.js','utf8'),a=s.indexOf('async function confirmParcelAnalysis('),b=s.indexOf('\nfunction ',a);
 vm.runInContext(s.slice(a,b),ctx);return {ctx,cleared:()=>cleared};
}
test('Novo estudo não herda orçamento, nota B ou varanda do terreno anterior',()=>{
 const {ctx,cleared}=harness();vm.runInContext('resetSimpleStudy()',ctx);
 assert.equal(Object.keys(ctx.state.finance).length,0);assert.equal(ctx.state.regimeVariant,'general');assert.equal(ctx.state.balconyProjectionMeters,0);assert.equal(cleared(),1);
 assert.equal(ctx.state.savedCustom.previous.scenario.finance.outorgaCost,9000);
});
test('Editar a geometria invalida orçamentos; confirmar o mesmo perímetro preserva as premissas',async()=>{
 for(const width of [12,15]){const {ctx}=harness(width);await vm.runInContext('confirmParcelAnalysis()',ctx);assert.equal(ctx.state.lot.width,width);
  assert.equal(ctx.state.finance.outorgaCost,width===12?9000:undefined);assert.equal(ctx.state.regimeVariant,width===12?'note-b':'general');
 }
});
