const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {_electron}=require('playwright-core');
test('unreadable configuration does not leave authorization locked',{timeout:30000,skip:process.platform!=='win32'},async()=>{
 const profile=fs.mkdtempSync(path.join(os.tmpdir(),'kartlink-config-test-'));fs.mkdirSync(path.join(profile,'config.json'));
 const app=await _electron.launch({args:[path.join(__dirname,'fixtures','real-main.cjs')],env:{...process.env,KARTLINK_TEST_PROFILE:profile},timeout:20000});
 try {const p=await app.firstWindow();await p.getByRole('button',{name:'Connect Playit'}).waitFor();const available=await app.evaluate(({safeStorage})=>safeStorage.isEncryptionAvailable());if(!available){console.log('Windows secure storage unavailable; skipped');return}for(let i=0;i<2;i++){const message=await p.evaluate(async()=>{try{await window.kartlink.connect();return 'unexpected success'}catch(e){return e.message}});assert.match(message,/could not read its saved settings/i);assert.doesNotMatch(message,/already in progress/i)}}finally{await app.close()}
});
