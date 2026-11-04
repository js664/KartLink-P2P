import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Check, CircleHelp, Copy, ExternalLink, Info, Link2, LoaderCircle, LockKeyhole, Radio, RotateCw, Server, Share2, Square } from 'lucide-react'
import { Button } from 'panelui-web/button'
import { Input } from 'panelui-web/input'
import { Field } from 'panelui-web/field'
import { Card } from 'panelui-web/card'
const CardContent = Card.Content
import './style.css'

type State = { connected: boolean; needsReset?: boolean; phase: 'idle'|'authorizing'|'starting'|'ready'; progress?: 'room'|'agent'|'address'|null; address: { host: string; port: number } | null; error: string | null }
type API = { state: () => Promise<State>; connect: () => Promise<State>; managePlayit: () => Promise<void>; disconnect: () => Promise<State>; start: (password: string) => Promise<State>; stop: () => Promise<State>; copy: (value: string) => Promise<void>; onState: (callback: (state: State) => void) => () => void }
declare global { interface Window { kartlink: API } }

function App() {
  const [state, setState] = useState<State>({ connected: false, phase: 'idle', address: null, error: null })
  const [password, setPassword] = useState('')
  const [guide, setGuide] = useState(false)
  const [copied, setCopied] = useState('')
  useEffect(() => { window.kartlink?.state().then(setState); return window.kartlink?.onState(setState) }, [])
  const run = async (fn: () => Promise<State>) => { try { setState(await fn()) } catch (error) { setState(old => ({ ...old, error: error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : 'The action failed. Please try again.' })) } }
  const manage = async () => { try { await window.kartlink.managePlayit() } catch { setState(old => ({ ...old, error: 'Could not open Playit. Check your connection and try again.' })) } }
  const copy = async (key: string, text: string) => { try { await window.kartlink.copy(text); setCopied(key); setTimeout(() => setCopied(''), 2000) } catch { setState(old => ({ ...old, error: 'Could not copy to the clipboard. Please copy the value manually.' })) } }
  const busy = state.phase === 'starting' || state.phase === 'authorizing'
  const active = state.phase === 'ready' && state.address
  const limit = !busy && !!state.error && /too many agents|agent.over.limit/i.test(state.error)
  const copyButton = (key: string, value: string) => <Button variant="ghost" size="icon" className="copy-icon" aria-label={`Copy ${key}`} onClick={() => copy(key, value)}>{copied === key ? <Check size={18}/> : <Copy size={18}/>}</Button>
  const retry = () => run(() => state.needsReset ? window.kartlink.disconnect() : state.connected ? window.kartlink.start(password) : window.kartlink.connect())
  const steps = [{ key: 'room', title: 'Room server', icon: Server }, { key: 'agent', title: 'Playit agent', icon: Radio }, { key: 'address', title: 'Assigning address', icon: Link2 }] as const
  const currentStep = Math.max(0, steps.findIndex(step => step.key === state.progress))
  return <div className="shell"><header className="app-header"><div className="brand">KartLink <span>P2P</span></div></header><main className={state.phase === 'starting' && !guide ? 'main progress-main' : 'main'}>
    <div className="page-top" key={`${guide}-${state.phase}-${state.connected}`}><h1>{guide ? 'How to play' : state.phase === 'starting' ? 'Creating room' : active ? 'Room ready' : 'Host a room'}</h1><Button size="sm" variant="ghost" className="help-link" onClick={() => setGuide(!guide)}>{guide ? 'Back to room' : <><CircleHelp size={19}/> How to play</>}</Button></div>
    <div className="screen" key={`${guide}-${state.phase}-${state.connected}-${limit}`} >{guide ? <Card className="panel guide-panel"><CardContent className="guide">
      <section><h2>1. Check airplane mode · both players</h2><p>In Eglantine, open <b>Emulation → Configure → Network</b> and uncheck <b>Enable Airplane Mode</b>. Apply the setting. If LAN Play sends either player back to the menu, check this on that player’s PC too.</p></section>
      <section><h2>2. Create the KartLink room · host</h2><p>Connect Playit in this app, choose a room password if you want one, then press <b>Create room</b>. Share the address, port, and password with your friends. Keep KartLink open while playing.</p></section>
      <section><h2>3. Join the emulator room · everyone</h2><p>In Eglantine choose <b>Multiplayer → Direct Connect to Room</b>. The host enters <b>127.0.0.1</b> and port <b>6009</b>. Friends enter the address and port shown in KartLink. Everyone enters the room password if one was set, then connects.</p></section>
      <section><h2>4. Enter LAN Play · everyone</h2><p>Start Mario Kart World and reach its mode selection menu. Hold <b>L + R</b> and click the <b>left stick</b> (L3). Wireless Play changes to <b>LAN Play</b>. Select it on each PC.</p></section>
      <section><h2>5. Create the game lobby</h2><p>One player creates the in-game room; the others find and join it. Joining the Eglantine room and joining the game lobby are two separate steps.</p></section>
      <section><h2>Having trouble?</h2><p>If Playit says you have too many agents, choose <b>Manage agents</b> on the room screen and remove unused agents. Check that everyone joined the same emulator room, has Airplane Mode off, and is using compatible game and emulator versions. Check the shared address, port and password. Playit can add latency and may limit tunnels depending on the account.</p></section>
    </CardContent></Card> : state.phase === 'starting' ? <div className="progress-wrap">
      <Card className="panel progress-card"><CardContent className="progress-list">{steps.map((step, index) => { const Icon = step.icon; const complete = index < currentStep; const waiting = index === currentStep; return <div className="progress-row" key={step.key}><Icon size={22}/><span>{step.title}</span>{complete ? <span className="step-done" aria-label="Completed"><Check size={15}/></span> : waiting ? <LoaderCircle className="spinner" size={20} aria-label="In progress"/> : <span className="step-pending" aria-label="Pending"/>}</div> })}</CardContent></Card>
      <p className="wait-copy">This may take a moment</p><Button variant="secondary" className="wait-button" disabled>Please wait</Button>
    </div> : active && state.address ? <>
      <div className="ready-status"><span className="status-dot active-dot"/>Address assigned</div>
      <Card className="panel share-card"><CardContent className="share-content"><div className="share-title"><Share2 size={22}/><h2>Share with friends</h2></div>
        <div className="value-row"><span>Address</span><div className="value-box"><strong>{state.address.host}</strong>{copyButton('address', state.address.host)}</div></div>
        <div className="value-row"><span>Port</span><div className="value-box"><strong>{state.address.port}</strong>{copyButton('port', String(state.address.port))}</div></div>
        {password && <div className="value-row"><span>Password</span><div className="value-box"><strong>{password}</strong>{copyButton('password', password)}</div></div>}
        <div className="actions share-actions"><Button className="primary-action" onClick={() => copy('invite', `Join my Eglantine room: address ${state.address!.host}, port ${state.address!.port}.${password ? ` Password: ${password}.` : ''} In Eglantine, turn off Enable Airplane Mode under Emulation → Configure → Network, then select Multiplayer → Direct Connect to Room. In Mario Kart World, hold L + R and click the left stick at the mode menu to enable LAN Play.`)}><Copy size={18}/>{copied === 'invite' ? 'Copied' : 'Copy invite'}</Button><Button variant="secondary" className="secondary-action" onClick={() => run(() => window.kartlink.stop())}><Square size={17}/>Stop room</Button></div>
      </CardContent></Card><p className="host-note"><Info size={18}/>Host joins at <b>127.0.0.1 : 6009</b></p>
      {state.error && <p className="inline-error" role="alert">{state.error}</p>}
    </> : limit ? <Card className="panel error-panel"><CardContent className="error-content" role="alert"><div className="error-title"><span className="status-dot error-dot"/><h2>Playit agent limit reached</h2></div><p>{state.error}</p><div className="actions"><Button className="primary-action" onClick={manage}><ExternalLink size={18}/>Manage agents</Button><Button variant="secondary" className="secondary-action" onClick={retry}><RotateCw size={18}/>Try again</Button></div></CardContent></Card> : <>
      <Card className={'panel '+(state.connected ? 'connected-card' : 'connect-card')}><CardContent className="connection-content"><div className="connection-heading"><div className="connection-icon"><Link2 size={24}/></div><div className="connection-details"><h2>Playit</h2><div className={'connection-status '+(state.connected ? 'is-connected' : '')}><span className={'status-dot '+(state.connected ? 'active-dot' : '')}/>{state.connected ? 'Connected' : 'Not connected'}</div></div>{state.connected && <Button variant="ghost" size="sm" className="disconnect" onClick={() => run(() => window.kartlink.disconnect())}>Disconnect</Button>}</div>
        {!state.connected && <><p className="connection-caption">{state.needsReset ? 'Clear the saved connection to reconnect' : 'Connect Playit to create a room'}</p><div className="actions"><Button className="primary-action" disabled={busy} onClick={retry}><Link2 size={18}/>{state.needsReset ? 'Clear saved connection' : state.phase === 'authorizing' ? 'Waiting for Playit…' : 'Connect Playit'}</Button><Button variant="ghost" className="text-action" disabled={busy} onClick={manage}>Manage agents</Button></div></>}
      </CardContent></Card>
      {state.connected && <div className="room-settings"><Field name="password" className="password-root"><Field.Label optional>Room password</Field.Label><Input type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Optional" maxLength={64} disabled={busy} /><Field.Description>Share the password with your friends</Field.Description></Field><div className="actions settings-actions"><Button className="primary-action create-button" disabled={busy} onClick={retry}>Create room</Button><Button variant="ghost" className="text-action" disabled={busy} onClick={manage}><ExternalLink size={17}/>Manage agents</Button></div></div>}
      {state.error && <div className="error-banner" role="alert"><span className="status-dot error-dot"/><div><h2>Something went wrong</h2><p>{state.error}</p></div></div>}
    </>}</div>
  </main></div>
}
createRoot(document.getElementById('root')!).render(<App />)
