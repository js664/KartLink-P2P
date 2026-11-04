import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Check, CircleHelp, Copy, ExternalLink, Info, Link2, LoaderCircle, LockKeyhole, Radio, RotateCw, Server, Share2, Square } from 'lucide-react'
import { Button } from 'panelui-web/button'
import { Input } from 'panelui-web/input'
import { Field } from 'panelui-web/field'
import { Card } from 'panelui-web/card'
import { Frame } from 'panelui-web/frame'
import { Badge } from 'panelui-web/badge'
import { Dialog } from 'panelui-web/dialog'
import { Checkbox } from 'panelui-web/checkbox'
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
  const [instructionsOpen, setInstructionsOpen] = useState(false)
  const [hideInstructions, setHideInstructions] = useState(() => localStorage.getItem('hide-room-instructions') === 'true')
  const previousPhase = useRef<State['phase']>('idle')
  useEffect(() => {
    if (state.phase === 'ready' && previousPhase.current !== 'ready' && !hideInstructions) setInstructionsOpen(true)
    previousPhase.current = state.phase
  }, [state.phase, hideInstructions])
  const updateHideInstructions = (value: boolean) => {
    setHideInstructions(value)
    if (value) localStorage.setItem('hide-room-instructions', 'true')
    else localStorage.removeItem('hide-room-instructions')
  }
  useEffect(() => { window.kartlink?.state().then(setState); return window.kartlink?.onState(setState) }, [])
  const run = async (fn: () => Promise<State>) => { try { setState(await fn()) } catch (error) { setState(old => ({ ...old, error: error instanceof Error ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '') : 'The action failed. Please try again.' })) } }
  const manage = async () => { try { await window.kartlink.managePlayit() } catch { setState(old => ({ ...old, error: 'Could not open Playit. Check your connection and try again.' })) } }
  const copy = async (key: string, text: string) => { try { await window.kartlink.copy(text); setCopied(key); setTimeout(() => setCopied(''), 2000) } catch { setState(old => ({ ...old, error: 'Could not copy to the clipboard. Please copy the value manually.' })) } }
  const busy = state.phase === 'starting' || state.phase === 'authorizing'
  const active = state.phase === 'ready' && state.address
  const limit = !busy && !!state.error && /too many agents|agent.over.limit/i.test(state.error)
  const copyButton = (key: string, value: string) => <Button variant="ghost" size="icon" className="copy-icon" aria-label={`Copy ${key}`} onClick={() => copy(key, value)}>{copied === key ? <Check size={18}/> : <Copy size={18}/>}</Button>
  const addressField = (name: string, value: string, key: string) => <Field name={key} className="room-field"><Field.Label>{name}</Field.Label><Input.Group><Input value={value} readOnly /><Input.Addon align="end">{copyButton(key, value)}</Input.Addon></Input.Group></Field>
  const retry = () => run(() => state.needsReset ? window.kartlink.disconnect() : state.connected ? window.kartlink.start(password) : window.kartlink.connect())
  const steps = [{ key: 'room', title: 'Room server', icon: Server }, { key: 'agent', title: 'Playit agent', icon: Radio }, { key: 'address', title: 'Assigning address', icon: Link2 }] as const
  const currentStep = Math.max(0, steps.findIndex(step => step.key === state.progress))
  return <div className="shell"><header className="app-header"><Button variant="ghost" className="brand" aria-label="KartLink home" onClick={() => setGuide(false)}>KartLink <span>P2P</span></Button><Button size="sm" variant="ghost" className="help-link" onClick={() => setGuide(!guide)}>{guide ? 'Back to room' : 'How to play'}</Button></header><main className={state.phase === 'starting' && !guide ? 'main progress-main' : 'main'}>
    <div className="page-top" key={`${guide}-${state.phase}-${state.connected}`}><h1>{guide ? 'How to play' : state.phase === 'starting' ? 'Creating room' : active ? 'Room ready' : 'Host a room'}</h1>{!guide && state.phase !== 'starting' && <Badge variant="secondary" dot>{active ? 'Address assigned' : state.connected ? 'Connected' : 'Not connected'}</Badge>}</div>
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
      <div className="room-layout"><Card className="panel room-card"><Card.Header><Card.Title>Invite players</Card.Title><Card.Description>Enter these in Eglantine</Card.Description></Card.Header><Card.Content>
        {addressField('Address', state.address.host, 'address')}{addressField('Port', String(state.address.port), 'port')}{password && addressField('Password', password, 'password')}
        <Button className="primary-action room-copy" onClick={() => copy('invite', `Join my Eglantine room: address ${state.address!.host}, port ${state.address!.port}.${password ? ` Password: ${password}.` : ''} In Eglantine, turn off Enable Airplane Mode under Emulation → Configure → Network, then select Multiplayer → Direct Connect to Room. In Mario Kart World, hold L + R and click the left stick at the mode menu to enable LAN Play.`)}>{copied === 'invite' ? 'Copied' : 'Copy invite'}</Button>
      </Card.Content><Card.Footer variant="panel"><div className="host-note"><span>Host joins at</span><span className="host-value"><b>127.0.0.1</b>{copyButton('host address', '127.0.0.1')}</span><span className="host-value"><b>6009</b>{copyButton('host port', '6009')}</span></div></Card.Footer></Card>
      <Frame className="panel room-connection"><Frame.Header><Frame.Title>Connection</Frame.Title></Frame.Header><Frame.Panel><Frame.Row><Frame.Content><Frame.Title>Room server</Frame.Title><Frame.Description>Running locally</Frame.Description></Frame.Content><Frame.Actions><Badge variant="secondary" dot>Started</Badge></Frame.Actions></Frame.Row><Frame.Row><Frame.Content><Frame.Title>Playit</Frame.Title><Frame.Description>Address assigned</Frame.Description></Frame.Content><Frame.Actions><Badge variant="secondary" dot>Assigned</Badge></Frame.Actions></Frame.Row></Frame.Panel><Frame.Footer><Button variant="secondary" className="stop-room" onClick={() => run(() => window.kartlink.stop())}>Stop room</Button></Frame.Footer></Frame></div>
      {state.error && <p className="inline-error" role="alert">{state.error}</p>}
    </> : limit ? <Card className="panel error-panel"><CardContent className="error-content" role="alert"><div className="error-title"><span className="status-dot error-dot"/><h2>Playit agent limit reached</h2></div><p>{state.error}</p><div className="actions"><Button className="primary-action" onClick={manage}><ExternalLink size={18}/>Manage agents</Button><Button variant="secondary" className="secondary-action" onClick={retry}><RotateCw size={18}/>Try again</Button></div></CardContent></Card> : <>
      {!state.connected ? <Card className="panel connect-card"><Card.Header><Card.Title>Connect Playit</Card.Title><Card.Description>{state.needsReset ? 'Clear the saved connection to reconnect' : 'Connect Playit to create a room'}</Card.Description></Card.Header><Card.Content><Button className="primary-action room-copy" disabled={busy} onClick={retry}>{state.needsReset ? 'Clear saved connection' : state.phase === 'authorizing' ? 'Waiting for Playit…' : 'Connect Playit'}</Button></Card.Content><Card.Footer variant="panel"><span className="quiet">Playit not connected</span><Button variant="ghost" size="sm" disabled={busy} onClick={manage}>Manage agents</Button></Card.Footer></Card> : <Card className="panel settings-card"><Card.Header><Card.Title>Room settings</Card.Title><Card.Description>Choose a password if you want one</Card.Description></Card.Header><Card.Content><Field name="password" className="password-root"><Field.Label optional>Room password</Field.Label><Input type="password" value={password} onChange={event => setPassword(event.target.value)} placeholder="Optional" maxLength={64} disabled={busy} /><Field.Description>Share the password with your friends</Field.Description></Field><Button className="primary-action room-copy" disabled={busy} onClick={retry}>Create room</Button></Card.Content><Card.Footer variant="panel"><span className="quiet">Playit connected</span><div><Button variant="ghost" size="sm" onClick={() => run(() => window.kartlink.disconnect())}>Disconnect</Button><Button variant="ghost" size="sm" disabled={busy} onClick={manage}>Manage agents</Button></div></Card.Footer></Card>}
      {state.error && <div className="error-banner" role="alert"><span className="status-dot error-dot"/><div><h2>Something went wrong</h2><p>{state.error}</p></div></div>}
    </>}</div>
  </main><Dialog open={instructionsOpen} onOpenChange={setInstructionsOpen}><Dialog.Content><Dialog.Header><Dialog.Title>Before you play</Dialog.Title><Dialog.Description>Both players need to complete these steps.</Dialog.Description></Dialog.Header><Dialog.Body><div className="play-instructions"><p><b>1. Turn off Airplane Mode</b><br/>In Eglantine, open Emulation → Configure → Network and uncheck Enable Airplane Mode.</p><p><b>2. Connect to the room</b><br/>Select Multiplayer → Direct Connect to Room. The host uses 127.0.0.1 and port 6009; friends use the shared address and port.</p><p><b>3. Enable LAN Play</b><br/>At Mario Kart World's mode menu, hold L + R and press the left stick. Select LAN Play, then create or join a game lobby.</p></div><label className="hide-instructions"><Checkbox checked={hideInstructions} onCheckedChange={updateHideInstructions} /> Don't show this again</label></Dialog.Body><Dialog.Footer><Dialog.Close render={<Button variant="secondary" />}>Got it</Dialog.Close></Dialog.Footer></Dialog.Content></Dialog></div>
}
createRoot(document.getElementById('root')!).render(<App />)
