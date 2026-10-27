/* Disclosure navigation and field-level feedback, without changing authentication or validation rules. */
(() => {
  const button = document.querySelector('[data-public-menu]');
  const nav = document.getElementById('public-navigation');
  const compact = matchMedia('(max-width: 767px)');
  let open = false;
  function sync() {
    button.hidden = !compact.matches;
    nav.hidden = compact.matches && !open;
    button.setAttribute('aria-expanded', String(open && compact.matches));
    button.setAttribute('aria-label', open ? 'Fechar navegação do site' : 'Abrir navegação do site');
  }
  button.addEventListener('click', () => { open = !open; sync(); });
  nav.addEventListener('click', event => { if (event.target.closest('a')) { open = false; sync(); } });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && open) { open = false; sync(); button.focus({preventScroll:true}); }
  });
  document.addEventListener('pointerdown', event => {
    if (open && !nav.contains(event.target) && !button.contains(event.target)) { open = false; sync(); }
  });
  compact.addEventListener('change', () => { open = false; sync(); });
  sync();
  let errorId = 0;
  function clearError(field) {
    const id = field.dataset.uiError;
    if (!id) return;
    document.getElementById(id)?.remove();
    const ids = (field.getAttribute('aria-describedby') || '').split(/\s+/).filter(value => value && value !== id);
    if (ids.length) field.setAttribute('aria-describedby', ids.join(' ')); else field.removeAttribute('aria-describedby');
    field.removeAttribute('aria-invalid'); delete field.dataset.uiError;
  }
  document.addEventListener('invalid', event => {
    const field = event.target;
    if (!field.matches('#auth-root input,#account-dialog input')) return;
    clearError(field);
    const validity = field.validity;
    const text = validity.valueMissing ? 'Preencha este campo.' : validity.typeMismatch ? 'Informe um e-mail válido.'
      : validity.tooShort ? `Use pelo menos ${field.minLength} caracteres.` : field.validationMessage;
    const message = document.createElement('span');
    message.className = 'field-error'; message.id = `ui-field-error-${++errorId}`; message.textContent = text;
    message.setAttribute('role','alert');
    const anchor = field.closest('.auth-password') || field;
    anchor.after(message);
    field.dataset.uiError = message.id; field.setAttribute('aria-invalid','true');
    field.setAttribute('aria-describedby', [field.getAttribute('aria-describedby'),message.id].filter(Boolean).join(' '));
  }, true);
  document.addEventListener('input', event => {
    if (event.target.dataset.uiError && event.target.validity.valid) clearError(event.target);
    const form = event.target.closest('#auth-form');
    const confirmation = form?.querySelector('[data-ui-mismatch]');
    if (confirmation && form.querySelector('[name=password]').value === confirmation.value) { confirmation.removeAttribute('aria-invalid'); confirmation.setAttribute('aria-describedby','password-hint'); delete confirmation.dataset.uiMismatch; }
  });
})();
