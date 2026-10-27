const number = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const format = value => number.format(Number.isFinite(Number(value)) ? Number(value) : 0);

function icon(name) {
  const paths = {
    cube: '<path d="m12 3 9 5v8l-9 5-9-5V8Z"/><path d="m3 8 9 5 9-5M12 13v8m-4.5-15.5 9 5"/>',
    terrain: '<path d="m3 12 9-6 9 6-9 6Z"/><path d="m7 9 9 6m-9 0 9-6"/>',
    envelope: '<path d="m4 7 8-4 8 4v10l-8 4-8-4Z" stroke-dasharray="3 3"/><path d="m4 7 8 4 8-4M12 11v10"/>',
    aerial: '<rect x="5" y="5" width="14" height="14" rx="1"/><path d="M9 5v14M5 9h14m-4-4v14M5 15h14"/>',
    technical: '<path d="M4 4h16v16H4ZM4 4l16 16M4 20 20 4M12 4v16M4 12h16"/>',
    dimensions: '<path d="M3 7v10m18-10v10M3 12h18m-14-3-4 3 4 3m10-6 4 3-4 3"/>',
    transparent: '<rect x="3" y="3" width="12" height="12" rx="2"/><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M9 11h6m-6 4h6"/>',
    play: '<path d="m8 5 11 7-11 7Z"/>',
    pause: '<path d="M8 5v14m8-14v14" stroke-width="3"/>',
    replay: '<path d="M4 10a8 8 0 1 1 1 7M4 4v6h6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    minus: '<path d="M5 12h14"/>',
    reset: '<path d="M9 3H3v6m12-6h6v6M3 15v6h6m6 0h6v-6"/><circle cx="12" cy="12" r="3"/>',
    left: '<path d="m14 5-7 7 7 7"/>',
    right: '<path d="m10 5 7 7-7 7"/>',
    up: '<path d="m5 14 7-7 7 7"/>',
    down: '<path d="m5 10 7 7 7-7"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    drag: '<path d="m8 3 4-2 4 2M12 1v5m-4 15 4 2 4-2m-4-4v6M3 8l-2 4 2 4m-2-4h5m15-4 2 4-2 4m-4-4h6"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
  };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.cube}</svg>`;
}

function thumbnail(id) {
  const base = '<path d="m7 54 37-19 36 19-37 20Z" fill="#dce8e2"/><path d="m12 55 31-15 31 15-31 15Z" fill="none" stroke="#a2bcb0" stroke-dasharray="2 2"/>';
  const block = (x, y, width, depth, height, color = '#4d9c89', light = '#c4e5d8') => {
    const bottom = y + height;
    const frontX = x + width;
    const rightX = frontX + depth;
    const middleY = y + width * 0.46;
    const rightY = middleY - depth * 0.46;
    return `<path d="M${x} ${y}v${height}l${width} ${width * .46}V${middleY}Z" fill="${color}"/><path d="M${frontX} ${middleY}v${height}l${depth} ${-depth * .46}V${rightY}Z" fill="#28635f"/><path d="M${x} ${y}l${depth} ${-depth * .46} ${width} ${width * .46}-${depth} ${depth * .46}Z" fill="${light}"/><path d="M${x} ${bottom}l${width} ${width * .46} ${depth} ${-depth * .46}" fill="none" stroke="#234e50" stroke-width=".6"/>`;
  };
  let volume;
  if (id === 'house') {
    volume = block(20, 40, 26, 19, 16) + block(35, 29, 15, 13, 14, '#7db5a0', '#e4f0e9') + '<path d="m24 47 17 8v9l-17-8Z" fill="#a4ccd0"/><path d="m51 46 8-4v11l-8 4Z" fill="#b8dcda"/>';
  } else if (id === 'commercial') {
    volume = block(20, 27, 26, 23, 31, '#91bdc3', '#deeeec') + '<g fill="none" stroke="#e3f2f0" stroke-width="1"><path d="m20 36 26 12 23-11M20 45l26 12 23-11m-40-15v31m8-27v30m9-26v31m9-35v32m8-36v31"/></g>';
  } else if (id === 'flats') {
    volume = block(21, 18, 21, 23, 42, '#719c83', '#d9e8d1') + '<g fill="none" stroke="#cde4d5" stroke-width="1.7"><path d="m21 27 21 10 23-11M21 36l21 10 23-11M21 45l21 10 23-11M21 54l21 10 23-11"/></g>';
  } else if (id === 'mixed') {
    volume = block(17, 47, 29, 25, 12, '#98bbc0', '#dae9e5') + block(28, 17, 18, 18, 34, '#569c8d', '#c6e4d4') + '<g fill="none" stroke="#c6e5dc" stroke-width="1.4"><path d="m28 25 18 8 18-8m-36 8 18 8 18-8m-36 8 18 8 18-8"/></g>';
  } else {
    volume = block(24, 14, 21, 20, 45) + '<g fill="none" stroke="#d5eadd" stroke-width="1.5"><path d="m24 22 21 10 20-9M24 30l21 10 20-9M24 38l21 10 20-9M24 46l21 10 20-9M24 54l21 10 20-9"/></g>';
  }
  return `<svg class="ve-scenario-illustration" viewBox="0 0 88 82" aria-hidden="true">${base}${volume}<circle cx="16" cy="58" r="4" fill="#7fae8c"/><path d="M16 61v4" stroke="#6e8b77"/></svg>`;
}

function scenarioCard(scenario, index, activeId) {
  const metrics = scenario.metrics || {};
  const id = escape(scenario.id);
  return `<button class="ve-scenario" type="button" data-scenario="${id}" aria-pressed="${scenario.id === activeId}" aria-label="Explorar ${escape(scenario.name)}">
    <span class="ve-scenario-identity"><span class="ve-scenario-thumb">${thumbnail(scenario.id)}</span><span class="ve-scenario-number">0${index + 1}</span></span>
    <strong>${escape(scenario.shortName || scenario.name)}</strong>
    <span class="ve-scenario-stats"><span><b>${format(scenario.floors)}</b> pav.</span><span><b>${format(metrics.builtArea)}</b> m²</span></span>
    <span class="ve-scenario-units">${format(scenario.units)} ${escape(scenario.unitLabel || 'unidades')}</span>
    <span class="ve-scenario-potential" data-scenario-potential="${id}">Potencial a comparar</span>
    <span class="ve-viability" data-scenario-viability="${id}">Viabilidade não avaliada</span>
  </button>`;
}

/** Markup only: public content is rendered before the Three.js module is loaded. */
export function renderExperience(root, { parcel, scenarios }) {
  const first = scenarios.find(scenario => scenario.id === 'house') || scenarios[0];
  if (!first) throw new Error('A experiência precisa de pelo menos um cenário.');
  const metrics = first.metrics || {};
  root.classList.add('ve-experience');
  root.innerHTML = `
    <div class="ve-hero-layout">
      <header class="ve-hero-content">
        <span class="ve-eyebrow"><span></span> VIABILIDADE QUE VOCÊ CONSEGUE VER</span>
        <h1 id="ve-experience-title">O futuro<br><em>toma forma.</em></h1>
        <p class="ve-hero-description ve-description-desktop">Antes da primeira obra, um novo olhar. Descubra o que o seu terreno pode se tornar.</p>
        <p class="ve-hero-description ve-description-mobile">Descubra o que o seu terreno pode se tornar.</p>
        <div class="ve-hero-actions"><button class="ve-hero-primary" type="button" data-require-login="analysis" data-access-label="analisar seu terreno">Analisar meu terreno ${icon('arrow')}</button></div>
        <p class="ve-hero-promise">DA LOCALIZAÇÃO À POSSIBILIDADE.</p>
        <div class="ve-hero-evidence" aria-label="Um terreno, cinco possibilidades"><span><b>01</b> terreno</span><i aria-hidden="true"></i><span><b>05</b> possibilidades</span></div>
        <p class="ve-hero-account-note">Explore livremente. Entre para analisar e salvar seus terrenos.</p>
      </header>
      <div class="ve-hero-demo">
        <div class="ve-demo-heading"><span class="ve-demo-badge"><i></i> Simulação ilustrativa</span><span class="ve-demo-lot">UM MESMO TERRENO <b>${format(parcel.area)} m²</b></span></div>
        <div class="ve-workbench">
          <div class="ve-stage"><span class="ve-scene-edition" aria-hidden="true">FORMA <b data-scene-edition>01</b><i>/ ${String(scenarios.length).padStart(2, '0')}</i></span>
            <div class="ve-scene-viewport" data-scene-viewport tabindex="0" aria-describedby="ve-setback-description" aria-label="Modelo tridimensional interativo do lote demonstrativo"></div>
            <div class="ve-scene-loading" data-scene-loading role="status"><span class="ve-loading-mark">${icon('cube')}</span><strong>Preparando as possibilidades…</strong><span>Um lote, cinco formas de imaginar.</span></div>
            <div class="ve-scene-fallback" data-scene-fallback hidden><span class="ve-fallback-art">${thumbnail('residential')}</span><strong>O 3D está indisponível neste dispositivo.</strong><p>Selecione os cenários abaixo e compare suas estimativas.</p></div>
            <div class="ve-stage-label"><span class="ve-live-dot"></span><span data-phase-label>Explorando possibilidades</span></div>
            <div class="ve-parcel-label"><span>MESMO LOTE EM TODOS OS CENÁRIOS</span><strong>${format(parcel.area)} <small>m²</small></strong><div><span>Testada <b>${format(parcel.frontage || parcel.width)} m</b></span><span>Profundidade <b>${format(parcel.depth)} m</b></span></div></div>
            <div class="ve-kinetic-action"><button type="button" data-explode aria-pressed="false">${icon('envelope')}<span>Separar pavimentos</span>${icon('plus')}</button><small>Uma nova perspectiva, camada por camada.</small></div>
            <div class="ve-camera-zoom" role="group" aria-label="Zoom e enquadramento"><button type="button" data-camera="zoomIn" aria-label="Aproximar modelo" title="Aproximar">${icon('plus')}</button><button type="button" data-camera="zoomOut" aria-label="Afastar modelo" title="Afastar">${icon('minus')}</button><button type="button" data-camera="reset" aria-label="Restaurar enquadramento" title="Restaurar enquadramento">${icon('reset')}</button></div>
            <div class="ve-compass" aria-label="Norte ilustrativo, acompanha a orientação do terreno"><span>N</span><svg viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="21" fill="#ffffffab" stroke="#a9bbc6" stroke-width=".7"/><path d="m26 7 6 19-6 19-6-19Z" fill="#0f2d4a"/><path d="m26 26 6 0-6 19Z" fill="#93adb4"/><path d="M7 26h7m24 0h7" stroke="#8fa5af" stroke-width=".7"/></svg></div>
            <span class="ve-scene-hint">${icon('drag')} Arraste. Gire. Descubra.</span>
          </div>
          <div class="ve-toolbar">
            <div class="ve-segmented ve-layers" role="group" aria-label="O que visualizar">
              <button type="button" data-layer="terrain" aria-pressed="false">${icon('terrain')}<span>Terreno</span></button>
              <button type="button" data-layer="envelope" aria-pressed="false">${icon('envelope')}<span>Envelope</span></button>
              <button type="button" data-layer="building" aria-pressed="true">${icon('cube')}<span>Construção</span></button>
            </div>
            <div class="ve-segmented ve-views" role="group" aria-label="Vista da câmera">
              <button type="button" data-view="iso" aria-pressed="true" aria-label="Vista isométrica" title="Vista isométrica">${icon('cube')}<span>3D</span></button>
              <button type="button" data-view="top" aria-pressed="false" aria-label="Vista aérea" title="Vista aérea">${icon('aerial')}<span>Aérea</span></button>
            </div>
          </div>
          <div class="ve-display-tools">
            <button class="ve-touch-rotation" type="button" data-touch-rotate aria-pressed="false">Girar por toque</button>
            <button class="ve-cotas-toggle" type="button" data-toggle="dimensions" aria-pressed="false" aria-label="Mostrar cotas dos recuos">${icon('dimensions')}<span>Cotas</span></button>
            <details class="ve-advanced-tools"><summary>Visualização ${icon('down')}</summary><div class="ve-advanced-panel"><div class="ve-toggles" role="group" aria-label="Representação do modelo"><button type="button" data-toggle="technical" aria-pressed="false">${icon('technical')} Visão técnica</button><button type="button" data-toggle="envelope" aria-pressed="false">${icon('envelope')} Envelope</button><button type="button" data-toggle="transparent" aria-pressed="false">${icon('transparent')} Transparência</button></div><div class="ve-camera-arrows" role="group" aria-label="Mover a câmera"><span>Câmera</span><button type="button" data-camera="left" aria-label="Girar para a esquerda" title="Girar à esquerda">${icon('left')}</button><button type="button" data-camera="right" aria-label="Girar para a direita" title="Girar à direita">${icon('right')}</button><button type="button" data-camera="up" aria-label="Elevar a câmera" title="Elevar câmera">${icon('up')}</button><button type="button" data-camera="down" aria-label="Baixar a câmera" title="Baixar câmera">${icon('down')}</button></div></div></details>
            <div class="ve-tour-actions"><button type="button" data-tour="play">${icon('play')}<span>Reproduzir</span></button><button type="button" data-tour="pause" hidden>${icon('pause')}<span>Pausar</span></button><button type="button" data-tour="replay" aria-label="Repetir demonstração" title="Repetir demonstração">${icon('replay')}</button></div>
          </div>
        </div>
        <section class="ve-scenarios" aria-labelledby="ve-scenarios-heading"><div class="ve-scenarios-heading"><h2 id="ve-scenarios-heading">O que pode nascer aqui?</h2><div class="ve-scenario-nav"><button type="button" data-scenario-nav="previous" aria-label="Cenário anterior">${icon('left')}</button><button type="button" data-scenario-nav="next" aria-label="Próximo cenário">${icon('right')}</button></div></div><div class="ve-scenario-list" aria-label="Alternativas para o mesmo terreno">${scenarios.map((scenario, index) => scenarioCard(scenario, index, first.id)).join('')}</div><p class="ve-carousel-hint">Deslize para explorar as cinco alternativas.</p></section>
        <details class="ve-study-details"><summary><span>Indicadores e recuos</span><span>CENÁRIO <b data-scenario-index>${String(scenarios.indexOf(first) + 1).padStart(2, '0')} / ${String(scenarios.length).padStart(2, '0')}</b>${icon('down')}</span></summary>
          <div class="ve-selected-scenario"><h2 data-scenario-name>${escape(first.name)}</h2><p data-scenario-description>${escape(first.description)}</p><b data-floors-label>${format(first.floors)} pavimentos</b></div>
          <dl class="ve-metrics" aria-label="Indicadores do cenário demonstrativo"><div><dt>Coef. de aproveitamento</dt><dd data-metric="coefficient">${decimal.format(metrics.coefficient || 0)}</dd></div><div><dt>Taxa de ocupação</dt><dd data-metric="occupancy">${format(metrics.occupancy)}%</dd></div><div><dt>Permeabilidade</dt><dd data-metric="permeability">${format(metrics.permeability)}%</dd></div><div><dt>Área computável estimada</dt><dd data-metric="computableArea">${format(metrics.computableArea)} m²</dd></div></dl>
          <section class="ve-setback-summary" aria-label="Recuos do terreno demonstrativo"><div class="ve-setback-heading"><strong>Recuos do terreno</strong><span>${format(parcel.width)} × ${format(parcel.depth)} m</span></div><dl><div><dt>Frente</dt><dd>${format(parcel.setbacks.front)} m</dd></div><div><dt>Lateral esquerda</dt><dd>${format(parcel.setbacks.side)} m</dd></div><div><dt>Lateral direita</dt><dd>${format(parcel.setbacks.side)} m</dd></div><div><dt>Fundos</dt><dd>${format(parcel.setbacks.rear)} m</dd></div></dl><p id="ve-setback-description">Cotas ilustrativas do limite do lote até o envelope de ${format(parcel.envelopeHeight)} m. A edificação pode ficar mais afastada. Parâmetros, usos e viabilidade dependem da análise específica do terreno.</p></section>
        </details>
      </div>
        <div class="ve-hero-insight" data-hero-insight><span>SIMULAÇÃO ILUSTRATIVA</span><h2 data-insight-title>Cinco estratégias. Um mesmo terreno.</h2><p data-insight-description>Compare as possibilidades com premissas transparentes.</p><button type="button" data-show-comparison>Comparar investimentos ${icon('arrow')}</button></div>
    </div>
    <div class="ve-tour-bar"><span class="ve-tour-caption">DO TERRENO À DECISÃO <small>Explore cada perspectiva</small></span><ol class="ve-tour-phases" aria-label="Etapas da apresentação"><li data-phase="terrain"><span>01</span> Localização</li><li data-phase="envelope"><span>02</span> Parâmetros</li><li data-phase="scenarios" aria-current="step"><span>03</span> Projeção 3D</li><li data-phase="comparison"><span>04</span> Comparação</li><li data-phase="opportunity"><span>05</span> Oportunidade</li></ol></div>
    <div id="ve-comparison" data-comparison-root></div>
    <p class="ve-sr-only" data-scene-status role="status" aria-live="polite" aria-atomic="true"></p>
  `;
}
