// Isolated main-process test: no real profile, room, or Playit account is touched.
const electron=require('electron');const Module=require('node:module');
electron.app.setPath('userData',process.env.KARTLINK_TEST_PROFILE);
electron.app.setPath('sessionData',require('node:path').join(process.env.KARTLINK_TEST_PROFILE,'Session'));
const BaseWindow=electron.BrowserWindow;
let fakeAgentExists=true;
const fakeSession = {fromPartition:()=>({fetch:async (url,options)=>{const route=new URL(url).pathname;const body=JSON.parse(options.body);let data;if(route==='/agents/list') data={agents:fakeAgentExists?[{id:'11111111-1111-4111-8111-111111111111',name:'Fixture agent',status:{state:'offline'}}]:[]};else if(route==='/v1/tunnels/list') data={tunnels:[]};else if(route==='/agents/delete'){if(body.tunnels_strategy.type!=='require_empty')throw Error('bad strategy');fakeAgentExists=false;data=null}else throw Error('unexpected endpoint');return {json:async()=>({status:'success',data})}}})};
class HiddenWindow extends BaseWindow { constructor(options) { super({...options,show:false}); } }
const original=Module._load;
Module._load=function(request,parent,isMain){
 const result=original.apply(this,arguments);
 if(request==='electron')return {...result,BrowserWindow:HiddenWindow,...(process.env.KARTLINK_FAKE_ACCOUNT ? {session:fakeSession}:{})};
 if(request==='node:fs/promises' && process.env.KARTLINK_TEST_INIT_DELAY_MS) return {...result,rm:async(target,...args)=>{if(String(target).endsWith('playit-runtime-secret'))await new Promise(resolve=>setTimeout(resolve,Number(process.env.KARTLINK_TEST_INIT_DELAY_MS)));return result.rm(target,...args)}};
 return result;
};
require('../../electron/main.cjs');
