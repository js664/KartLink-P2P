const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {_electron}=require('playwright-core');
test('real main process lists and deletes an agent through isolated session IPC',{timeout:30000,skip:process.platform!=='win32'},async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'kartlink-agent-test-'));
 const app=await _electron.launch({args:[path.join(__dirname,'fixtures','real-main.cjs')],env:{...process.env,KARTLINK_TEST_PROFILE:profile,KARTLINK_FAKE_ACCOUNT:'1'},timeout:20000});
 try {const page=await app.firstWindow();await page.getByRole('button',{name:'Connect Playit'}).waitFor();const before=await page.evaluate(()=>window.kartlink.listAgents());assert.deepEqual(before.map(a=>a.name),['Fixture agent']);await page.evaluate(id=>window.kartlink.deleteAgent(id,'leave'),before[0].id);assert.deepEqual(await page.evaluate(()=>window.kartlink.listAgents()),[])}finally{await app.close();fs.rmSync(profile,{recursive:true,force:true})}
});
