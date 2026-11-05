const {test}=require('node:test');const assert=require('node:assert/strict');const {markCurrent}=require('../electron/active-resources.cjs');
test('marks only the running resource, never an old or stopped one',()=>{
 const items=[{id:'A'},{id:'B'}];
 assert.deepEqual(markCurrent(items,'a',true).map(x=>x.inUse),[true,false]);
 assert.deepEqual(markCurrent(items,'a',false).map(x=>x.inUse),[false,false]);
 assert.deepEqual(markCurrent(items,null,true).map(x=>x.inUse),[false,false]);
 assert.deepEqual(markCurrent(items,'C',true).map(x=>x.inUse),[false,false]);
});
