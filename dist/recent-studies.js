/* Saved studies and access times are supplied by the authenticated account. */
function recentStudyCards(){
 const recent=Object.values(state.savedCustom)
  .filter(entry=>state.saved.has(entry.lot.id))
  .sort((a,b)=>Math.max(b.updatedAt||0,b.lastOpenedAt||0)-Math.max(a.updatedAt||0,a.lastOpenedAt||0)||(b.updatedAt||0)-(a.updatedAt||0)||a.lot.id.localeCompare(b.lot.id))
  .slice(0,6);
 const cards=recent.map((entry,index)=>{
  const l=entry.lot,opened=(entry.lastOpenedAt||0)>(entry.updatedAt||0),timestamp=Math.max(entry.updatedAt||0,entry.lastOpenedAt||0);
  const date=timestamp?new Date(timestamp):null;
  const activity=date?`<time datetime="${date.toISOString()}">${opened?'Acessado':'Salvo'} em ${esc(new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit',timeZone:'America/Fortaleza'}).format(date))}</time>`:'Estudo salvo na sua conta';
  const product=products.find(product=>product.use===entry.scenario?.use)?.name||'Cenário salvo';
  return `<button type="button" class="recent-study-card" data-lot="${esc(l.id)}" data-resume-study aria-label="Continuar estudo: ${esc(l.name)}"><span class="recent-study-preview" aria-hidden="true">${l.geometry?parcelSvg(l.geometry):miniMap(index%3)}</span><span class="recent-study-content"><span class="recent-study-name">${esc(l.name)}</span><span class="recent-study-detail">${number(l.area)} m² · ${esc(product)}</span><span class="recent-study-activity">${activity}</span><span class="recent-study-continue">Continuar estudo ${icon('arrowRight')}</span></span></button>`;
 }).join('');
 return `<section class="home-recent-studies" aria-labelledby="recent-studies-title"><div class="recent-studies-heading"><div><h2 id="recent-studies-title">${icon('clock')}Continue seus estudos</h2><p>Seus últimos estudos salvos ou acessados.</p></div><button class="btn" data-page="projects">Ver todos ${icon('arrowRight')}</button></div>${recent.length?`<div class="recent-studies-grid">${cards}</div>`:`<div class="recent-studies-empty">${icon('folder')}<div><h3>Seus estudos vão aparecer aqui.</h3><p>Salve sua primeira análise para retomá-la quando quiser.</p></div>${btn('Criar um estudo','plus','new-analysis','primary')}</div>`}</section>`;
}
