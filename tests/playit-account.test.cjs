const {test} = require('node:test');
const assert = require('node:assert/strict');
const {createAccountApi} = require('../electron/playit-account.cjs');
const id = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
function server({expired=false, hasTunnel=true, refreshFails=false}={}) {
  const calls=[]; let authenticated=!expired;
  return {calls, api:createAccountApi(async (url, options) => {
    const route = new URL(url).pathname; const body=JSON.parse(options.body); calls.push({route,body,credentials:options.credentials});
    if(route === '/login/refresh') {authenticated=!refreshFails; return {json:async()=>({status:refreshFails?'error':'success',data:{}})};}
    if(!authenticated) return {json:async()=>({status:'error',data:{type:'auth',message:'SessionExpired'}})};
    if(route === '/agents/list') return {json:async()=>({status:'success',data:{agents:[{id,name:'Old agent',status:{state:'offline'},privateField:'ignored'}]}})};
    if(route === '/v1/tunnels/list') return {json:async()=>({status:'success',data:{tunnels:hasTunnel?[{origin:{type:'agent',details:{agent_id:id}}}]:[]}})};
    if(route === '/agents/delete') return {json:async()=>({status:'success'})};
    throw Error('unexpected endpoint');
  })};
}
test('lists agents and counts their associated tunnels without exposing account data', async()=>{
  const {api,calls}=server(); assert.deepEqual(await api.list(),[{id,name:'Old agent',status:'offline',tunnels:1}]);
  assert.ok(calls.every(c=>c.credentials==='include'));
});
test('account-wide tunnel management reads v1 allocation fields and protects a running tunnel',async()=>{
 const calls=[];const api=createAccountApi(async(url,options)=>{const route=new URL(url).pathname;calls.push({route,body:JSON.parse(options.body)});return {json:async()=>({status:'success',data:route==='/v1/tunnels/list'?{tunnels:[{id,name:'Room',port_type:'udp',port_count:1,origin:{type:'agent',details:{agent_id:other,name:'Old agent'}},public_allocations:[{type:'PortAllocation',details:{ip:'192.0.2.9',port:1234}}]}]}:null})}});
 assert.deepEqual((await api.listTunnels())[0].address,{host:'192.0.2.9',port:1234});
 await assert.rejects(api.removeTunnel(id,id),/Stop your room/);
 await api.removeTunnel(id,null);assert.deepEqual(calls.at(-1),{route:'/tunnels/delete',body:{tunnel_id:id}});
});
test('refreshes an expired session and reports when sign-in is still needed',async()=>{
  const good=server({expired:true}); assert.equal((await good.api.list()).length,1); assert.ok(good.calls.some(c=>c.route==='/login/refresh'));
  const bad=server({expired:true,refreshFails:true}); await assert.rejects(bad.api.list(),/could not find your Playit website session/);
});
test('deletes only an agent from a fresh list and respects the tunnel strategy',async()=>{
  for (const [strategy,expected] of [['leave',{type:'move_to_agent',details:{agent_id:null,disable_tunnels:false}}],['delete',{type:'delete_tunnels',details:null}]]) {
    const {api,calls}=server(); await api.remove(id,strategy,null);
    assert.deepEqual(calls.find(c=>c.route==='/agents/delete').body,{agent_id:id,tunnels_strategy:expected});
  }
  const empty=server({hasTunnel:false}); await empty.api.remove(id,'leave',null);
  assert.deepEqual(empty.calls.at(-1).body.tunnels_strategy,{type:'require_empty',details:null});
  const blocked=server(); await assert.rejects(blocked.api.remove(id,'leave',id),/Stop your room/);
  await assert.rejects(blocked.api.remove(id.toUpperCase(),'leave',id),/Stop your room/);
  await assert.rejects(blocked.api.remove(other,'leave',null),/no longer in the list/);
  await assert.rejects(blocked.api.remove(id,'unknown',null),/Choose what to do/);
  assert.equal(blocked.calls.some(c=>c.route==='/agents/delete'),false);
});
test('rejects malformed lists and reports network failures',async()=>{
  const malformed=createAccountApi(async()=>({json:async()=>({status:'success',data:{}})}));
  await assert.rejects(malformed.list(),/invalid agent list/);
  const offline=createAccountApi(async()=>{throw Error('private details')});
  await assert.rejects(offline.list(),/Could not reach Playit/);
});
