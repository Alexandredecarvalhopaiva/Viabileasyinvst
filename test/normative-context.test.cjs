const {test}=require('node:test');
const assert=require('node:assert/strict');
const N=require('../dist/normative-context.js');

const lot=()=>({id:'fixture',custom:true,lat:-7.11,lng:-34.86,
 geometry:{vertices:[[0,0],[20,0],[20,30],[0,30]],front:0,back:2}});
const config=()=>({use:'H3',floors:4,analysisDate:'2026-11-05',sourceVersions:{synthetic:{version:'v1',hash:'fixture-v1'}}});
const fixture=version=>({id:'SYNTHETIC-ONLY',synthetic:true,version,fields:{caBasic:{value:version==='v1'?1:2,
 unit:'m²/m²',source:{title:'Fixture sintética '+version,device:'fixture-row',validFrom:'2026-01-01',version,hash:'fixture-'+version}}}});

test('AUT-06 altera identidade por finalidade, data, versão e hash sem mover o terreno',()=>{
 const l=lot(),c=config(),first=N.snapshot(l,c,fixture('v1'));
 l.normativeSnapshot=first;
 for(const changed of [{...c,use:'H1'},{...c,analysisDate:'2026-11-06'},
  {...c,sourceVersions:{synthetic:{version:'v2',hash:'fixture-v1'}}},
  {...c,sourceVersions:{synthetic:{version:'v1',hash:'fixture-v2'}}}]){
  const next=N.snapshot(l,changed);
  assert.notEqual(next.key,first.key);
  assert.equal(next.fields.caBasic.value,null);
  assert.equal(next.status,'pending');
 }
 assert.notEqual(N.key(l,c),N.key({...l,geometry:{...l.geometry,back:null}},c));
});

test('AUT-07 reabre v1 após disponibilizar v2, preservando valores e fontes até atualização',()=>{
 const l=lot(),c=config(),packageV1=fixture('v1');
 const v1=N.snapshot(l,c,packageV1);
 const saved=JSON.parse(JSON.stringify({lot:{...l,normativeSnapshot:v1},scenario:c}));
 packageV1.fields.caBasic.source.title='Catálogo corrente alterado';
 const current={...c,sourceVersions:{synthetic:{version:'v2',hash:'fixture-v2'}}};
 const v2=N.snapshot(l,current,fixture('v2'));
 const reopened=N.snapshot(saved.lot,saved.scenario);
 assert.equal(reopened.fields.caBasic.value,1);
 assert.equal(reopened.fields.caBasic.source.title,'Fixture sintética v1');
 assert.equal(v2.fields.caBasic.value,2);
 assert.equal(reopened.key,v1.key);
 assert.notEqual(reopened.key,v2.key);
 assert.equal(reopened.legalValidation,false);
 const reordered={...c,sourceVersions:{synthetic:{hash:'fixture-v1',version:'v1'}}};
 assert.equal(N.key(l,reordered),v1.key);
});

test('AUT-08 conserva original e histórico, com responsável, justificativa e revisão pendente',()=>{
 const originalRule={resolved:true,top:{values:{front:5,side:3,back:3}},source:{title:'Fixture v1'}};
 const requested={mode:'manual',front:7,side:2,back:4,reference:'Documento sintético'};
 const metadata={responsible:'synthetic-account',justification:'Conferência técnica da fixture',recordedAt:'2026-11-05T00:00:00Z',originalRule};
 const first=N.proposeOverride({zone:'ZH1'},requested,metadata);
 const next=N.proposeOverride({...requested,overrideAudit:first},{...requested,front:8},metadata);
 assert.equal(first.revisions.length,1);
 assert.equal(next.version,2);
 assert.equal(next.original.values.front,5);
 assert.equal(next.revisions[0].values.front,7);
 assert.equal(next.revisions[1].responsible.accountId,'synthetic-account');
 assert.equal(next.revisions[1].justification,metadata.justification);
 assert.equal(next.status,'pending_review');
 assert.equal(next.legalValidation,false);
 assert.doesNotThrow(()=>N.validateOverride({urbanContext:{overrideAudit:next}},'synthetic-account'));
 assert.throws(()=>N.validateOverride({urbanContext:{overrideAudit:next}},'other-account'));
 assert.throws(()=>N.validateOverride({urbanContext:{overrideAudit:{...next,status:'approved'}}},'synthetic-account'));
 assert.throws(()=>N.proposeOverride({},requested,{...metadata,responsible:null}));
 assert.throws(()=>N.proposeOverride({},requested,{...metadata,justification:''}));
 const legacy=N.proposeOverride(requested,requested,metadata);
 assert.equal(legacy.revisions[0].status,'legacy_unverified');
 assert.equal(legacy.revisions[0].responsible,null);
 assert.equal(legacy.revisions[1].version,2);
});
