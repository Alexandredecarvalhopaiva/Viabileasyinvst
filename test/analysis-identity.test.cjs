const {test}=require('node:test'),assert=require('node:assert/strict'),identity=require('../dist/analysis-identity.js');
test('Reabrir geometria com arredondamento numérico e alterar a frente não cria outra cobrança',()=>{
 const base={area:600,width:20,depth:30,lat:-7.08,lng:-34.83,geometry:{metricCoordinates:[[0,0],[20,0],[20,30],[0,30]],crs:'local'}};
 const rebuilt=JSON.parse(JSON.stringify(base));rebuilt.area=599.9999998;rebuilt.width=30;rebuilt.depth=20;rebuilt.geometry.metricCoordinates[1][0]=20.00000001;
 assert.equal(identity.key(base),identity.key(rebuilt));
 rebuilt.geometry.metricCoordinates[1][0]=21;assert.notEqual(identity.key(base),identity.key(rebuilt));
});
test('Medidas ou localização de outro terreno mudam a identidade; nome e premissas não mudam',()=>{
 const base={area:600,width:20,depth:30,lat:-7.08,lng:-34.83};
 assert.equal(identity.key(base),identity.key({...base,name:'Outro nome',price:9000,floors:10}));
 assert.notEqual(identity.key(base),identity.key({...base,lat:-7.1}));
 assert.notEqual(identity.key(base),identity.key({...base,width:30,depth:20}));
});
