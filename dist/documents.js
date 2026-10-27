/* Uploaded PDFs remain on the server; references are applied only after the user enters values. */
(() => {
  const categories = {legislacao:'Legislação',certidao:'Certidão / consulta urbanística',planta:'Planta / levantamento',matricula:'Matrícula / registro',outro:'Outro documento'};
  let lotFilter = '', page = 0, records = new Map(), selected = null, requestVersion = 0;
  const date = value => new Intl.DateTimeFormat('pt-BR',{dateStyle:'short'}).format(new Date(value));
  const ownStudies = () => Object.values(state.savedCustom);
  const reference = doc => [doc.title,doc.issuer,doc.reference].filter(Boolean).join(' · ').slice(0,250);
  const fileURL = doc => new URL(doc.url,location.origin).href;
  function open(lotId = '') { lotFilter = lotId; page = 0; state.page = 'documents'; render(); focusMain(); }
  function openLot() {
    if (!guardSelection()) return;
    if (!state.saved.has(state.lot.id)) {
      modal('Guarde o terreno e seus documentos.','<p>Salve o estudo para vincular certidões, plantas e outros documentos a este terreno.</p>','<button class="btn primary" data-doc-command="save-lot">Salvar estudo e continuar</button>');
      return;
    }
    open(state.lot.id);
  }
  function view() {
    const studies = ownStudies(), admin = window.ViabilAuth?.isSuperAdmin();
    const canUpload = admin || studies.length > 0;
    return `${heading('DOCUMENTOS · FONTES DA ANÁLISE','Documentos oficiais.','Reúna leis, certidões e plantas e mantenha a origem das referências do seu estudo.')}<div class="notice">${icon('file')}<div><strong>Do documento à análise.</strong> Anexe o PDF e use “Usar como referência” para informar recuos ou pavimentos. Os valores são preenchidos por você; o arquivo não altera o cálculo automaticamente.</div></div><section class="panel document-upload section-space" aria-labelledby="document-upload-title"><div class="panel-title"><h2 id="document-upload-title">Adicionar documento</h2><span>PDF · até 10 MB</span></div>${canUpload?`<form id="document-form" class="document-form"><div class="document-field-grid"><label class="auth-field" for="document-destination">Vincular a<select id="document-destination" name="destination" required>${admin?`<option value="library" ${!lotFilter?'selected':''}>Legislação geral · disponível às contas</option>`:''}${studies.map(entry=>`<option value="lot:${esc(entry.lot.id)}" ${lotFilter===entry.lot.id?'selected':''}>Terreno · ${esc(entry.lot.name)} (${esc(entry.lot.id)})</option>`).join('')}</select></label><label class="auth-field" for="document-category">Tipo de documento<select id="document-category" name="category">${Object.entries(categories).map(([id,label])=>`<option value="${id}">${label}</option>`).join('')}</select></label><label class="auth-field" for="document-title">Título<input id="document-title" name="title" maxlength="160" required placeholder="Ex.: Certidão de uso e ocupação do solo"></label><label class="auth-field" for="document-issuer">Órgão ou entidade emissora<input id="document-issuer" name="issuer" maxlength="160" required placeholder="Ex.: Prefeitura de João Pessoa"></label><label class="auth-field" for="document-reference">Número, data e identificação<input id="document-reference" name="reference" maxlength="250" placeholder="Ex.: Certidão nº 123 · 26/10/2026"></label><label class="auth-field" for="document-source">Link da publicação oficial (opcional)<input id="document-source" name="sourceURL" type="url" maxlength="1500" placeholder="https://..."></label></div><label class="auth-field" for="document-notes">Páginas, artigos ou trechos relevantes (opcional)<textarea id="document-notes" name="notes" rows="3" maxlength="1500" placeholder="Indique onde consultar zoneamento, recuos, gabarito ou outras condições."></textarea></label><label class="auth-field document-file" for="document-file">Arquivo PDF<input id="document-file" name="file" type="file" accept="application/pdf,.pdf" required aria-describedby="document-file-help"></label><p id="document-file-help" class="document-help">Até 100 documentos e 100 MB por conta. Documentos de um terreno ficam acessíveis à conta responsável e ao superadministrador.</p><p id="document-feedback" class="document-feedback" role="status" hidden></p><button class="btn primary" type="submit">${icon('upload')}Salvar documento</button></form>`:'<div class="admin-empty"><p>Salve um estudo para anexar os documentos do terreno. A legislação geral é cadastrada pelo superadministrador.</p><button class="btn" data-action="new-analysis">Iniciar estudo de um terreno</button></div>'}</section><section class="document-library section-space" aria-labelledby="document-library-title"><div class="document-library-heading"><h2 id="document-library-title">Documentos cadastrados</h2><label for="document-filter">Visualizar<select id="document-filter"><option value="">Todos os documentos disponíveis</option>${studies.map(entry=>`<option value="${esc(entry.lot.id)}" ${lotFilter===entry.lot.id?'selected':''}>${esc(entry.lot.name)} · documentos e legislação geral</option>`).join('')}</select></label></div><div id="document-list" aria-live="polite" aria-busy="true"><p class="panel admin-loading">Carregando documentos…</p></div></section>`;
  }
  async function mount() {
    const node = document.getElementById('document-list');
    if (!node || !window.ViabilAuth?.accountId()) return;
    const version = ++requestVersion; node.setAttribute('aria-busy','true');
    const accountId = window.ViabilAuth.accountId(), query = new URLSearchParams({page,lotId:lotFilter});
    try {
      const response = await fetch('/api/documents?'+query,{credentials:'same-origin',cache:'no-store'}), data = await response.json();
      if (!node.isConnected || version !== requestVersion || accountId !== window.ViabilAuth.accountId()) return;
      if (!response.ok) throw Error(data.error || 'Não foi possível carregar os documentos.');
      records = new Map(data.documents.map(doc=>[doc.id,doc]));
      node.innerHTML = data.documents.length?`<p class="document-help">${data.total} ${data.total===1?'documento cadastrado':'documentos cadastrados'} · página ${data.page+1}</p><div class="sources-grid">${data.documents.map(doc=>`<article class="panel source-card"><div class="source-card-top"><span class="source-symbol">${icon('file')}</span><span class="source-kind">${esc(categories[doc.category])} · aplicação a conferir</span></div><h3>${esc(doc.title)}</h3><p class="source-description">${esc(doc.issuer)}${doc.reference?'<br>'+esc(doc.reference):''}</p>${doc.notes?`<p class="document-notes">${esc(doc.notes)}</p>`:''}<p class="document-help">${doc.scope==='library'?'Legislação geral':`Terreno: ${esc(doc.lotName)} · ${esc(doc.lotId)}`}<br>Cadastrado por ${esc(doc.ownerName)} · ${date(doc.createdAt)}<br>${esc(doc.filename)} · ${number(doc.size/1024,1)} KB</p><div class="document-card-actions"><a class="btn" href="${esc(doc.url)}" target="_blank" rel="noopener noreferrer">${icon('download')}Baixar PDF</a>${doc.scope==='library'||doc.ownerId===accountId?`<button class="btn" data-doc-reference="${doc.id}">Usar como referência</button>`:''}${doc.sourceURL?`<a href="${esc(doc.sourceURL)}" target="_blank" rel="noopener noreferrer">Publicação oficial ${icon('external')}</a>`:''}</div></article>`).join('')}</div><div class="document-pagination"><button class="btn" data-doc-page="${data.page-1}" ${data.page===0?'disabled':''}>Anterior</button><button class="btn" data-doc-page="${data.page+1}" ${(data.page+1)*data.pageSize>=data.total?'disabled':''}>Próxima</button></div>`:'<div class="panel admin-empty"><h3>Nenhum documento cadastrado ainda.</h3><p>Use o formulário acima para adicionar o primeiro PDF.</p></div>';
    } catch (error) { if(node.isConnected && version===requestVersion) node.innerHTML=`<div class="panel admin-empty" role="alert">${esc(error.message)} <button class="btn" data-doc-command="retry">Tentar novamente</button></div>`; }
    finally { if(node.isConnected && version===requestVersion) node.setAttribute('aria-busy','false'); }
  }
  async function upload(form) {
    const values = new FormData(form), file = values.get('file'), button = form.querySelector('[type=submit]'), feedback = form.querySelector('#document-feedback');
    if(button.disabled)return;
    const show = (text,error=false) => {feedback.hidden=false;feedback.textContent=text;feedback.setAttribute('role',error?'alert':'status');};
    if (!file?.size || file.size > 10*1024*1024 || !/\.pdf$/i.test(file.name)) return show('Selecione um PDF de até 10 MB.',true);
    const accountId = window.ViabilAuth.accountId(), destination = String(values.get('destination'));
    button.disabled=true; button.setAttribute('aria-busy','true'); show('Enviando e salvando o documento…');
    try {
      const pdf = await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(Error('Não foi possível ler o arquivo.'));reader.readAsDataURL(file);});
      if (!form.isConnected || accountId !== window.ViabilAuth.accountId()) return;
      const response = await fetch('/api/documents',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Viabileasy-Request':'1'},body:JSON.stringify({title:values.get('title'),issuer:values.get('issuer'),reference:values.get('reference'),sourceURL:values.get('sourceURL'),notes:values.get('notes'),category:values.get('category'),scope:destination==='library'?'library':'lot',lotId:destination.startsWith('lot:')?destination.slice(4):null,filename:file.name,pdf})});
      const data = await response.json();
      if (!response.ok) throw Error(data.error || 'Não foi possível salvar o documento.');
      if (!form.isConnected || accountId !== window.ViabilAuth.accountId()) return;
      form.reset(); form.querySelector('[name=destination]').value=destination;
      lotFilter=destination==='library'?'':destination.slice(4); page=0;
      document.getElementById('document-filter').value=lotFilter;
      show('Documento salvo. Baixe o PDF ou use-o como referência nos parâmetros do terreno.'); await mount();
    } catch(error) {if(form.isConnected)show(error.message,true);}
    finally {button.disabled=false;button.removeAttribute('aria-busy');}
  }
  function useReference(id) {
    selected = records.get(id);
    if (!selected) return;
    if (selected.scope==='lot') {
      if (!state.savedCustom[selected.lotId]) return notify('Este documento pertence ao estudo de outra conta.');
      if (state.lot.id!==selected.lotId || !state.lotConfirmed) {selectLot(selected.lotId);state.parcelDirty=false;}
    }
    state.page='analysis';
    if (!guardSelection()) {focusMain();return;}
    state.step=2;render();
    modal('Usar documento na análise',`<p><strong>${esc(selected.title)}</strong><br>${esc(selected.issuer)}</p><p>Consulte o PDF e informe os valores indicados para o terreno. Nenhum limite será extraído ou aplicado automaticamente.</p><p><a href="${esc(selected.url)}" target="_blank" rel="noopener noreferrer">Baixar PDF ${icon('external')}</a></p>`,'<button class="btn" data-doc-parameter="setbacks">Informar recuos</button><button class="btn primary" data-doc-parameter="floors">Informar pavimentos</button>');
  }
  document.addEventListener('submit',event=>{if(event.target.id==='document-form'){event.preventDefault();upload(event.target);}});
  document.addEventListener('change',event=>{if(event.target.id==='document-filter'){lotFilter=event.target.value;page=0;mount();}});
  document.addEventListener('click',async event=>{
    const openButton=event.target.closest('[data-open-documents]');if(openButton){closeModal();open(openButton.dataset.openDocuments==='lot'?state.lot.id:'');return;}
    const source=event.target.closest('[data-doc-reference]');if(source){useReference(source.dataset.docReference);return;}
    const pager=event.target.closest('[data-doc-page]');if(pager&&!pager.disabled){page=Number(pager.dataset.docPage);mount();return;}
    const command=event.target.closest('[data-doc-command]');
    if(command?.dataset.docCommand==='retry'){mount();return;}
    if(command?.dataset.docCommand==='save-lot'){command.disabled=true;await saveParcelStudy();if(state.saved.has(state.lot.id)){closeModal();open(state.lot.id);}command.disabled=false;return;}
    const parameter=event.target.closest('[data-doc-parameter]');if(!parameter||!selected)return;
    if(parameter.dataset.docParameter==='floors'){
      openBuildingLimit();document.getElementById('building-max-floors').value='';document.getElementById('building-reference').value=reference(selected);document.getElementById('building-reference-url').value=fileURL(selected);document.getElementById('building-max-floors').focus();
    }else{
      openSetbackRules();const form=document.querySelector('.modal form');form.querySelector('[name=mode]').value='manual';form.querySelector('.setback-manual').open=true;form.querySelector('[name=reference]').value=reference(selected);form.querySelector('[name=url]').value=fileURL(selected);for(const name of ['front','side','back'])form.querySelector(`[name=${name}]`).value='';form.querySelector('[name=front]').focus();
    }
  });
  window.ViabilDocuments = {view,mount,open,openLot};
})();
