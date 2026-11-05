const {test}=require('node:test');const assert=require('node:assert/strict');const {spawn}=require('node:child_process');const {waitForRoomReady}=require('../electron/room-process.cjs');
test('startup timeout terminates the actual child before rejecting', {timeout:10000}, async()=>{
 const child=spawn(process.execPath,['-e','process.stdin.resume();setInterval(()=>{},1000)'],{stdio:['pipe','pipe','pipe'],windowsHide:true});
 await assert.rejects(waitForRoomReady(child,{timeoutMs:100,graceMs:20,killMs:2000}),/did not become ready/);
 assert.ok(child.exitCode!==null || child.signalCode!==null,'child must have exited before rejection');
});
