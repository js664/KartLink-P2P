const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { _electron } = require('playwright-core');

async function launch(scenario) {
  return _electron.launch({ args: [path.join(__dirname, 'fixtures', 'ui-main.cjs')], env: { ...process.env, KARTLINK_UI_SCENARIO: scenario }, timeout: 30000 });
}
test('room controls, invite and guide work in the actual Electron renderer', { timeout: 90000 }, async () => {
  const app = await launch('room');
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'Create room' }).click();
    await page.getByRole('dialog', { name: 'Before you play' }).waitFor();
    const reminderText = await page.getByRole('dialog', { name: 'Before you play' }).locator('.play-instructions').innerText();
    await page.getByRole('button', { name: 'Got it' }).click();
    await page.locator('input[value="example.test"]').waitFor();
    assert.equal(await page.locator('input[value="32100"]').count(), 1);
    await page.getByRole('button', { name: 'Copy host address' }).click();
    assert.equal(await page.evaluate(() => window.kartlinkTest.lastCopied()), '127.0.0.1');
    await page.getByRole('button', { name: 'Copy host port' }).click();
    assert.equal(await page.evaluate(() => window.kartlinkTest.lastCopied()), '6009');
    await page.getByRole('button', { name: 'How to play' }).click();
    const helpDialog = page.getByRole('dialog', { name: 'How to play' });
    await helpDialog.waitFor();
    assert.equal(await page.getByRole('dialog', { name: 'Before you play' }).count(), 0);
    assert.equal(await helpDialog.locator('.play-instructions').innerText(), reminderText);
    assert.equal(await helpDialog.getByRole('checkbox').count(), 0);
    await helpDialog.getByRole('button', { name: 'Got it' }).click();
    assert.equal(await page.locator('input[value="example.test"]').count(), 1);
    await page.getByRole('button', { name: 'Copy invite', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: 'Copied', exact: true }).count(), 1);
    await page.getByRole('button', { name: 'Stop room' }).click();
    assert.equal(await page.locator('input[value="example.test"]').count(), 0);
    await page.getByRole('button', { name: 'Create room' }).click();
    await page.getByRole('dialog', { name: 'Before you play' }).waitFor();
    await page.getByRole('checkbox', { name: /Don't show this again/ }).check();
    await page.getByRole('button', { name: 'Got it' }).click();
    await page.getByRole('button', { name: 'Stop room' }).click();
    await page.getByRole('button', { name: 'Create room' }).click();
    await page.getByRole('button', { name: 'Stop room' }).waitFor();
    assert.equal(await page.getByRole('dialog', { name: 'Before you play' }).count(), 0);
    await page.reload();
    assert.equal(await page.evaluate(() => localStorage.getItem('hide-room-instructions')), 'true');
    await page.getByRole('button', { name: 'How to play' }).click();
    const manualHelp = page.getByRole('dialog', { name: 'How to play' });
    await manualHelp.waitFor();
    assert.equal(await manualHelp.getByRole('checkbox').count(), 0);
    assert.match(await manualHelp.innerText(), /Enable Airplane Mode/);
    await manualHelp.getByRole('button', { name: 'Got it' }).click();
    assert.equal(await page.getByRole('button', { name: 'Create room' }).count(), 1);
  } finally { await app.close(); }
});
test('agent limit is visible with an action the user can find', { timeout: 45000 }, async () => {
  const app = await launch('agent-limit');
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'Create room' }).click();
    await page.getByRole('alert').waitFor();
    assert.match(await page.getByRole('alert').innerText(), /too many agents.*Manage Playit agents/s);
    assert.equal(await page.getByRole('button', { name: 'Manage Playit' }).count(), 1);
  } finally { await app.close(); }
});
test('an unreadable saved connection offers an explicit reset', { timeout: 45000 }, async () => {
  const app = await launch('unreadable');
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'Clear saved connection' }).click();
    assert.equal(await page.getByRole('button', { name: 'Connect Playit' }).count(), 1);
    assert.equal(await page.getByRole('alert').count(), 0);
  } finally { await app.close(); }
});
test('disconnected screen offers Playit setup and agent management', { timeout: 45000 }, async () => {
  const app = await launch('disconnected');
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', { name: 'Connect Playit' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Manage Playit' }).count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Create room' }).count(), 0);
  } finally { await app.close(); }
});
test('progress screen reflects completed and active startup stages', { timeout: 45000 }, async () => {
  const app = await launch('progress');
  try {
    const page = await app.firstWindow();
    await page.getByRole('heading', { name: 'Creating room' }).waitFor();
    assert.equal(await page.getByLabel('Completed').count(), 2);
    assert.equal(await page.getByLabel('In progress').count(), 1);
    assert.equal(await page.getByRole('button', { name: 'Please wait' }).isDisabled(), true);
  } finally { await app.close(); }
});
test('instructions fit and remain scrollable at the minimum window size', { timeout: 45000 }, async () => {
  const app = await launch('room');
  try {
    const page = await app.firstWindow();
    await page.setViewportSize({ width: 640, height: 480 });
    await page.getByRole('button', { name: 'How to play' }).click();
    const dialog = page.getByRole('dialog', { name: 'How to play' });
    await dialog.getByText('3. Enable LAN Play').scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    assert.equal(await dialog.getByText('3. Enable LAN Play').isVisible(), true);
    assert.equal(await dialog.getByRole('button', { name: 'Got it' }).isVisible(), true);
  } finally { await app.close(); }
});

test('navigation opens activity and help details without leaving the room', { timeout: 90000 }, async () => {
  const app = await launch('room');
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', {name:'Create room'}).click();
    await page.getByRole('button', {name:'Got it'}).click();
    await page.getByRole('tab', {name:'Activity'}).click();
    const activity = page.locator('.activity-grid');
    await activity.waitFor();
    assert.match(await activity.innerText(), /Room server[\s\S]*Running/);
    assert.match(await activity.innerText(), /External connection[\s\S]*Not tested/);
    assert.match(await activity.innerText(), /KartA/);
    assert.match(await activity.innerText(), /may be incomplete/);
    assert.match(await activity.getByLabel('Recent server log').innerText(), /Room is open/);
    await page.evaluate(() => window.kartlinkTest.emitDiagnostics({logs:['KartB joined the room'], players:['KartB'], playerListReliable:false}));
    await activity.getByText('KartB', {exact:true}).waitFor();
    assert.match(await activity.getByLabel('Recent server log').innerText(), /KartB joined the room/);
    await page.getByRole('button', {name:'View all'}).click();
    let dialog = page.getByRole('dialog', {name:'Server log'});
    assert.match(await dialog.innerText(), /KartB joined the room/);
    await dialog.getByRole('button', {name:'Close', exact:true}).last().click();
    await page.getByRole('tab', {name:'Help & settings'}).click();
    await page.getByRole('button', {name:'Settings', exact:true}).click();
    dialog = page.getByRole('dialog', {name:'Settings'});
    await dialog.getByRole('switch', {name:'Show room instructions'}).uncheck();
    assert.equal(await page.evaluate(() => localStorage.getItem('hide-room-instructions')), 'true');
    await dialog.getByRole('switch', {name:'Show room instructions'}).check();
    assert.equal(await page.evaluate(() => localStorage.getItem('hide-room-instructions')), null);
    await dialog.getByRole('button', {name:'Close', exact:true}).last().click();
    await page.getByRole('button', {name:'Updates', exact:true}).click();
    dialog = page.getByRole('dialog', {name:'Updates'});
    assert.match(await dialog.innerText(), /new release is available/i);
    assert.match(await dialog.innerText(), /1.0.2/);
    await dialog.getByRole('button', {name:'Close', exact:true}).last().click();
    await page.getByRole('button', {name:'KartLink home'}).click();
    assert.equal(await page.getByRole('button', {name:'Stop room'}).count(), 1);
    assert.equal(await page.getByRole('tab', {name:'Room'}).getAttribute('aria-selected'), 'true');
  } finally { await app.close(); }
});

test('a delayed initial state cannot overwrite a newer startup update',{timeout:30000},async()=>{
 const app=await launch('race');try{const p=await app.firstWindow();await p.getByRole('button',{name:'Create room'}).waitFor();await p.waitForTimeout(400);assert.equal(await p.getByRole('button',{name:'Create room'}).count(),1);assert.equal(await p.getByRole('button',{name:'Connect Playit'}).count(),0)}finally{await app.close()}
});

test('tunnel management requires confirmation and updates the list', {timeout:45000}, async () => {
  const app = await launch('room');
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', {name:'Manage Playit'}).click();
    const dialog = page.locator('main');
    await dialog.getByRole('button', {name:'Tunnels', exact:true}).click();
    await dialog.getByText('Test tunnel', {exact:true}).waitFor();
    await dialog.getByRole('button', {name:'Delete Test tunnel'}).click();
    assert.match(await dialog.innerText(), /public address and allocated ports will be released/);
    await dialog.getByRole('button', {name:'Cancel',exact:true}).click();
    assert.equal(await dialog.getByText('Test tunnel', {exact:true}).count(), 1);
    await dialog.getByRole('button', {name:'Delete Test tunnel'}).click();
    await dialog.getByRole('button', {name:'Delete tunnel',exact:true}).click();
    await dialog.getByText('No tunnels found for this account.').waitFor();
  } finally { await app.close(); }
});

test('agent management lists agents and confirms their tunnel treatment', {timeout:45000}, async () => {
  const app = await launch('room');
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', {name:'Manage Playit'}).click();
    const dialog = page.locator('main');
    await dialog.getByText('Test agent', {exact:true}).waitFor();
    assert.match(await dialog.innerText(), /offline.*1 tunnel/s);
    await dialog.getByRole('button', {name:'Delete agent Test agent'}).click();
    assert.match(await dialog.innerText(), /cannot be undone/);
    await dialog.getByRole('button', {name:'Cancel',exact:true}).click();
    assert.equal(await dialog.getByText('Test agent', {exact:true}).count(), 1);
    await dialog.getByRole('button', {name:'Delete agent Test agent'}).click();
    await dialog.getByRole('button', {name:'Delete tunnels too'}).click();
    await dialog.getByRole('button', {name:'Confirm delete agent'}).click();
    await dialog.getByText('No agents found.').waitFor();
  } finally { await app.close(); }
});

test('agent management explains how it reuses the room creator website session', {timeout:45000}, async () => {
  const app = await launch('auth-expired');
  try {
    const page = await app.firstWindow();
    await page.getByRole('button', {name:'Manage Playit'}).click();
    const dialog = page.locator('main');
    await dialog.getByRole('alert').getByText(/Connect Playit from the Room tab/).waitFor();
    assert.equal(await dialog.getByRole('button', {name:'Sign in to Playit'}).count(),0);
  } finally { await app.close(); }
});

test('only current agent and tunnel are labelled and protected', {timeout:45000}, async () => {
 const app=await launch('active-resources'); try {const p=await app.firstWindow();await p.getByRole('tab',{name:'Manage Playit'}).click();await p.getByText('Current agent',{exact:true}).waitFor();assert.equal(await p.getByRole('button',{name:'Delete agent Current agent'}).isDisabled(),true);assert.equal(await p.getByRole('button',{name:'Delete agent Old agent'}).isEnabled(),true);assert.match(await p.locator('main').innerText(),/Currently used by KartLink/);await p.getByRole('button',{name:'Tunnels',exact:true}).click();await p.getByText('Current tunnel',{exact:true}).waitFor();assert.equal(await p.getByRole('button',{name:'Delete Current tunnel'}).isDisabled(),true);assert.equal(await p.getByRole('button',{name:'Delete Old tunnel'}).isEnabled(),true)}finally{await app.close()}
});
