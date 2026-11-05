const {test} = require('node:test');
const assert = require('node:assert/strict');
const {EventEmitter} = require('node:events');
const {terminateChild} = require('../electron/process-control.cjs');
function child() { const x=new EventEmitter(); x.pid=123; x.exitCode=null; x.signalCode=null; x.stdin=new EventEmitter(); x.stdin.write=()=>{}; x.kill=()=>true; return x; }
test('graceful shutdown waits until the child actually exits', async()=>{const c=child();let finished=false;c.stdin.write=()=>setTimeout(()=>{c.exitCode=0;c.emit('exit',0)},30);const p=terminateChild(c,{graceful:true,graceMs:100,killMs:100}).then(()=>finished=true);await new Promise(r=>setTimeout(r,5));assert.equal(finished,false);await p;assert.equal(c.exitCode,0)});
test('forced termination is awaited after grace period',async()=>{const c=child();let killed=false;c.kill=()=>{killed=true;setTimeout(()=>{c.signalCode='SIGTERM';c.emit('exit',null,'SIGTERM')},20);return true};await terminateChild(c,{graceful:true,graceMs:10,killMs:100});assert.equal(killed,true);assert.equal(c.signalCode,'SIGTERM')});
test('failure to terminate is reported and never treated as success',async()=>{const c=child();await assert.rejects(terminateChild(c,{graceful:true,graceMs:5,killMs:5}),/did not exit/)});
test('agent termination waits and reports an unresponsive process',async()=>{const c=child();await assert.rejects(terminateChild(c,{killMs:5,name:'Agent'}),/Agent did not exit/)});
