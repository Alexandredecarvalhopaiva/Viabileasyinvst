const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx={URL,proj4:require('../dist/vendor/geometry/proj4.js'),ClipperLib:require('../dist/vendor/geometry/clipper.js'),module:{exports:{}}};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync('dist/parcel-geometry.js','utf8')+'\nthis.G=ParcelGeometry;',ctx);
vm.runInContext(fs.readFileSync('dist/setback-rules.js','utf8')+'\nthis.R=SetbackRules;',ctx);
const {G,R}=ctx;
vm.runInContext(fs.readFileSync('dist/building-capacity.js','utf8'),ctx);
const app=fs.readFileSync('dist/app.js','utf8');
ctx.getLotGeometry=lot=>lot.geometry||G.rectangle(lot.width,lot.depth);
vm.runInContext(app.slice(app.indexOf('function calc('),app.indexOf('function miniMap('))+'\nthis.calculate=calc;',ctx);
const near=(a,b)=>assert.ok(Math.abs(a-b)<.02,a+' != '+b);
const plain=value=>JSON.parse(JSON.stringify(value));
const lot=(urbanContext={})=>({area:600,width:20,depth:30,coastal:false,geometry:G.rectangle(20,30),urbanContext});
const config={floors:8,to:50,efficiency:76,unitArea:70,use:'H3',price:8200,cost:2700,landPrice:100000,indirect:22,profit:18};
const context={mode:'catalog',zone:'ZH1',coastal:'outside',regime:'ordinary'};
test('Quadro documental: patamares por pavimento e diferenças entre zonas',()=>{
 const expected={
  ZH1:[[1,5,1.5,3],[3,5,1.5,3],[4,5,3,3],[5,5,3.3,3.3],[8,5,4.2,4.2]],
  ZH2:[[2,5,1.5,2],[3,5,1.5,3]],
  ZH3:[[1,5,1.5,3],[8,5,4.2,4.2]],
  ZH4:[[3,5,2,3],[4,5,4,3],[5,5,4.3,4.3],[8,5,5.2,5.2]],
  ZH5:[[2,5,1.5,3],[3,5,3,3],[8,5,4.2,4.2]]
 };
 for(const [zone,rows]of Object.entries(expected))for(const [n,front,side,back]of rows)assert.deepEqual(plain(R.minimum(zone,n)),{front,side,back});
 assert.equal(R.minimum('fora-do-catalogo',3),null);
});
test('Sem zona, orla resolvida e regime geral não se apresenta regra aplicável',()=>{
 for(const partial of [{},{...context,zone:''},{...context,zone:'ZCS1'},{...context,coastal:''},{...context,coastal:'inside'},{...context,regime:'special'},{...context,catalogId:'versao-diferente'}]){
  const l=lot(partial),result=R.resolve(l,config,l.geometry);
  assert.equal(result.resolved,false);assert.equal(result.status,'pending');assert.equal(result.legalValidation,false);
 }
 const l=lot(context);l.coastal=true;assert.equal(R.resolve(l,config,l.geometry).resolved,false);
});
test('Caso publicado 20x30: envelope 374 m² no térreo e 241,28 m² no oitavo',()=>{
 const l=lot(context),result=R.resolve(l,config,l.geometry);
 assert.equal(result.status,'conditional');assert.equal(result.source.verified,false);
 near(G.inset(l.geometry,{edgeOffsets:result.levels[0].edgeOffsets}).area,374);
 near(G.inset(l.geometry,{edgeOffsets:result.levels[7].edgeOffsets}).area,241.28);
 assert.match(result.source.url,/LC169/);
});
test('Esquina e rodovia: cada frente recebe seu próprio recuo',()=>{
 const l=lot({...context,streetEdges:[0,1],roads:{0:'highway',1:'urban'}});
 const result=R.resolve(l,{...config,floors:1},l.geometry);
 assert.deepEqual(plain(result.levels[0].edgeOffsets),[15,5,3,1.5]);
 assert.equal(result.top.values.front,15);
 near(G.inset(l.geometry,{edgeOffsets:result.top.edgeOffsets}).area,162);
});
test('Offset assimétrico respeita sentido do polígono e não reutiliza envelope antigo',()=>{
 const g=G.rectangle(20,30),first=G.inset(g,{edgeOffsets:[5,2,3,1.5]}),second=G.inset(g,{edgeOffsets:[5,4.2,4.2,4.2]});
 near(first.area,363);near(second.area,241.28);
 const a=G.footprint(g,200,first),b=G.footprint(g,200,second);
 near(a.reduce((sum,p)=>sum+G.area(p),0),200);near(b.reduce((sum,p)=>sum+G.area(p),0),200);
 assert.notDeepEqual(plain(a),plain(b));
 const cw=G.build([[0,0],[0,30],[20,30],[20,0]],{front:3,back:1});
 near(G.inset(cw,{edgeOffsets:[1.5,3,2,5]}).area,363);
});
test('A massa de cada pavimento respeita os recuos e a soma respeita CA/TO',()=>{
 const l=lot(context),c=ctx.calculate(l,config);
 near(c.gross,c.floorPlates.reduce((sum,p)=>sum+p.area,0));
 assert.ok(c.gross<=l.area*3+1e-6);
 for(const plate of c.floorPlates){
  assert.ok(plate.area<=l.area*config.to/100+1e-6);
  const shapes=G.footprint(l.geometry,plate.area,plate.envelope);
  near(shapes.reduce((sum,p)=>sum+G.area(p),0),plate.area);
  const offsets=c.setbackRule.levels[plate.floor-1].edgeOffsets;
  for(const ring of shapes)for(const [x,y]of ring){
   assert.ok(y>=offsets[0]-.001&&x<=20-offsets[1]+.001&&y<=30-offsets[2]+.001&&x>=offsets[3]-.001);
  }
 }
 assert.ok(c.floorPlates[7].area<c.floorPlates[0].area);
 assert.match(JSON.stringify(c.setbackRule),/JP-LC169-2024/);
});
test('Geometria côncava é conservadora e ausência de envelope gera massa zero',()=>{
 const g=G.build([[0,0],[40,0],[40,20],[20,20],[20,40],[0,40]],{front:0,back:2});
 const env=G.inset(g,{edgeOffsets:[5,1.5,3,1.5,1.5,1.5]});
 assert.equal(env.method,'conservative_uniform');assert.equal(env.uniform,5);
 const l=lot(context);l.geometry=G.rectangle(4,6);l.area=24;l.width=4;l.depth=6;
 const c=ctx.calculate(l,config);assert.equal(c.gross,0);assert.equal(c.footprint,0);
});
test('Documento exige valores explícitos e aceita zero somente quando informado',()=>{
 const invalid=lot({mode:'manual',front:null,side:null,back:null,reference:'Documento de teste'});
 assert.equal(R.resolve(invalid,config,invalid.geometry).resolved,false);
 const l=lot({mode:'manual',front:4,side:0,back:2,reference:'Certidão informada pelo usuário'});
 const r=R.resolve(l,config,l.geometry);
 assert.equal(r.status,'document');assert.equal(r.source.verified,false);
 assert.deepEqual(plain(r.top.edgeOffsets),[4,0,2,0]);
});

test('Referência de PDF preserva o link sem validar o documento ou aceitar protocolos ativos',()=>{
 const l=lot({mode:'manual',front:5,side:1.5,back:3,reference:'Certidão anexada',url:'http://127.0.0.1:4173/api/documents/arquivo/file'});
 const result=R.resolve(l,config,l.geometry);
 assert.equal(result.source.url,l.urbanContext.url);assert.equal(result.source.verified,false);assert.equal(result.legalValidation,false);
 l.urbanContext.url='javascript:alert(1)';assert.equal(R.resolve(l,config,l.geometry).source.url,null);
});
