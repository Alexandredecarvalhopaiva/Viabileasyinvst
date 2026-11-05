/* Automatically consult a new parcel; saved results keep their source snapshot until refreshed. */
let urbanLookupPending=null;
function urbanLookupPanel(){
 const lot=state.lot,result=lot.territory,current=result?.key===UrbanLookup.key(lot),r=current?result:null;
 const messages={loading:'Consultando a camada municipal de zoneamento…',identified:'Zona identificada para o perímetro informado.',
  approximate:'Zona sugerida para o ponto. Posicione e confirme o perímetro para aplicar ao terreno.',
  ambiguous:'O perímetro toca ou cruza limites de zonas. O enquadramento precisa de conferência.',
  not_found:'Nenhuma zona encontrada nesta camada para o local informado.',no_location:'Marque a localização ou importe o perímetro geográfico para consultar os dados.',
  error:'A consulta não foi concluída. Você pode tentar novamente sem preencher índices manualmente.'};
 const o=r?.occupation,minimum=r?.status==='identified'?SetbackRules.minimum(r.zone,1):null;
 return `<section class="urban-lookup" aria-labelledby="urban-lookup-title"><h3 id="urban-lookup-title">Dados identificados do terreno</h3><p role="status" aria-live="polite">${esc(messages[r?.status]||messages.loading)}</p>${r?.zone?`<dl class="urban-lookup-values"><div><dt>Zona ${r.status==='approximate'?'sugerida':'identificada'}</dt><dd>${esc(r.zone)}</dd></div>${o?`<div><dt>Ocupação máxima · quadro geral</dt><dd>${number(o.to)}%</dd></div><div><dt>Permeabilidade mínima · quadro geral</dt><dd>${number(o.permeability)}%</dd></div>`:''}${minimum?`<div><dt>Recuos documentais · térreo</dt><dd>Frente ${number(minimum.front,2)} m · lateral ${number(minimum.side,2)} m · fundos ${number(minimum.back,2)} m</dd></div>`:''}<div><dt>Altura e coeficiente aplicáveis</dt><dd>Dependem das demais regras e restrições do lote</dd></div></dl>`:''}${r?.contextConflict?`<p role="alert">A zona consultada diverge do enquadramento confirmado. Suas condições foram preservadas; confira a zona antes de utilizar o estudo.</p>`:r?.contextPreserved?`<p>Condições confirmadas no estudo foram preservadas. A consulta não substitui seu documento ou revisão técnica.</p>`:''}${r?.candidates?.length>1?`<p>Zonas incidentes: ${r.candidates.map(z=>esc(z)).join(', ')}.</p>`:''}${r?.source?`<p class="setback-source">Zona: <a href="https://filipeia.joaopessoa.pb.gov.br/" target="_blank" rel="noopener noreferrer">Filipeia/SEPLAN/PMJP</a> · camada ${esc(r.source.layer)} · consulta ${esc(r.source.retrievedAt?.slice(0,10)||'sem data')}.</p>`:''}${o||minimum?`<p class="setback-source">Parâmetros: <a href="${esc(UrbanLookup.catalog.url)}" target="_blank" rel="noopener noreferrer">${esc(UrbanLookup.catalog.title)}</a>. Quadro geral; notas e restrições adicionais ainda precisam de conferência.</p>`:''}<button type="button" class="btn" data-urban-refresh ${r?.status==='loading'?'disabled':''}>${icon('rotate')}Consultar novamente</button></section>`;
}
function urbanLookupReport(){
 const r=state.lot.territory;
 if(!r||r.key!==UrbanLookup.key(state.lot))return '';
 const o=r.occupation;
 return `<div class="report-block"><h3>Consulta automática de zoneamento</h3><p>Resultado: ${esc({identified:'zona identificada no perímetro',approximate:'sugestão por ponto',ambiguous:'limite entre zonas',not_found:'sem cobertura',error:'consulta indisponível',no_location:'localização pendente',loading:'consulta em andamento'}[r.status]||'pendente')}${r.zone?' · '+esc(r.zone):''}.</p>${r.source?`<p>Fonte: Filipeia/SEPLAN/PMJP · ${esc(r.source.layer)} · ${esc(r.source.retrievedAt)}.</p>`:''}${o?`<p>Quadro geral: ocupação máxima ${number(o.to)}%; permeabilidade mínima ${number(o.permeability)}%. <a href="${esc(UrbanLookup.catalog.url)}">${esc(UrbanLookup.catalog.title)}</a>.</p>`:''}${r.contextConflict?'<p>CONFLITO: zona consultada diferente do enquadramento confirmado. Condições informadas preservadas; conferência necessária.</p>':''}<p>A consulta espacial e os parâmetros documentais não confirmam vigência consolidada, condições especiais, permissões ou aprovação. O estudo conserva esta consulta até uma nova atualização.</p></div>`;
}
async function refreshUrbanLookup(force=false){
 const lot=state.lot;
 if(!lot?.custom||!state.lotConfirmed||state.lookupDirty||state.parcelDirty)return;
 const identity=UrbanLookup.key(lot),existing=lot.territory;
 if(urbanLookupPending?.lot===lot&&urbanLookupPending.key===identity)return;
 if(!force&&existing?.key===identity&&existing.status!=='loading')return;
 urbanLookupPending?.controller.abort();
 const q=UrbanLookup.query(lot);
 if(!q){UrbanLookup.apply(lot,{key:identity,status:'no_location'});render();return;}
 const controller=new AbortController(),task={lot,key:identity,controller};urbanLookupPending=task;
 const firstLookup=!existing||existing.key!==identity;
 if(firstLookup&&lot.urbanContext?.origin==='territory'){delete lot.urbanContext;lot.zone='Não identificado';}
 lot.territory={key:identity,status:'loading'};render();
 try{
  const response=await fetch('/api/territory?'+q.search,{signal:controller.signal,credentials:'same-origin',cache:'no-store'});
  if(!response.ok)throw Error('lookup');
  const result=UrbanLookup.resolve(lot,await response.json());
  if(urbanLookupPending!==task||state.lot!==lot||UrbanLookup.key(lot)!==identity||state.lookupDirty||state.parcelDirty)return;
  UrbanLookup.apply(lot,result);
  if(firstLookup&&result.status==='identified'&&result.occupation&&lot.urbanContext?.origin==='territory'){
   state.to=result.occupation.to;result.occupationApplied=true;
  }
 }catch(error){
  if(urbanLookupPending===task&&state.lot===lot&&UrbanLookup.key(lot)===identity&&error.name!=='AbortError')UrbanLookup.apply(lot,{key:identity,status:'error'});
 }finally{
  if(urbanLookupPending===task){urbanLookupPending=null;if(state.lot===lot)render();}
 }
}
document.addEventListener('click',event=>{if(event.target.closest('[data-urban-refresh]'))refreshUrbanLookup(true);});
