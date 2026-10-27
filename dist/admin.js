/* Administrative data is authorized on the server and is never stored in the browser. */
(() => {
  let requestVersion = 0, accounts = new Map();
  function usageSection(data){return `<section class="panel admin-section" aria-labelledby="admin-usage-title"><div class="panel-title"><h2 id="admin-usage-title">Gerenciar usos por usuário</h2><span>Sem renovação mensal</span></div><p class="admin-approval-intro">Cada conta começa com 0 usos. Após aprovar o cadastro, libere a quantidade de análises para aquela pessoa. O superadministrador possui uso sem limite.</p><div class="admin-usage-list">${data.users.filter(account=>account.role!=='super_admin').map(account=>`<article class="admin-usage-card"><div><h3>${esc(account.name)}</h3><p>${esc(account.email)}</p><span class="account-approval" data-status="${esc(account.accountStatus)}">${approvalLabel(account.accountStatus)}</span></div><div class="admin-usage-summary"><strong>${number(account.creditBalance)} <small>disponíveis</small></strong><span>${number(account.usedCredits)} análises consumidas</span></div><button class="btn primary" data-manage-credits="${esc(account.id)}" ${account.accountStatus!=='approved'?'disabled':''} aria-label="Liberar usos para ${esc(account.name)}">${account.accountStatus==='approved'?'Liberar usos':'Aguarda aprovação'}</button></article>`).join('')||'<p class="admin-empty">Novos usuários aparecerão aqui para a liberação individual de usos.</p>'}</div></section>`;}
  const approvalLabel = value => ({approved:'Aprovado',pending:'Pendente',rejected:'Recusado'}[value] || 'Pendente');
  function pendingSection(data) {
    return `<section class="panel admin-section" aria-labelledby="admin-pending-title"><div class="panel-title"><h2 id="admin-pending-title">Cadastros aguardando aprovação</h2><span>${number(data.totals.pendingUsers)} ${data.totals.pendingUsers===1?'pendente':'pendentes'}</span></div>${data.pendingUsers.length ? `<p class="admin-approval-intro">Confira nome e e-mail antes de liberar o acesso. A fila mostra até 100 pedidos, dos mais antigos aos mais recentes.</p><div class="admin-pending-list">${data.pendingUsers.map(account=>`<article class="admin-pending-account" data-review-card><div><h3>${esc(account.name)}</h3><p>${esc(account.email)}</p><small>Perfil: ${account.role==='super_admin'?'Superadministrador':'Usuário'} · Solicitado em ${date(account.createdAt)}</small></div><div class="admin-review-actions"><button class="btn primary" data-account-review="${esc(account.id)}" data-decision="approved" aria-label="Aprovar acesso de ${esc(account.name)}">Aprovar acesso</button><button class="btn" data-account-review="${esc(account.id)}" data-decision="rejected" aria-label="Recusar cadastro de ${esc(account.name)}">Recusar</button></div></article>`).join('')}</div>` : '<p class="admin-empty">Nenhum cadastro pendente. Novos pedidos aparecerão aqui para sua análise.</p>'}</section>`;
  }
  const date = value => new Intl.DateTimeFormat('pt-BR', {dateStyle:'short'}).format(new Date(value));
  function view() {
    if (!window.ViabilAuth?.isSuperAdmin()) return `${heading('ACESSO RESTRITO','Administração.','Esta área exige o perfil de superadministrador.')}`;
    return `${heading('ADMINISTRAÇÃO · SUPERADMINISTRADOR','Visão geral do sistema.','Acompanhe as contas e os estudos salvos no ViabilEasy.','<button class="btn primary" data-open-documents>'+icon('upload')+'Documentos oficiais</button><button class="btn" data-admin-refresh>'+icon('rotate')+'Atualizar dados</button>')}<p id="admin-feedback" class="admin-feedback" role="status" aria-live="polite" hidden></p><div id="admin-content" aria-live="polite" aria-busy="true"><p class="panel admin-loading" role="status">Carregando os dados do sistema…</p></div>`;
  }
  async function mount() {
    const node = document.getElementById('admin-content');
    if (!node || !window.ViabilAuth?.isSuperAdmin()) return;
    const accountId = window.ViabilAuth.accountId(), version = ++requestVersion;
    try {
      const response = await fetch('/api/admin/overview', {credentials:'same-origin', cache:'no-store'});
      const data = await response.json();
      if (!node.isConnected || version !== requestVersion || window.ViabilAuth.accountId() !== accountId || !window.ViabilAuth.isSuperAdmin()) return;
      if (!response.ok) throw Error(data.error || 'Não foi possível carregar os dados.');
      accounts=new Map(data.users.map(account=>[account.id,account]));
      node.innerHTML = `<div class="overview-stats admin-stats">${metric('CONTAS CADASTRADAS',number(data.totals.users),'Todas as contas do sistema')}${metric('ESTUDOS SALVOS',number(data.totals.studies),'Total de estudos das contas')}${metric('CADASTROS PENDENTES',number(data.totals.pendingUsers),'Aguardando sua aprovação')}${metric('SESSÕES ATIVAS',number(data.totals.activeSessions),'Sessões dentro do prazo de acesso')}</div>${pendingSection(data)}${usageSection(data)}<section class="panel admin-section" aria-labelledby="admin-users-title"><div class="panel-title"><h2 id="admin-users-title">Contas do sistema</h2><span>Até 100 cadastros mais recentes</span></div><div class="table-scroll"><table class="admin-table"><thead><tr><th scope="col">Conta</th><th scope="col">Perfil</th><th scope="col">Aprovação</th><th scope="col">Estudos</th><th scope="col">Cadastro</th></tr></thead><tbody>${data.users.map(account=>`<tr><td><strong>${esc(account.name)}</strong><span class="admin-email">${esc(account.email)}</span></td><td><span class="account-badge">${account.role==='super_admin'?'Superadministrador':'Usuário'}</span></td><td><span class="account-approval" data-status="${esc(account.accountStatus)}">${approvalLabel(account.accountStatus)}</span>${account.reviewedAt?`<small class="admin-email">${date(account.reviewedAt)} · ${esc(account.reviewerName||'Superadministrador')}</small>`:''}</td><td>${number(account.studyCount)}</td><td>${date(account.createdAt)}</td></tr>`).join('') || '<tr><td colspan="5">Nenhuma conta cadastrada.</td></tr>'}</tbody></table></div></section><section class="panel admin-section" aria-labelledby="admin-studies-title"><div class="panel-title"><h2 id="admin-studies-title">Últimos estudos salvos</h2><span>Até 20 estudos mais recentes</span></div>${data.recentStudies.length?`<div class="table-scroll"><table class="admin-table"><thead><tr><th scope="col">Estudo</th><th scope="col">Responsável</th><th scope="col">Atualização</th></tr></thead><tbody>${data.recentStudies.map(study=>`<tr><td><strong>${esc(study.name)}</strong><span class="admin-email">${esc(study.id)}</span></td><td>${esc(study.ownerName)}<span class="admin-email">${esc(study.ownerEmail)}</span></td><td>${date(study.updatedAt)}</td></tr>`).join('')}</tbody></table></div>`:'<p class="admin-empty">Os estudos aparecerão aqui quando forem salvos pelas contas.</p>'}</section>`;
    } catch (error) {
      if (node.isConnected && version === requestVersion) node.innerHTML = `<p class="admin-empty" role="alert">${esc(error.message)}</p><button class="btn" data-admin-refresh>Tentar novamente</button>`;
    } finally { if (node.isConnected && version === requestVersion) node.setAttribute('aria-busy','false'); }
  }
  document.addEventListener('submit',async event=>{
    if(event.target.id!=='grant-uses-form')return;
    event.preventDefault();const form=event.target,button=form.querySelector('[type=submit]');if(button.disabled)return;
    const account=accounts.get(form.dataset.accountId),feedback=form.querySelector('[role=alert]'),data=new FormData(form);
    const amount=Number(data.get('amount'));button.disabled=true;feedback.hidden=true;
    try{
      const response=await fetch('/api/admin/users/'+encodeURIComponent(form.dataset.accountId)+'/credits',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Viabileasy-Request':'1'},body:JSON.stringify({amount,note:data.get('note'),requestKey:form.dataset.requestKey})});
      const result=await response.json();if(!response.ok)throw Error(result.error||'Não foi possível liberar os usos.');
      closeModal();await mount();const message=document.getElementById('admin-feedback');if(message){message.hidden=false;message.setAttribute('role','status');message.textContent=`${amount} usos liberados para ${account.name}. Saldo disponível: ${result.usage.balance}.`;}
      const title=document.getElementById('admin-usage-title');if(title){title.tabIndex=-1;title.focus({preventScroll:true});}
    }catch(error){if(form.isConnected){feedback.hidden=false;feedback.textContent=error.message;button.disabled=false;}}
  });
  document.addEventListener('click', async event => {
    const manage=event.target.closest('[data-manage-credits]');
    if(manage&&!manage.disabled){const account=accounts.get(manage.dataset.manageCredits);if(!account)return;modal('Liberar usos para '+esc(account.name),`<p>Saldo atual: <strong>${number(account.creditBalance)} usos</strong>. Cada análise nova consome 1 uso.</p><form id="grant-uses-form" data-account-id="${esc(account.id)}" data-request-key="${crypto.randomUUID()}"><label class="setback-field" for="grant-uses-amount">Quantidade de usos a adicionar<input id="grant-uses-amount" name="amount" type="number" min="1" max="1000" step="1" required placeholder="Ex.: 5"></label><label class="setback-field" for="grant-uses-note">Identificação da liberação (opcional)<input id="grant-uses-note" name="note" maxlength="250" placeholder="Ex.: liberação avulsa acordada"></label><p role="alert" class="auth-message" hidden></p><button class="btn primary" type="submit">Adicionar usos ao saldo</button></form>`);return;}

    const button = event.target.closest('[data-account-review]');
    if (button && !button.disabled && state.page === 'admin') {
      const card = button.closest('[data-review-card]'), name = card.querySelector('h3').textContent;
      const buttons = [...card.querySelectorAll('button')];
      const feedback = document.getElementById('admin-feedback');
      buttons.forEach(item=>item.disabled=true);
      feedback.hidden=false; feedback.setAttribute('role','status'); feedback.textContent='Salvando a decisão…';
      try {
        const response = await fetch('/api/admin/users/'+encodeURIComponent(button.dataset.accountReview)+'/review',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Viabileasy-Request':'1'},body:JSON.stringify({decision:button.dataset.decision})});
        const data = await response.json();
        if (!response.ok) throw Error(data.error || 'Não foi possível validar o cadastro.');
        if (feedback.isConnected) feedback.textContent=button.dataset.decision==='approved'?`Acesso de ${name} aprovado. A pessoa já pode entrar; libere os usos na seção de gerenciamento.`:`Cadastro de ${name} recusado. O acesso permanece bloqueado.`;
        await mount();
      } catch(error) {
        if(feedback.isConnected){feedback.setAttribute('role','alert');feedback.textContent=error.message;}
        buttons.forEach(item=>item.disabled=false);
      }
      return;
    }
    if (event.target.closest('[data-admin-refresh]') && state.page === 'admin') { render(); focusMain(); }
  });
  window.ViabilAdmin = {view, mount};
})();
