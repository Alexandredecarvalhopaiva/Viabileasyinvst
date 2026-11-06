/* Reproducible normative inputs and unapproved technical proposals. No client data grants legal validation. */
const NormativeContext=(()=>{
 const SCHEMA='VIABILEASY_NORMATIVE_V1';
 const copy=value=>JSON.parse(JSON.stringify(value));
 function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])]));
  return value;
 }
 function request(lot,config){
  const g=lot.geometry||{},context=lot.urbanContext||{};
  if(config.analysisDate!=null&&config.analysisDate!==''&&(typeof config.analysisDate!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(config.analysisDate)||
   !Number.isFinite(Date.parse(config.analysisDate))||new Date(config.analysisDate).toISOString().slice(0,10)!==config.analysisDate))throw Error('Data normativa inválida.');
  const versions=config.sourceVersions||{};
  if(typeof versions!=='object'||Array.isArray(versions)||Object.keys(versions).length>32)throw Error('Versões de fontes inválidas.');
  for(const [id,source]of Object.entries(versions)){
   if(!/^[a-zA-Z0-9_.-]{1,80}$/.test(id)||!source||typeof source!=='object'||Array.isArray(source)||
    ['version','hash'].some(field=>source[field]!=null&&(typeof source[field]!=='string'||source[field].length>200)))throw Error('Versão ou hash de fonte inválido.');
  }
  return canonical({municipality:lot.municipalityId||'2507507',
   position:{lat:lot.lat??null,lng:lot.lng??null,coordinates:g.geographic||g.vertices||[lot.width,lot.depth],
    front:g.front??0,back:'back' in g?g.back:2,streetEdges:context.streetEdges||[],roads:context.roads||{}},
   use:config.use,date:config.analysisDate||null,sources:config.sourceVersions||{},
   territory:lot.territory?{status:lot.territory.status,zone:lot.territory.zone??null,conflict:lot.territory.contextConflict||false,
    source:lot.territory.source||null}:null,
   floors:config.floors,regimeVariant:config.regimeVariant||'general',
   context:{zone:context.zone||lot.zone||null,macrozone:context.macrozone||null,coastal:context.coastal||null,
    regime:context.regime||null,roadClass:context.roadClass||null,mode:context.mode||null,
    front:context.front??null,side:context.side??null,back:context.back??null,override:context.overrideAudit||null}});
 }
 const key=(lot,config)=>JSON.stringify(request(lot,config));
 function snapshot(lot,config,fixture=null){
  const inputs=request(lot,config),identity=JSON.stringify(inputs),previous=lot.normativeSnapshot;
  if(!fixture&&previous?.schema===SCHEMA&&previous.key===identity){
   const synthetic=previous.status==='synthetic';
   const fields=Object.fromEntries(Object.entries(previous.fields||{}).map(([name,field])=>[name,
    {...copy(field),value:synthetic?field.value:null,state:synthetic?'synthetic':'pending',legalValidation:false}]));
   return {...copy(previous),fields,legalValidation:false,status:synthetic?'synthetic':'pending'};
  }
  const fields=Object.fromEntries(['use','caBasic','caMax','occupation','permeability','setbacks','height','parking','restrictions']
   .map(name=>[name,{value:null,state:'pending',legalValidation:false,reason:'Regra revisada, vigência e cobertura pendentes.'}]));
  if(fixture?.synthetic){
   for(const [name,field]of Object.entries(fixture.fields||{}))fields[name]={...copy(field),state:'synthetic',legalValidation:false};
  }
  return {schema:SCHEMA,id:identity,key:identity,request:inputs,legalValidation:false,
   status:fixture?.synthetic?'synthetic':'pending',package:fixture?.synthetic?copy(fixture):null,fields};
 }
 function proposeOverride(previous,next,{responsible,justification,recordedAt,originalRule}){
  if(!responsible||!String(justification||'').trim())throw Error('Identifique o responsável e justifique a exceção técnica.');
  if(!['front','side','back'].every(name=>Number.isFinite(next[name])&&next[name]>=0&&next[name]<=1000))throw Error('Informe os três recuos da exceção.');
  const prior=previous?.overrideAudit,history=copy(prior?.revisions||[]);
  if(history.length>=50)throw Error('O histórico atingiu o limite. Solicite revisão técnica.');
  const original=prior?.original||{
   values:originalRule?.resolved?copy(originalRule.top.values):{front:null,side:null,back:null},
   source:originalRule?.source?copy(originalRule.source):null,zone:previous?.zone||null
  };
  if(!history.length&&previous?.mode==='manual'){
   history.push({version:1,values:{front:previous.front??null,side:previous.side??null,back:previous.back??null},
    responsible:null,justification:null,recordedAt:null,status:'legacy_unverified'});
  }
  history.push({version:history.length+1,values:{front:next.front,side:next.side,back:next.back},
   reference:next.reference,responsible:{accountId:responsible,verification:'session_claim'},
   justification:String(justification).trim(),recordedAt,status:'pending_review'});
  return {schema:'VIABILEASY_OVERRIDE_V1',original:copy(original),version:history.length,
   revisions:history,status:'pending_review',legalValidation:false};
 }
 function validateOverride(lot,responsible){
  const audit=lot.urbanContext?.overrideAudit;
  if(!audit)return;
  const revisions=audit.revisions;
  if(audit.schema!=='VIABILEASY_OVERRIDE_V1'||audit.status!=='pending_review'||audit.legalValidation!==false||
   !Array.isArray(revisions)||!revisions.length||revisions.length>50||audit.version!==revisions.length)throw Error('Histórico da exceção técnica inválido.');
  for(const [index,row]of revisions.entries()){
   if(row?.version!==index+1||!['pending_review','legacy_unverified'].includes(row.status)||
    !['front','side','back'].every(name=>row.values?.[name]==null&&row.status==='legacy_unverified'||
     Number.isFinite(row.values?.[name])&&row.values[name]>=0&&row.values[name]<=1000))throw Error('Versão da exceção técnica inválida.');
  }
  const latest=revisions.at(-1);
  if(latest.status!=='pending_review'||latest.responsible?.accountId!==responsible||
   typeof latest.justification!=='string'||!latest.justification.trim()||latest.justification.length>2000||
   !Number.isFinite(Date.parse(latest.recordedAt)))throw Error('Responsável ou justificativa da exceção técnica inválidos.');
  if(lot.urbanContext.mode==='manual'&&!['front','side','back'].every(name=>lot.urbanContext[name]===latest.values[name]))throw Error('Valores da exceção diferem da versão registrada.');
 }
 const versions=(occupation,setbacks)=>({occupation:{version:occupation.id,hash:null},setbacks:{version:setbacks.id,hash:null},zoning:{version:null,hash:null}});
 return {SCHEMA,request,key,snapshot,proposeOverride,validateOverride,versions};
})();
if(typeof module!=='undefined')module.exports=NormativeContext;
