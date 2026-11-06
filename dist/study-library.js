/* Organização privada. Rascunhos duram somente na sessão autenticada atual. */
window.StudyLibrary = (() => {
  const stages = {triage: 'Em triagem', in_study: 'Em estudo', waiting_information: 'Aguardando informação', archived: 'Arquivado'};
  let filters = {query: '', stage: '', tag: ''};
  let drafts = new Map();
  let editingId = null;
  let generation = 0;
  let announcement = '';

  function normalize(value) {
    return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function metadata(entry) {
    return {schemaVersion: 1, stage: 'triage', tags: [], note: '', revision: 0, updatedAt: null, ...entry.metadata};
  }

  function entries() {
    return Object.values(state.savedCustom).filter(entry => state.saved.has(entry.lot.id));
  }

  function matches(entry, selected = filters) {
    const data = metadata(entry);
    return normalize(entry.lot.name).includes(normalize(selected.query.trim()))
      && (selected.stage ? data.stage === selected.stage : data.stage !== 'archived')
      && (!selected.tag || data.tags.some(tag => normalize(tag) === selected.tag));
  }

  function stageOptions(selected, includeDefault = false) {
    return (includeDefault ? '<option value="">Etapas ativas</option>' : '')
      + Object.entries(stages).map(([key, label]) => `<option value="${key}" ${key === selected ? 'selected' : ''}>${label}</option>`).join('');
  }

  function editor(entry) {
    const id = entry.lot.id, draft = drafts.get(id);
    if (editingId !== id || !draft) return '';
    const latest = draft.latest;
    const current = latest ? `<div class="library-current"><h4>Revisão atual ${latest.revision}</h4><p>${esc(stages[latest.stage])} · ${esc(latest.tags.join(', ') || 'Sem etiquetas')}</p><p class="library-note">${esc(latest.note || 'Sem nota')}</p></div>` : '';
    return `<form class="library-editor" data-library-form="${esc(id)}" aria-label="Organizar ${esc(entry.lot.name)}" aria-busy="${Boolean(draft.saving)}">
      <h4>Organizar estudo</h4>
      <label>Etapa de acompanhamento<select name="stage" ${draft.saving ? 'disabled' : ''}>${stageOptions(draft.stage)}</select></label>
      <label>Etiquetas<textarea name="tags" rows="3" aria-describedby="library-tags-help" ${draft.saving ? 'disabled' : ''}>${esc(draft.tagsText)}</textarea></label>
      <p id="library-tags-help">Uma por linha. Até 10 etiquetas de 32 caracteres.</p>
      <label>Nota opcional<textarea name="note" rows="4" ${draft.saving ? 'disabled' : ''}>${esc(draft.note)}</textarea></label>
      <p>Até 1.000 caracteres. A nota pode ficar vazia.</p>
      ${current}<p class="library-feedback" role="status" aria-live="polite">${esc(draft.message || '')}</p>
      <div class="library-actions"><button type="submit" class="btn primary" ${draft.saving || draft.conflict ? 'disabled' : ''}>${draft.saving ? 'Salvando…' : draft.failed ? 'Tentar novamente' : 'Salvar organização'}</button>
      ${draft.conflict ? `<button type="button" class="btn" data-library-current="${esc(id)}" ${draft.saving ? 'disabled' : ''}>Carregar revisão atual</button>` : ''}
      <button type="button" class="btn" data-library-close ${draft.saving ? 'disabled' : ''}>Fechar edição</button></div>
      <p>Rascunho mantido nesta sessão até confirmar a gravação.</p>
    </form>`;
  }

  function cards() {
    const all = entries(), found = all.filter(entry => matches(entry));
    if (!all.length) return '<div class="account-empty"><h2>Seu primeiro estudo começa aqui.</h2><p>Salve uma análise para retomá-la na sua conta.</p><button class="btn primary" data-action="new-analysis">Criar meu primeiro estudo</button></div>';
    if (!found.length) return '<div class="account-empty"><h2>Nenhum estudo encontrado.</h2><p>Revise a busca e as etapas selecionadas. Estudos arquivados aparecem no filtro Arquivado.</p><button class="btn" data-library-clear>Limpar filtros</button></div>';
    return found.map((entry, index) => {
      const lot = entry.lot, data = metadata(entry);
      return `<article class="panel project-card" data-study-card="${esc(lot.id)}">
        <div class="project-map">${lot.geometry ? parcelSvg(lot.geometry) : miniMap(index % 3)}${status(lot.coastal ? 'PENDENTE' : 'PRELIMINAR', lot.coastal ? 'pending' : 'estimated')}</div>
        <div class="project-info"><h3>${esc(lot.name)}</h3><p>${esc(lot.address || '')} · João Pessoa, PB</p>
        <p class="library-stage">Acompanhamento <strong>${esc(stages[data.stage])}</strong></p>
        <ul class="library-tags" aria-label="Etiquetas">${data.tags.map(tag => `<li>${esc(tag)}</li>`).join('')}</ul>
        ${data.note ? `<p class="library-note">${esc(data.note)}</p>` : ''}
        <div class="project-data"><div><span>ÁREA DO LOTE</span><strong>${number(lot.area)} m²</strong></div><div><span>BASE TERRITORIAL</span><strong>${lot.geometry ? 'Geometria informada' : 'Demonstrativa'}</strong></div></div>
        <div class="library-actions"><button class="btn" data-lot="${esc(lot.id)}" data-resume-study>Abrir estudo ${icon('arrowRight')}</button>
        <button class="btn" data-library-edit="${esc(lot.id)}">Organizar</button>
        <button class="btn" data-library-stage="${data.stage === 'archived' ? 'triage' : 'archived'}" data-library-id="${esc(lot.id)}">${data.stage === 'archived' ? 'Restaurar para triagem' : 'Arquivar'}</button></div>
        ${editor(entry)}</div></article>`;
    }).join('');
  }

  function view() {
    const tags = new Map();
    entries().forEach(entry => metadata(entry).tags.forEach(tag => tags.set(normalize(tag), tag)));
    return `${heading('BIBLIOTECA DE ESTUDOS', 'Meus estudos', 'Localize e acompanhe seus estudos pessoais.', btn('Novo estudo', 'plus', 'new-analysis', 'primary'))}
      <section aria-label="Filtros de estudos" class="panel library-filters">
      <label>Buscar por nome<input type="search" data-library-filter="query" value="${esc(filters.query)}" placeholder="Nome do estudo"></label>
      <label>Etapa<select data-library-filter="stage">${stageOptions(filters.stage, true)}</select></label>
      <label>Etiqueta<select data-library-filter="tag"><option value="">Todas as etiquetas</option>${[...tags].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')).map(([key, label]) => `<option value="${esc(key)}" ${filters.tag === key ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></label>
      <button class="btn" data-library-clear>Limpar filtros</button></section>
      <p id="library-announcement" role="status" aria-live="polite">${esc(announcement)}</p>
      <div class="project-grid" id="library-cards">${cards()}</div>
      <p class="financial-note">Organizar estudos não consome usos. Arquivados conservam os dados e documentos. Use “Salvar estudo” na análise para guardar alterações do cenário.</p>`;
  }

  function announce(text) {
    announcement = text;
    const node = document.getElementById('library-announcement');
    if (node) node.textContent = text;
  }

  function updateCards() {
    const grid = document.getElementById('library-cards');
    if (grid) grid.innerHTML = cards();
  }

  function openEditor(id) {
    const entry = state.savedCustom[id];
    if (!entry) return;
    if (!drafts.has(id)) {
      const data = metadata(entry);
      drafts.set(id, {...data, tagsText: data.tags.join('\n')});
    }
    editingId = id;
    updateCards();
    document.querySelector('[data-library-form] select')?.focus();
  }

  async function save(id) {
    const draft = drafts.get(id), token = generation;
    if (!draft || draft.saving || draft.conflict) return;
    draft.saving = true;
    draft.message = 'Salvando organização…';
    updateCards();
    announce(draft.message);
    try {
      const result = await window.ViabilAuth.saveStudyMetadata(id, {
        expectedRevision: draft.revision, stage: draft.stage,
        tags: draft.tagsText.trim() ? draft.tagsText.split('\n') : [], note: draft.note,
      });
      if (token !== generation) return;
      state.savedCustom[id].metadata = result;
      drafts.delete(id);
      editingId = null;
      render();
      announce(result.stage === 'archived' ? 'Estudo arquivado. Use o filtro Arquivado para reabrir ou restaurar.' : 'Organização salva.');
      const card = [...document.querySelectorAll('[data-study-card]')].find(node => node.dataset.studyCard === id);
      (card?.querySelector('[data-library-edit]') || document.querySelector('[data-library-filter="stage"]'))?.focus();
    } catch (error) {
      if (token !== generation) return;
      draft.saving = false;
      draft.conflict = error.code === 'METADATA_CONFLICT';
      draft.failed = !draft.conflict;
      draft.message = draft.conflict ? 'Outra sessão salvou uma alteração. Seu rascunho foi mantido. Carregue a revisão atual para comparar antes de salvar.' : `Gravação pendente. ${error.message} Seu rascunho foi mantido.`;
      updateCards();
      announce(draft.message);
      document.querySelector(draft.conflict ? '[data-library-current]' : '[data-library-form] [type="submit"]')?.focus();
    }
  }

  async function loadCurrent(id) {
    const draft = drafts.get(id), token = generation;
    if (!draft || draft.saving) return;
    draft.saving = true;
    updateCards();
    announce('Carregando revisão atual…');
    try {
      const latest = await window.ViabilAuth.getStudyMetadata(id);
      if (token !== generation) return;
      state.savedCustom[id].metadata = latest;
      const adjustFilters = !matches(state.savedCustom[id]);
      if (adjustFilters) filters = {query: '', stage: latest.stage, tag: ''};
      Object.assign(draft, {latest, revision: latest.revision, conflict: false, failed: false,
        message: 'Revisão atual carregada abaixo. Sua proposta permanece nos campos. Revise e salve para reaplicá-la.'});
      if (adjustFilters) draft.message += ' Filtros ajustados para exibir esta revisão.';
    } catch (error) {
      if (token !== generation) return;
      draft.message = `Não foi possível carregar a revisão. ${error.message} Seu rascunho foi mantido.`;
    }
    if (token !== generation) return;
    draft.saving = false;
    render();
    announce(draft.message);
    document.querySelector('[data-library-form] select')?.focus();
  }

  document.addEventListener('input', event => {
    const target = event.target;
    if (target.dataset.libraryFilter === 'query') {
      filters.query = target.value;
      updateCards();
      announce(`${entries().filter(entry => matches(entry)).length} estudos encontrados.`);
    }
    const form = target.closest('[data-library-form]');
    if (form) {
      const draft = drafts.get(form.dataset.libraryForm);
      if (draft) draft[target.name === 'tags' ? 'tagsText' : target.name] = target.value;
    }
  });

  document.addEventListener('change', event => {
    const key = event.target.dataset.libraryFilter;
    // Search already updates on input. Its blur/change must preserve the focused card.
    if (key && key !== 'query') {
      filters[key] = event.target.value;
      updateCards();
      announce(`${entries().filter(entry => matches(entry)).length} estudos encontrados.`);
    }
  });

  document.addEventListener('submit', event => {
    if (!event.target.matches('[data-library-form]')) return;
    event.preventDefault();
    void save(event.target.dataset.libraryForm);
  });

  document.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.hasAttribute('data-library-clear')) {
      filters = {query: '', stage: '', tag: ''};
      render();
      document.querySelector('[data-library-filter="query"]')?.focus();
    }
    if (button.hasAttribute('data-library-edit')) openEditor(button.dataset.libraryEdit);
    if (button.hasAttribute('data-library-close')) {
      const id = editingId;
      editingId = null;
      updateCards();
      [...document.querySelectorAll('[data-library-edit]')].find(node => node.dataset.libraryEdit === id)?.focus();
    }
    if (button.hasAttribute('data-library-stage')) {
      const id = button.dataset.libraryId;
      if (drafts.get(id)?.saving) return;
      openEditor(id);
      drafts.get(id).stage = button.dataset.libraryStage;
      void save(id);
    }
    if (button.hasAttribute('data-library-current')) void loadCurrent(button.dataset.libraryCurrent);
  });

  function reset() {
    generation++;
    filters = {query: '', stage: '', tag: ''};
    drafts = new Map();
    editingId = null;
    announcement = '';
  }

  return {view, reset, normalize, matches, metadata};
})();
