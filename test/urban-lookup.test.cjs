const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ctx={URLSearchParams,ClipperLib:require('../dist/vendor/geometry/clipper.js'),module:{exports:{}}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync('dist/urban-lookup.js','utf8'),ctx);const U=ctx.module.exports;
const plain=value=>JSON.parse(JSON.stringify(value));
const rect=(w,s,e,n)=>[[w,s],[e,s],[e,n],[w,n],[w,s]];
const lot=(ring=rect(-34.861,-7.111,-34.8608,-7.1108))=>({custom:true,lat:-7.1109,lng:-34.8609,geometry:{geographic:ring,front:0,back:2}});
const feature=(zone,ring=rect(-34.862,-7.112,-34.86,-7.11))=>({type:'Feature',properties:{sigla:zone},geometry:{type:'Polygon',coordinates:[ring]}});
const data=features=>({features,source:{layer:'digeoc:zoneamento2024',retrievedAt:'2026-11-03T00:00:00Z'}});
test('O perímetro recebe zona e parâmetros documentais sem inferir aprovação, orla ou regime',()=>{
 const l=lot(),r=U.resolve(l,data([feature('ZH-4')]));
 assert.equal(r.status,'identified');assert.equal(r.zone,'ZH4');assert.equal(r.occupation.to,50);assert.equal(r.occupation.permeability,15);
 assert.equal(r.legalValidation,false);assert.equal(r.occupation.source.legalValidation,false);
 U.apply(l,r);assert.equal(l.urbanContext.zone,'ZH4');assert.equal(l.urbanContext.coastal,'');assert.equal(l.urbanContext.regime,'');
});
test('Dois lotes com iguais dimensões em locais diferentes não reutilizam referências',()=>{
 const l=lot();l.urbanContext={zone:'ZH1'};l.buildingLimit={maxFloors:8};l.territory=U.resolve(l,data([feature('ZH1')]));
 const moved=lot(l.geometry.geographic.map(([x,y])=>[x+.01,y]));
 assert.notEqual(U.key(l),U.key(moved));U.carry(l,moved);assert.equal(moved.urbanContext,undefined);assert.equal(moved.buildingLimit,undefined);
 assert.equal(U.apply(moved,l.territory),false);
 const same=lot();U.carry(l,same);assert.deepEqual(plain(same.urbanContext),l.urbanContext);same.urbanContext.zone='ZH5';assert.equal(l.urbanContext.zone,'ZH1');
});
test('Ponto sem perímetro só sugere zona e nunca aplica enquadramento',()=>{
 const l={lat:-7.111,lng:-34.861};const r=U.resolve(l,data([feature('ZH1')]));
 assert.equal(r.status,'approximate');U.apply(l,r);assert.equal(l.urbanContext,undefined);
 assert.equal(U.query({width:20,depth:30}),null);
 for(const bad of [{lat:null,lng:null},{lat:-7.1,lng:NaN},{lat:0,lng:0}])assert.equal(U.query(bad),null);
});
test('Polígono multizona, cobertura parcial e contato com borda não escolhem a maior zona',()=>{
 const l=lot(rect(-34.861,-7.111,-34.8606,-7.1108));
 const a=feature('ZH1',rect(-34.862,-7.112,-34.8608,-7.11)),b=feature('ZH3',rect(-34.8608,-7.112,-34.86,-7.11));
 assert.equal(U.resolve(l,data([a,b])).status,'ambiguous');
 assert.equal(U.resolve(l,data([a])).status,'ambiguous');
 assert.equal(U.resolve(l,data([feature('ZH1',l.geometry.geographic)])).status,'ambiguous');
});
test('Furos e geometria côncava são recortados, não classificados só pelos vértices',()=>{
 const f=feature('ZH1');f.geometry.coordinates.push(rect(-34.8611,-7.1111,-34.8607,-7.1107));
 assert.equal(U.resolve(lot(),data([f])).status,'not_found');
 const split=feature('ZH1',[[ -34.862,-7.112],[-34.86,-7.112],[-34.86,-7.1109],[-34.8609,-7.1109],[-34.8609,-7.1107],[-34.86,-7.1107],[-34.86,-7.11],[-34.862,-7.11],[-34.862,-7.112]]);
 assert.notEqual(U.resolve(lot(),data([split])).status,'identified');
});
test('Não sobrescreve exceção técnica ou converte zona fora de catálogo em índices padrão',()=>{
 const l=lot();l.urbanContext={mode:'manual',front:7};const r=U.resolve(l,data([feature('ZCS1')]));
 assert.equal(r.occupation,null);U.apply(l,r);assert.equal(l.urbanContext.mode,'manual');assert.equal(l.urbanContext.front,7);
 assert.equal(U.resolve(l,data([])).status,'not_found');
 assert.throws(()=>U.resolve(l,data([feature('sem código válido')])));
});
test('Mesma geometria local movida pelo ponto perde o enquadramento; edição de frente também invalida',()=>{
 const a={lat:-7.11,lng:-34.86,geometry:{vertices:[[0,0],[20,0],[20,30],[0,30]],front:0,back:2},urbanContext:{zone:'ZH1'}};
 const b={...a,lat:-7.12};delete b.urbanContext;U.carry(a,b);assert.equal(b.urbanContext,undefined);
 assert.notEqual(U.key(a),U.key({...a,geometry:{...a.geometry,front:1}}));
});
test('Nova consulta ambígua ou indisponível remove seleção automática anterior e preserva ajuste técnico',()=>{
 const l=lot();U.apply(l,U.resolve(l,data([feature('ZH1')])));
 assert.equal(l.urbanContext.zone,'ZH1');
 U.apply(l,{key:U.key(l),status:'error'});assert.equal(l.urbanContext,undefined);assert.equal(l.zone,'Não identificado');
 U.apply(l,U.resolve(l,data([feature('ZH1')])));
 U.apply(l,{key:U.key(l),status:'ambiguous'});assert.equal(l.urbanContext,undefined);
 l.urbanContext={mode:'manual',front:8};U.apply(l,{key:U.key(l),status:'error'});assert.equal(l.urbanContext.front,8);
});
test('Atualização preserva condições confirmadas e identifica divergência com a zona consultada',()=>{
 const l=lot();U.apply(l,U.resolve(l,data([feature('ZH1')])));
 Object.assign(l.urbanContext,{coastal:'outside',regime:'ordinary',macrozone:'MAD1',roadClass:'local'});
 U.apply(l,U.resolve(l,data([feature('ZH2')])));
 assert.equal(l.urbanContext.zone,'ZH1');assert.equal(l.urbanContext.macrozone,'MAD1');assert.equal(l.urbanContext.coastal,'outside');
 assert.equal(l.territory.contextConflict,true);
 U.apply(l,{key:U.key(l),status:'error'});assert.equal(l.urbanContext.regime,'ordinary');
});
test('Documento técnico não volta a automático mesmo quando um estudo antigo conservou origin=territory',()=>{
 const l=lot();l.urbanContext={origin:'territory',mode:'manual',front:7,side:2,back:4,reference:'Certidão do usuário'};
 U.apply(l,U.resolve(l,data([feature('ZH1')])));assert.equal(l.urbanContext.mode,'manual');assert.equal(l.urbanContext.front,7);
});
