/* One current-result cache. A response for old inputs is never displayed for new inputs. */
const EngineResults=(()=>{
 const keys=['floors','to','unitArea','use','price','cost','landPrice','profit','finance','regimeVariant','balconyProjectionMeters'];
 const payload=(lot,config)=>({lot,scenario:Object.fromEntries(keys.map(k=>[k,config[k]]))});
 const identity=(lot,config)=>JSON.stringify(payload(lot,config));
 let cached=null,pending=null,timer=null,error=null,failedKey=null;
 function get(lot,config){const key=identity(lot,config);return cached?.key===key?cached.result:null}
 function schedule(lot,config,done){const body=payload(lot,config),key=JSON.stringify(body);if(cached?.key===key||pending===key||failedKey===key)return;
  clearTimeout(timer);timer=setTimeout(async()=>{pending=key;error=null;
   try{const response=await fetch('/api/calculate',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Viabileasy-Request':'1'},body:key,signal:AbortSignal.timeout(10000)});
    if(!response.ok)throw Error('Cálculo no servidor indisponível; prévia demonstrativa local.');
    const text=await response.text();if(text.length>4000000)throw Error('Resposta de cálculo excede o limite.');const result=JSON.parse(text);
    if(result.schema!=='VIABILEASY_ANALYSIS_V1'||!result.engine?.version||!Array.isArray(result.floorPlates)||!Array.isArray(result.pendings)||!(Number.isFinite(result.gross)||result.gross===null&&result.calculationStatus==='identification_only')||!result.financial||!result.setbackRule)throw Error('Resposta de cálculo inválida.');
    if(pending===key){cached={key,result};failedKey=null;done();}
   }catch(e){if(pending===key){error=e.message;failedKey=key;done();}}
   finally{if(pending===key)pending=null}
  },250);
 }
 return {get,schedule,get error(){return error},retry(){failedKey=null;cached=null}};
})();
if(typeof module!=='undefined')module.exports=EngineResults;
