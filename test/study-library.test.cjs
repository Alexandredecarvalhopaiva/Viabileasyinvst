const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function library() {
  const context = {window: {}, document: {addEventListener() {}}};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('dist/study-library.js', 'utf8'), context);
  return context.window.StudyLibrary;
}

test('Library intersects normalized name, stage and a single normalized tag', () => {
  const api = library();
  const tree = {lot: {name: 'Lote Árvore'}, metadata: {stage: 'in_study', tags: ['Prospecção']}};
  const selected = {query: ' ARVORE ', stage: 'in_study', tag: 'prospeccao'};
  assert.equal(api.matches(tree, selected), true);
  assert.equal(api.matches(tree, {...selected, stage: 'triage'}), false);
  assert.equal(api.matches(tree, {...selected, tag: 'documentacao'}), false);
  assert.equal(api.matches(tree, {...selected, query: 'Centro'}), false);
});

test('Library defaults include legacy studies and exclude archived studies until explicitly filtered', () => {
  const api = library();
  const legacy = {lot: {name: 'Antigo'}};
  assert.equal(api.matches(legacy, {query: '', stage: '', tag: ''}), true);
  assert.deepEqual(JSON.parse(JSON.stringify(api.metadata(legacy))), {
    schemaVersion: 1, stage: 'triage', tags: [], note: '', revision: 0, updatedAt: null,
  });
  const archived = {...legacy, metadata: {stage: 'archived'}};
  assert.equal(api.matches(archived, {query: '', stage: '', tag: ''}), false);
  assert.equal(api.matches(archived, {query: '', stage: 'archived', tag: ''}), true);
});
