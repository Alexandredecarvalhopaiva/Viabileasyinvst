/** Pre-render the public demo from the same data and templates used in the browser. */
import { readFile, writeFile } from 'node:fs/promises';
import { renderExperience } from '../dist/experience3d/ui.js';
import { renderComparison } from '../dist/experience3d/comparison-ui.js';
import { buildComparison, demoFinancialAssumptions } from '../dist/experience3d/comparison.js';
import { demoParcel, scenarios } from '../dist/experience3d/data.js';
const target = new URL('../dist/index.html', import.meta.url);
const element = () => ({ classList: { add() {} }, setAttribute() {}, innerHTML: '' });
const hero = element(), comparison = element();
renderExperience(hero, { parcel: demoParcel, scenarios });
renderComparison(comparison, buildComparison(scenarios, demoFinancialAssumptions));
const content = hero.innerHTML.replace('<div id="ve-comparison" data-comparison-root></div>',
  `<div id="ve-comparison" class="ve-comparison" data-comparison-root aria-labelledby="ve-comparison-title">${comparison.innerHTML}</div>`);
const generated = `<!-- public-experience:start -->\n      <section id="experiencia-3d" class="ve-experience" data-architecture="house" data-layer="building" aria-labelledby="ve-experience-title">${content}</section>\n      <!-- public-experience:end -->`;
let html = await readFile(target, 'utf8');
if (html.includes('<!-- public-experience:start -->')) {
  html = html.replace(/<!-- public-experience:start -->[\s\S]*?<!-- public-experience:end -->/, generated);
} else {
  const start = html.indexOf('<section id="experiencia-3d"');
  const next = html.indexOf('<section class="public-features"', start);
  if (start < 0 || next < 0) throw new Error('Public experience boundary not found.');
  const end = html.lastIndexOf('</section>', next) + '</section>'.length;
  html = html.slice(0, start) + generated + html.slice(end);
}
await writeFile(target, html);
console.log('Página pública pré-renderizada a partir dos templates e dados compartilhados.');
