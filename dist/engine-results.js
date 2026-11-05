/* One current-result cache. A response for old inputs is never displayed for new inputs. */
const EngineResults=(()=>{
 const keys=['floors','to','unitArea','use','price','cost','landPrice','profit','finance','regimeVariant','balconyProjectionMeters'];
 const payload=(lot,config)=>({lot,scenario:Object.fromEntries(keys.map(k=>[k,config[k]]))});
 const identity=(lot,config)=>JSON.stringify(payload(lot,config));
 let cached=null,inFlight=null,timer=null,scheduledKey=null,selectedKey=null,error=null,failedKey=null,generation=0;
 function cancel(){
  generation++;clearTimeout(timer);timer=null;scheduledKey=null;
  const previous=inFlight;inFlight=null;previous?.controller.abort();
 }
 function get(lot,config){const key=identity(lot,config);return cached?.key===key?cached.result:null}
 function schedule(lot,config,done){
  const key=identity(lot,config);
  if(selectedKey!==key){cancel();selectedKey=key;error=null;}
  if(cached?.key===key||inFlight?.key===key||scheduledKey===key||failedKey===key)return;
  const requestedGeneration=generation;scheduledKey=key;
  timer=setTimeout(async()=>{
   if(requestedGeneration!==generation||selectedKey!==key)return;
   timer=null;scheduledKey=null;error=null;
   const task={key,controller:new AbortController()};inFlight=task;
   const active=()=>inFlight===task&&selectedKey===key&&generation===requestedGeneration;
   const timeout=AbortSignal.timeout(10000);
   timeout.addEventListener('abort',()=>task.controller.abort(),{once:true});
   try{const response=await fetch('/api/calculate',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Viabileasy-Request':'1'},body:key,signal:task.controller.signal});
    if(!response.ok)throw Error('Cálculo no servidor indisponível; prévia demonstrativa local.');
    const text=await response.text();if(text.length>4000000)throw Error('Resposta de cálculo excede o limite.');const result=JSON.parse(text);
    if(result.schema!=='VIABILEASY_ANALYSIS_V1'||!result.engine?.version||!Array.isArray(result.floorPlates)||!Array.isArray(result.pendings)||!(Number.isFinite(result.gross)||result.gross===null&&result.calculationStatus==='identification_only')||!result.financial||!result.setbackRule)throw Error('Resposta de cálculo inválida.');
    if(active()){cached={key,result};failedKey=null;done();}
   }catch(e){if(active()){error=task.controller.signal.aborted?'Cálculo no servidor excedeu o prazo; prévia demonstrativa local.':e.message;failedKey=key;done();}}
   finally{if(active())inFlight=null}
  },250);
 }
 return {get,schedule,get error(){return error},retry(){cancel();selectedKey=null;failedKey=null;cached=null;error=null}};
})();
if(typeof module!=='undefined')module.exports=EngineResults;
