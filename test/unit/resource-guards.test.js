const test=require('node:test'),assert=require('node:assert/strict');
const {createAdmission}=require('../../src/resources/admission');
const {auditJson}=require('../../src/resources/audit');
const {validateOverrides,MiB}=require('../../src/resources/policy');
test('admission bounds concurrent memory and key cardinality, releases once, and expires rates',()=>{
  let now=0;const gate=createAdmission({maxRequests:2,maxBytes:100,maxKeys:2,clock:()=>now});
  const done=gate.enter(80);assert.throws(()=>gate.enter(21),e=>e.status===429);done();done();gate.enter(100)();
  gate.rate('one',1,60);assert.throws(()=>gate.rate('one',1,60),e=>e.headers['Retry-After']==='60');
  gate.rate('two',1,60);assert.throws(()=>gate.rate('three',1,60));now=61000;gate.rate('three',1,60);
});
test('audit snapshots replace embedded binaries and bound the serialized result',()=>{
  const result=auditJson({image:'data:image/png;base64,'+'a'.repeat(100000),description:'x'.repeat(20000)});
  assert.ok(!result.includes('aaaaaa'));assert.ok(result.length<14000);assert.ok(result.includes('sha256'));
});
test('quota overrides cannot disable a bound or exceed overall storage',()=>{
  for(const value of [0,-1,Infinity,1.5])assert.throws(()=>validateOverrides({sessions:value}));
  assert.throws(()=>validateOverrides({ttsStorageBytes:2048*MiB}));
  assert.deepEqual(validateOverrides({sessions:10}),{});
  assert.deepEqual(validateOverrides({sessions:20}),{sessions:20});
});
test('large JSON and Studio validation run in a bounded worker',async()=>{
  const {run}=require('../../src/resources/workers');
  assert.deepEqual(await run('parse',Buffer.from('{"ok":true}')),{ok:true});
  const project=require('../../public/studio/model').newProject('worker-project','Worker project');
  const validated=await run('studio',project);assert.equal(validated.team.id,project.team.id);
  await assert.rejects(run('parse',Buffer.from('{')),e=>e.status===400);
});
