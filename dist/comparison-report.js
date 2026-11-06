/* Comparison documents retain the existing analysis contract and its provenance. */
const ComparisonReport = (() => {
  const metrics = [
    ['floors', 'Pavimentos'], ['footprint', 'Projeção efetiva (m²)'],
    ['gross', 'Área computável (m²)'], ['ca', 'CA efetivo'],
    ['units', 'Unidades estimadas'], ['height', 'Altura geométrica (m)'],
    ['sellable', 'Área vendável (m²)']
  ];
  const copy = value => JSON.parse(JSON.stringify(value));
  const escape = value => String(value ?? 'Pendente').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const format = value => typeof value === 'number' && Number.isFinite(value)
    ? value.toLocaleString('pt-BR', {maximumFractionDigits: 6}) : 'Pendente';
  function capture(id, name, inputs, result) {
    return copy({id, name, capturedAt: new Date().toISOString(), revision: JSON.stringify(inputs), inputs, result});
  }
  function manifest(a, b) {
    if (!a || !b) throw Error('Selecione as alternativas A e B.');
    if (a.id === b.id && a.revision === b.revision) throw Error('Selecione duas alternativas diferentes.');
    const alternatives = copy([a, b]);
    const differences = metrics.map(([key, label]) => ({key, label,
      value: Number.isFinite(a.result[key]) && Number.isFinite(b.result[key])
        ? b.result[key] - a.result[key] : null
    }));
    return {schema: 'VIABILEASY_COMPARISON_V1', generatedAt: new Date().toISOString(),
      legalValidation: false, alternatives, differences,
      differentParcel: JSON.stringify(a.inputs.lot) !== JSON.stringify(b.inputs.lot),
      differentRulebase: JSON.stringify([a.result.engine, a.result.evidence, a.inputs.lot.territory?.source]) !== JSON.stringify([b.result.engine, b.result.evidence, b.inputs.lot.territory?.source]),
      notice: 'Estudo preliminar. Fontes e vigência dependem de conferência. O briefing original está incompleto na seção de relatórios.'};
  }
  function sources(value) {
    const found = new Map();
    function visit(item) {
      if (!item || typeof item !== 'object') return;
      if (item.reference || item.url) found.set(JSON.stringify([item.reference, item.url, item.kind]), item);
      for (const nested of Object.values(item)) visit(nested);
    }
    visit(value);
    return [...found.values()].map(source => `<p>${escape(({documentary:'Fonte documental',product:'Hipótese de produto'})[source.kind] || 'Fonte informada')} · ${escape(source.reference || source.title || source.id)}<br>${escape(source.url || 'Referência sem URL')}</p>`).join('');
  }
  function render(report) {
    const [a, b] = report.alternatives;
    const row = (label, values) => `<tr><th scope="row">${escape(label)}</th>${values.map(value => `<td>${escape(value)}</td>`).join('')}</tr>`;
    const inputs = ['use', 'floors', 'to', 'unitArea', 'regimeVariant', 'balconyProjectionMeters'];
    const labels = ['Uso informado', 'Pavimentos solicitados', 'Ocupação solicitada (%)', 'Área útil por unidade (m²)', 'Regime informado', 'Balanço informado (m)'];
    return `<article class="comparison-document"><h2>Comparação técnica A / B</h2><p>${escape(report.notice)}</p>
      <p>Seleção gerada em ${escape(report.generatedAt)}. Diferenças expressas como B − A.</p>
      <p>${report.differentParcel ? 'Terrenos ou dados territoriais divergentes.' : 'Mesmos dados de terreno.'} ${report.differentRulebase ? 'Versão, base ou origem do cálculo divergente.' : 'Mesma versão, base e origem do cálculo.'}</p>
      <table><thead><tr><th scope="col">Parâmetro</th><th scope="col">A · ${escape(a.name)}</th><th scope="col">B · ${escape(b.name)}</th></tr></thead><tbody>
      ${row('Terreno', [a, b].map(item => item.inputs.lot.name || item.inputs.lot.id))}
      ${row('Área informada (m²)', [a, b].map(item => format(item.inputs.lot.area)))}
      ${inputs.map((key, index) => row(labels[index], [a, b].map(item => item.inputs.scenario[key] ?? 'Pendente'))).join('')}
      ${row('Classificação', [a.result.classification, b.result.classification])}
      ${row('Versão do motor', [a.result.engine.version, b.result.engine.version])}
      ${row('Base normativa', [a, b].map(item => item.result.engine.rulesetId || 'Pendente'))}
      ${row('Origem do cálculo', [a, b].map(item => item.result.engine.execution === 'server-demonstration' ? 'Servidor' : 'Prévia local'))}
      ${row('Revisão da alternativa (captura)', [a.capturedAt, b.capturedAt])}
      ${metrics.map(([key, label]) => row(label, [format(a.result[key]), format(b.result[key])])).join('')}
      ${row('Mínimo legal de vagas', [a, b].map(item => format(item.result.parkingRules.legalMinimum)))}
      ${row('Capacidade física de vagas', [a, b].map(item => format(item.result.parkingRules.capacity)))}
      </tbody></table><h3>Diferenças técnicas B − A</h3><table><tbody>${report.differences.map(item => row(item.label, [format(item.value)])).join('')}</tbody></table>
      ${[a, b].map((item, index) => `<section><h3>${index ? 'B' : 'A'} · ${escape(item.name)} · Fontes e pendências</h3><p>${escape(item.result.engine.notice)}</p><p>Zona ${escape(item.result.zone)} · Macrozona ${escape(item.result.macrozone)} · Fonte territorial ${escape(item.inputs.lot.territory?.source?.title || item.inputs.lot.territory?.source?.id || "Pendente")}</p>${item.result.pendings.map(pending => `<p><strong>${escape(({pending:'Pendente',informed:'Informado',incompatible:'Incompatível',special_review:'Revisão especial'})[pending.status] || pending.status)}</strong> · ${escape(pending.message)}</p>`).join('')}${sources({territory:item.inputs.lot.territory, evidence:item.result.evidence, pendings:item.result.pendings, setbackRule:item.result.setbackRule, buildingCapacity:item.result.buildingCapacity})}</section>`).join('')}</article>`;
  }
  const css = `.comparison-document{font:14px/1.5 Arial,sans-serif;color:#123;overflow-wrap:anywhere;max-width:100%;background:white;padding:16px}.comparison-document table{width:100%;border-collapse:collapse;table-layout:fixed;margin:12px 0}.comparison-document th,.comparison-document td{border:1px solid #bcc6d0;padding:8px;text-align:left;vertical-align:top;overflow-wrap:anywhere}.comparison-document th{font-weight:600}.comparison-document h3{margin-top:24px}.comparison-document p{margin:8px 0}.comparison-document pre{white-space:pre-wrap;font:inherit;overflow-wrap:anywhere}@media print{.comparison-document{padding:0;font-size:10pt}.comparison-document tr,.comparison-document p{break-inside:avoid}.comparison-document h2,.comparison-document h3{break-after:avoid}.comparison-document thead{display:table-header-group}@page{size:A4;margin:15mm}}`;
  function documentHTML(report) {
    return `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ViabilEasy · Comparação técnica</title><style>${css}</style><body>${render(report)}</body></html>`;
  }
  return {capture, manifest, render, documentHTML, css};
})();
if (typeof module !== 'undefined') module.exports = ComparisonReport;

function comparisonInputs(alternative) {
  const scenario = {...state, floors: alternative.floors, to: alternative.to, regimeVariant: alternative.regimeVariant || 'general'};
  return EngineResults.payload({...state.lot, geometry: getLotGeometry(state.lot)}, scenario);
}
function comparisonStale(selection, data) {
  if (selection.draftDirty) return true;
  return ['A', 'B'].some(slot => {
    const snapshot = selection[slot];
    if (!snapshot) return false;
    const current = data.find(item => item.id === snapshot.id);
    return !current || snapshot.revision !== JSON.stringify(comparisonInputs(current)) ||
      JSON.stringify(snapshot.result) !== JSON.stringify(current);
  });
}
function comparisonPanel(data) {
  const selection = state.comparisonSelection || {};
  const stale = comparisonStale(selection, data);
  const ready = selection.report && !stale;
  return `<section class="panel section-space comparison-panel" aria-label="Relatório comparativo"><h2>Selecionar duas alternativas</h2>
    <p>Escolha A e B e confirme a captura. Edições posteriores exigem atualizar a seleção.</p>
    <div class="comparison-controls">${['A', 'B'].map((slot, index) => `<label for="comparison-${slot}">Alternativa ${slot}<select id="comparison-${slot}" data-comparison-slot="${slot}">${data.map((item, position) => `<option value="${esc(item.id)}" ${((selection.draft?.[slot] || selection[slot]?.id) === item.id || !selection.draft?.[slot] && !selection[slot] && position === index) ? 'selected' : ''}>${esc(item.name)}</option>`).join('')}</select></label>`).join('')}
    <button class="btn" type="button" data-comparison-action="capture">Atualizar seleção A / B</button></div>
    <p role="status">${stale ? 'Seleção desatualizada. A escolha, o terreno, as premissas ou a base mudaram. Atualize A / B para exportar.' : selection.report ? 'Seleção capturada. Tela, impressão e JSON usam os mesmos resultados.' : 'Aguardando confirmação das duas alternativas.'}</p>
    <div class="comparison-actions"><button class="btn" type="button" data-comparison-action="print" ${ready ? '' : 'disabled'}>Imprimir comparação / salvar PDF</button>
    <button class="btn" type="button" data-comparison-action="json" ${ready ? '' : 'disabled'}>Exportar comparação JSON</button></div>
    ${selection.report ? `<style>${ComparisonReport.css}</style>${ComparisonReport.render(selection.report)}` : ''}</section>`;
}
if (typeof document !== 'undefined') document.addEventListener('click', event => {
  const button = event.target.closest('[data-comparison-action]');
  if (!button || !guardSelection()) return;
  try {
    const data = scenarioData();
    if (button.dataset.comparisonAction === 'capture') {
      const selected = {};
      for (const slot of ['A', 'B']) {
        const alternative = data.find(item => item.id === document.getElementById(`comparison-${slot}`).value);
        selected[slot] = ComparisonReport.capture(alternative.id, alternative.name, comparisonInputs(alternative), alternative);
      }
      selected.report = ComparisonReport.manifest(selected.A, selected.B);
      state.comparisonSelection = selected;
      render();
      document.querySelector('[data-comparison-action="capture"]')?.focus();
      return;
    }
    const selected = state.comparisonSelection;
    if (!selected?.report || comparisonStale(selected, data)) throw Error('Atualize a seleção A / B antes de exportar.');
    if (button.dataset.comparisonAction === 'print') {
      const preview = window.open('', '_blank');
      if (!preview) throw Error('Permita abrir a janela de impressão e tente novamente.');
      preview.opener = null;
      preview.document.write(ComparisonReport.documentHTML(selected.report));
      preview.document.close();
      preview.focus();
      preview.print();
    } else {
      const blob = new Blob([JSON.stringify(selected.report, null, 2)], {type: 'application/json'});
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'viabileasy-comparacao-preliminar.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  } catch (error) {
    notify(error.message || 'Falha ao exportar. Tente novamente.');
  }
});

if (typeof document !== 'undefined') document.addEventListener('change', event => {
  const select = event.target.closest('[data-comparison-slot]');
  if (!select) return;
  const selection = state.comparisonSelection || {};
  selection.draft = Object.fromEntries(['A', 'B'].map(slot => [slot, document.getElementById(`comparison-${slot}`).value]));
  selection.draftDirty = true;
  state.comparisonSelection = selection;
  render();
});
