import { createClient } from '@supabase/supabase-js'
import { useState, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster, toast } from 'react-hot-toast'

// ─── Supabase ────────────────────────────────────────────────
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY
const sb = createClient(SUPABASE_URL, SUPABASE_ANON)

const GEWERKE = ['Rohbau','Fassade','Fenster & Türen','Dach','Innenausbau','Haustechnik','Elektro','Sanitär','Böden','Außenanlagen','Sonstiges']
const NOTEN = [
  { n:1, label:'Besser als gefordert', color:'#10b981', bg:'rgba(16,185,129,0.15)' },
  { n:2, label:'Alle Forderungen erfüllt', color:'#3b82f6', bg:'rgba(59,130,246,0.15)' },
  { n:3, label:'Durchschnittlich', color:'#f59e0b', bg:'rgba(245,158,11,0.15)' },
  { n:4, label:'Verbesserungsbedarf', color:'#f97316', bg:'rgba(249,115,22,0.15)' },
  { n:5, label:'Fehlerhaft', color:'#ef4444', bg:'rgba(239,68,68,0.15)' },
]
const STATUS_OPT = ['In Ordnung','Beobachtung','Verbesserung empfohlen','Mangel']

// ─── CSS-in-JS ───────────────────────────────────────────────
const G = {
  bg: '#0f1117', card: '#1a1d27', border: '#2a2d3a',
  text: '#f0f0f0', muted: '#8b8fa8', accent: '#f59e0b',
  green: '#10b981', red: '#ef4444', blue: '#3b82f6',
}

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  * { font-family: 'Inter', sans-serif; }
  input,select,textarea { color: ${G.text}; background: ${G.card}; border: 1.5px solid ${G.border}; border-radius: 8px; padding: 10px 13px; font-size: 14px; outline: none; width: 100%; transition: border-color .15s; }
  input:focus,select:focus,textarea:focus { border-color: ${G.accent}; }
  input::placeholder,textarea::placeholder { color: ${G.muted}; }
  select option { background: #1a1d27; }
  button { cursor: pointer; }
  @keyframes fadeUp { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
  @keyframes spin { to { transform: rotate(360deg); } }
  .fade-up { animation: fadeUp .3s ease; }
  .spinner { width:20px; height:20px; border:2.5px solid rgba(255,255,255,.2); border-top-color:white; border-radius:50%; animation:spin .6s linear infinite; display:inline-block; }
  @media (max-width: 640px) {
    .desktop-only { display: none !important; }
  }
`

// ─── Helpers ─────────────────────────────────────────────────
const btn = (variant='primary', extra={}) => ({
  padding: '10px 20px', borderRadius: 10, border: 'none', fontWeight: 600, fontSize: 14,
  background: variant === 'primary' ? G.accent : variant === 'danger' ? G.red : variant === 'ghost' ? 'transparent' : G.card,
  color: variant === 'primary' ? '#000' : variant === 'ghost' ? G.muted : G.text,
  border: variant === 'ghost' ? `1.5px solid ${G.border}` : 'none',
  cursor: 'pointer', transition: 'opacity .15s',
  ...extra,
})

const card = (extra={}) => ({
  background: G.card, border: `1px solid ${G.border}`, borderRadius: 14,
  padding: 20, ...extra,
})

const inp = { background: G.card, border: `1.5px solid ${G.border}`, borderRadius: 8, padding: '10px 13px', fontSize: 14, color: G.text, width: '100%', outline: 'none' }
const lbl = { fontSize: 11, fontWeight: 700, color: G.muted, textTransform: 'uppercase', letterSpacing: '.5px', display: 'block', marginBottom: 5, marginTop: 14 }

function formatDate(d) {
  if (!d) return '–'
  return new Date(d).toLocaleDateString('de-AT', { day:'2-digit', month:'2-digit', year:'numeric' })
}

function NoteCircle({ n, size=32 }) {
  const cfg = NOTEN.find(x => x.n === n)
  if (!cfg) return null
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: cfg.bg, border: `2px solid ${cfg.color}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize: size * 0.4, fontWeight: 800, color: cfg.color, flexShrink:0 }}>
      {n}
    </div>
  )
}

// ─── API Calls ───────────────────────────────────────────────
async function callClaudeAI(prompt) {
  const res = await fetch('/api/claude-text', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Claude API Fehler')
  return data.text || ''
}

async function analyzeImage(base64, mediaType = 'image/jpeg') {
  const imageBase64 = base64.includes(',') ? base64.split(',')[1] : base64
  const res = await fetch('/api/claude-analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, mediaType }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Claude Bildanalyse Fehler')
  // claude-analyze gibt oeffentlich+intern zurueck, wir nehmen intern fuer die einfache Analyse
  return data.intern || data.oeffentlich || ''
}

async function generateDualText(rohtext) {
  const prompt = `Du bist Bausachverständiger. Formuliere aus folgender Rohnotiz ZWEI professionelle Fachtexte auf Deutsch.

Rohnotiz: "${rohtext}"

Antworte NUR im folgenden JSON-Format, keine weiteren Erklärungen:
{
  "oeffentlich": "Positiver, diplomatischer Text für den Auftraggeber (2-3 Sätze, lösungsorientiert, professionell)",
  "intern": "Kritischer, technisch präziser Text für interne Zwecke (2-3 Sätze, klar, vollständig)"
}`
  const raw = await callClaudeAI(prompt)
  try {
    const clean = raw.replace(/```json|```/g, '').trim()
    return JSON.parse(clean)
  } catch {
    return { oeffentlich: rohtext, intern: rohtext }
  }
}

// ─── Upload Foto zu Supabase ─────────────────────────────────
async function uploadFoto(base64, name) {
  const match = base64.match(/^data:([A-Za-z-+/]+);base64,(.+)$/)
  if (!match) return null
  const mimeType = match[1]
  const buffer = Uint8Array.from(atob(match[2]), c => c.charCodeAt(0))
  const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg'
  const path = `${Date.now()}-${name || 'foto'}.${ext}`
  const { error } = await sb.storage.from('bhh-photos').upload(path, buffer, { contentType: mimeType, upsert: true })
  if (error) return null
  const { data } = sb.storage.from('bhh-photos').getPublicUrl(path)
  return data?.publicUrl || null
}

// ─── Auth ────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ email:'', password:'', name:'', role:'gutachter' })
  const [loading, setLoading] = useState(false)
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleLogin(e) {
    e.preventDefault()
    setLoading(true)
    const { data, error } = await sb.auth.signInWithPassword({ email: form.email, password: form.password })
    if (error) { toast.error(error.message); setLoading(false); return }
    onLogin(data.user)
  }

  async function handleRegister(e) {
    e.preventDefault()
    setLoading(true)
    const { data, error } = await sb.auth.signUp({ email: form.email, password: form.password,
      options: { data: { full_name: form.name, role: form.role } } })
    if (error) { toast.error(error.message); setLoading(false); return }
    toast.success('Registrierung erfolgreich! Bitte E-Mail bestätigen.')
    setMode('login')
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100dvh', background: `linear-gradient(135deg, ${G.bg} 0%, #1a1020 100%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: `linear-gradient(135deg, ${G.accent}, #f97316)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, margin: '0 auto 16px', boxShadow: `0 8px 32px rgba(245,158,11,0.3)` }}>🏗</div>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: G.text, marginBottom: 4 }}>Bauherren Hilfe</h1>
          <p style={{ color: G.muted, fontSize: 13 }}>Professionelle Baustellenprüfung</p>
        </div>

        <div style={card()}>
          {/* Tab */}
          <div style={{ display: 'flex', background: G.bg, borderRadius: 10, padding: 4, marginBottom: 24 }}>
            {['login','register'].map(m => (
              <button key={m} onClick={() => setMode(m)} style={{ flex:1, padding:'8px', borderRadius:8, border:'none', background: mode===m ? G.accent : 'transparent', color: mode===m ? '#000' : G.muted, fontWeight:700, fontSize:13, cursor:'pointer' }}>
                {m === 'login' ? 'Anmelden' : 'Registrieren'}
              </button>
            ))}
          </div>

          <form onSubmit={mode === 'login' ? handleLogin : handleRegister}>
            {mode === 'register' && (
              <>
                <label style={lbl}>Vollständiger Name</label>
                <input style={inp} value={form.name} onChange={e => upd('name', e.target.value)} placeholder="Ing. Max Mustermann" required />
                <label style={lbl}>Rolle</label>
                <select style={inp} value={form.role} onChange={e => upd('role', e.target.value)}>
                  <option value="gutachter">Sachverständiger / Gutachter</option>
                  <option value="admin">Administrator</option>
                </select>
              </>
            )}
            <label style={lbl}>E-Mail</label>
            <input style={inp} type="email" value={form.email} onChange={e => upd('email', e.target.value)} placeholder="name@firma.at" required />
            <label style={lbl}>Passwort</label>
            <input style={inp} type="password" value={form.password} onChange={e => upd('password', e.target.value)} placeholder="••••••••" required />

            <button style={{ ...btn('primary'), width:'100%', marginTop:24, padding:'13px', fontSize:15 }} disabled={loading}>
              {loading ? <span className="spinner" /> : mode === 'login' ? 'Anmelden' : 'Konto erstellen'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}

// ─── Navigation ──────────────────────────────────────────────
function BottomNav({ page, setPage, isAdmin }) {
  const items = [
    { id:'dashboard', icon:'🏠', label:'Home' },
    { id:'begehungen', icon:'📋', label:'Begehungen' },
    { id:'neueBegehung', icon:'＋', label:'Neu', accent:true },
    { id:'projekte', icon:'🏗', label:'Projekte' },
    ...(isAdmin ? [{ id:'admin', icon:'⚙️', label:'Admin' }] : []),
  ]
  return (
    <div style={{ position:'fixed', bottom:0, left:0, right:0, background:G.card, borderTop:`1px solid ${G.border}`, display:'flex', zIndex:100, paddingBottom:'env(safe-area-inset-bottom)' }}>
      {items.map(it => (
        <button key={it.id} onClick={() => setPage(it.id)} style={{ flex:1, padding:'10px 4px 8px', border:'none', background:'transparent', display:'flex', flexDirection:'column', alignItems:'center', gap:3, cursor:'pointer' }}>
          <div style={{ width:36, height:36, borderRadius:10, background: it.accent ? `linear-gradient(135deg,${G.accent},#f97316)` : page===it.id ? 'rgba(245,158,11,0.15)' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', fontSize: it.accent ? 20 : 17, color: it.accent ? '#000' : page===it.id ? G.accent : G.muted, fontWeight:800, transition:'all .15s' }}>
            {it.icon}
          </div>
          <span style={{ fontSize:10, color: it.accent ? G.accent : page===it.id ? G.accent : G.muted, fontWeight:600 }}>{it.label}</span>
        </button>
      ))}
    </div>
  )
}

// ─── Dashboard ───────────────────────────────────────────────
function Dashboard({ user, profile, setPage, stats }) {
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Guten Morgen' : hour < 18 ? 'Guten Tag' : 'Guten Abend'

  return (
    <div style={{ padding: 20, paddingBottom: 100 }}>
      <div style={{ marginBottom: 28 }}>
        <p style={{ color: G.muted, fontSize: 13, marginBottom: 3 }}>{greeting},</p>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: G.text }}>{profile?.full_name || user?.email}</h1>
        <p style={{ color: G.muted, fontSize: 12, marginTop: 3 }}>Sachverständiger · Bauherren Hilfe</p>
      </div>

      {/* Quick Action */}
      <button onClick={() => setPage('neueBegehung')} style={{ width:'100%', background:`linear-gradient(135deg, ${G.accent}, #f97316)`, border:'none', borderRadius:16, padding:20, display:'flex', alignItems:'center', gap:16, marginBottom:20, cursor:'pointer', boxShadow:'0 8px 24px rgba(245,158,11,0.25)' }}>
        <div style={{ width:48, height:48, borderRadius:12, background:'rgba(0,0,0,0.2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, flexShrink:0 }}>📋</div>
        <div style={{ textAlign:'left' }}>
          <p style={{ color:'#000', fontWeight:800, fontSize:16, marginBottom:2 }}>Neue Begehung starten</p>
          <p style={{ color:'rgba(0,0,0,0.6)', fontSize:12 }}>Fotos, Bewertungen & KI-Protokoll</p>
        </div>
        <div style={{ marginLeft:'auto', fontSize:22, color:'rgba(0,0,0,0.5)' }}>›</div>
      </button>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20 }}>
        {[
          { icon:'📋', label:'Begehungen', value: stats?.begehungen || 0, color: G.blue },
          { icon:'🏗', label:'Projekte', value: stats?.projekte || 0, color: G.green },
          { icon:'📸', label:'Fotos', value: stats?.fotos || 0, color: G.accent },
          { icon:'⚠️', label:'Mängel', value: stats?.maengel || 0, color: G.red },
        ].map(s => (
          <div key={s.label} style={{ ...card({ padding:16 }) }}>
            <p style={{ fontSize:22, marginBottom:6 }}>{s.icon}</p>
            <p style={{ fontSize:24, fontWeight:800, color:s.color }}>{s.value}</p>
            <p style={{ fontSize:11, color:G.muted, fontWeight:600, textTransform:'uppercase' }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Letzte Aktivität */}
      {stats?.letzte?.length > 0 && (
        <div style={card()}>
          <p style={{ fontWeight:700, marginBottom:14, fontSize:14 }}>Letzte Begehungen</p>
          {stats.letzte.map(b => (
            <div key={b.id} style={{ display:'flex', alignItems:'center', gap:12, paddingBottom:12, borderBottom:`1px solid ${G.border}`, marginBottom:12 }}>
              <div style={{ width:40, height:40, borderRadius:10, background:'rgba(245,158,11,0.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>📋</div>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontWeight:600, fontSize:13, marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{b.titel}</p>
                <p style={{ fontSize:11, color:G.muted }}>{b.gewerk} · {formatDate(b.datum)}</p>
              </div>
              <NoteCircle n={b.gesamtnote} size={28} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Begehungen Liste ────────────────────────────────────────
function BegehungenListe({ setPage, setSelectedBegehung, begehungen, loading }) {
  const [filter, setFilter] = useState('alle')
  const filtered = begehungen.filter(b => {
    if (filter === 'alle') return true
    if (filter === 'mangel') return b.gesamtnote >= 4
    if (filter === 'ok') return b.gesamtnote <= 2
    return true
  })

  return (
    <div style={{ padding:20, paddingBottom:100 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <h1 style={{ fontSize:22, fontWeight:800 }}>Begehungen</h1>
        <span style={{ fontSize:12, color:G.muted }}>{begehungen.length} gesamt</span>
      </div>

      {/* Filter */}
      <div style={{ display:'flex', gap:6, marginBottom:16, overflowX:'auto', paddingBottom:4 }}>
        {[['alle','Alle'],['mangel','Mängel'],['ok','In Ordnung']].map(([id,lbl]) => (
          <button key={id} onClick={() => setFilter(id)} style={{ padding:'6px 14px', borderRadius:20, border:`1.5px solid ${filter===id ? G.accent : G.border}`, background:filter===id ? 'rgba(245,158,11,0.1)' : 'transparent', color:filter===id ? G.accent : G.muted, fontWeight:600, fontSize:12, cursor:'pointer', whiteSpace:'nowrap', flexShrink:0 }}>
            {lbl}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:G.muted }}>Lädt…</div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign:'center', padding:60 }}>
          <p style={{ fontSize:40, marginBottom:12 }}>📋</p>
          <p style={{ color:G.muted }}>Noch keine Begehungen</p>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {filtered.map(b => (
            <div key={b.id} style={{ ...card({ cursor:'pointer' }), display:'flex', gap:14, alignItems:'flex-start' }}
              onClick={() => { setSelectedBegehung(b); setPage('begehungDetail') }}>
              <NoteCircle n={b.gesamtnote} size={44} />
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontWeight:700, fontSize:14, marginBottom:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{b.titel}</p>
                <p style={{ fontSize:12, color:G.muted, marginBottom:6 }}>{b.gewerk} · {formatDate(b.datum)}</p>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  <span style={{ fontSize:10, background:'rgba(255,255,255,0.06)', borderRadius:6, padding:'2px 8px', color:G.muted }}>{b.auftraggeber_name}</span>
                  {b.pruefpunkte_count > 0 && <span style={{ fontSize:10, background:'rgba(245,158,11,0.1)', borderRadius:6, padding:'2px 8px', color:G.accent }}>{b.pruefpunkte_count} Punkte</span>}
                </div>
              </div>
              <span style={{ color:G.muted, fontSize:20 }}>›</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Neue Begehung ───────────────────────────────────────────
function NeueBegehung({ user, setPage, onCreated }) {
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    titel: '', adresse: '', auftraggeber_name: '', auftraggeber_email: '',
    kunde_name: '', sachverstaendiger: user?.user_metadata?.full_name || '',
    datum: new Date().toISOString().split('T')[0],
    uhrzeit: new Date().toTimeString().slice(0,5),
    gewerk: GEWERKE[0], bemerkungen: '',
  })
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleCreate() {
    if (!form.titel || !form.auftraggeber_name || !form.auftraggeber_email) {
      toast.error('Bitte alle Pflichtfelder ausfüllen')
      return
    }
    setSaving(true)
    const { data, error } = await sb.from('begehungen').insert({
      ...form,
      user_id: user.id,
      gesamtnote: null,
      status: 'in_bearbeitung',
    }).select().single()
    if (error) { toast.error(error.message); setSaving(false); return }
    toast.success('Begehung angelegt!')
    onCreated(data)
    setPage('begehungDetail')
  }

  const steps = ['Projekt', 'Beteiligte', 'Details']

  return (
    <div style={{ padding:20, paddingBottom:100 }}>
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
        <button onClick={() => setPage('begehungen')} style={{ background:'transparent', border:'none', color:G.muted, fontSize:22, padding:4, cursor:'pointer' }}>←</button>
        <h1 style={{ fontSize:20, fontWeight:800 }}>Neue Begehung</h1>
      </div>

      {/* Step Indicator */}
      <div style={{ display:'flex', gap:8, marginBottom:24 }}>
        {steps.map((s, i) => (
          <div key={s} style={{ flex:1, textAlign:'center' }}>
            <div style={{ height:4, borderRadius:4, background: step > i ? G.accent : G.border, marginBottom:6, transition:'background .3s' }} />
            <span style={{ fontSize:10, color: step === i+1 ? G.accent : G.muted, fontWeight:600 }}>{s}</span>
          </div>
        ))}
      </div>

      <div style={card()}>
        {step === 1 && (
          <div className="fade-up">
            <label style={lbl}>Projekttitel / Bauvorhaben *</label>
            <input style={inp} value={form.titel} onChange={e => upd('titel', e.target.value)} placeholder="z.B. EFH Musterstraße - Rohbauabnahme" autoFocus />
            <label style={lbl}>Projektadresse *</label>
            <input style={inp} value={form.adresse} onChange={e => upd('adresse', e.target.value)} placeholder="Straße, PLZ Ort" />
            <label style={lbl}>Gewerk / Bereich *</label>
            <select style={inp} value={form.gewerk} onChange={e => upd('gewerk', e.target.value)}>
              {GEWERKE.map(g => <option key={g}>{g}</option>)}
            </select>
          </div>
        )}

        {step === 2 && (
          <div className="fade-up">
            <label style={lbl}>Auftraggeber *</label>
            <input style={inp} value={form.auftraggeber_name} onChange={e => upd('auftraggeber_name', e.target.value)} placeholder="Name / Firma" />
            <label style={lbl}>E-Mail Auftraggeber *</label>
            <input style={inp} type="email" value={form.auftraggeber_email} onChange={e => upd('auftraggeber_email', e.target.value)} placeholder="email@firma.at" />
            <label style={lbl}>Kunde / Bauherr (für wen gebaut wird)</label>
            <input style={inp} value={form.kunde_name} onChange={e => upd('kunde_name', e.target.value)} placeholder="Name des Bauherrn" />
            <label style={lbl}>Sachverständiger</label>
            <input style={inp} value={form.sachverstaendiger} onChange={e => upd('sachverstaendiger', e.target.value)} placeholder="Name SV" />
          </div>
        )}

        {step === 3 && (
          <div className="fade-up">
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div>
                <label style={lbl}>Datum</label>
                <input style={inp} type="date" value={form.datum} onChange={e => upd('datum', e.target.value)} />
              </div>
              <div>
                <label style={lbl}>Uhrzeit</label>
                <input style={inp} type="time" value={form.uhrzeit} onChange={e => upd('uhrzeit', e.target.value)} />
              </div>
            </div>
            <label style={lbl}>Zusätzliche Bemerkungen</label>
            <textarea style={{ ...inp, resize:'vertical' }} rows={4} value={form.bemerkungen} onChange={e => upd('bemerkungen', e.target.value)} placeholder="Allgemeine Hinweise zur Begehung…" />
          </div>
        )}

        <div style={{ display:'flex', gap:10, marginTop:24 }}>
          {step > 1 && (
            <button style={btn('ghost', { flex:1 })} onClick={() => setStep(s => s-1)}>← Zurück</button>
          )}
          {step < 3 ? (
            <button style={btn('primary', { flex:2 })} onClick={() => setStep(s => s+1)}>Weiter →</button>
          ) : (
            <button style={btn('primary', { flex:2 })} onClick={handleCreate} disabled={saving}>
              {saving ? <span className="spinner" /> : '✓ Begehung anlegen'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Prüfpunkt Editor ────────────────────────────────────────
function PruefpunktModal({ begehungId, punkt, onSave, onClose }) {
  const [form, setForm] = useState({
    titel: punkt?.titel || '',
    rohtext: punkt?.rohtext || '',
    text_oeffentlich: punkt?.text_oeffentlich || '',
    text_intern: punkt?.text_intern || '',
    note: punkt?.note || 3,
    status: punkt?.status || 'In Ordnung',
    fotos: punkt?.fotos || [],
  })
  const [generating, setGenerating] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef()
  const camRef = useRef()

  async function handleFotos(files) {
    for (const file of Array.from(files)) {
      const reader = new FileReader()
      reader.onload = async (ev) => {
        const base64 = ev.target.result
        setForm(f => ({ ...f, fotos: [...f.fotos, { base64, url: null, analyse: null }] }))
        // KI Analyse
        setAnalyzing(true)
        try {
          const analyse = await analyzeImage(base64, file.type)
          setForm(f => {
            const fotos = [...f.fotos]
            const idx = fotos.findIndex(x => x.base64 === base64)
            if (idx >= 0) fotos[idx] = { ...fotos[idx], analyse }
            return { ...f, fotos }
          })
          toast.success('KI-Analyse abgeschlossen')
        } catch (e) {
          console.warn('KI Analyse fehlgeschlagen:', e)
        }
        setAnalyzing(false)
      }
      reader.readAsDataURL(file)
    }
  }

  async function generateTexts() {
    if (!form.rohtext.trim()) { toast.error('Bitte zuerst eine Rohnotiz eingeben'); return }
    setGenerating(true)
    try {
      const result = await generateDualText(form.rohtext)
      setForm(f => ({ ...f, text_oeffentlich: result.oeffentlich, text_intern: result.intern }))
      toast.success('KI-Texte generiert!')
    } catch (e) {
      toast.error('KI-Fehler: ' + e.message)
    }
    setGenerating(false)
  }

  async function handleSave() {
    if (!form.titel.trim()) { toast.error('Titel ist Pflichtfeld'); return }
    setSaving(true)

    // Fotos hochladen
    const uploadedFotos = []
    for (const foto of form.fotos) {
      if (foto.url) { uploadedFotos.push(foto); continue }
      const url = await uploadFoto(foto.base64, 'pruefpunkt')
      uploadedFotos.push({ ...foto, url, base64: null })
    }

    const payload = {
      begehung_id: begehungId,
      titel: form.titel,
      rohtext: form.rohtext,
      text_oeffentlich: form.text_oeffentlich,
      text_intern: form.text_intern,
      note: form.note,
      status: form.status,
      fotos: uploadedFotos.map(f => ({ url: f.url, analyse: f.analyse })),
    }

    let data, error
    if (punkt?.id) {
      ({ data, error } = await sb.from('pruefpunkte').update(payload).eq('id', punkt.id).select().single())
    } else {
      ({ data, error } = await sb.from('pruefpunkte').insert(payload).select().single())
    }

    if (error) { toast.error(error.message); setSaving(false); return }
    toast.success('Prüfpunkt gespeichert!')
    onSave(data)
    setSaving(false)
  }

  const noteCfg = NOTEN.find(x => x.n === form.note)

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.8)', zIndex:200, display:'flex', alignItems:'flex-end', padding:0 }} onClick={onClose}>
      <div style={{ background:G.card, borderRadius:'20px 20px 0 0', width:'100%', maxHeight:'92dvh', overflowY:'auto', padding:20 }} onClick={e => e.stopPropagation()}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <h2 style={{ fontSize:18, fontWeight:800 }}>{punkt ? 'Prüfpunkt bearbeiten' : 'Neuer Prüfpunkt'}</h2>
          <button onClick={onClose} style={{ background:'transparent', border:'none', color:G.muted, fontSize:24, cursor:'pointer' }}>×</button>
        </div>

        {/* Titel */}
        <label style={lbl}>Titel / Prüfbereich *</label>
        <input style={inp} value={form.titel} onChange={e => setForm(f => ({ ...f, titel: e.target.value }))} placeholder="z.B. Fensteranschluss Erdgeschoss" />

        {/* Note */}
        <label style={lbl}>Schulnote</label>
        <div style={{ display:'flex', gap:8, marginBottom:8 }}>
          {NOTEN.map(n => (
            <button key={n.n} onClick={() => setForm(f => ({ ...f, note: n.n }))} style={{ flex:1, padding:'10px 4px', borderRadius:10, border:`2px solid ${form.note===n.n ? n.color : G.border}`, background:form.note===n.n ? n.bg : 'transparent', color:form.note===n.n ? n.color : G.muted, fontWeight:800, fontSize:16, cursor:'pointer', transition:'all .15s' }}>
              {n.n}
            </button>
          ))}
        </div>
        <p style={{ fontSize:12, color:noteCfg?.color, marginBottom:12 }}>{noteCfg?.label}</p>

        {/* Status */}
        <label style={lbl}>Status</label>
        <select style={inp} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
          {STATUS_OPT.map(s => <option key={s}>{s}</option>)}
        </select>

        {/* Fotos */}
        <label style={lbl}>Fotos</label>
        <input ref={fileRef} type="file" accept="image/*" multiple style={{ display:'none' }} onChange={e => handleFotos(e.target.files)} />
        <input ref={camRef} type="file" accept="image/*" capture="environment" style={{ display:'none' }} onChange={e => handleFotos(e.target.files)} />
        <div style={{ display:'flex', gap:8, marginBottom:12 }}>
          <button style={btn('ghost', { flex:1, fontSize:13 })} onClick={() => camRef.current?.click()}>📷 Kamera</button>
          <button style={btn('ghost', { flex:1, fontSize:13 })} onClick={() => fileRef.current?.click()}>🖼️ Galerie</button>
        </div>

        {form.fotos.length > 0 && (
          <div style={{ display:'flex', gap:8, marginBottom:12, overflowX:'auto', paddingBottom:4 }}>
            {form.fotos.map((foto, i) => (
              <div key={i} style={{ position:'relative', flexShrink:0 }}>
                <img src={foto.url || foto.base64} alt="" style={{ width:90, height:90, borderRadius:10, objectFit:'cover', border:`1px solid ${G.border}` }} />
                {analyzing && !foto.analyse && (
                  <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.6)', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <span className="spinner" />
                  </div>
                )}
                {foto.analyse && (
                  <div style={{ position:'absolute', bottom:0, left:0, right:0, background:'rgba(0,0,0,0.8)', borderRadius:'0 0 10px 10px', padding:'4px 6px' }}>
                    <p style={{ fontSize:9, color:'#ddd', lineHeight:1.3 }}>{foto.analyse.slice(0,60)}…</p>
                  </div>
                )}
                <button onClick={() => setForm(f => ({ ...f, fotos: f.fotos.filter((_,j) => j!==i) }))}
                  style={{ position:'absolute', top:-6, right:-6, width:20, height:20, borderRadius:'50%', background:G.red, border:'none', color:'white', fontSize:12, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', fontWeight:700 }}>×</button>
              </div>
            ))}
          </div>
        )}

        {/* Rohtext & KI */}
        <label style={lbl}>Rohnotiz / Spracheingabe</label>
        <textarea style={{ ...inp, resize:'vertical' }} rows={3} value={form.rohtext} onChange={e => setForm(f => ({ ...f, rohtext: e.target.value }))} placeholder="Befund kurz beschreiben… z.B. 'Fensteranschluss außen unsauber, Dichtband sichtbar'" />

        <button style={{ ...btn('primary', { width:'100%', marginTop:8, marginBottom:16 }), opacity: generating ? 0.7 : 1 }} onClick={generateTexts} disabled={generating}>
          {generating ? <><span className="spinner" /> &nbsp;KI generiert…</> : '✨ KI-Texte generieren'}
        </button>

        {/* Öffentlicher Text */}
        {form.text_oeffentlich && (
          <>
            <label style={{ ...lbl, color:G.green }}>📄 Öffentliches Protokoll (für Auftraggeber)</label>
            <textarea style={{ ...inp, resize:'vertical', borderColor: G.green + '44' }} rows={4} value={form.text_oeffentlich} onChange={e => setForm(f => ({ ...f, text_oeffentlich: e.target.value }))} />
          </>
        )}

        {/* Interner Text */}
        {form.text_intern && (
          <>
            <label style={{ ...lbl, color:G.red }}>🔒 Internes Protokoll (nur intern)</label>
            <textarea style={{ ...inp, resize:'vertical', borderColor: G.red + '44' }} rows={4} value={form.text_intern} onChange={e => setForm(f => ({ ...f, text_intern: e.target.value }))} />
          </>
        )}

        <button style={btn('primary', { width:'100%', marginTop:20, padding:'13px', fontSize:15 })} onClick={handleSave} disabled={saving}>
          {saving ? <span className="spinner" /> : '✓ Speichern'}
        </button>
      </div>
    </div>
  )
}

// ─── Begehung Detail ─────────────────────────────────────────
function BegehungDetail({ begehung: initial, setPage, user }) {
  const [begehung, setBegehung] = useState(initial)
  const [punkte, setPunkte] = useState([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editPunkt, setEditPunkt] = useState(null)
  const [sending, setSending] = useState(false)
  const [viewMode, setViewMode] = useState('liste') // liste | oeffentlich | intern

  useEffect(() => { fetchPunkte() }, [begehung.id])

  async function fetchPunkte() {
    setLoading(true)
    const { data } = await sb.from('pruefpunkte').select('*').eq('begehung_id', begehung.id).order('created_at')
    setPunkte(data || [])
    setLoading(false)
  }

  async function handleSavePunkt(data) {
    setPunkte(prev => {
      const idx = prev.findIndex(p => p.id === data.id)
      if (idx >= 0) { const next = [...prev]; next[idx] = data; return next }
      return [...prev, data]
    })
    // Update Gesamtnote
    const allPunkte = punkte.some(p => p.id === data.id) ? punkte.map(p => p.id === data.id ? data : p) : [...punkte, data]
    const avg = allPunkte.length > 0 ? Math.round(allPunkte.reduce((s, p) => s + (p.note || 3), 0) / allPunkte.length) : null
    await sb.from('begehungen').update({ gesamtnote: avg, pruefpunkte_count: allPunkte.length }).eq('id', begehung.id)
    setBegehung(b => ({ ...b, gesamtnote: avg, pruefpunkte_count: allPunkte.length }))
    setShowModal(false)
    setEditPunkt(null)
  }

  async function deletePunkt(id) {
    if (!confirm('Prüfpunkt löschen?')) return
    await sb.from('pruefpunkte').delete().eq('id', id)
    setPunkte(prev => prev.filter(p => p.id !== id))
    toast.success('Gelöscht')
  }

  async function sendProtocol(type) {
    setSending(type)
    try {
      await fetch('/api/send-protocol', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ begehung, punkte, type }),
      })
      toast.success(type === 'oeffentlich' ? 'Öffentliches Protokoll versendet!' : 'Internes Protokoll versendet!')
    } catch (e) {
      toast.error('Versand fehlgeschlagen')
    }
    setSending(false)
  }

  async function finalize() {
    await sb.from('begehungen').update({ status: 'abgeschlossen' }).eq('id', begehung.id)
    setBegehung(b => ({ ...b, status: 'abgeschlossen' }))
    toast.success('Begehung abgeschlossen!')
  }

  const noteCfg = NOTEN.find(x => x.n === begehung.gesamtnote)

  return (
    <div style={{ paddingBottom: 100 }}>
      {/* Header */}
      <div style={{ background:`linear-gradient(135deg, #1a1d27, #0f1117)`, padding:'16px 20px 0', borderBottom:`1px solid ${G.border}` }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
          <button onClick={() => setPage('begehungen')} style={{ background:'transparent', border:'none', color:G.muted, fontSize:20, cursor:'pointer' }}>←</button>
          <div style={{ flex:1 }}>
            <p style={{ fontSize:11, color:G.muted, marginBottom:2 }}>{begehung.gewerk} · {formatDate(begehung.datum)}</p>
            <h1 style={{ fontSize:17, fontWeight:800, lineHeight:1.3 }}>{begehung.titel}</h1>
          </div>
          {begehung.gesamtnote && <NoteCircle n={begehung.gesamtnote} size={40} />}
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', gap:0, overflowX:'auto' }}>
          {[['liste','Prüfpunkte'],['oeffentlich','📄 Öffentlich'],['intern','🔒 Intern']].map(([id, label]) => (
            <button key={id} onClick={() => setViewMode(id)} style={{ padding:'10px 16px', border:'none', background:'transparent', color: viewMode===id ? G.accent : G.muted, fontWeight: viewMode===id ? 700 : 400, fontSize:13, cursor:'pointer', borderBottom:`2px solid ${viewMode===id ? G.accent : 'transparent'}`, whiteSpace:'nowrap', flexShrink:0 }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding:20 }}>
        {/* Metadaten */}
        <div style={{ ...card({ marginBottom:16, padding:14 }) }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            {[
              ['Auftraggeber', begehung.auftraggeber_name],
              ['Bauherr', begehung.kunde_name || '–'],
              ['Sachverständiger', begehung.sachverstaendiger],
              ['Adresse', begehung.adresse],
            ].map(([k,v]) => (
              <div key={k}>
                <p style={{ fontSize:10, color:G.muted, fontWeight:700, textTransform:'uppercase', marginBottom:2 }}>{k}</p>
                <p style={{ fontSize:13, color:G.text }}>{v}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Prüfpunkte Liste */}
        {viewMode === 'liste' && (
          <>
            <button style={{ ...btn('primary', { width:'100%', marginBottom:16 }) }} onClick={() => { setEditPunkt(null); setShowModal(true) }}>
              + Prüfpunkt hinzufügen
            </button>

            {loading ? <div style={{ textAlign:'center', padding:40, color:G.muted }}>Lädt…</div>
            : punkte.length === 0 ? (
              <div style={{ textAlign:'center', padding:40 }}>
                <p style={{ fontSize:32, marginBottom:8 }}>📋</p>
                <p style={{ color:G.muted, fontSize:13 }}>Noch keine Prüfpunkte. Füge den ersten hinzu.</p>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {punkte.map(p => (
                  <div key={p.id} style={card()}>
                    <div style={{ display:'flex', gap:12, alignItems:'flex-start', marginBottom:10 }}>
                      <NoteCircle n={p.note} size={36} />
                      <div style={{ flex:1 }}>
                        <p style={{ fontWeight:700, fontSize:14, marginBottom:3 }}>{p.titel}</p>
                        <span style={{ fontSize:11, padding:'2px 8px', borderRadius:6, background:`${NOTEN.find(n=>n.n===p.note)?.bg}`, color:NOTEN.find(n=>n.n===p.note)?.color, fontWeight:600 }}>{p.status}</span>
                      </div>
                      <div style={{ display:'flex', gap:6 }}>
                        <button onClick={() => { setEditPunkt(p); setShowModal(true) }} style={{ background:'transparent', border:`1px solid ${G.border}`, borderRadius:8, padding:'6px 10px', color:G.muted, fontSize:13, cursor:'pointer' }}>✏️</button>
                        <button onClick={() => deletePunkt(p.id)} style={{ background:'transparent', border:`1px solid ${G.border}`, borderRadius:8, padding:'6px 10px', color:G.red, fontSize:13, cursor:'pointer' }}>🗑</button>
                      </div>
                    </div>
                    {p.fotos?.length > 0 && (
                      <div style={{ display:'flex', gap:6, marginBottom:8, overflowX:'auto' }}>
                        {p.fotos.slice(0,4).map((f, i) => (
                          <img key={i} src={f.url} alt="" style={{ width:70, height:70, borderRadius:8, objectFit:'cover', flexShrink:0 }} />
                        ))}
                      </div>
                    )}
                    {p.text_oeffentlich && <p style={{ fontSize:12, color:G.muted, lineHeight:1.5 }}>{p.text_oeffentlich.slice(0,120)}…</p>}
                  </div>
                ))}
              </div>
            )}

            {/* Aktionen */}
            {punkte.length > 0 && (
              <div style={{ marginTop:20, display:'flex', flexDirection:'column', gap:10 }}>
                <button style={btn('ghost', { width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:8 })} onClick={() => sendProtocol('oeffentlich')} disabled={!!sending}>
                  {sending === 'oeffentlich' ? <span className="spinner" /> : '📧'} Öffentliches Protokoll senden
                </button>
                <button style={{ ...btn('ghost', { width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }), borderColor: G.red + '44', color: G.red }} onClick={() => sendProtocol('intern')} disabled={!!sending}>
                  {sending === 'intern' ? <span className="spinner" /> : '🔒'} Internes Protokoll senden
                </button>
                {begehung.status !== 'abgeschlossen' && (
                  <button style={btn('primary', { width:'100%' })} onClick={finalize}>✓ Begehung abschließen</button>
                )}
              </div>
            )}
          </>
        )}

        {/* Öffentliches Protokoll */}
        {viewMode === 'oeffentlich' && (
          <div>
            <div style={{ ...card({ marginBottom:16, background:'rgba(16,185,129,0.05)', borderColor: G.green + '33' }) }}>
              <p style={{ fontSize:12, color:G.green, fontWeight:700, marginBottom:4 }}>📄 Öffentliches Protokoll</p>
              <p style={{ fontSize:11, color:G.muted }}>Für den Auftraggeber · Positiv formuliert · Lösungsorientiert</p>
            </div>
            {punkte.map((p, i) => (
              <div key={p.id} style={{ ...card({ marginBottom:12 }) }}>
                <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:10 }}>
                  <NoteCircle n={p.note} size={32} />
                  <div>
                    <p style={{ fontWeight:700, fontSize:14 }}>{i+1}. {p.titel}</p>
                    <p style={{ fontSize:11, color:G.muted }}>{p.status}</p>
                  </div>
                </div>
                {p.fotos?.slice(0,2).map((f, j) => (
                  <img key={j} src={f.url} alt="" style={{ width:'100%', borderRadius:10, marginBottom:8, maxHeight:200, objectFit:'cover' }} />
                ))}
                <p style={{ fontSize:13, color:G.text, lineHeight:1.7 }}>{p.text_oeffentlich || p.rohtext || '–'}</p>
              </div>
            ))}
          </div>
        )}

        {/* Internes Protokoll */}
        {viewMode === 'intern' && (
          <div>
            <div style={{ ...card({ marginBottom:16, background:'rgba(239,68,68,0.05)', borderColor: G.red + '33' }) }}>
              <p style={{ fontSize:12, color:G.red, fontWeight:700, marginBottom:4 }}>🔒 Internes Protokoll</p>
              <p style={{ fontSize:11, color:G.muted }}>Nur intern · Technisch präzise · Vollständig</p>
            </div>
            {punkte.map((p, i) => (
              <div key={p.id} style={{ ...card({ marginBottom:12, borderColor: p.note >= 4 ? G.red + '44' : G.border }) }}>
                <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:10 }}>
                  <NoteCircle n={p.note} size={32} />
                  <div>
                    <p style={{ fontWeight:700, fontSize:14 }}>{i+1}. {p.titel}</p>
                    <p style={{ fontSize:11, color: p.note >= 4 ? G.red : G.muted }}>{p.status}</p>
                  </div>
                </div>
                {p.fotos?.map((f, j) => (
                  <img key={j} src={f.url} alt="" style={{ width:'100%', borderRadius:10, marginBottom:8, maxHeight:200, objectFit:'cover' }} />
                ))}
                {p.rohtext && <p style={{ fontSize:11, color:G.muted, fontStyle:'italic', marginBottom:6 }}>Rohnotiz: {p.rohtext}</p>}
                <p style={{ fontSize:13, color:G.text, lineHeight:1.7 }}>{p.text_intern || p.rohtext || '–'}</p>
                {p.fotos?.[0]?.analyse && (
                  <div style={{ marginTop:8, padding:'8px 12px', background:'rgba(245,158,11,0.08)', borderRadius:8, borderLeft:`3px solid ${G.accent}` }}>
                    <p style={{ fontSize:10, color:G.accent, fontWeight:700, marginBottom:2 }}>KI-Bildanalyse</p>
                    <p style={{ fontSize:11, color:G.muted }}>{p.fotos[0].analyse}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <PruefpunktModal
          begehungId={begehung.id}
          punkt={editPunkt}
          onSave={handleSavePunkt}
          onClose={() => { setShowModal(false); setEditPunkt(null) }}
        />
      )}
    </div>
  )
}

// ─── Projekte ────────────────────────────────────────────────
function Projekte({ setPage }) {
  const [projekte, setProjekte] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ name:'', adresse:'', auftraggeber:'' })

  useEffect(() => { fetchProjekte() }, [])

  async function fetchProjekte() {
    setLoading(true)
    const { data } = await sb.from('projekte').select('*, begehungen(count)').order('created_at', { ascending:false })
    setProjekte(data || [])
    setLoading(false)
  }

  async function handleCreate() {
    if (!form.name.trim()) return
    const { data, error } = await sb.from('projekte').insert(form).select().single()
    if (error) { toast.error(error.message); return }
    setProjekte(p => [{ ...data, begehungen:[{count:0}] }, ...p])
    setShowNew(false)
    setForm({ name:'', adresse:'', auftraggeber:'' })
    toast.success('Projekt angelegt!')
  }

  return (
    <div style={{ padding:20, paddingBottom:100 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <h1 style={{ fontSize:22, fontWeight:800 }}>Projekte</h1>
        <button style={btn('primary', { padding:'8px 16px', fontSize:13 })} onClick={() => setShowNew(true)}>+ Neu</button>
      </div>

      {showNew && (
        <div style={{ ...card({ marginBottom:16 }) }}>
          <label style={lbl}>Projektname *</label>
          <input style={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name:e.target.value }))} placeholder="Bauvorhaben EFH Graz" autoFocus />
          <label style={lbl}>Adresse</label>
          <input style={inp} value={form.adresse} onChange={e => setForm(f => ({ ...f, adresse:e.target.value }))} placeholder="Musterstraße 1, 8010 Graz" />
          <label style={lbl}>Auftraggeber</label>
          <input style={inp} value={form.auftraggeber} onChange={e => setForm(f => ({ ...f, auftraggeber:e.target.value }))} placeholder="Name / Firma" />
          <div style={{ display:'flex', gap:8, marginTop:16 }}>
            <button style={btn('ghost', { flex:1 })} onClick={() => setShowNew(false)}>Abbrechen</button>
            <button style={btn('primary', { flex:2 })} onClick={handleCreate}>✓ Anlegen</button>
          </div>
        </div>
      )}

      {loading ? <div style={{ textAlign:'center', padding:60, color:G.muted }}>Lädt…</div>
      : projekte.length === 0 ? (
        <div style={{ textAlign:'center', padding:60 }}>
          <p style={{ fontSize:40, marginBottom:12 }}>🏗</p>
          <p style={{ color:G.muted }}>Noch keine Projekte</p>
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {projekte.map(p => (
            <div key={p.id} style={card()}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                <div>
                  <p style={{ fontWeight:700, fontSize:15, marginBottom:3 }}>{p.name}</p>
                  {p.adresse && <p style={{ fontSize:12, color:G.muted }}>{p.adresse}</p>}
                </div>
                <span style={{ fontSize:11, background:'rgba(245,158,11,0.1)', color:G.accent, borderRadius:8, padding:'3px 8px', fontWeight:600 }}>
                  {p.begehungen?.[0]?.count || 0} Begehungen
                </span>
              </div>
              {p.auftraggeber && <p style={{ fontSize:12, color:G.muted }}>AG: {p.auftraggeber}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Admin Panel ─────────────────────────────────────────────
function AdminPanel() {
  const [stats, setStats] = useState({ begehungen:0, user:0, maengel:0 })
  const [begehungen, setBegehungen] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      const [bRes, uRes] = await Promise.all([
        sb.from('begehungen').select('*, pruefpunkte(note)').order('created_at', { ascending:false }).limit(20),
        sb.from('profiles').select('count', { count:'exact', head:true }),
      ])
      const allBegehungen = bRes.data || []
      const maengel = allBegehungen.reduce((s, b) => s + (b.pruefpunkte || []).filter(p => p.note >= 4).length, 0)
      setBegehungen(allBegehungen)
      setStats({ begehungen: allBegehungen.length, user: uRes.count || 0, maengel })
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div style={{ padding:60, textAlign:'center', color:G.muted }}>Lädt…</div>

  return (
    <div style={{ padding:20, paddingBottom:100 }}>
      <h1 style={{ fontSize:22, fontWeight:800, marginBottom:20 }}>⚙️ Admin</h1>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:20 }}>
        {[
          { label:'Begehungen', value:stats.begehungen, color:G.blue },
          { label:'Nutzer', value:stats.user, color:G.green },
          { label:'Mängel', value:stats.maengel, color:G.red },
        ].map(s => (
          <div key={s.label} style={{ ...card({ padding:14, textAlign:'center' }) }}>
            <p style={{ fontSize:22, fontWeight:800, color:s.color }}>{s.value}</p>
            <p style={{ fontSize:10, color:G.muted, fontWeight:600, textTransform:'uppercase' }}>{s.label}</p>
          </div>
        ))}
      </div>

      <div style={card()}>
        <p style={{ fontWeight:700, marginBottom:14 }}>Alle Begehungen</p>
        {begehungen.map(b => (
          <div key={b.id} style={{ display:'flex', gap:12, alignItems:'center', paddingBottom:10, borderBottom:`1px solid ${G.border}`, marginBottom:10 }}>
            <NoteCircle n={b.gesamtnote} size={32} />
            <div style={{ flex:1 }}>
              <p style={{ fontSize:13, fontWeight:600 }}>{b.titel}</p>
              <p style={{ fontSize:11, color:G.muted }}>{b.auftraggeber_name} · {formatDate(b.datum)}</p>
            </div>
            <span style={{ fontSize:11, padding:'3px 8px', borderRadius:6, background: b.status === 'abgeschlossen' ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)', color: b.status === 'abgeschlossen' ? G.green : G.accent, fontWeight:600 }}>
              {b.status === 'abgeschlossen' ? 'Abgeschlossen' : 'Offen'}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main App ────────────────────────────────────────────────
function App() {
  const [user, setUser]               = useState(null)
  const [profile, setProfile]         = useState(null)
  const [loading, setLoading]         = useState(true)
  const [page, setPage]               = useState('dashboard')
  const [begehungen, setBegehungen]   = useState([])
  const [selectedBegehung, setSelectedBegehung] = useState(null)
  const [stats, setStats]             = useState({})

  useEffect(() => {
    sb.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user || null)
      if (session?.user) loadData(session.user)
      setLoading(false)
    })
    const { data: { subscription } } = sb.auth.onAuthStateChange((_, session) => {
      setUser(session?.user || null)
      if (session?.user) loadData(session.user)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function loadData(u) {
    const [bRes, prjRes, fotoRes] = await Promise.all([
      sb.from('begehungen').select('*').eq('user_id', u.id).order('created_at', { ascending:false }),
      sb.from('projekte').select('count', { count:'exact', head:true }),
      sb.from('pruefpunkte').select('id, note, fotos').eq('begehung_id', sb.from('begehungen').select('id').eq('user_id', u.id)),
    ])
    const bList = bRes.data || []
    setBegehungen(bList)

    const allPunkte = []
    if (bList.length > 0) {
      const { data: punkte } = await sb.from('pruefpunkte').select('id, note, fotos, begehung_id').in('begehung_id', bList.map(b => b.id))
      allPunkte.push(...(punkte || []))
    }

    const fotos = allPunkte.reduce((s, p) => s + (p.fotos?.length || 0), 0)
    const maengel = allPunkte.filter(p => p.note >= 4).length

    setStats({
      begehungen: bList.length,
      projekte: prjRes.count || 0,
      fotos,
      maengel,
      letzte: bList.slice(0, 3),
    })
  }

  const isAdmin = user?.user_metadata?.role === 'admin' || user?.user_metadata?.role === 'superadmin'

  if (loading) return (
    <div style={{ height:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', background:G.bg }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontSize:40, marginBottom:12 }}>🏗</div>
        <span className="spinner" style={{ width:30, height:30 }} />
      </div>
    </div>
  )

  if (!user) return <LoginScreen onLogin={u => { setUser(u); loadData(u) }} />

  function handleBegehungCreated(b) {
    setBegehungen(prev => [b, ...prev])
    setSelectedBegehung(b)
  }

  function renderPage() {
    switch (page) {
      case 'dashboard':      return <Dashboard user={user} profile={profile} setPage={setPage} stats={stats} />
      case 'begehungen':     return <BegehungenListe setPage={setPage} setSelectedBegehung={setSelectedBegehung} begehungen={begehungen} loading={false} />
      case 'neueBegehung':   return <NeueBegehung user={user} setPage={setPage} onCreated={handleBegehungCreated} />
      case 'begehungDetail': return selectedBegehung ? <BegehungDetail begehung={selectedBegehung} setPage={setPage} user={user} /> : null
      case 'projekte':       return <Projekte setPage={setPage} />
      case 'admin':          return <AdminPanel />
      default:               return <Dashboard user={user} profile={profile} setPage={setPage} stats={stats} />
    }
  }

  return (
    <div style={{ background:G.bg, minHeight:'100dvh', color:G.text }}>
      <style>{css}</style>
      {renderPage()}
      {page !== 'neueBegehung' && page !== 'begehungDetail' && (
        <BottomNav page={page} setPage={setPage} isAdmin={isAdmin} />
      )}
    </div>
  )
}

// ─── Mount ───────────────────────────────────────────────────
createRoot(document.getElementById('root')).render(
  <>
    <App />
    <Toaster position="top-center" toastOptions={{ style: { background:'#1a1d27', color:'#f0f0f0', border:'1px solid #2a2d3a', fontSize:13 } }} />
  </>
)
