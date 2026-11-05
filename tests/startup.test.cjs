const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {_electron}=require('playwright-core');
test('window appears while saved connection initialization is still pending',{timeout:20000,skip:process.platform!=='win32'},async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'kartlink-startup-test-'));
 const app=await _electron.launch({args:[path.join(__dirname,'fixtures','real-main.cjs')],env:{...process.env,KARTLINK_TEST_PROFILE:profile,KARTLINK_TEST_INIT_DELAY_MS:'4000'},timeout:15000});
 try {const p=await app.firstWindow();await p.getByRole('heading',{name:'Opening KartLink'}).waitFor({timeout:3000});const state=await p.evaluate(()=>window.kartlink.state());assert.equal(state.initializing,true);await p.getByRole('button',{name:'Connect Playit'}).waitFor({timeout:7000});assert.equal((await p.evaluate(()=>window.kartlink.state())).initializing,false)}finally{await app.close()}
});
