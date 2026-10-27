import { demoParcel, scenarios, prepareExperienceData } from './data.js';
import { renderExperience } from './ui.js';
import { buildComparison, demoFinancialAssumptions, formatMoney, formatPercent } from './comparison.js';
import { renderComparison } from './comparison-ui.js';
import { createIntroTour } from './tour.js';

const number = (value, digits = 0) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits }).format(value);

/** Public, self-contained demonstration. It never reads or writes account studies. */
export function mountExperience(root, input = { parcel: demoParcel, scenarios, financialAssumptions: demoFinancialAssumptions }) {
  const data = prepareExperienceData(input);
  renderExperience(root, data);
  const find = selector => root.querySelector(selector);
  const all = selector => [...root.querySelectorAll(selector)];
  const viewport = find('[data-scene-viewport]');
  const comparison = buildComparison(data.scenarios, input.financialAssumptions ?? null);
  renderComparison(find('[data-comparison-root]'), comparison);
  comparison.rows.forEach(row => {
    const potential = find(`[data-scenario-potential="${row.id}"]`);
    const viability = find(`[data-scenario-viability="${row.id}"]`);
    if (potential) potential.textContent = row.investmentPotential;
    if (viability) { viability.textContent = row.viability.label; viability.dataset.tone = row.viability.tone; }
  });
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  const publicSite = root.closest('#public-site');
  let engine = null;
  let loading = null;
  let disposed = false;
  let failed = false;
  let visible = false;
  let active = false;
  let interacted = false;
  let initializedTour = false;
  let selected = Math.max(0, data.scenarios.findIndex(item => item.id === 'house'));
  let layer = 'building';
  let exploded = false;
  let touchRotation = false;
  let view = 'iso';
  const toggles = { technical: false, envelope: false, transparent: false, dimensions: false };
  root.dataset.dimensions = 'false';
  let tourRunning = false;
  let tourIndex = -1;
  let timer = null;
  let deadline = 0;
  let remaining = 0;
  let metricFrame = null;
  let displayedMetrics = null;

  const tour = createIntroTour(data.scenarios);

  function announce(message) { find('[data-scene-status]').textContent = message; }
  function pressed(selector, value, attribute) {
    all(selector).forEach(button => button.setAttribute('aria-pressed', String(button.getAttribute(attribute) === value)));
  }
  function renderMetrics(animate = false) {
    cancelAnimationFrame(metricFrame);
    const target = data.scenarios[selected].metrics;
    const previous = displayedMetrics || target;
    const start = performance.now();
    const paint = progress => {
      displayedMetrics = {};
      for (const key of ['coefficient', 'occupancy', 'permeability', 'computableArea']) {
        const value = previous[key] + (target[key] - previous[key]) * progress;
        displayedMetrics[key] = value;
        const suffix = key === 'coefficient' ? '×' : key === 'computableArea' ? ' m²' : '%';
        find(`[data-metric="${key}"]`).textContent = number(value, key === 'coefficient' ? 2 : 0) + suffix;
      }
    };
    if (!animate || media.matches || !active) { paint(1); return; }
    const tick = now => {
      const progress = Math.min(1, (now - start) / 480);
      paint(1 - Math.pow(1 - progress, 3));
      if (progress < 1 && active && !disposed) metricFrame = requestAnimationFrame(tick);
    };
    metricFrame = requestAnimationFrame(tick);
  }
  function renderSelection(animate = false) {
    const scenario = data.scenarios[selected];
    pressed('[data-scenario]', scenario.id, 'data-scenario');
    find('[data-scenario-name]').textContent = scenario.name;
    root.dataset.architecture = scenario.id;
    renderExploded();
    find('[data-scene-edition]').textContent = String(selected + 1).padStart(2, '0');
    find('[data-scenario-description]').textContent = scenario.description;
    find('[data-scenario-index]').textContent = `${String(selected + 1).padStart(2, '0')} / ${String(data.scenarios.length).padStart(2, '0')}`;
    find('[data-floors-label]').textContent = `${scenario.floors} pavimentos · ${number(scenario.floors * scenario.floorHeight, 1)} m de altura ilustrativa`;
    renderMetrics(animate);
    all('[data-comparison-highlight]').forEach(element => {
      element.classList.toggle('is-selected', element.dataset.comparisonHighlight === scenario.id);
    });
    const card = find(`[data-scenario="${scenario.id}"]`);
    const list = find('.ve-scenario-list');
    if (card && list && list.scrollWidth > list.clientWidth) {
      const cardRect = card.getBoundingClientRect(), listRect = list.getBoundingClientRect();
      const fullyVisible = cardRect.left >= listRect.left && cardRect.right <= listRect.right;
      if (!fullyVisible) list.scrollTo({ left: list.scrollLeft + cardRect.left - listRect.left - 2, behavior: media.matches ? 'instant' : 'smooth' });
    }
  }
  function renderLayer(phaseOverride) {
    pressed('[data-layer]', layer, 'data-layer');
    const phase = phaseOverride || (layer === 'building' ? 'scenarios' : layer);
    root.dataset.story = phase;
    all('[data-phase]').forEach(element => {
      const current = element.dataset.phase === phase;
      element.classList.toggle('is-active', current);
      if (current) element.setAttribute('aria-current', 'step');
      else element.removeAttribute('aria-current');
    });
    const label = layer === 'terrain' ? 'Terreno demonstrativo' : layer === 'envelope' ? 'Envelope ilustrativo' : `${data.scenarios[selected].name}${data.scenarios[selected].id === 'house' ? ' · versão final' : ''}`;
    find('[data-phase-label]').textContent = label;
    root.dataset.layer = layer;
    find('[data-explode]').disabled = layer !== 'building' || failed;
    const scenario = data.scenarios[selected];
    const description = layer === 'terrain'
      ? `Terreno demonstrativo vazio de ${number(data.parcel.area)} metros quadrados, testada de ${number(data.parcel.frontage)} metros.`
      : layer === 'envelope'
        ? `Envelope ilustrativo de ${number(data.parcel.envelopeHeight)} metros de altura. Recuos assumidos de ${data.parcel.setbacks.front} metros na frente, ${data.parcel.setbacks.side} metros nas laterais e ${data.parcel.setbacks.rear} metros nos fundos. Não representa autorização para construir.`
        : `${scenario.name}, ${scenario.floors} pavimentos, ${number(scenario.metrics.builtArea)} metros quadrados estimados.`;
    viewport.setAttribute('aria-label', `Modelo 3D demonstrativo: ${description} Use os botões ou as setas do teclado para girar e aproximar. No celular, ative Girar por toque para arrastar o modelo.`);
    const row = comparison.rows[selected];
    let title = 'Cinco estratégias. Um mesmo terreno.';
    let detail = 'Alterne os cenários e descubra como a área, o custo e o resultado mudam.';
    if (phase === 'comparison') {
      title = 'Mais área não garante o maior resultado.';
      detail = 'Compare o valor residual após reservar a mesma margem alvo para cada alternativa.';
    } else if (phase === 'opportunity' && comparison.winner) {
      title = `${comparison.winner.shortName} · maior potencial estimado`;
      detail = `${formatMoney(comparison.winner.residual)} de residual do terreno neste exemplo. Consulte as premissas da comparação.`;
    } else if (phase === 'scenarios' && row?.valid) {
      title = `${row.shortName} · ${formatMoney(row.revenue)} de VGV ilustrativo`;
      detail = `${formatPercent(row.profitability)} de retorno sobre custo no exemplo. Resultado do projeto, sem taxa anual.`;
    }
    find('[data-insight-title]').textContent = title;
    find('[data-insight-description]').textContent = detail;
  }
  function renderTour() {
    const pause = find('[data-tour="pause"]');
    const play = find('[data-tour="play"]');
    const focused = document.activeElement;
    pause.hidden = !tourRunning;
    play.hidden = tourRunning;
    if (tourRunning && focused === play) pause.focus({ preventScroll: true });
    if (!tourRunning && focused === pause) play.focus({ preventScroll: true });
    root.dataset.playing = String(tourRunning);
  }
  function selectScenario(index) {
    selected = index;
    layer = 'building';
    engine?.setScenario(data.scenarios[selected]);
    engine?.setLayer(layer);
    renderSelection(true);
    renderLayer();
  }
  function suspendTimer() {
    if (timer !== null) remaining = Math.max(0, deadline - performance.now());
    clearTimeout(timer);
    timer = null;
  }
  function scheduleTour() {
    clearTimeout(timer);
    timer = null;
    if (!tourRunning || !active || !engine) return;
    deadline = performance.now() + remaining;
    timer = setTimeout(nextStep, remaining);
  }
  function nextStep() {
    timer = null;
    tourIndex += 1;
    if (tourIndex >= tour.length) {
      tourRunning = false;
      renderTour();
      announce('Apresentação concluída. Escolha uma alternativa para explorar o mesmo terreno.');
      return;
    }
    const step = tour[tourIndex];
    layer = step.layer;
    if (step.scenario !== undefined) selectScenario(step.scenario);
    else { engine?.setLayer(layer); renderLayer(); }
    if (step.assembly) { exploded = false; engine?.replayAssembly(); }
    if (step.exploded !== undefined) { exploded = step.exploded; engine?.setExploded(exploded); }
    renderExploded();
    renderLayer(step.phase);
    find('[data-phase-label]').textContent = step.label;
    remaining = step.duration;
    scheduleTour();
  }
  function renderExploded() {
    const button = find('[data-explode]');
    const house = data.scenarios[selected].id === 'house';
    if (house) exploded = false;
    button.hidden = house;
    button.setAttribute('aria-pressed', String(exploded));
    button.querySelector('span').textContent = exploded ? 'Montar edifício' : 'Separar pavimentos';
    root.dataset.exploded = String(exploded);
    find('.ve-kinetic-action small').textContent = house ? 'Explore a casa pronta · controle a câmera abaixo' : exploded ? 'Distâncias expandidas apenas para visualização.' : 'Uma nova perspectiva, camada por camada.';
  }
  function pauseTour(userInitiated = false) {
    if (userInitiated) interacted = true;
    suspendTimer();
    tourRunning = false;
    renderTour();
  }
  function startTour(replay = false) {
    if (disposed || failed || !engine) return;
    engine.setPaused(false);
    if (replay || tourIndex < 0 || tourIndex >= tour.length) {
      clearTimeout(timer);
      timer = null;
      tourIndex = -1;
      view = 'iso';
      engine.setView(view);
      pressed('[data-view]', view, 'data-view');
      tourRunning = true;
      nextStep();
    } else { tourRunning = true; scheduleTour(); }
    renderTour();
  }
  function showFallback() {
    if (disposed) return;
    failed = true;
    pauseTour();
    cancelAnimationFrame(metricFrame);
    const failedEngine = engine;
    engine = null;
    failedEngine?.dispose();
    find('[data-scene-loading]').hidden = true;
    find('[data-scene-fallback]').hidden = false;
    viewport.hidden = true;
    root.dataset.renderer = 'fallback';
    all('[data-touch-rotate], [data-material], [data-camera], [data-view], [data-toggle], [data-layer], [data-tour], [data-explode]').forEach(button => { button.disabled = true; });
    announce('A visualização 3D não está disponível neste navegador. Você ainda pode comparar os cinco exemplos nos cards.');
  }
  function synchronizeActivity() {
    const next = visible && !document.hidden && !publicSite?.hidden && !disposed;
    if (next !== active) {
      active = next;
      engine?.setActive(active);
      if (active) { renderMetrics(); scheduleTour(); maybeStartTour(); }
      else { suspendTimer(); cancelAnimationFrame(metricFrame); }
    }
    if (active && !loading && !failed) ensureScene();
  }
  function maybeStartTour() {
    if (engine && !failed && data.scenarios[selected].id !== 'house' && !initializedTour && !interacted && !media.matches && active) {
      initializedTour = true;
      startTour(true);
    }
  }
  async function ensureScene() {
    if (loading || disposed || failed) return loading;
    loading = import('./scene.js').then(({ createExperience }) => {
      if (disposed) return;
      engine = createExperience(viewport, {
        ...data, scenario: data.scenarios[selected], reducedMotion: media.matches,
        onError: showFallback, onInteraction: () => pauseTour(true),
        onNorthChange: angle => { const compass = find('.ve-compass svg'); if (compass) compass.style.transform = `rotate(${angle}deg)`; },
      });
      if (failed) { engine?.dispose(); engine = null; return; }
      engine.setActive(active);
      engine.setView(view);
      engine.setScenario(data.scenarios[selected]);
      engine.setLayer(layer);
      engine.setTechnical(toggles.technical);
      engine.setEnvelope(toggles.envelope);
      engine.setTransparent(toggles.transparent);
      engine.setDimensions(toggles.dimensions);
      find('[data-scene-loading]').hidden = true;
      root.dataset.renderer = 'ready';
      maybeStartTour();
    }).catch(showFallback);
    return loading;
  }
  async function onClick(event) {
    const button = event.target.closest('button');
    if (!button || !root.contains(button) || button.disabled || button.hasAttribute('data-require-login')) return;
    if (!button.matches('[data-touch-rotate], [data-material], [data-explode], [data-scenario], [data-layer], [data-view], [data-toggle], [data-camera], [data-tour], [data-hero-demo], [data-scenario-nav], [data-compare-scenario], [data-show-comparison]')) return;
    // Keep this self-contained demo out of the workspace's delegated controls.
    event.stopPropagation();
    interacted = true;
    if (button.dataset.tour !== 'pause') engine?.setPaused(false);
    if (button.hasAttribute('data-show-comparison')) {
      pauseTour(true);
      renderLayer('comparison');
      find('[data-comparison-root]').scrollIntoView({ behavior: media.matches ? 'instant' : 'smooth', block: 'start' });
      find('#ve-comparison-title').focus({ preventScroll: true });
      return;
    }
    if (button.hasAttribute('data-hero-demo')) {
      await ensureScene();
      viewport.scrollIntoView({ behavior: media.matches ? 'instant' : 'smooth', block: 'center' });
      viewport.focus({ preventScroll: true });
      startTour(true);
      return;
    }
    if (button.dataset.tour === 'pause') { pauseTour(true); engine?.setPaused(true); return; }
    if (button.dataset.tour) {
      await ensureScene();
      startTour(button.dataset.tour === 'replay');
      return;
    }
    pauseTour(true);
    // Manual exploration starts a fresh presentation if Play is used later.
    tourIndex = -1;
    if (button.dataset.scenario || button.dataset.compareScenario || button.dataset.scenarioNav) {
      const index = button.dataset.scenarioNav
        ? (selected + (button.dataset.scenarioNav === 'next' ? 1 : data.scenarios.length - 1)) % data.scenarios.length
        : data.scenarios.findIndex(item => item.id === (button.dataset.scenario || button.dataset.compareScenario));
      if (index < 0) return;
      selectScenario(index);
      if (button.dataset.compareScenario) { viewport.scrollIntoView({ behavior: media.matches ? 'instant' : 'smooth', block: 'center' }); viewport.focus({ preventScroll: true }); }
      else if (window.matchMedia('(max-width: 767px)').matches && viewport.getBoundingClientRect().top < -40) {
        viewport.scrollIntoView({ behavior: media.matches ? 'instant' : 'smooth', block: 'start' });
      }
      announce(`${data.scenarios[index].name}. ${data.scenarios[index].floors} pavimentos estimados. Parâmetros e comparação financeira ilustrativos; viabilidade legal não avaliada.`);
      return;
    }
    if (button.hasAttribute('data-touch-rotate')) {
      await ensureScene();
      touchRotation = !touchRotation;
      button.setAttribute('aria-pressed', String(touchRotation));
      engine?.setTouchRotation(touchRotation);
      announce(touchRotation ? 'Giro por toque ativado. Arraste para girar e use dois dedos para aproximar. Desative para rolar a página.' : 'Giro por toque desativado. Deslize para rolar a página.');
      return;
    }
    if (button.dataset.material) {
      const kind = button.getAttribute('aria-pressed') === 'true' ? null : button.dataset.material;
      pressed('[data-material]', kind, 'data-material');
      engine?.setMaterialHighlight(kind);
      announce(kind ? `${button.textContent} em destaque na residência.` : 'Destaque de material removido.');
      return;
    }
    if (button.hasAttribute('data-explode')) {
      if (data.scenarios[selected].id === 'house') {
        await ensureScene();
        engine?.cameraAction('reset');
        announce('Residência completa.');
        return;
      }
      await ensureScene();
      exploded = !exploded;
      engine?.setExploded(exploded);
      renderExploded();
      announce(exploded ? 'Pavimentos separados para visualização. As distâncias entre camadas são ilustrativas.' : 'Edifício montado.');
      return;
    }
    if (button.dataset.layer) {
      layer = button.dataset.layer;
      engine?.setLayer(layer);
      renderLayer();
      return;
    }
    if (button.dataset.view) {
      view = button.dataset.view;
      engine?.setView(view);
      pressed('[data-view]', view, 'data-view');
      return;
    }
    if (button.dataset.toggle) {
      const key = button.dataset.toggle;
      toggles[key] = !toggles[key];
      button.setAttribute('aria-pressed', String(toggles[key]));
      if (key === 'dimensions') root.dataset.dimensions = String(toggles.dimensions);
      const method = { technical: 'setTechnical', envelope: 'setEnvelope', transparent: 'setTransparent', dimensions: 'setDimensions' }[key];
      engine?.[method](toggles[key]);
      return;
    }
    if (button.dataset.camera) engine?.cameraAction(button.dataset.camera);
  }
  function onKey(event) {
    if (event.target !== viewport || failed) return;
    const action = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', '+': 'zoomIn', '=': 'zoomIn', '-': 'zoomOut', Home: 'reset' }[event.key];
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    pauseTour(true);
    engine?.cameraAction(action);
  }
  function onMotionPreference() {
    engine?.setReducedMotion?.(media.matches);
    if (media.matches) { pauseTour(); renderMetrics(); }
  }
  const observer = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    synchronizeActivity();
  }, { threshold: 0.08 });
  observer.observe(viewport);
  const authObserver = new MutationObserver(synchronizeActivity);
  if (publicSite) authObserver.observe(publicSite, { attributes: true, attributeFilter: ['hidden'] });
  root.addEventListener('click', onClick);
  viewport.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', synchronizeActivity);
  media.addEventListener('change', onMotionPreference);
  window.addEventListener('pagehide', onPageHide);
  renderSelection();
  renderLayer();
  renderTour();

  function onPageHide(event) { if (!event.persisted) dispose(); }
  function dispose() {
    disposed = true;
    clearTimeout(timer);
    cancelAnimationFrame(metricFrame);
    observer.disconnect();
    authObserver.disconnect();
    root.removeEventListener('click', onClick);
    viewport.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', synchronizeActivity);
    media.removeEventListener('change', onMotionPreference);
    window.removeEventListener('pagehide', onPageHide);
    engine?.dispose();
  }
  return { dispose };
}

const host = document.getElementById('experiencia-3d');
if (host) mountExperience(host);
