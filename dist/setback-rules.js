/* Documentary setback rules. This module never infers zoning from a neighbourhood or coordinate. */
const SetbackRules=(()=>{
 const catalog={id:'JP-LC169-2024-RECUOS-v1',municipality:'João Pessoa/PB',consultedAt:'2026-10-21',title:'LC 166/2024 · Anexo V, substituído pelo Anexo IV da LC 169/2024',url:'https://planodiretor.joaopessoa.pb.gov.br/wp-content/uploads/2025/01/LC169-2024_AlteraLUOS.pdf#page=4',articleUrl:'https://sapl.joaopessoa.pb.leg.br/norma/19967',pages:'Diário Oficial 23/12/2024, pp. 004–005',articles:'Arts. 68, parágrafo 1º, 77 e 78 da LC 166/2024; Anexo IV e nota C da LC 169/2024'};
 const zones=['ZH1','ZH2','ZH3','ZH4','ZH5'];
 const round=n=>Math.round(n*1000)/1000;
 function minimum(zone,n){
  if(!zones.includes(zone)||!Number.isInteger(n)||n<1||n>80)return null;
  const growth=round(3+.3*(n-4));
  let side=n<=3?1.5:n===4?3:growth,back=n<=4?3:growth;
  if(zone==='ZH2'&&n<=2)back=2;
  if(zone==='ZH4'){side=n<=3?2:n===4?4:round(4+.3*(n-4));back=n<=4?3:round(4+.3*(n-4))}
  if(zone==='ZH5')side=n<=2?1.5:n<=4?3:growth;
  return {front:5,side,back};
 }
 function resolve(lot,config,geometry){
  const context=lot.urbanContext||{},mode=context.mode||'catalog',floors=Math.max(1,Math.min(80,Math.trunc(config.floors)||1));
  const defaults={front:5,back:5,side:3};
  let status='pending',reason='',source=null;
  if(mode==='demo'){status='demonstration';reason='Recuos de demonstração, sem origem legal.'}
  else if(mode==='manual'){
   const values=['front','side','back'].map(k=>context[k]);
   if(values.some(v=>!Number.isFinite(v)||v<0||v>1000)||!String(context.reference||'').trim())reason='Informe os três recuos e a referência do documento.';
   else {let url=null;try{const parsed=new URL(context.url);if(['http:','https:'].includes(parsed.protocol))url=parsed.href}catch{}status='document';source={title:String(context.reference).slice(0,250),url,verified:false};reason='Valores informados pelo usuário para todos os pavimentos; documento não validado.'}
  }else if(context.catalogId&&context.catalogId!==catalog.id)reason='O estudo usa outra versão documental. Revise e reaplique o enquadramento.';
  else if(!zones.includes(context.zone))reason='Informe a zona do lote. O catálogo inicial cobre ZH1 a ZH5.';
  else if(lot.coastal||context.coastal!=='outside')reason='A faixa de orla e seu regime precisam de análise específica. Nenhum enquadramento automático foi aplicado.';
  else if(context.regime!=='ordinary')reason='Confirme o cenário de aplicação geral. Patrimônio, ambiente, ZEIS, alinhamentos e outros regimes podem exigir parâmetros próprios.';
  else if(!geometry?.valid)reason='Confirme a geometria e identifique a frente do terreno.';
  else {status='conditional';source={...catalog,zone:context.zone,verified:false};reason='Regra geral da zona informada, aplicada por pavimento. Enquadramento do lote e permissões ainda dependem de confirmação.'}
  const resolved=status==='conditional'||status==='document';
  const roads=context.roads&&typeof context.roads==='object'?context.roads:{};
  const fronts=new Set([geometry?.front||0,...(Array.isArray(context.streetEdges)?context.streetEdges.filter(i=>Number.isInteger(i)&&i>=0&&i<(geometry?.vertices.length||0)):[])]);
  const levels=Array.from({length:floors},(_,index)=>{
   const n=index+1,values=status==='conditional'?minimum(context.zone,n):status==='document'?{front:Number(context.front),side:Number(context.side),back:Number(context.back)}:defaults;
   const edges=(geometry?.vertices||[]).map((_,i)=>{
    const isFront=fronts.has(i),role=isFront?(i===geometry.front?'Frente':'Outra frente'):i===geometry.back?'Fundos':'Lateral';
    const highway=status==='conditional'&&isFront&&roads[i]==='highway';
    const distance=highway?Math.max(15,values.front):isFront?values.front:i===geometry.back?values.back:values.side;
    return {index:i,role,distance,reference:highway?'Anexo IV, nota C':isFront&&i!==geometry.front?'Art. 68, parágrafo 1º; Anexo IV':'Anexo IV · '+(context.zone||'premissa')};
   });
   // Without an identified back edge we retain the existing conservative uniform approximation.
   const unknownBack=geometry?.back==null;
   const edgeOffsets=unknownBack?edges.map(()=>Math.max(...edges.map(e=>e.distance))):edges.map(e=>e.distance);
   return {floor:n,values:{...values,front:edges[geometry?.front||0]?.distance??values.front},edges,edgeOffsets,unknownBack};
  });
  const warnings=[];
  if(status==='conditional'){
   warnings.push('N inclui o térreo. Não foram aplicadas faculdades de colagem, geminação, subsolos ou a alternativa H3 da nota B.');
   warnings.push('Os demais índices (TO, CA, permeabilidade e altura permitida) continuam demonstrativos e independentes destes recuos.');
   if(context.zone==='ZH2')warnings.push('ZH2 exige conferência específica de patrimônio e do perímetro de incidência.');
   if(config.use==='Flats')warnings.push('O enquadramento de flats como residência ou hospedagem não foi confirmado.');
  }
  if(geometry?.back==null)warnings.push('Fundos sem lado único identificado: aplica-se o maior recuo uniformemente. Não é o recorte legal exato.');
  return {status,resolved,reason,mode,source,catalog:status==='conditional'?catalog:null,zone:context.zone||null,levels,top:levels.at(-1),warnings,legalValidation:false};
 }
 return {catalog,zones,minimum,resolve};
})();
if(typeof module!=='undefined')module.exports=SetbackRules;
