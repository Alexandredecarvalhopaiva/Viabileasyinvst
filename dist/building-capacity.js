/* A documented floor count is a user-supplied reference, never a legal approval. */
const BuildingCapacity=(()=>{
 const MAX_FLOORS=80;
 function document(input={}){
  const raw=input.maxFloors,value=raw===null||raw===undefined||String(raw).trim()===''?NaN:Number(raw);
  const reference=String(input.reference||'').trim();
  if(!Number.isInteger(value)||value<0||value>MAX_FLOORS||!reference)return null;
  let url=null;
  if(input.url){try{const parsed=new URL(input.url);if(['https:','http:'].includes(parsed.protocol))url=parsed.href}catch{}}
  return {maxFloors:value,reference:reference.slice(0,250),url,verified:false};
 }
 function resolve(lot,config,plates=[]){
  const source=document(lot.buildingLimit),simulatedFloors=config.floors;
  const modeledFloors=plates.filter(plate=>plate.area>.01).length;
  return {status:source?'document':'pending',simulatedFloors,modeledFloors,maxFloors:source?.maxFloors??null,source,
   aboveReference:source?simulatedFloors>source.maxFloors:false,remaining:source?Math.max(0,source.maxFloors-simulatedFloors):null,
   legalValidation:false,counting:'Térreo e pavimentos acima do solo; sem subsolos ou cobertura especial.',heightPerFloor:3};
 }
 const describe=n=>n===0?'Nenhum pavimento':n===1?'Somente térreo':`Térreo + ${n-1} ${n===2?'andar':'andares'}`;
 const count=n=>`${n} ${Number(n)===1?'pavimento':'pavimentos'}`;
 return {MAX_FLOORS,document,resolve,describe,count};
})();
if(typeof module!=='undefined')module.exports=BuildingCapacity;
