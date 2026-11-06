import test from 'node:test';
import assert from 'node:assert/strict';
import {supabaseAPI} from '../server/pages-supabase.mjs';

const app = 'https://viabileasy.pages.dev';
const env = {APP_URL: app, SUPABASE_URL: 'https://project.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'synthetic'};
const payload = floors => ({
  lot: {width: 12, depth: 30, urbanContext: {zone: 'ZH1', mode: 'catalog', regime: 'ordinary', coastal: 'outside', macrozone: 'MAD1', roadClass: 'local'}},
  scenario: {floors, to: 50, unitArea: 70, use: 'H3', price: 8200, cost: 2700, profit: 18}
});
const request = body => new Request(`${app}/api/calculate`, {
  method: 'POST', headers: {Origin: app, 'Content-Type': 'application/json', 'X-Viabileasy-Request': '1', Cookie: '__Host-ve_access=synthetic.jwt'},
  body: JSON.stringify(body)
});

test('duas alternativas são calculadas no servidor sem gravar estudo ou consumir créditos', async () => {
  const calls = [];
  const authStub = async (url, options = {}) => {
    calls.push([String(url), options.method || 'GET']);
    if (String(url).endsWith('/auth/v1/user')) return Response.json({id: 'synthetic', email: 'qa@example.test', email_confirmed_at: '2026-10-01', identities: [{provider: 'email'}]});
    if (String(url).endsWith('/rest/v1/rpc/viabil_api')) {
      assert.equal(JSON.parse(options.body).operation, 'session');
      return Response.json({user: {accountStatus: 'approved'}});
    }
    assert.fail(`Chamada inesperada durante cálculo: ${url}`);
  };
  const responses = await Promise.all([4, 6, 4].map(floors => supabaseAPI(request(payload(floors)), env, authStub)));
  for (const response of responses) {
    assert.equal(response.status, 200);
    assert.match(response.headers.get('Cache-Control'), /no-store/);
  }
  const [a, b, repeatedA] = await Promise.all(responses.map(response => response.json()));
  assert.deepEqual(a, repeatedA);
  assert.equal(a.floors, 4);
  assert.equal(b.floors, 6);
  for (const result of [a, b]) {
    assert.equal(result.schema, 'VIABILEASY_ANALYSIS_V1');
    assert.equal(result.engine.execution, 'server-demonstration');
    assert.equal(result.engine.validatedRuleCount, 0);
    assert.equal(result.parkingRules.capacity, null);
    assert.ok(result.pendings.length > 0);
  }
  assert.equal(calls.length, 6);
});
