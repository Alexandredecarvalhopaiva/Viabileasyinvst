/* Automatically consult a new parcel; saved results keep their source snapshot until refreshed. */
let urbanLookupPending=null;
function urbanSourceLink(source){
 const title=esc(source?.title||'Fonte normativa pendente');
 if(!/^https?:\/\//i.test(source?.url||''))return title;
 return `<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${title}</a>`;
}
function urbanLookupPanel(){
 const lot=state.lot,result=lot.territory,current=result?.key===UrbanLookup.key(lot),r=current?result:null;
 const messages={loading:'Consultando zoneamento e parâmetros disponíveis…',identified:'Zona identificada para o perímetro informado.',
  approximate:'Zona sugerida para o ponto. Confirme a posição e os limites do perímetro para consultar os parâmetros do terreno.',
  ambiguous:'O perímetro toca ou cruza limites de zonas. O enquadramento precisa de conferência.',
  not_found:'Sem cobertura na camada consultada para este perímetro. O enquadramento permanece pendente.',outside_coverage:'Sem cobertura no recorte de consulta suportado para a localização informada. O enquadramento permanece pendente.',no_location:'Marque a localização ou importe o perímetro geográfico para consultar os dados.',
  error:'A consulta não foi concluída. Você pode tentar novamente sem preencher índices manualmente.'};
 const o=r?.status==='identified'?r.occupation:null,source=o?.source,minimum=r?.status==='identified'?SetbackRules.minimum(r.zone,1):null;
 return `<section class="urban-lookup" aria-busy="${r?.status==='loading'}" aria-labelledby="urban-lookup-title"><h3 id="urban-lookup-title">Dados identificados para este terreno</h3><p role="status" aria-live="polite">${esc(messages[r?.status]||messages.loading)}</p>${r?.contextConflict?`<p role="alert">Conflito de enquadramento. Zona consultada ${esc(r.zone)}. Zona registrada no estudo ${esc(lot.urbanContext?.zone)}. As condições registradas foram preservadas. Revise a divergência para concluir os resultados afetados.</p><button type="button" class="btn" data-urban-review>Revisar enquadramento</button>`:r?.contextPreserved?`<p>Condições confirmadas no estudo foram preservadas. A consulta não substitui seu documento ou revisão técnica.</p>`:''}${r?.zone?`<dl class="urban-lookup-values"><div><dt>Zona ${r.status==='approximate'?'sugerida':'identificada'}</dt><dd>${esc(r.zone)}</dd></div>${o?`<div><dt>Ocupação · referência documental</dt><dd>${number(o.to)}%</dd></div><div><dt>Permeabilidade · referência documental</dt><dd>${number(o.permeability)}%</dd></div>`:''}${minimum?`<div><dt>Recuos documentais · térreo</dt><dd>Frente ${number(minimum.front,2)} m · lateral ${number(minimum.side,2)} m · fundos ${number(minimum.back,2)} m</dd></div>`:''}<div><dt>Altura e coeficiente aplicáveis</dt><dd>Dependem das demais regras e restrições do lote</dd></div></dl>`:''}${r?.candidates?.length>1?`<p>Zonas incidentes: ${r.candidates.map(z=>esc(z)).join(', ')}.</p>`:''}${r?.source?`<p class="setback-source">Zona: <a href="https://filipeia.joaopessoa.pb.gov.br/" target="_blank" rel="noopener noreferrer">Filipeia/SEPLAN/PMJP</a> · camada ${esc(r.source.layer)} · consulta ${esc(r.source.retrievedAt?.slice(0,10)||'sem data')}.</p>`:''}${source?`<p class="setback-source">Parâmetros: ${urbanSourceLink(source)}. Referência documental · aplicação e vigência pendentes. Versão ${esc(source.id||'pendente')}. Notas e restrições adicionais precisam de conferência.</p>`:''}<button type="button" class="btn" data-urban-refresh ${r?.status==='loading'?'disabled':''}>${icon('rotate')}Consultar novamente</button></section>`;
}
function urbanLookupReport(){
 const r=state.lot.territory;
 if(!r||r.key!==UrbanLookup.key(state.lot))return '';
 const o=r.status==='identified'?r.occupation:null,source=o?.source;
 return `<div class="report-block"><h3>Consulta automática de zoneamento</h3><p>Resultado: ${esc({identified:'zona identificada no perímetro',approximate:'sugestão por ponto',ambiguous:'limite entre zonas',not_found:'sem cobertura',outside_coverage:'fora do recorte suportado',error:'consulta indisponível',no_location:'localização pendente',loading:'consulta em andamento'}[r.status]||'pendente')}${r.zone?' · '+esc(r.zone):''}.</p>${r.source?`<p>Fonte: Filipeia/SEPLAN/PMJP · ${esc(r.source.layer)} · ${esc(r.source.retrievedAt)}.</p>`:''}${o?`<p>Quadro geral: ocupação máxima ${number(o.to)}%; permeabilidade mínima ${number(o.permeability)}%. ${urbanSourceLink(source)}.</p>`:''}${r.contextConflict?'<p>CONFLITO: zona consultada diferente do enquadramento confirmado. Condições informadas preservadas; conferência necessária.</p>':''}<p>A consulta espacial e os parâmetros documentais não confirmam vigência consolidada, condições especiais, permissões ou aprovação. O estudo conserva esta consulta até uma nova atualização.</p></div>`;
}
async function refreshUrbanLookup(force=false){
 const lot=state.lot;
 if(!lot?.custom||!state.lotConfirmed||state.lookupDirty||state.parcelDirty)return;
 const identity=UrbanLookup.key(lot),existing=lot.territory;
 if(urbanLookupPending?.lot===lot&&urbanLookupPending.key===identity)return;
 if(!force&&existing?.key===identity&&existing.status!=='loading')return;
 urbanLookupPending?.controller.abort();
 const q=UrbanLookup.query(lot);
 if(!q){
  const located=Boolean(lot.geometry?.geographic?.length>=3||Number.isFinite(lot.lat)&&Number.isFinite(lot.lng));
  UrbanLookup.apply(lot,{key:identity,status:located?'outside_coverage':'no_location'});
  render();return;
 }
 const controller=new AbortController(),task={lot,key:identity,controller};urbanLookupPending=task;
 const firstLookup=!existing||existing.key!==identity;
 const requestedOccupancy=state.to;
 const loading={key:identity,status:'loading'};
 if(firstLookup)UrbanLookup.apply(lot,loading);
 else lot.territory=loading;
 render();
 try{
  const response=await fetch('/api/territory?'+q.search,{signal:controller.signal,credentials:'same-origin',cache:'no-store'});
  if(!response.ok)throw Error('lookup');
  const result=UrbanLookup.resolve(lot,await response.json());
  if(urbanLookupPending!==task||state.lot!==lot||UrbanLookup.key(lot)!==identity||state.lookupDirty||state.parcelDirty)return;
  UrbanLookup.apply(lot,result);
  if(firstLookup&&state.to===requestedOccupancy&&result.status==='identified'&&result.occupation&&!result.contextPreserved&&lot.urbanContext?.origin==='territory'){
   state.to=result.occupation.to;result.occupationApplied=true;
  }
 }catch(error){
  if(urbanLookupPending===task&&state.lot===lot&&UrbanLookup.key(lot)===identity&&!state.lookupDirty&&!state.parcelDirty&&error.name!=='AbortError')UrbanLookup.apply(lot,{key:identity,status:'error'});
 }finally{
  if(lot.territory===loading){
   if(existing?.key===identity)lot.territory=existing;
   else delete lot.territory;
  }
  if(urbanLookupPending===task){urbanLookupPending=null;if(state.lot===lot)render();}
 }
}
document.addEventListener('click',event=>{
 if(event.target.closest('[data-urban-refresh]'))refreshUrbanLookup(true);
 if(event.target.closest('[data-urban-review]')){
  const details=event.target.closest('.setback-panel')?.querySelector('details');
  if(details){details.open=true;details.querySelector('[name="zone"]')?.focus();}
 }
});
