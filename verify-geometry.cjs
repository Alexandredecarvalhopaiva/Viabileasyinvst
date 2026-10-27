const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');const root=process.cwd();
const ctx={proj4:require(root+'/dist/vendor/geometry/proj4.js'),ClipperLib:require(root+'/dist/vendor/geometry/clipper.js'),module:{exports:{}}};vm.createContext(ctx);vm.runInContext(fs.readFileSync('dist/parcel-geometry.js','utf8'),ctx);const G=ctx.module.exports;let checks=0;const near=(a,b,e=1e-6)=>{assert.ok(Math.abs(a-b)<=e,`${a} ≠ ${b}`);checks++};
const rect=G.rectangle(12,30);near(rect.area,360);near(rect.perimeter,84);near(G.inset(rect).area,120);near(G.rectangle(12.5,30.5).area,381.25);
assert.equal(G.rectangle(-12,30).valid,false);assert.equal(G.rectangle(0,30).valid,false);checks+=2;
const trap=G.trapezoid(12,20,30);near(trap.area,480);near(G.inset(trap).area,198.9380323966276);near(G.trapezoid(12,20,30,8).area,480);
const cw=G.build([[0,0],[0,30],[12,30],[12,0]],{front:3,back:1});near(G.inset(cw).area,120);
for(const points of [[[0,0],[10,10],[0,10],[10,0]],[[0,0],[0,0],[10,10]],[[0,0],[10,0],[5,0]],[[0,0],[10,0],[10,10],[0,0],[0,10]]]){assert.equal(G.build(points).valid,false);checks++}
assert.equal(G.build([[0,0],[10,0],[0,10]],{closed:false}).valid,false);checks++;
const triangle=G.build([[0,0],[20,0],[0,20]]);near(triangle.area,200);assert.equal(G.inset(triangle).reason,'back_unspecified');checks++;
const seg=G.fromSegments([['12','90'],['30','0'],['12','270'],['30','180']],true,{front:0,back:2});near(seg.area,360);near(G.inset(seg).area,120);assert.equal(G.fromSegments([['12',''],['30','0'],['12','270']],true).valid,false);assert.equal(G.fromSegments([['12','90'],['30','0'],['12','270']],true).valid,false);checks+=2;
const concave=G.build([[0,0],[40,0],[40,20],[20,20],[20,40],[0,40]],{kind:'irregular'});near(concave.area,1200);near(G.inset(concave).area,500);assert.equal(G.inset(concave).method,'conservative_uniform');checks++;
for(const g of [rect,trap,concave,cw])for(const ratio of [.2,.5,.9,1]){const env=G.inset(g),target=env.largest*ratio,paths=G.footprint(g,target);near(paths.reduce((s,p)=>s+G.area(p),0),target,.02);assert.ok(paths.every(p=>!G.validate(p)));checks++}
const input=[[294500,9213000],[294512,9213000],[294512,9213030],[294500,9213030]];for(const crs of ['EPSG:31985','EPSG:32725']){const g=G.fromCoordinates(input.map(p=>p.map(String)),crs,{closed:true});assert.equal(g.valid,true);near(g.area,360,.0001);near(g.perimeter,84,.0001);checks++}
const geo=G.fromCoordinates([['-34.86','-7.115'],['-34.8598','-7.115'],['-34.8598','-7.1147'],['-34.86','-7.1147']],'EPSG:4326',{closed:true});assert.equal(geo.valid,true);assert.equal(geo.crs,'EPSG:31985');checks+=2;
vm.runInContext(fs.readFileSync('dist/building-capacity.js','utf8'),ctx);
const app=fs.readFileSync('dist/app.js','utf8'),calc=app.slice(app.indexOf('function calc('),app.indexOf('function miniMap('));vm.runInContext(fs.readFileSync('dist/setback-rules.js','utf8'),ctx);ctx.getLotGeometry=l=>l.geometry||G.rectangle(l.width,l.depth);ctx.ParcelGeometry=G;vm.runInContext(calc+'\nthis.calculate=calc;',ctx);
const configurations=[{floors:2,to:30,efficiency:85,unitArea:250,use:'H1'},{floors:6,to:50,efficiency:76,unitArea:70,use:'H3'},{floors:6,to:45,efficiency:80,unitArea:45,use:'C'},{floors:8,to:50,efficiency:72,unitArea:30,use:'F'}];
for(const g of [rect,trap,concave,triangle,G.rectangle(4,10)])for(const config of configurations){const lot={area:g.area,width:g.frontage,depth:g.depth,geometry:g},c=ctx.calculate(lot,{...config,price:8000,cost:2500,indirect:20,profit:18,landPrice:100000});assert.ok(c.footprint<=G.inset(g).largest+1e-8);assert.ok(c.footprint<=g.area*config.to/100+1e-8);assert.ok(c.gross<=g.area*3+1e-8);assert.ok(Number.isFinite(c.margin)&&c.units>=0);checks+=4}
console.log(`${checks} verificações geométricas e de limites passaram.`);
