/* Contas e estudos privados. Tokens de sessão ficam somente em cookies HttpOnly. */
(() => {
  const root = document.getElementById('auth-root');
  const publicSite = document.getElementById('public-site');
  const profile = document.getElementById('account-dialog');
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const googleMark = '<svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.5 9.5 0 0 1-4.1 6.3v5.2h6.6c3.9-3.6 6.1-8.9 6.1-15.2Z"/><path fill="#34A853" d="M24 44c5.5 0 10.2-1.8 13.6-5l-6.6-5.1c-1.8 1.2-4.1 1.9-7 1.9-5.3 0-9.8-3.6-11.4-8.4H5.8v5.3A20.5 20.5 0 0 0 24 44Z"/><path fill="#FBBC05" d="M12.6 27.4a12.4 12.4 0 0 1 0-7.8v-5.3H5.8a20 20 0 0 0 0 18.4l6.8-5.3Z"/><path fill="#EA4335" d="M24 11.2c3 0 5.6 1 7.7 3L37.4 8A19.8 19.8 0 0 0 24 3 20.5 20.5 0 0 0 5.8 14.3l6.8 5.3C14.2 14.8 18.7 11.2 24 11.2Z"/></svg>';
  const initialAccountState = JSON.stringify(state);
  const initialLots = JSON.stringify(lots);
  let user = null, config = {googleOnly:false,registrationMode:'admin',passwordRecovery:false}, screen = 'login', resetToken = '', sentEmail = '', busy = false, timer, requestedPage = null, returnFocus = null;
  const avatar = (u, large = false) => `<span class="account-avatar${large ? ' large' : ''}">${u.avatar ? `<img src="${escape(u.avatar)}" alt="" referrerpolicy="no-referrer">` : escape(u.name.trim().split(/\s+/).slice(0,2).map(n => n[0]).join('').toUpperCase())}</span>`;
  const message = (target, text, good = false) => {
    const node = target.querySelector('[data-auth-message]');
    if (!node) return;
    node.textContent = text;
    node.className = 'auth-message' + (good ? ' success' : '');
    node.hidden = false;
    node.setAttribute('role', good ? 'status' : 'alert');
  };
  function clearStudies() {
    state.saved = new Set();
    state.savedCustom = {};
  }
  function resetWorkspace() {
    lots.splice(0, lots.length, ...JSON.parse(initialLots));
    for (const key of Object.keys(state)) delete state[key];
    Object.assign(state, JSON.parse(initialAccountState));
    clearStudies();
    window.ViabilUsage?.clear();
    state.page = 'overview'; state.step = 1; state.lotConfirmed = false;
    state.lookupDirty = false; state.parcelDirty = false;
    state.customPolygon = null; state.parcelDraft = null;
    state.lookupContext = null; state.lookupResult = null;
    state.lookupValues = {latitude:'',longitude:'',registration:'',office:'',address:''};
    document.getElementById('results-announcement').textContent = '';
    profile.innerHTML = '';
  }
  function showPublic(notice = '') {
    clearInterval(timer); user = null; resetToken = ''; requestedPage = null;
    document.querySelectorAll('[data-admin-nav]').forEach(button => button.hidden = true);
    if (profile.open) profile.close();
    if (menuOpen) setMenu(false, false);
    closeModal(); resetWorkspace(); render();
    for (const button of document.querySelectorAll('[data-account-open]')) {
      button.innerHTML = '<span class="account-avatar">VE</span><span>Entrar</span>';
      button.setAttribute('aria-label', 'Entrar na minha conta');
    }
    root.hidden = true; root.innerHTML = '';
    publicSite.hidden = false;
    document.body.dataset.auth = 'guest';
    document.getElementById('app').inert = true;
    document.title = 'ViabilEasy — Um novo olhar sobre cada terreno';
    const status = publicSite.querySelector('[data-public-status]');
    status.hidden = !notice; status.textContent = notice;
    if (returnFocus?.isConnected && returnFocus.getClientRects().length) returnFocus.focus({preventScroll:false});
  }
  function requireLogin(page = null, label = 'usar as ferramentas') {
    if (user && document.body.dataset.auth === 'ready') return true;
    requestedPage = ['analysis','projects'].includes(page) ? page : null;
    returnFocus = document.activeElement;
    gate('login', `Entre na sua conta para ${label}.`, true);
    return false;
  }
  function gate(mode = 'login', notice = '', good = false) {
    screen = mode;
    busy = false;
    if (profile.open) profile.close();
    if (menuOpen) setMenu(false, false);
    closeModal();
    document.body.dataset.auth = 'signin';
    document.getElementById('app').inert = true;
    publicSite.hidden = true;
    root.hidden = false;
    renderGate();
    document.title = ({login:'Entrar',register:'Criar conta',forgot:'Recuperar senha',sent:'Confira seu e-mail',reset:'Nova senha',expired:'Solicitar novo link',pending:'Cadastro em análise',rejected:'Cadastro não aprovado',offline:'Conectar'})[mode] + ' | ViabilEasy';
    if (notice) message(root, notice, good);
    window.scrollTo({top:0,behavior:'instant'});
    root.querySelector('h1')?.focus({ preventScroll: true });
  }
  async function request(path, method = 'GET', data) {
    let response;
    try {
      response = await fetch(path, { method, credentials: 'same-origin', headers: { 'Content-Type':'application/json', 'X-Viabileasy-Request':'1' }, ...(data ? { body: JSON.stringify(data) } : {}) });
    } catch { throw Error('Não foi possível conectar. Confira sua conexão e tente novamente.'); }
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401 && user && !path.includes('/auth/login')) {
        user = null;
        resetWorkspace(); render();
        gate('login', 'Sua sessão terminou. Entre novamente para continuar.');
      }
      throw Object.assign(Error(body.error || 'Não foi possível concluir agora. Tente novamente.'), {code:body.code});
    }
    return body;
  }
  const passwordIcon = revealed => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${revealed ? '<path d="m3 3 18 18M10.6 5.1A11 11 0 0 1 12 5c6.5 0 10 7 10 7a17.4 17.4 0 0 1-3 3.8M6.1 6.1A18 18 0 0 0 2 12s3.5 7 10 7a10.9 10.9 0 0 0 5.2-1.3M9.9 9.9a3 3 0 0 0 4.2 4.2"/>' : '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'}</svg>`;
  const passwordField = (label, id, confirm = false) => `<div class="auth-field"><label for="${id}">${label}</label><span class="auth-password"><input id="${id}" name="${confirm ? 'confirmation' : 'password'}" type="password" autocomplete="${screen === 'login' ? 'current-password' : 'new-password'}" ${screen !== 'login' ? 'minlength="12"' : ''} maxlength="128" required aria-describedby="${screen !== 'login' ? 'password-hint' : 'auth-feedback'}"><button type="button" data-password="${id}" data-password-label="${confirm ? 'confirmação de senha' : label.toLowerCase()}" aria-label="Mostrar ${confirm ? 'confirmação de senha' : label.toLowerCase()}" aria-controls="${id}" title="Mostrar ${confirm ? 'confirmação de senha' : label.toLowerCase()}" aria-pressed="false">${passwordIcon(false)}</button></span></div>`;
  const googleButton = `<button type="button" class="auth-google" data-auth-google>${googleMark}<span>Continuar com Google</span></button>`;
  const emailField = `<label class="auth-field" for="auth-email">E-mail<input id="auth-email" name="email" type="email" autocomplete="email" placeholder="voce@exemplo.com" maxlength="254" required></label>`;
  function renderGate() {
    clearInterval(timer);
    let content = '';
    if (config.registrationMode === 'admin' && ['login','register','forgot','reset','expired','sent'].includes(screen)) {
      if (screen === 'login') {
        content = `<div class="auth-kicker">SEU ESPAÇO DE POSSIBILIDADES</div><h1 tabindex="-1">Entre na sua conta.</h1><p class="auth-intro">Use o e-mail e a senha cadastrados para acessar seus estudos.</p><form id="auth-form" data-mode="login">${emailField}${passwordField('Senha', 'auth-password')}<div class="auth-options"><label><input name="remember" type="checkbox"> Manter conectado</label><button type="button" data-auth-view="forgot">Esqueci minha senha</button></div><p id="auth-feedback" data-auth-message class="auth-message" role="alert" hidden></p><button type="submit" class="auth-primary">Entrar na minha conta<span aria-hidden="true">→</span></button></form><p class="auth-footnote">Ainda não tem acesso? <button type="button" class="auth-text" data-auth-view="register">Saiba como solicitar</button></p>`;
      } else {
        const signup = screen === 'register';
        content = `<div class="auth-kicker">${signup ? 'SOLICITAR ACESSO' : 'RECUPERAR ACESSO'}</div><h1 tabindex="-1">${signup ? 'Vamos preparar sua conta.' : 'Precisa de uma nova senha?'}</h1><p class="auth-intro">${signup ? 'Fale com o administrador do ViabilEasy e informe seu nome e e-mail. Ele cadastrará sua conta e orientará seu primeiro acesso.' : 'Fale com o administrador do ViabilEasy para confirmar sua identidade e solicitar uma nova senha.'}</p><div class="auth-callout">${signup ? 'Após receber seu acesso, entre com o e-mail e a senha cadastrados. A liberação das ferramentas e dos usos é feita pelo administrador.' : 'A recuperação é feita com atendimento do administrador. Esta tela não envia links por e-mail.'}</div><p data-auth-message class="auth-message" role="status" hidden></p><button type="button" class="auth-primary" data-auth-view="login">Voltar para entrar<span aria-hidden="true">→</span></button>`;
      }
    } else if (config.googleOnly && ['login','register','forgot','reset','expired'].includes(screen)) {
      content = `<div class="auth-kicker">SEU ESPAÇO DE POSSIBILIDADES</div><h1 tabindex="-1">Entre com sua conta Google.</h1><p class="auth-intro">Use sua conta Google para acessar seus estudos ou solicitar seu primeiro acesso.</p>${config.googleEnabled ? googleButton : '<p class="auth-callout">O acesso está sendo configurado. Tente novamente em instantes.</p>'}<p data-auth-message class="auth-message" role="alert" hidden></p><p class="auth-footnote">Novos cadastros aguardam aprovação do administrador. Sua senha é gerenciada pelo Google.</p>`;
    } else if (screen === 'login' || screen === 'register') {
      const register = screen === 'register';
      content = `<div class="auth-kicker">SEU ESPAÇO DE POSSIBILIDADES</div><h1 tabindex="-1">${register ? 'Crie sua conta.' : 'Bom ter você aqui.'}</h1><p class="auth-intro">${register ? 'Solicite seu acesso. O superadministrador avaliará seu cadastro antes de liberar as ferramentas.' : 'Entre para retomar seus estudos e explorar novos terrenos.'}</p><div class="auth-tabs" aria-label="Acesso à conta"><button type="button" data-auth-view="login" ${!register ? 'aria-current="page"' : ''}>Entrar</button><button type="button" data-auth-view="register" ${register ? 'aria-current="page"' : ''}>Criar conta</button></div>${config.googleEnabled ? googleButton + '<div class="auth-divider"><span>ou use seu e-mail</span></div>' : ''}<form id="auth-form" data-mode="${screen}">${register ? '<label class="auth-field" for="auth-name">Seu nome<input id="auth-name" name="name" autocomplete="name" placeholder="Como podemos chamar você?" minlength="2" maxlength="100" required></label>' : ''}${emailField}${passwordField('Senha', 'auth-password')}${register ? '<p class="auth-hint" id="password-hint">Use pelo menos 12 caracteres. Uma frase também funciona.</p>' + passwordField('Confirme sua senha', 'auth-confirm', true) : '<div class="auth-options"><label><input name="remember" type="checkbox"> Manter conectado</label><button type="button" data-auth-view="forgot">Esqueci minha senha</button></div>'}<p id="auth-feedback" data-auth-message class="auth-message" role="alert" hidden></p><button type="submit" class="auth-primary">${register ? 'Criar minha conta' : 'Entrar na minha conta'}<span aria-hidden="true">→</span></button></form><p class="auth-footnote">${register ? 'Novas contas precisam de aprovação do superadministrador.' : 'Seus estudos ficam vinculados à sua conta e disponíveis quando você voltar.'}</p>`;
    } else if (screen === 'pending' || screen === 'rejected') {
      const pending = screen === 'pending';
      content = `<div class="auth-symbol" aria-hidden="true">${pending ? '◷' : '—'}</div><div class="auth-kicker">VALIDAÇÃO DO CADASTRO</div><h1 tabindex="-1">${pending ? 'Seu cadastro está em análise.' : 'Cadastro não aprovado.'}</h1><p class="auth-intro">${pending ? 'Seu pedido foi encaminhado ao superadministrador. Você poderá acessar as ferramentas depois que ele aprovar sua conta.' : 'O superadministrador não aprovou este cadastro. Fale com o responsável pelo sistema para esclarecer seu acesso.'}</p><div class="auth-callout">${pending ? (config.googleOnly ? 'Após a aprovação, volte e entre com a mesma conta Google.' : 'Após a aprovação, volte e entre com o mesmo e-mail e senha.') : 'Fale com o administrador para esclarecer a decisão sobre seu cadastro.'}</div><p data-auth-message class="auth-message" role="status" hidden></p><button type="button" class="auth-primary" data-auth-view="login">Voltar para entrar<span aria-hidden="true">→</span></button>`;
    } else if (screen === 'forgot') {
      content = `<button type="button" class="auth-back" data-auth-view="login">← Voltar para entrar</button><div class="auth-symbol" aria-hidden="true">↗</div><h1 tabindex="-1">Esqueceu sua senha?</h1><p class="auth-intro">Acontece. Informe seu e-mail e enviaremos um link para criar uma nova senha.</p><form id="auth-form" data-mode="forgot">${emailField}<p data-auth-message class="auth-message" role="alert" hidden></p><button type="submit" class="auth-primary">Enviar link de recuperação<span aria-hidden="true">→</span></button></form><p class="auth-footnote">O link é válido por 30 minutos e pode ser usado uma única vez.</p>`;
    } else if (screen === 'sent') {
      content = `<div class="auth-symbol" aria-hidden="true">✓</div><h1 tabindex="-1">Confira seu e-mail.</h1><p class="auth-intro">Se houver uma conta com <strong>${escape(sentEmail)}</strong>, você receberá as instruções para criar uma nova senha.</p><div class="auth-callout">Não encontrou? Confira também a pasta de spam ou lixo eletrônico.</div><p data-auth-message class="auth-message" role="status" hidden></p><button type="button" class="auth-primary" data-auth-view="login">Voltar para entrar<span aria-hidden="true">→</span></button><button type="button" class="auth-text" data-auth-resend disabled>Reenviar em 60 s</button><button type="button" class="auth-text" data-auth-view="forgot">Usar outro e-mail</button>`;
      let seconds = 60;
      timer = setInterval(() => { const button = root.querySelector('[data-auth-resend]'); if (!button) return clearInterval(timer); seconds--; button.textContent = seconds > 0 ? `Reenviar em ${seconds} s` : 'Reenviar link'; button.disabled = seconds > 0; if (!seconds) clearInterval(timer); }, 1000);
    } else if (screen === 'reset') {
      content = `<div class="auth-kicker">RECUPERE SEU ACESSO</div><h1 tabindex="-1">Uma nova senha.<br>Um novo começo.</h1><p class="auth-intro">Escolha uma senha para voltar aos seus estudos.</p><form id="auth-form" data-mode="reset">${passwordField('Nova senha', 'reset-password')}<p class="auth-hint" id="password-hint">Use pelo menos 12 caracteres.</p>${passwordField('Confirme a nova senha', 'reset-confirm', true)}<p data-auth-message class="auth-message" role="alert" hidden></p><button type="submit" class="auth-primary">Salvar nova senha<span aria-hidden="true">→</span></button></form>`;
    } else if (screen === 'expired') {
      content = '<div class="auth-symbol" aria-hidden="true">↻</div><h1 tabindex="-1">Vamos tentar de novo?</h1><p class="auth-intro">Este link expirou, já foi utilizado ou está incompleto. Peça outro para redefinir sua senha.</p><button type="button" class="auth-primary" data-auth-view="forgot">Solicitar novo link<span aria-hidden="true">→</span></button><button type="button" class="auth-text" data-auth-view="login">Voltar para entrar</button>';
    } else {
      content = '<h1 tabindex="-1">Não foi possível conectar.</h1><p class="auth-intro">Confira se o servidor está disponível e tente novamente.</p><button type="button" class="auth-primary" data-auth-retry>Tentar novamente</button>';
    }
    root.innerHTML = `<div class="auth-layout"><aside class="auth-story"><a class="auth-wordmark" href="/" aria-label="ViabilEasy início">Viabil<span>Easy</span><i></i></a><div class="auth-story-copy"><span class="auth-kicker">INTELIGÊNCIA URBANÍSTICA</span><h2>Cada terreno,<br>um mundo de<br><em>possibilidades.</em></h2><p>Explore o potencial construtivo, imagine cenários e mantenha suas ideias no mesmo lugar.</p><div class="auth-illustration" aria-hidden="true"><div class="auth-orbit"></div><div class="auth-building one"></div><div class="auth-building two"></div><div class="auth-building three"></div><span class="auth-plot"></span><span class="auth-pin">+</span></div></div><div class="auth-story-footer"><span class="auth-status-dot"></span> Seu próximo projeto começa aqui.</div></aside><main class="auth-main"><a href="/" class="auth-wordmark auth-mobile-wordmark">Viabil<span>Easy</span><i></i></a><div class="auth-card"><button type="button" class="auth-dismiss" data-auth-dismiss>← Voltar ao site</button>${content}</div><p class="auth-bottom">ViabilEasy · Mais clareza para construir possibilidades.</p></main></div>`;
    const input = root.querySelector('#auth-email');
    if (input && sentEmail) input.value = sentEmail;
  }
  function syncProfile() {
    document.querySelectorAll('[data-admin-nav]').forEach(button => button.hidden = user?.role !== 'super_admin');
    if (!user) return;
    window.ViabilUsage?.set(user.usage,user.id);
    for (const button of document.querySelectorAll('[data-account-open]')) {
      button.innerHTML = avatar(user) + (button.classList.contains('account-topbar') ? `<span class="account-short-name">${escape(user.name.split(' ')[0])}</span>` : `<span><strong>${escape(user.name)}</strong><small>Meu perfil e acesso</small></span>`);
      button.setAttribute('aria-label', 'Abrir perfil de ' + user.name);
    }
    const workspace = document.getElementById('workspace-button');
    workspace.innerHTML = `<span class="workspace-avatar">VE</span><span><strong>${user.role === 'super_admin' ? 'Superadministrador' : 'Minha conta'}</strong><small>${user.role === 'super_admin' ? 'Administração do sistema' : 'Estudos pessoais'}</small></span>`;
  }
  async function enter(account) {
    if (account?.accountStatus !== 'approved') {
      user = null; resetWorkspace(); syncProfile();
      gate(account?.accountStatus === 'rejected' ? 'rejected' : 'pending');
      return;
    }
    user = account;
    resetWorkspace();
    window.ViabilUsage?.set(user.usage,user.id);
    const data = await request('/api/studies');
    restoreParcelStudies(data.studies);
    state.page = requestedPage || (user.role === 'super_admin' ? 'admin' : 'overview'); requestedPage = null;
    publicSite.hidden = true;
    root.hidden = true;
    root.innerHTML = '';
    render();
    syncProfile();
    document.body.dataset.auth = 'ready';
    focusMain();
  }
  function openProfile() {
    if (!requireLogin(null, 'acessar seu perfil')) return;
    if (menuOpen) setMenu(false, false);
    closeModal();
    profile.innerHTML = `<div class="account-dialog-header"><div><span class="auth-kicker">SUA CONTA</span><h2 id="account-title">Meu perfil</h2><span class="account-badge">${user.role === 'super_admin' ? 'Superadministrador' : 'Usuário'}</span></div><button type="button" class="account-close" data-profile-close aria-label="Fechar perfil">×</button></div><div class="account-photo-row">${avatar(user, true)}<div><strong>Sua foto, seu espaço.</strong><p>Escolha uma imagem para o seu perfil.</p><div class="account-photo-actions"><button type="button" data-photo-pick>Escolher foto</button><button type="button" data-photo-camera class="account-camera">Usar câmera</button><button type="button" data-photo-remove ${!user.avatar ? 'disabled' : ''}>Remover</button></div></div></div><input type="file" id="account-photo-file" accept="image/jpeg,image/png,image/webp" hidden><input type="file" id="account-photo-camera" accept="image/*" capture="user" hidden><p class="auth-hint">PNG, JPEG ou WebP, até 5 MB. A foto será ajustada ao centro.</p><form id="profile-form"><label class="auth-field" for="profile-name">Seu nome<input id="profile-name" name="name" autocomplete="name" value="${escape(user.name)}" minlength="2" maxlength="100" required></label><label class="auth-field" for="profile-email">E-mail da conta<input id="profile-email" value="${escape(user.email)}" readonly type="email"></label><button type="submit" class="auth-primary">Salvar alterações<span aria-hidden="true">✓</span></button></form><p data-auth-message class="auth-message" role="status" hidden></p><div class="account-security"><h3>Usos da ferramenta</h3><p class="usage-profile-note">${user.role==='super_admin'?'Superadministrador: uso sem limite.':`${user.usage?.balance||0} usos disponíveis · ${user.usage?.used||0} análises consumidas. O superadministrador gerencia suas liberações.`}</p><h3>Acesso e segurança</h3>${config.googleEnabled ? `<div class="account-security-row"><div><strong>${user.googleConnected ? 'Google conectado' : 'Entrar com Google'}</strong><p>${user.googleConnected ? (config.googleOnly ? 'Seu acesso é feito com esta conta Google.' : 'Você também pode acessar com sua conta Google.') : 'Conecte a conta Google que usa este mesmo e-mail.'}</p></div>${user.googleConnected ? '<span class="account-badge">Conectado</span>' : config.googleEnabled ? '<button type="button" class="account-outline" data-google-link>Conectar</button>' : '<span class="account-badge" data-status="unavailable">Indisponível</span>'}</div>` : '<p class="auth-hint">Seu acesso é feito com e-mail e senha.</p>'}${config.googleOnly || config.passwordRecovery === false ? `<p class="auth-hint">${config.googleOnly ? 'Seu acesso e sua senha são gerenciados pela sua conta Google.' : 'Para recuperar sua senha, fale com o administrador.'}</p>` : `<div class="account-security-row"><div><strong>${user.hasPassword ? 'Redefinir senha' : 'Criar uma senha'}</strong><p>Enviaremos um link para o e-mail da sua conta.</p></div><button type="button" class="account-outline" data-profile-reset>Enviar link</button></div>`}</div><button type="button" class="account-logout" data-auth-logout>Sair da conta <span aria-hidden="true">↗</span></button>`;
    if (!profile.open) profile.showModal();
  }
  async function uploadPhoto(file) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024 || !['image/png','image/jpeg','image/webp'].includes(file.type)) return message(profile, 'Escolha uma foto PNG, JPEG ou WebP de até 5 MB.');
    let bitmap;
    try {
      bitmap = await createImageBitmap(file);
      if (bitmap.width * bitmap.height > 40_000_000) throw Error('Escolha uma foto com resolução menor.');
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      const ctx = canvas.getContext('2d'), side = Math.min(bitmap.width, bitmap.height);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 256, 256);
      ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256);
      const result = await request('/api/profile/photo', 'PUT', { image: canvas.toDataURL('image/jpeg', .9) });
      user = result.user; syncProfile(); openProfile(); message(profile, 'Foto atualizada.', true);
    } catch (e) { message(profile, e.message || 'Não foi possível abrir esta foto. Escolha outra imagem.'); }
    finally { bitmap?.close(); }
  }
  publicSite.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    returnFocus = button;
    if (button.hasAttribute('data-public-register')) { requestedPage = null; gate('register'); return; }
    if (button.hasAttribute('data-public-login')) { requestedPage = null; gate(); return; }
    if (button.hasAttribute('data-require-login')) requireLogin(button.dataset.requireLogin, button.dataset.accessLabel);
  });
  // Protect all workspace input paths, including the mobile menu and keyboard-generated clicks.
  for (const type of ['click','submit','input','change','pointerdown','wheel','paste','drop']) {
    document.addEventListener(type, event => {
      if (user && document.body.dataset.auth === 'ready') return;
      if (!event.target.closest?.('#app,.prototype-switcher,#mobile-dock,#modal-root,#geojson-input')) return;
      event.preventDefault(); event.stopImmediatePropagation();
      requireLogin();
    }, {capture:true, passive:false});
  }
  root.addEventListener('click', async event => {
    const target = event.target.closest('button');
    if (!target || busy) return;
    if (target.hasAttribute('data-auth-dismiss')) return showPublic();
    if (target.dataset.authView) return gate(target.dataset.authView);
    if (target.hasAttribute('data-password')) {
      const field = document.getElementById(target.dataset.password), visible = field.type === 'password';
      field.type = visible ? 'text' : 'password';
      target.innerHTML = passwordIcon(visible);
      const label = (visible ? 'Ocultar ' : 'Mostrar ') + (target.dataset.passwordLabel || 'senha');
      target.setAttribute('aria-pressed', String(visible)); target.setAttribute('aria-label', label); target.title = label; return;
    }
    if (target.hasAttribute('data-auth-google')) {
      if (!config.googleEnabled) return message(root, 'O acesso pelo Google ainda não está disponível. Tente novamente em instantes.');
      location.assign('/api/auth/google'); return;
    }
    if (target.hasAttribute('data-auth-retry')) return bootstrap();
    if (target.hasAttribute('data-auth-resend')) {
      target.disabled = true;
      try { await request('/api/auth/forgot-password', 'POST', { email: sentEmail }); gate('sent'); message(root, 'Solicitação recebida. Confira seu e-mail.', true); }
      catch(e) { message(root, e.message); target.disabled = false; }
    }
  });
  root.addEventListener('submit', async event => {
    event.preventDefault(); event.stopPropagation();
    if (busy) return;
    const form = event.target, fields = new FormData(form), mode = form.dataset.mode;
    const values = Object.fromEntries(fields);
    if (values.confirmation !== undefined && values.password !== values.confirmation) { message(root, 'As senhas precisam ser iguais.'); const confirmation = form.querySelector('[name=confirmation]'); confirmation.setAttribute('aria-invalid','true'); confirmation.setAttribute('aria-describedby','password-hint auth-feedback'); confirmation.dataset.uiMismatch = 'true'; confirmation.focus(); return; }
    const button = form.querySelector('[type=submit]'), label = button.innerHTML;
    busy = true; button.disabled = true; button.textContent = 'Só um instante…'; form.setAttribute('aria-busy', 'true');
    try {
      if (mode === 'forgot') {
        sentEmail = values.email;
        await request('/api/auth/forgot-password', 'POST', { email: sentEmail }); gate('sent');
      } else if (mode === 'reset') {
        const result = await request('/api/auth/reset-password', 'POST', { token: resetToken, password: values.password });
        user = null; clearStudies(); resetToken = ''; gate('login', result.message, true);
      } else {
        sentEmail = values.email;
        const result = await request('/api/auth/' + mode, 'POST', { ...values, remember: fields.has('remember') });
        await enter(result.user);
      }
    } catch (e) { if (e.code === 'ACCOUNT_PENDING' || e.code === 'ACCOUNT_REJECTED') { user = null; resetWorkspace(); syncProfile(); gate(e.code === 'ACCOUNT_PENDING' ? 'pending' : 'rejected'); } else message(root, e.message); }
    finally { busy = false; button.disabled = false; button.innerHTML = label; form.removeAttribute('aria-busy'); }
  });
  profile.addEventListener('click', async event => {
    const button = event.target.closest('button');
    if (!button || busy) return;
    if (button.hasAttribute('data-profile-close')) { profile.close(); return; }
    if (button.hasAttribute('data-photo-pick')) { document.getElementById('account-photo-file').click(); return; }
    if (button.hasAttribute('data-photo-camera')) { document.getElementById('account-photo-camera').click(); return; }
    if (button.hasAttribute('data-google-link')) {
      if (!config.googleEnabled) return message(profile, 'O acesso pelo Google ainda não está disponível.');
      location.assign('/api/auth/google?link=1'); return;
    }
    busy = true; button.disabled = true;
    try {
      if (button.hasAttribute('data-photo-remove')) {
        const result = await request('/api/profile/photo', 'PUT', { image: null });
        user = result.user; syncProfile(); openProfile(); message(profile, 'Foto removida.', true);
      }
      if (button.hasAttribute('data-profile-reset')) {
        await request('/api/auth/forgot-password', 'POST', { email: user.email });
        message(profile, 'Solicitação recebida. Confira seu e-mail para criar uma nova senha.', true);
      }
      if (button.hasAttribute('data-auth-logout')) {
        await request('/api/auth/logout', 'POST', {});
        user = null; showPublic();
      }
    } catch (e) { message(profile, e.message); }
    finally { busy = false; button.disabled = false; }
  });
  profile.addEventListener('change', async event => {
    if (!event.target.matches('input[type=file]') || busy) return;
    busy = true;
    profile.setAttribute('aria-busy', 'true');
    try { await uploadPhoto(event.target.files[0]); }
    finally { busy = false; profile.removeAttribute('aria-busy'); }
  });
  profile.addEventListener('submit', async event => {
    event.preventDefault(); event.stopPropagation();
    if (busy) return;
    busy = true;
    const button = event.target.querySelector('[type=submit]'); button.disabled = true;
    try {
      const result = await request('/api/profile', 'PUT', { name: new FormData(event.target).get('name') });
      user = result.user; syncProfile(); message(profile, 'Perfil atualizado.', true);
    } catch(e) { message(profile, e.message); }
    finally { busy = false; button.disabled = false; }
  });
  document.querySelectorAll('[data-account-open]').forEach(button => button.addEventListener('click', openProfile));
  document.getElementById('workspace-button').addEventListener('click', openProfile);
  // Keep application keyboard shortcuts from changing the study while accessing an account.
  document.addEventListener('keydown', event => {
    // Public demonstration controls have their own keyboard interactions.
    if (!publicSite.hidden && event.target.closest?.('#public-site')) return;
    if (document.body.dataset.auth !== 'ready' || profile.open) event.stopImmediatePropagation();
  }, true);
  window.addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden || !user) return;
    try {
      const session = await request('/api/auth/session');
      if (!session.user || session.user.id !== user.id) { user = null; syncProfile(); resetWorkspace(); render(); gate('login', 'Sua sessão mudou. Entre novamente para continuar.'); }
      else { const changed=session.user.role!==user.role; user=session.user; syncProfile(); if(changed){if(state.page==='admin'&&user.role!=='super_admin')state.page='overview';render();} }
    } catch {}
  });
  window.ViabilAuth = {
    openProfile,
    requireLogin,
    isSuperAdmin: () => user?.role === 'super_admin' && user?.accountStatus === 'approved',
    accountId: () => user?.id,
    isAuthenticated: () => Boolean(user && document.body.dataset.auth === 'ready'),
    async saveStudy(entry) {
      if (!user) { gate(); throw Error('Entre na sua conta para salvar o estudo.'); }
      const accountId=user.id;
      const result=await request('/api/studies/'+encodeURIComponent(entry.lot.id),'PUT',entry);
      if(user?.id!==accountId)throw Error('A sessão mudou. Entre novamente.');
      user.usage=result.usage; window.ViabilUsage?.set(result.usage,user.id);
      return result.study;
    },
    async recordStudyAccess(id) {
      if (!user || !state.savedCustom[id]) return;
      const accountId = user.id;
      const activity = await request('/api/studies/' + encodeURIComponent(id) + '/open', 'POST', {});
      if (user?.id !== accountId || !state.savedCustom[id]) return;
      Object.assign(state.savedCustom[id], activity);
      if (state.page === 'overview') render();
    }
  };
  async function bootstrap() {
    document.body.dataset.auth = 'loading';
    root.hidden = true; root.innerHTML = ''; publicSite.hidden = false;
    document.getElementById('app').inert = true;
    const url = new URL(location.href), fragment = new URLSearchParams(url.hash.slice(1));
    resetToken = fragment.get('reset') || resetToken;
    const errorCode = url.searchParams.get('auth_error');
    if (fragment.has('reset') || errorCode) {
      url.hash = ''; url.searchParams.delete('auth_error'); history.replaceState({}, '', url);
    }
    try {
      const session = await request('/api/auth/session');
      config = session;
      publicSite.querySelectorAll('[data-public-register]').forEach(button => {
        button.innerHTML = (config.registrationMode === 'admin' ? 'Solicitar acesso' : 'Criar minha conta') + ' <span aria-hidden="true">→</span>';
      });
      if (resetToken) {
        try { await request('/api/auth/reset/check', 'POST', { token: resetToken }); gate('reset'); }
        catch { resetToken = ''; gate('expired'); }
      } else if (errorCode === 'approval_pending' || errorCode === 'approval_rejected') {
        gate(errorCode === 'approval_pending' ? 'pending' : 'rejected');
      } else if (session.user) {
        await enter(session.user);
        if (errorCode) { openProfile(); message(profile, googleError(errorCode)); }
      } else if (errorCode) gate('login', googleError(errorCode));
      else if (root.hidden) showPublic();
      else renderGate();
    } catch { user = null; showPublic('Não foi possível conectar ao servidor. Você pode conhecer o site e tentar entrar novamente.'); }
  }
  function googleError(code) {
    return ({
      google_unavailable: 'O acesso pelo Google ainda não está disponível. Tente novamente em instantes.',
      google_cancelled: 'Você cancelou o acesso com Google. Pode tentar novamente.',
      google_expired: 'A tentativa de acesso expirou. Tente novamente.',
      google_conflict: 'Este e-mail já tem uma conta. Entre com sua senha e conecte o Google pelo perfil, ou recupere a senha.',
      google_email: 'Escolha a conta Google com o mesmo e-mail do seu perfil.',
      google_failed: 'Não foi possível concluir o acesso com Google. Tente novamente.'
    })[code] || 'Não foi possível concluir o acesso com Google.';
  }
  window.addEventListener('hashchange', () => { if (new URLSearchParams(location.hash.slice(1)).has('reset')) bootstrap(); });
  bootstrap();
})();
