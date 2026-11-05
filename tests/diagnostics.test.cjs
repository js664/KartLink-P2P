const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createDiagnostics } = require('../electron/diagnostics.cjs');
test('room output handles fragmented join and departure events', () => {
  const d = createDiagnostics();
  d.push('[0] Network <Info> network\\room.cpp:758:SendStatusMessage: [127.0.0.1] Kart');
  d.push('A has joined.\n[0] Network <Info> network\\room.cpp:758:SendStatusMessage: [127.0.0.1] KartB has joined.\n');
  assert.deepEqual(d.snapshot().players, ['KartA', 'KartB']);
  d.push('[0] Network <Info> network\\room.cpp:761:SendStatusMessage: [127.0.0.1] KartA has left.\n');
  assert.deepEqual(d.snapshot().players, ['KartB']);
  assert.equal(d.snapshot().playerListReliable, false);
  d.reset(); assert.deepEqual(d.snapshot().players, []);
});
test('separate output streams and split UTF-8 do not corrupt player events',()=>{
 const d=createDiagnostics();const line=Buffer.from('[0] Network <Info> network\\room.cpp:758:SendStatusMessage: [::1] José has joined.\n');const i=line.indexOf(Buffer.from('é'));d.push(line.subarray(0,i+1),'stdout');d.push('warning\n','stderr');d.push(line.subarray(i+1),'stdout');assert.deepEqual(d.snapshot().players,['José']);
});
test('chat text cannot impersonate server membership events',()=>{const d=createDiagnostics();d.push('[0] Network <Info> network\\room.cpp:974:HandleChatPacket: X: SendStatusMessage: [127.0.0.1] Fake has joined.\n');assert.deepEqual(d.snapshot().players,[])});
test('room log is bounded', () => { const d = createDiagnostics(); d.push(Array.from({length: 350}, (_, n) => `line ${n}`).join('\n') + '\n'); assert.equal(d.snapshot().logs.length, 300); });
