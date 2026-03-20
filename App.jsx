import { createClient } from '@supabase/supabase-js'

import { useState, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster, toast } from 'react-hot-toast'

// ─── Supabase ────────────────────────────────────────────────
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY
const sb = createClient(SUPABASE_URL, SUPABASE_ANON)

const GEWERKE = ['Rohbau','Ausbau / Fertigstellung']
const NOTEN = [
  { n:1, label:'Besser als gefordert', color:'#16a34a', bg:'#dcfce7' },
  { n:2, label:'Alle Forderungen erfüllt', color:'#2563eb', bg:'#dbeafe' },
  { n:3, label:'Durchschnittlich', color:'#d97706', bg:'#fef3c7' },
  { n:4, label:'Verbesserungsbedarf', color:'#f97316', bg:'#fff7ed' },
  { n:5, label:'Fehlerhaft', color:'#dc2626', bg:'#fef2f2' },
]
const STATUS_OPT = ['In Ordnung','Beobachtung','Verbesserung empfohlen','Mangel']

const BEGEHUNG_STATUS = {
  erstellt:      { label:'Erstellt',     color:'#2563eb', bg:'#dbeafe' },
  versendet:     { label:'Versendet',    color:'#d97706', bg:'#fef3c7' },
  abgeschlossen: { label:'Abgeschlossen',color:'#16a34a', bg:'#dcfce7' },
}

function StatusBadge({ status }) {
  const cfg = BEGEHUNG_STATUS[status] || BEGEHUNG_STATUS['erstellt']
  return (
    <span style={{ fontSize:11, fontWeight:700, background:cfg.bg, color:cfg.color, borderRadius:6, padding:'3px 9px', flexShrink:0 }}>
      {cfg.label}
    </span>
  )
}

// ─── CSS-in-JS ───────────────────────────────────────────────
const G = {
  bg: '#f5f5f5', card: '#ffffff', border: '#e5e7eb',
  text: '#111111', muted: '#6b7280', accent: '#cc1f1f',
  accentLight: '#fef2f2', accentBorder: '#fca5a5',
  green: '#16a34a', greenLight: '#dcfce7',
  red: '#dc2626', redLight: '#fef2f2',
  orange: '#f97316', orangeLight: '#fff7ed',
  blue: '#2563eb',
}

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  * { font-family: 'Inter', sans-serif; }
  input,select,textarea { color: ${G.text}; background: ${G.card}; border: 1.5px solid ${G.border}; border-radius: 8px; padding: 10px 13px; font-size: 14px; outline: none; width: 100%; transition: border-color .15s; }
  input:focus,select:focus,textarea:focus { border-color: ${G.accent}; }
  input::placeholder,textarea::placeholder { color: ${G.muted}; }
  select option { background: #ffffff; color: #1a1a1a; }
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
  padding: '12px 20px', borderRadius: 10, border: 'none', fontWeight: 700, fontSize: 14,
  background: variant === 'primary' ? G.accent : variant === 'danger' ? G.red : variant === 'ghost' ? 'transparent' : G.card,
  color: variant === 'primary' ? '#fff' : variant === 'ghost' ? G.muted : G.text,
  border: variant === 'ghost' ? `0.5px solid ${G.border}` : 'none',
  cursor: 'pointer', transition: 'opacity .15s', width: '100%',
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

// ─── PDF Generierung ─────────────────────────────────────────
async function imgToBase64(url, maxW=800, quality=0.6) {
  try {
    return await new Promise((resolve) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let w = img.width, h = img.height
        if (w > maxW) { h = Math.round(h * maxW / w); w = maxW }
        canvas.width = w; canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, w, h)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.onerror = () => resolve(null)
      img.src = url
    })
  } catch { return null }
}

async function loadJsPDF() {
  if (window.jspdf?.jsPDF) return window.jspdf.jsPDF
  await new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
    s.onload = resolve
    s.onerror = reject
    document.head.appendChild(s)
  })
  return window.jspdf.jsPDF
}

// ─── Usage Tracking ─────────────────────────────────────────
async function trackUsage(companyId, userId, eventType, meta = {}) {
  if (!companyId) return
  try {
    await sb.from('usage_events').insert({
      company_id: companyId,
      user_id: userId,
      event_type: eventType,
      meta,
    })
  } catch(e) { /* silent fail */ }
}

async function generateProtokollPDF({ type, begehung, punkte, getEditedText, stempelUrl, stempelSizeMm, creatorName }) {
  const JsPDF = await loadJsPDF()
  const doc = new JsPDF({ unit: 'mm', format: 'a4' })
  const pW = 210, pH = 297, ml = 18, mr = 18, cW = pW - ml - mr
  let y = 0
  const isOeff = type === 'oeffentlich'
  const red = [204, 31, 31]
  const darkRed = [127, 29, 29]
  const white = [255, 255, 255]
  const dark = [17, 17, 17]
  const muted = [107, 114, 128]
  const lightGray = [249, 250, 251]
  const borderGray = [229, 231, 235]

  function addPage() {
    doc.addPage()
    y = 15
    doc.setFillColor(...[249,250,251])
    doc.rect(0, 0, pW, pH, 'F')
  }

  function checkY(needed) {
    if (y + needed > pH - 20) { addPage() }
  }

  function noteColor(n) {
    if (n === 1) return [22, 163, 74]
    if (n === 2) return [37, 99, 235]
    if (n === 3) return [217, 119, 6]
    if (n === 4) return [249, 115, 22]
    return [220, 38, 38]
  }

  function noteBg(n) {
    if (n === 1) return [220, 252, 231]
    if (n === 2) return [219, 234, 254]
    if (n === 3) return [254, 243, 199]
    if (n === 4) return [255, 247, 237]
    return [254, 242, 242]
  }

  function noteLabel(n) {
    return ['','Besser als gefordert','Alle Forderungen erfüllt','Durchschnittlich','Verbesserungsbedarf','Fehlerhaft'][n] || ''
  }

  function fmtDate(d) {
    if (!d) return '–'
    return new Date(d).toLocaleDateString('de-AT', { day:'2-digit', month:'2-digit', year:'numeric' })
  }

  // ── Header ──
  doc.setFillColor(...(isOeff ? red : darkRed))
  doc.rect(0, 0, pW, 46, 'F')

  // Logo text
  doc.setTextColor(...white)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('BAUHERRENHILFE · ' + (isOeff ? 'BAUSTELLENPRÜFPROTOKOLL' : 'INTERNES PROTOKOLL'), ml, 10)

  // Title
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  const titleLines = doc.splitTextToSize(begehung.titel || '–', cW - 25)
  doc.text(titleLines, ml, 20)

  // Date + address
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(255, 200, 200)
  doc.text((begehung.adresse || '') + (begehung.datum ? '  ·  ' + fmtDate(begehung.datum) : ''), ml, 33)

  // Gesamtnote circle
  if (begehung.gesamtnote) {
    const nc = noteColor(begehung.gesamtnote)
    doc.setFillColor(255,255,255)
    doc.circle(pW - mr - 10, 23, 10, 'F')
    doc.setTextColor(...nc)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text(String(begehung.gesamtnote), pW - mr - 10, 25, { align: 'center' })
    doc.setFontSize(7)
    doc.setTextColor(...nc)
    doc.text('NOTE', pW - mr - 10, 30, { align: 'center' })
  }

  y = 52

  // ── Beteiligte ──
  doc.setFillColor(...lightGray)
  doc.rect(0, 46, pW, 22, 'F')
  doc.setDrawColor(...borderGray)
  doc.setLineWidth(0.3)
  doc.line(0, 68, pW, 68)

  const cols = [
    ['Auftraggeber', begehung.auftraggeber_firma || begehung.auftraggeber_name || '–'],
    ['Bauherr', begehung.kunde_name || '–'],
    ['Sachverständiger', begehung.sachverstaendiger || '–'],
  ]
  cols.forEach((c, i) => {
    const x = ml + i * (cW / 3)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...muted)
    doc.text(c[0].toUpperCase(), x, 53)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...dark)
    doc.text(doc.splitTextToSize(c[1], cW/3 - 4)[0], x, 59)
  })

  y = 76

  // ── Sektion 1: Auftrag & Grundlagen ──
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...red)
  doc.text('1. AUFTRAG & GRUNDLAGEN', ml, y)
  y += 6

  doc.setDrawColor(...red)
  doc.setLineWidth(0.4)
  doc.line(ml, y, ml + cW, y)
  y += 5

  const grundlagenText = 'Die Baustellenprüfung wurde im Auftrag des Auftraggebers ' +
    (begehung.auftraggeber_firma || begehung.auftraggeber_name || '–') +
    ' durchgeführt. Gegenstand der Prüfung ist die Prüfung der Verarbeitung des Qualitätsbetriebes. Die Begehung erfolgte am ' +
    fmtDate(begehung.datum) + ' durch den Sachverständigen ' +
    (begehung.sachverstaendiger || '–') + '.'

  doc.setFontSize(9.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...dark)
  const grundLines = doc.splitTextToSize(grundlagenText, cW)
  doc.text(grundLines, ml, y)
  y += grundLines.length * 5 + 8

  // ── Sektion 2: Befund ──
  checkY(20)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...red)
  doc.text('2. BEFUND DER PRÜFPUNKTE', ml, y)
  y += 6
  doc.setDrawColor(...red)
  doc.setLineWidth(0.4)
  doc.line(ml, y, ml + cW, y)
  y += 7

  for (let i = 0; i < punkte.length; i++) {
    const p = punkte[i]
    const text = getEditedText(p, isOeff ? 'oeffentlich' : 'intern')
    const nc = noteColor(p.note)
    const nb = noteBg(p.note)

    checkY(35)

    // Note circle
    doc.setFillColor(...nb)
    doc.circle(ml + 5, y + 4, 5, 'F')
    doc.setDrawColor(...nc)
    doc.setLineWidth(0.5)
    doc.circle(ml + 5, y + 4, 5, 'S')
    doc.setTextColor(...nc)
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text(String(p.note), ml + 5, y + 5.5, { align: 'center' })

    // Title
    doc.setTextColor(...dark)
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.text((i+1) + '. ' + (p.titel || ''), ml + 13, y + 4)

    // Status badge
    doc.setFillColor(...nb)
    doc.roundedRect(ml + 13, y + 7, 45, 5, 1, 1, 'F')
    doc.setFontSize(7)
    doc.setTextColor(...nc)
    doc.text(p.status || noteLabel(p.note), ml + 15, y + 10.5)

    y += 18

    // Photos
    const fotos = isOeff ? (p.fotos?.filter(f=>f.url).slice(0,2) || []) : (p.fotos?.filter(f=>f.url) || [])
    for (const foto of fotos) {
      if (!foto.url) continue
      const b64 = await imgToBase64(foto.url)
      if (b64) {
        try {
          // Get natural dimensions to preserve aspect ratio
          const imgEl = await new Promise(res => {
            const i = new Image()
            i.onload = () => res(i)
            i.onerror = () => res(null)
            i.src = b64
          })
          if (!imgEl) continue
          const aspect = imgEl.naturalHeight / imgEl.naturalWidth
          const imgW = cW
          const imgH = Math.min(imgW * aspect, 100) // max 100mm height
          checkY(imgH + 6)
          doc.addImage(b64, 'JPEG', ml, y, imgW, imgH)
          y += imgH + 5
        } catch(e) { /* skip broken image */ }
      }
    }

    // Text
    if (text) {
      checkY(20)
      const textLines = doc.splitTextToSize(text, cW)
      doc.setFontSize(9.5)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...dark)
      doc.text(textLines, ml, y)
      y += textLines.length * 5
    }

    // Rohnotiz (intern only)
    if (!isOeff && p.rohtext) {
      checkY(10)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'italic')
      doc.setTextColor(...muted)
      const rLines = doc.splitTextToSize('Rohnotiz: ' + p.rohtext, cW)
      doc.text(rLines, ml, y)
      y += rLines.length * 4.5
    }

    // Divider
    y += 4
    doc.setDrawColor(...borderGray)
    doc.setLineWidth(0.2)
    doc.line(ml, y, ml + cW, y)
    y += 6
  }

  // ── Sektion 3: Zusammenfassung ──
  checkY(30)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...red)
  doc.text('3. ZUSAMMENFASSUNG & EMPFEHLUNG', ml, y)
  y += 6
  doc.setDrawColor(...red)
  doc.setLineWidth(0.4)
  doc.line(ml, y, ml + cW, y)
  y += 6

  const maengel = punkte.filter(p => p.note >= 4).length
  const gut = punkte.filter(p => p.note <= 2).length
  let summaryText = 'Die Begehung ergab insgesamt eine Gesamtnote von ' + (begehung.gesamtnote || '–') + ' bei ' + punkte.length + ' geprüften Punkten.'
  if (maengel > 0) summaryText += ' Es wurden ' + maengel + ' Prüfpunkt' + (maengel > 1 ? 'e' : '') + ' mit Verbesserungsbedarf oder Mängeln festgestellt. Eine Nachkontrolle der bemängelten Punkte wird empfohlen.'
  else summaryText += ' Alle Prüfpunkte wurden zufriedenstellend bewertet. Es besteht kein unmittelbarer Nachbesserungsbedarf.'

  doc.setFontSize(9.5)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...dark)
  const sumLines = doc.splitTextToSize(summaryText, cW)
  doc.text(sumLines, ml, y)
  y += sumLines.length * 5 + 10

  // ── Sektion 4: Abschluss & Signatur ──
  checkY(50)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...red)
  doc.text('4. ABSCHLUSS & SIGNATUR', ml, y)
  y += 6
  doc.setDrawColor(...red)
  doc.setLineWidth(0.4)
  doc.line(ml, y, ml + cW, y)
  y += 8

  // Left: date + name
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...muted)
  doc.text('Erstellt am', ml, y)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...dark)
  doc.text(fmtDate(new Date().toISOString()), ml, y + 5)

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...muted)
  doc.text('Erstellt von', ml, y + 12)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...dark)
  doc.text(creatorName || begehung.sachverstaendiger || '–', ml, y + 17)

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...muted)
  doc.text('Bauherrenhilfe · bauherrenhilfe.at', ml, y + 23)

  // Right: Stempel
  const stampX = ml + cW / 2
  const stampW = cW / 2 - 4
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...muted)
  doc.text('Stempel & Unterschrift', stampX, y)

  if (stempelUrl) {
    try {
      const stempelB64 = await imgToBase64(stempelUrl, 400, 0.9)
      if (stempelB64) {
        const sizeMm = stempelSizeMm || 50
        // Keep aspect ratio
        const sImg = new Image()
        await new Promise(res => { sImg.onload = res; sImg.onerror = res; sImg.src = stempelB64 })
        const aspect = sImg.naturalHeight / (sImg.naturalWidth || 1)
        const sW = sizeMm
        const sH = Math.min(sW * aspect, 35)
        doc.addImage(stempelB64, 'PNG', stampX, y + 3, sW, sH)
      }
    } catch(e) {
      doc.setDrawColor(...borderGray)
      doc.setLineWidth(0.3)
      doc.setLineDashPattern([1, 1], 0)
      doc.rect(stampX, y + 3, stampW, 25, 'S')
      doc.setLineDashPattern([], 0)
    }
  } else {
    doc.setDrawColor(...borderGray)
    doc.setLineWidth(0.3)
    doc.setLineDashPattern([1, 1], 0)
    doc.rect(stampX, y + 3, stampW, 25, 'S')
    doc.setLineDashPattern([], 0)
  }

  y += 32

  // ── Footer auf jeder Seite ──
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFillColor(...lightGray)
    doc.rect(0, pH - 12, pW, 12, 'F')
    doc.setDrawColor(...borderGray)
    doc.setLineWidth(0.2)
    doc.line(0, pH - 12, pW, pH - 12)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...muted)
    doc.text(isOeff ? 'Bauherrenhilfe · bauherrenhilfe.at' : 'VERTRAULICH · Bauherrenhilfe · bauherrenhilfe.at', ml, pH - 5)
    doc.text('Seite ' + i + ' / ' + pageCount, pW - mr, pH - 5, { align: 'right' })
  }

  return doc
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

function InfoCard({ label, value, half=true }) {
  return (
    <div style={{ background:'#f9fafb', border:`0.5px solid ${G.border}`, borderRadius:10, padding:'10px 12px', ...(half ? {} : {}) }}>
      <p style={{ fontSize:10, fontWeight:700, color:G.muted, textTransform:'uppercase', letterSpacing:'.5px', margin:'0 0 3px' }}>{label}</p>
      <p style={{ fontSize:13, fontWeight:600, color:G.text, margin:0 }}>{value || '–'}</p>
    </div>
  )
}

function RedHeader({ title, subtitle, onBack, right }) {
  return (
    <div style={{ background: G.accent, padding:'14px 16px', display:'flex', alignItems:'center', gap:10 }}>
      {onBack && <button onClick={onBack} style={{ background:'rgba(255,255,255,0.2)', border:'none', color:'#fff', borderRadius:8, width:32, height:32, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0, cursor:'pointer' }}>←</button>}
      <div style={{ flex:1 }}>
        {subtitle && <p style={{ color:'rgba(255,255,255,0.7)', fontSize:11, margin:'0 0 2px' }}>{subtitle}</p>}
        <p style={{ color:'#fff', fontSize:15, fontWeight:700, margin:0 }}>{title}</p>
      </div>
      {right}
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
  if (!base64 || typeof base64 !== 'string') return ''
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
async function uploadFoto(base64, name, companyId, begehungId) {
  if (!base64 || typeof base64 !== 'string') return null
  const match = base64.match(/^data:([A-Za-z-+/]+);base64,(.+)$/)
  if (!match) return null
  const mimeType = match[1]
  const buffer = Uint8Array.from(atob(match[2]), c => c.charCodeAt(0))
  const ext = mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'jpg'
  // Neue saubere Struktur: company/begehungen/begehung-id/timestamp-name.ext
  // Fallback für alte Uploads ohne company/begehung ID
  const folder = companyId && begehungId
    ? `${companyId}/begehungen/${begehungId}`
    : 'allgemein'
  const path = `${folder}/${Date.now()}-${name || 'foto'}.${ext}`
  const { error } = await sb.storage.from('bhh-photos').upload(path, buffer, { contentType: mimeType, upsert: true })
  if (error) return null
  const { data } = sb.storage.from('bhh-photos').getPublicUrl(path)
  return data?.publicUrl || null
}


// ─── Onboarding Modal ────────────────────────────────────────
function OnboardingModal({ user, onComplete }) {
  const [form, setForm] = useState({
    full_name: user?.user_metadata?.full_name || '',
    firma: '',
    uid_nummer: '',
    telefon: '',
    firma_adresse: '',
  })
  const [saving, setSaving] = useState(false)
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleSave() {
    if (!form.full_name.trim()) { toast.error('Name ist Pflicht'); return }
    if (!form.firma.trim()) { toast.error('Firmenname ist Pflicht'); return }
    if (!form.telefon.trim()) { toast.error('Telefon ist Pflicht'); return }
    if (!form.firma_adresse.trim()) { toast.error('Firmenadresse ist Pflicht'); return }
    setSaving(true)
    // 1. Company anlegen
    const { data: company, error: cErr } = await sb.from('companies').insert({
      name: form.firma,
      uid_nummer: form.uid_nummer,
      adresse: form.firma_adresse,
      email: user.email,
      telefon: form.telefon,
      plan: 'trial',
      max_begehungen: 10,
      max_users: 1,
    }).select().single()
    if (cErr) { toast.error('Firma konnte nicht angelegt werden: ' + cErr.message); setSaving(false); return }
    // 2. Profile updaten mit company_id
    const { error: pErr } = await sb.from('profiles').upsert({
      id: user.id,
      full_name: form.full_name,
      firma: form.firma,
      uid_nummer: form.uid_nummer,
      telefon: form.telefon,
      firma_adresse: form.firma_adresse,
      company_id: company.id,
      onboarding_complete: true,
      role: 'gutachter',
    })
    if (pErr) { toast.error(pErr.message); setSaving(false); return }
    // 3. Trial Subscription anlegen
    await sb.from('company_subscriptions').insert({
      company_id: company.id,
      plan_id: 'trial',
      status: 'active',
    })
    toast.success('Willkommen bei Bauherrenhilfe!')
    onComplete({ ...form, company_id: company.id, onboarding_complete: true })
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:20 }}>
      <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:460, maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ background:G.accent, padding:'20px 20px 16px', borderRadius:'16px 16px 0 0' }}>
          <p style={{ color:'rgba(255,255,255,0.75)', fontSize:12, margin:'0 0 4px' }}>Willkommen bei</p>
          <p style={{ color:'#fff', fontSize:18, fontWeight:800, margin:0 }}>Bauherrenhilfe</p>
          <p style={{ color:'rgba(255,255,255,0.7)', fontSize:12, margin:'6px 0 0' }}>Alle Felder sind Pflichtfelder. Ohne vollständige Angaben ist keine Nutzung möglich.</p>
        </div>
        <div style={{ padding:20 }}>
          <label style={lbl}>Vollständiger Name *</label>
          <input style={{ ...inp, borderColor: !form.full_name ? '#fca5a5' : G.border }} value={form.full_name} onChange={e => upd('full_name', e.target.value)} placeholder="Vor- und Nachname" />
          <label style={lbl}>Firmenname *</label>
          <input style={{ ...inp, borderColor: !form.firma ? '#fca5a5' : G.border }} value={form.firma} onChange={e => upd('firma', e.target.value)} placeholder="Musterbau GmbH" autoFocus />
          <label style={lbl}>UID-Nummer</label>
          <input style={inp} value={form.uid_nummer} onChange={e => upd('uid_nummer', e.target.value)} placeholder="ATU12345678" />
          <label style={lbl}>Telefon *</label>
          <input style={{ ...inp, borderColor: !form.telefon ? '#fca5a5' : G.border }} value={form.telefon} onChange={e => upd('telefon', e.target.value)} placeholder="+43 123 456 789" />
          <label style={lbl}>Firmenadresse *</label>
          <input style={{ ...inp, borderColor: !form.firma_adresse ? '#fca5a5' : G.border }} value={form.firma_adresse} onChange={e => upd('firma_adresse', e.target.value)} placeholder="Musterstraße 1, 8010 Graz" />
          <button onClick={handleSave} disabled={saving}
            style={{ background:G.accent, color:'#fff', border:'none', borderRadius:10, padding:'13px 20px', width:'100%', fontSize:14, fontWeight:700, cursor:'pointer', marginTop:20, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
            {saving ? <span className="spinner"/> : null} Profil speichern & starten
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Auth ────────────────────────────────────────────────────
function LoginScreen({ onLogin, inviteData, inviteToken }) {
  const [mode, setMode] = useState(inviteData ? 'register' : 'login')
  const [form, setForm] = useState({ email: inviteData?.email || '', password:'', name:'', role: inviteData?.role || 'gutachter' })
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
      options: { data: { full_name: form.name, role: inviteData?.role || form.role } } })
    if (error) { toast.error(error.message); setLoading(false); return }
    // Mark invite as used + link to company
    if (inviteToken && inviteData) {
      await sb.from('invitations').update({ used: true }).eq('token', inviteToken)
      // Profile will be created by onboarding, but pre-set company_id
      if (data?.user?.id) {
        await sb.from('profiles').upsert({
          id: data.user.id,
          company_id: inviteData.company_id,
          firma: inviteData.companies?.name || '',
          role: inviteData.role || 'gutachter',
          onboarding_complete: false,
        })
      }
      toast.success('Konto erstellt! Bitte vollständige Profildaten eingeben.')
    } else {
      toast.success('Registrierung erfolgreich!')
    }
    setMode('login')
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100dvh', background: 'linear-gradient(135deg, #fff5f5 0%, #fef2f2 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <img src="/logo.png" alt="BHH Logo" style={{ width: 140, height: 'auto', margin: '0 auto 16px', display: 'block' }} />
          <h1 style={{ fontSize: 26, fontWeight: 800, color: '#1a1a1a', marginBottom: 4 }}>Bauherrenhilfe</h1>
          <p style={{ color: '#6b7280', fontSize: 13 }}>Professionelle Baustellenprüfung</p>
        </div>

        <div style={card()}>
          {/* Tab */}
          <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: 10, padding: 4, marginBottom: 24 }}>
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
function BottomNav({ page, setPage, isAdmin, isSuperAdmin }) {
  const items = [
    { id:'dashboard', icon:'🏠', label:'Home' },
    { id:'begehungen', icon:'📋', label:'Begehungen' },
    { id:'neueBegehung', icon:'＋', label:'Neu', accent:true },
    { id:'profil', icon:'👤', label:'Profil' },
    ...(isSuperAdmin ? [{ id:'projekte', icon:'📁', label:'Projekte' }] : []),
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
function Dashboard({ user, profile, setPage, stats, setSelectedBegehung, isSuperAdmin, role }) {
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Guten Morgen' : hour < 18 ? 'Guten Tag' : 'Guten Abend'

  return (
    <div style={{ padding: 20, paddingBottom: 100 }}>
      <div style={{ marginBottom: 28 }}>
        <p style={{ color: G.muted, fontSize: 13, marginBottom: 3 }}>{greeting},</p>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: G.text }}>{profile?.full_name || user?.email}</h1>
        <p style={{ color: G.muted, fontSize: 12, marginTop: 3 }}>Sachverständiger · Bauherrenhilfe</p>
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
            <div key={b.id} onClick={() => { setSelectedBegehung(b); setPage('begehungDetail') }}
              style={{ display:'flex', alignItems:'center', gap:12, paddingBottom:12, borderBottom:`1px solid ${G.border}`, marginBottom:12, cursor:'pointer' }}>
              <div style={{ width:40, height:40, borderRadius:10, background:G.accentLight, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>📋</div>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontWeight:600, fontSize:13, margin:'0 0 2px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{b.titel}</p>
                <p style={{ fontSize:11, color:G.muted, margin:0 }}>{b.gewerk} · {formatDate(b.datum)}</p>
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
function BegehungenListe({ setPage, setSelectedBegehung, begehungen, loading, onDelete }) {
  const [filter, setFilter] = useState('alle')
  const [deletingId, setDeletingId] = useState(null)

  async function handleDelete(e, id) {
    e.stopPropagation()
    if (!window.confirm('Begehung wirklich löschen? Alle Prüfpunkte und Fotos werden entfernt.')) return
    setDeletingId(id)
    await sb.from('pruefpunkte').delete().eq('begehung_id', id)
    await sb.from('begehungen').delete().eq('id', id)
    toast.success('Begehung gelöscht')
    setDeletingId(null)
    if (onDelete) onDelete(id)
  }
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
            <div key={b.id} style={{ background:G.card, border:`0.5px solid ${G.border}`, borderRadius:12, padding:14, display:'flex', gap:14, alignItems:'flex-start', cursor:'pointer' }}
              onClick={() => { setSelectedBegehung(b); setPage('begehungDetail') }}>
              <NoteCircle n={b.gesamtnote} size={44} />
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontWeight:700, fontSize:14, margin:'0 0 3px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{b.titel}</p>
                <p style={{ fontSize:12, color:G.muted, margin:'0 0 6px' }}>{b.gewerk} · {formatDate(b.datum)}</p>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  <span style={{ fontSize:10, background:G.accentLight, borderRadius:6, padding:'2px 8px', color:G.accent, fontWeight:600 }}>{b.auftraggeber_firma || b.auftraggeber_name}</span>
                  <StatusBadge status={b.status || 'erstellt'} />
                  {b.pruefpunkte_count > 0 && <span style={{ fontSize:10, background:'#f0fdf4', borderRadius:6, padding:'2px 8px', color:G.green, fontWeight:600 }}>{b.pruefpunkte_count} Punkte</span>}
                </div>
              </div>
              <button onClick={e => handleDelete(e, b.id)} disabled={deletingId === b.id}
                style={{ background:'#fef2f2', border:`0.5px solid #fca5a5`, borderRadius:8, width:32, height:32, display:'flex', alignItems:'center', justifyContent:'center', color:G.red, fontSize:16, cursor:'pointer', flexShrink:0 }}>
                {deletingId === b.id ? <span className="spinner" style={{ width:14, height:14, borderWidth:2 }}/> : '🗑'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Neue Begehung ───────────────────────────────────────────
function NeueBegehung({ user, profile, setPage, onCreated }) {
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    titel: '', adresse: '', auftraggeber_firma: '', vertreter_ag: '', auftraggeber_email: '',
    kunde_name: '', kunde_email: '', sachverstaendiger: user?.user_metadata?.full_name || 'Ing. Ferid Mujcinovic MBA',
    datum: new Date().toISOString().split('T')[0],
    uhrzeit: new Date().toTimeString().slice(0,5),
    gewerk: GEWERKE[0], bemerkungen: '',
  })
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function handleCreate() {
    if (!form.titel || !form.auftraggeber_firma || !form.auftraggeber_email) {
      toast.error('Bitte alle Pflichtfelder ausfüllen')
      return
    }
    setSaving(true)
    // company_id aus eigenem Profil holen
    const { data: myProfile } = await sb.from('profiles').select('company_id').eq('id', user.id).single()
    const { data, error } = await sb.from('begehungen').insert({
      ...form,
      user_id: user.id,
      company_id: myProfile?.company_id || null,
      gesamtnote: null,
      status: 'erstellt',
    }).select().single()
    if (error) { toast.error(error.message); setSaving(false); return }
    // Usage tracken
    await trackUsage(myProfile?.company_id, user.id, 'begehung_erstellt', { titel: form.titel })
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
            <label style={lbl}>Ausbaustufe *</label>
            <select style={inp} value={form.gewerk} onChange={e => upd('gewerk', e.target.value)}>
              {GEWERKE.map(g => <option key={g}>{g}</option>)}
            </select>
          </div>
        )}

        {step === 2 && (
          <div className="fade-up">
            <label style={lbl}>Auftraggeber Firma *</label>
            <input style={inp} value={form.auftraggeber_firma} onChange={e => upd('auftraggeber_firma', e.target.value)} placeholder="Firma / Unternehmen" />
            <label style={lbl}>Vertreter AG (Name) *</label>
            <input style={inp} value={form.vertreter_ag} onChange={e => upd('vertreter_ag', e.target.value)} placeholder="Vor- und Nachname" />
            <label style={lbl}>E-Mail AG *</label>
            <input style={inp} type="email" value={form.auftraggeber_email} onChange={e => upd('auftraggeber_email', e.target.value)} placeholder="email@firma.at" />
            <label style={lbl}>Kunde / Bauherr (Name)</label>
            <input style={inp} value={form.kunde_name} onChange={e => upd('kunde_name', e.target.value)} placeholder="Name des Bauherrn" />
            <label style={lbl}>E-Mail Kunde</label>
            <input style={inp} type="email" value={form.kunde_email} onChange={e => upd('kunde_email', e.target.value)} placeholder="email@kunde.at" />
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
      try {
        await addHistory('ki_analyse', { pruefpunkte_count: punkte.length })
        const { data: prof2 } = await sb.from('profiles').select('company_id').eq('id', begehung?.user_id || '').maybeSingle()
        if (prof2?.company_id) await trackUsage(prof2.company_id, begehung?.user_id, 'ki_analyse')
      } catch(e) {}
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

    // Fotos hochladen – strukturierter Pfad
    const { data: prof } = await sb.from('profiles').select('company_id').eq('id', userId).maybeSingle()
    const uploadedFotos = []
    for (const foto of form.fotos) {
      if (foto.url) { uploadedFotos.push(foto); continue }
      const url = await uploadFoto(foto.base64, 'pruefpunkt', prof?.company_id, begehungId)
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
            <label style={{ fontSize:10, fontWeight:700, color:G.accent, textTransform:'uppercase', letterSpacing:'.5px', display:'block', marginBottom:5, marginTop:14 }}>Öffentliches Protokoll (für Auftraggeber)</label>
            <textarea style={{ ...inp, resize:'vertical', borderColor: G.green + '44' }} rows={4} value={form.text_oeffentlich} onChange={e => setForm(f => ({ ...f, text_oeffentlich: e.target.value }))} />
          </>
        )}

        {/* Interner Text */}
        {form.text_intern && (
          <>
            <label style={{ fontSize:10, fontWeight:700, color:G.muted, textTransform:'uppercase', letterSpacing:'.5px', display:'block', marginBottom:5, marginTop:14 }}>Internes Protokoll (nur intern)</label>
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
  const [showPreview, setShowPreview] = useState(null) // null | 'ag_beide' | 'ag_oeffentlich' | 'bauherr'
  const [editPunkt, setEditPunkt] = useState(null)
  const [sending, setSending] = useState(false)
  const [viewMode, setViewMode] = useState('liste') // liste | oeffentlich | intern | historie
  const [history, setHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyDetail, setHistoryDetail] = useState(null)

  useEffect(() => { fetchPunkte() }, [begehung.id])

  async function fetchHistory() {
    setHistoryLoading(true)
    const { data } = await sb.from('begehung_history')
      .select('*')
      .eq('begehung_id', begehung.id)
      .order('created_at', { ascending: false })
    setHistory(data || [])
    setHistoryLoading(false)
  }

  async function addHistory(eventType, meta = {}) {
    const { data: prof } = await sb.from('profiles').select('company_id').eq('id', user.id).maybeSingle()
    await sb.from('begehung_history').insert({
      begehung_id: begehung.id,
      company_id: prof?.company_id || null,
      user_id: user.id,
      event_type: eventType,
      meta,
    })
  }

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

  async function sendProtocol(recipient) {
    // recipient: 'ag_beide' = beide Protokolle an AG
    //            'ag_oeffentlich' = nur öffentliches an AG
    //            'bauherr' = nur öffentliches an Bauherr
    const agEmail = begehung.auftraggeber_email
    const bauherrEmail = begehung.kunde_email
    if (recipient === 'ag_beide' || recipient === 'ag_oeffentlich') {
      if (!agEmail) { toast.error('Keine E-Mail für Auftraggeber hinterlegt'); return }
    }
    if (recipient === 'bauherr') {
      if (!bauherrEmail) { toast.error('Keine E-Mail für Bauherr hinterlegt'); return }
    }
    setSending(recipient)
    try {
      toast.loading('PDFs werden erstellt…', { id: 'pdf-send' })
      let linkOeff = null, linkIntern = null

      // PDF generieren + in Supabase hochladen für Download-Link
      async function uploadPDF(type) {
        const { data: svProf } = await sb.from('profiles').select('stempel_url, stempel_size_mm').eq('id', begehung.user_id || '').maybeSingle()
        const d = await generateProtokollPDF({ type, begehung, punkte, getEditedText, stempelUrl: svProf?.stempel_url || null, stempelSizeMm: svProf?.stempel_size_mm || 50, creatorName: begehung.sachverstaendiger })
        const blob = d.output('blob')
        // Strukturierter PDF-Pfad
        const { data: pdfProf } = await sb.from('profiles').select('company_id').eq('id', begehung.user_id || '').maybeSingle()
        const pdfFolder = pdfProf?.company_id ? pdfProf.company_id + '/protokolle' : 'protokolle'
        const path = pdfFolder + '/' + begehung.id + '_' + type + '_' + Date.now() + '.pdf'
        await sb.storage.from('bhh-photos').upload(path, blob, { contentType: 'application/pdf', upsert: true })
        const { data } = sb.storage.from('bhh-photos').getPublicUrl(path)
        return data?.publicUrl || null
      }

      if (recipient === 'ag_beide' || recipient === 'ag_oeffentlich' || recipient === 'bauherr') {
        linkOeff = await uploadPDF('oeffentlich')
      }
      if (recipient === 'ag_beide') {
        linkIntern = await uploadPDF('intern')
      }

      toast.loading('E-Mail wird gesendet…', { id: 'pdf-send' })
      const res = await fetch('/api/send-protocol', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ begehung, punkte: getPunkteForSend(), recipient, linkOeff, linkIntern }),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.error || 'Versand fehlgeschlagen')
      }
      toast.dismiss('pdf-send')
      // History + Usage tracken
      try {
        const toEmail = recipient === 'bauherr' ? begehung.kunde_email : begehung.auftraggeber_email
        await addHistory('protokoll_versendet', {
          recipient,
          email: toEmail,
          link_oeff: linkOeff,
          link_intern: linkIntern,
        })
        const { data: prof3 } = await sb.from('profiles').select('company_id').eq('id', begehung?.user_id || '').maybeSingle()
        if (prof3?.company_id) await trackUsage(prof3.company_id, begehung?.user_id, 'protokoll_versendet', { recipient })
      } catch(e) {}
      if (recipient === 'ag_beide') toast.success('E-Mail + PDFs versendet & heruntergeladen!')
      else if (recipient === 'ag_oeffentlich') toast.success('E-Mail versendet + PDF heruntergeladen!')
      else toast.success('E-Mail an Bauherr versendet + PDF heruntergeladen!')
      // Status auf 'versendet' setzen (nur wenn noch nicht abgeschlossen)
      if (begehung.status !== 'abgeschlossen') {
        await sb.from('begehungen').update({ status: 'versendet' }).eq('id', begehung.id)
        setBegehung(b => ({ ...b, status: 'versendet' }))
      }
    } catch (e) {
      toast.dismiss('pdf-send')
      toast.error(e.message || 'Versand fehlgeschlagen')
    }
    setSending(null)
  }

  async function finalize() {
    await sb.from('begehungen').update({ status: 'abgeschlossen' }).eq('id', begehung.id)
    setBegehung(b => ({ ...b, status: 'abgeschlossen' }))
    toast.success('Begehung abgeschlossen!')
  }

  const noteCfg = NOTEN.find(x => x.n === begehung.gesamtnote)

  function PreviewModal() {
    if (!showPreview) return null
    const showOeff = showPreview === 'ag_beide' || showPreview === 'ag_oeffentlich' || showPreview === 'bauherr'
    const showIntern = showPreview === 'ag_beide'
    const recipientLabel = showPreview === 'ag_beide' ? 'Beide Protokolle an AG senden'
      : showPreview === 'ag_oeffentlich' ? 'Öffentliches Protokoll an AG senden'
      : 'Öffentliches Protokoll an Bauherr senden'

    return (
      <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:2000, overflowY:'auto', padding:'16px' }}>
        <div style={{ background:'#fff', borderRadius:16, maxWidth:680, margin:'0 auto', overflow:'hidden' }}>
          {/* Header */}
          <div style={{ background:G.accent, padding:'14px 16px', display:'flex', alignItems:'center', gap:10, position:'sticky', top:0, zIndex:10 }}>
            <button onClick={() => setShowPreview(null)}
              style={{ background:'rgba(255,255,255,0.2)', border:'none', color:'#fff', borderRadius:8, width:32, height:32, fontSize:18, cursor:'pointer', flexShrink:0 }}>←</button>
            <p style={{ color:'#fff', fontWeight:700, fontSize:14, margin:0, flex:1 }}>Vorschau & Senden</p>
            <button onClick={() => { setShowPreview(null); sendProtocol(showPreview) }} disabled={!!sending}
              style={{ background:'rgba(255,255,255,0.25)', border:'1px solid rgba(255,255,255,0.5)', color:'#fff', borderRadius:9, padding:'8px 14px', fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
              {sending ? <span className="spinner" style={{ width:14, height:14, borderWidth:2, borderTopColor:'#fff' }}/> : '📧'} Senden
            </button>
          </div>

          <div style={{ padding:16 }}>
            {/* Öffentliches Protokoll */}
            {showOeff && (
              <div style={{ marginBottom: showIntern ? 24 : 0 }}>
                <div style={{ background:G.accentLight, border:`0.5px solid ${G.accentBorder}`, borderRadius:10, padding:'10px 14px', marginBottom:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <p style={{ fontSize:13, fontWeight:700, color:G.accent, margin:0 }}>Öffentliches Protokoll</p>
                  <button onClick={() => exportPDF('oeffentlich')}
                    style={{ background:'#fff', border:`0.5px solid ${G.border}`, borderRadius:7, padding:'5px 10px', fontSize:11, fontWeight:600, color:G.text, cursor:'pointer' }}>📄 PDF</button>
                </div>
                {/* Meta */}
                <div style={{ background:'#f9fafb', border:`0.5px solid ${G.border}`, borderRadius:10, padding:12, marginBottom:10 }}>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    {[['Auftraggeber', begehung.auftraggeber_firma || begehung.auftraggeber_name],['Bauherr', begehung.kunde_name || '–'],['SV', begehung.sachverstaendiger],['Datum', formatDate(begehung.datum)]].map(([k,v]) => (
                      <div key={k}>
                        <p style={{ fontSize:10, fontWeight:700, color:G.muted, textTransform:'uppercase', margin:'0 0 1px' }}>{k}</p>
                        <p style={{ fontSize:12, fontWeight:600, color:G.text, margin:0 }}>{v || '–'}</p>
                      </div>
                    ))}
                  </div>
                </div>
                {punkte.map((p, i) => (
                  <div key={p.id} style={{ background:'#fff', border:`0.5px solid ${G.border}`, borderRadius:10, padding:12, marginBottom:8 }}>
                    <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:8 }}>
                      <NoteCircle n={p.note} size={28} />
                      <p style={{ fontWeight:700, fontSize:13, margin:0 }}>{i+1}. {p.titel}</p>
                    </div>
                    {p.fotos?.filter(f=>f.url).slice(0,1).map((f,j) => (
                      <img key={j} src={f.url} alt="" style={{ width:'100%', maxHeight:160, objectFit:'cover', borderRadius:8, marginBottom:8 }} />
                    ))}
                    <p style={{ fontSize:12, color:G.text, lineHeight:1.6, margin:0 }}>{getEditedText(p,'oeffentlich') || '–'}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Internes Protokoll */}
            {showIntern && (
              <div>
                <div style={{ background:'#fff5f5', border:`0.5px solid #fca5a5`, borderRadius:10, padding:'10px 14px', marginBottom:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <p style={{ fontSize:13, fontWeight:700, color:G.red, margin:0 }}>Internes Protokoll</p>
                  <button onClick={() => exportPDF('intern')}
                    style={{ background:'#fff', border:`0.5px solid ${G.border}`, borderRadius:7, padding:'5px 10px', fontSize:11, fontWeight:600, color:G.text, cursor:'pointer' }}>📄 PDF</button>
                </div>
                <div style={{ background:'#f9fafb', border:`0.5px solid ${G.border}`, borderRadius:10, padding:12, marginBottom:10 }}>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    {[['Auftraggeber', begehung.auftraggeber_firma || begehung.auftraggeber_name],['Bauherr', begehung.kunde_name || '–'],['SV', begehung.sachverstaendiger],['Datum', formatDate(begehung.datum)]].map(([k,v]) => (
                      <div key={k}>
                        <p style={{ fontSize:10, fontWeight:700, color:G.muted, textTransform:'uppercase', margin:'0 0 1px' }}>{k}</p>
                        <p style={{ fontSize:12, fontWeight:600, color:G.text, margin:0 }}>{v || '–'}</p>
                      </div>
                    ))}
                  </div>
                </div>
                {punkte.map((p, i) => (
                  <div key={p.id} style={{ background: p.note >= 4 ? '#fff5f5' : '#fff', border:`0.5px solid ${p.note >= 4 ? '#fca5a5' : G.border}`, borderRadius:10, padding:12, marginBottom:8 }}>
                    <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:8 }}>
                      <NoteCircle n={p.note} size={28} />
                      <p style={{ fontWeight:700, fontSize:13, margin:0 }}>{i+1}. {p.titel}</p>
                    </div>
                    {p.fotos?.filter(f=>f.url).map((f,j) => (
                      <img key={j} src={f.url} alt="" style={{ width:'100%', maxHeight:160, objectFit:'cover', borderRadius:8, marginBottom:8 }} />
                    ))}
                    <p style={{ fontSize:12, color:G.text, lineHeight:1.6, margin:0 }}>{getEditedText(p,'intern') || '–'}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Senden Button unten */}
            <button onClick={() => { setShowPreview(null); sendProtocol(showPreview) }} disabled={!!sending}
              style={{ background:G.accent, color:'#fff', border:'none', borderRadius:10, padding:'14px', width:'100%', fontSize:14, fontWeight:700, cursor:'pointer', marginTop:8, display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
              {sending ? <span className="spinner"/> : '📧'} {recipientLabel}
            </button>
          </div>
        </div>
      </div>
    )
  }

  const [editTexts, setEditTexts] = useState({}) // { [punktId_type]: text }
  const [editMode, setEditMode] = useState({})   // { [punktId_type]: bool }

  function getEditedText(p, type) {
    const key = p.id + '_' + type
    return editTexts[key] !== undefined ? editTexts[key] : (type === 'oeffentlich' ? (p.text_oeffentlich || p.rohtext || '') : (p.text_intern || p.rohtext || ''))
  }

  async function saveEditedText(p, type) {
    const key = p.id + '_' + type
    const text = editTexts[key]
    // Track
    try { await addHistory('text_bearbeitet', { titel: p.titel, type }) } catch(e) {}
    if (text === undefined) return
    const field = type === 'oeffentlich' ? 'text_oeffentlich' : 'text_intern'
    await sb.from('pruefpunkte').update({ [field]: text }).eq('id', p.id)
    setPunkte(prev => prev.map(x => x.id === p.id ? { ...x, [field]: text } : x))
    setEditMode(m => ({ ...m, [key]: false }))
    toast.success('Text gespeichert')
  }

  function toggleEdit(p, type) {
    const key = p.id + '_' + type
    setEditMode(m => ({ ...m, [key]: !m[key] }))
    if (!editTexts[key]) {
      setEditTexts(t => ({ ...t, [key]: type === 'oeffentlich' ? (p.text_oeffentlich || p.rohtext || '') : (p.text_intern || p.rohtext || '') }))
    }
  }

  // ── Berechne protokollText für Versand (edited oder DB) ──
  function getPunkteForSend() {
    return punkte.map(p => ({
      ...p,
      text_oeffentlich: getEditedText(p, 'oeffentlich'),
      text_intern: getEditedText(p, 'intern'),
    }))
  }

  // ── PDF Export via Print ──
  async function exportPDF(type) {
    toast.loading('PDF wird erstellt…', { id: 'pdf' })
    try {
      // Load stempel from profile
      const { data: svProfile } = await sb.from('profiles').select('stempel_url, stempel_size_mm').eq('id', begehung.user_id || '').maybeSingle()
      const doc = await generateProtokollPDF({
        type,
        begehung,
        punkte,
        getEditedText,
        stempelUrl: svProfile?.stempel_url || null,
        stempelSizeMm: svProfile?.stempel_size_mm || 50,
        creatorName: begehung.sachverstaendiger,
      })
      doc.save('Protokoll_' + (type === 'oeffentlich' ? 'Oeffentlich' : 'Intern') + '_' + (begehung.titel || 'Begehung').replace(/[^a-zA-Z0-9]/g, '_') + '.pdf')
      toast.success('PDF erstellt!', { id: 'pdf' })
    } catch(e) {
      toast.error('PDF Fehler: ' + e.message, { id: 'pdf' })
    }
  }

  // ── Word Export ──
  function exportWord(type) {
    const html = buildPrintHTML(type)
    const blob = new Blob(['\ufeff' + html], { type: 'application/msword' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `Protokoll_${type}_${begehung.titel || 'Begehung'}.doc`
    a.click()
    URL.revokeObjectURL(url)
  }

  function buildPrintHTML(type) {
    const isOeff = type === 'oeffentlich'
    const color = isOeff ? '#cc1f1f' : '#991515'
    const title = isOeff ? 'Baustellenprüfprotokoll' : 'Internes Protokoll'
    const subtitle = isOeff ? 'Öffentliches Protokoll · Für Auftraggeber & Bauherr' : 'Vertraulich · Nur für interne Zwecke'

    const items = punkte.map((p, i) => {
      const text = getEditedText(p, type === 'oeffentlich' ? 'oeffentlich' : 'intern')
      const noteCfg2 = NOTEN.find(n => n.n === p.note) || {}
      const fotos = isOeff ? (p.fotos?.filter(f=>f.url).slice(0,2) || []) : (p.fotos?.filter(f=>f.url) || [])
      const fotosHtml = fotos.map(f => '<img src="' + f.url + '" style="width:100%;max-height:180px;object-fit:cover;border-radius:6px;margin-bottom:8px;" />').join('')
      const rohHtml = (!isOeff && p.rohtext) ? '<p style="font-size:11px;color:#6b7280;font-style:italic;margin:0 0 6px;">Rohnotiz: ' + p.rohtext + '</p>' : ''
      return '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin-bottom:12px;page-break-inside:avoid;">'
        + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">'
        + '<div style="width:34px;height:34px;border-radius:50%;background:' + noteCfg2.bg + ';border:2px solid ' + noteCfg2.color + ';display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:' + noteCfg2.color + ';">' + p.note + '</div>'
        + '<div>'
        + '<p style="font-weight:700;font-size:14px;margin:0 0 3px;">' + (i+1) + '. ' + p.titel + '</p>'
        + '<span style="font-size:11px;background:' + noteCfg2.bg + ';color:' + noteCfg2.color + ';padding:2px 8px;border-radius:4px;font-weight:600;">' + p.status + '</span>'
        + '</div></div>'
        + fotosHtml
        + rohHtml
        + '<p style="font-size:13px;color:#374151;line-height:1.7;margin:0;">' + (text || '–') + '</p>'
        + '</div>'
    }).join('')

    return '<!DOCTYPE html><html><head><meta charset="utf-8">'
      + '<style>body{font-family:Arial,sans-serif;max-width:700px;margin:0 auto;padding:20px;color:#111;}'
      + '@media print{body{padding:0;}@page{margin:1.5cm;}}</style></head><body>'
      + '<div style="background:' + color + ';padding:20px;border-radius:8px;margin-bottom:16px;">'
      + '<h1 style="color:#fff;font-size:20px;margin:0 0 4px;">' + title + '</h1>'
      + '<p style="color:rgba(255,255,255,0.85);font-size:12px;margin:0;">' + subtitle + ' · ' + (begehung.datum || '') + '</p>'
      + '</div>'
      + '<table style="width:100%;font-size:12px;margin-bottom:16px;border-collapse:collapse;">'
      + '<tr><td style="color:#6b7280;padding:4px 8px 4px 0;width:140px;">Bauvorhaben</td><td style="font-weight:600;">' + (begehung.titel || '') + '</td></tr>'
      + '<tr><td style="color:#6b7280;padding:4px 8px 4px 0;">Adresse</td><td style="font-weight:600;">' + (begehung.adresse || '–') + '</td></tr>'
      + '<tr><td style="color:#6b7280;padding:4px 8px 4px 0;">Auftraggeber</td><td style="font-weight:600;">' + (begehung.auftraggeber_firma || begehung.auftraggeber_name || '–') + '</td></tr>'
      + '<tr><td style="color:#6b7280;padding:4px 8px 4px 0;">Bauherr</td><td style="font-weight:600;">' + (begehung.kunde_name || '–') + '</td></tr>'
      + '<tr><td style="color:#6b7280;padding:4px 8px 4px 0;">Sachverständiger</td><td style="font-weight:600;">' + (begehung.sachverstaendiger || '–') + '</td></tr>'
      + '</table>'
      + items
      + '<p style="font-size:10px;color:#9ca3af;text-align:center;margin-top:20px;padding-top:12px;border-top:1px solid #e5e7eb;">Bauherrenhilfe · bauherrenhilfe.at</p>'
      + '</body></html>'
  }

  return (
    <div style={{ paddingBottom: 100 }}>
      {/* Header */}
      <div style={{ background: G.accent }}>
        <div style={{ padding:'14px 16px', display:'flex', alignItems:'center', gap:10 }}>
          <button onClick={() => setPage('begehungen')} style={{ background:'rgba(255,255,255,0.2)', border:'none', color:'#fff', borderRadius:8, width:34, height:34, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0, cursor:'pointer' }}>←</button>
          <div style={{ flex:1, minWidth:0 }}>
            <p style={{ fontSize:11, color:'rgba(255,255,255,0.75)', margin:'0 0 2px' }}>{begehung.gewerk} · {formatDate(begehung.datum)}</p>
            <h1 style={{ fontSize:17, fontWeight:800, color:'#fff', margin:'0 0 4px', lineHeight:1.3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{begehung.titel}</h1>
            <StatusBadge status={begehung.status || 'erstellt'} />
          </div>
          {begehung.gesamtnote && <NoteCircle n={begehung.gesamtnote} size={40} />}
        </div>
        {/* Tabs */}
        <div style={{ display:'flex', gap:0, overflowX:'auto', borderTop:'1px solid rgba(255,255,255,0.15)' }}>
          {[['liste','Prüfpunkte'],['oeffentlich','Öffentlich'],['intern','Intern'],['historie','Historie']].map(([id, label]) => (
            <button key={id} onClick={() => { setViewMode(id); if (id === 'historie') fetchHistory() }} style={{ padding:'10px 18px', border:'none', background:'transparent', color: viewMode===id ? '#fff' : 'rgba(255,255,255,0.6)', fontWeight: viewMode===id ? 700 : 400, fontSize:13, cursor:'pointer', borderBottom: viewMode===id ? '2px solid #fff' : '2px solid transparent', whiteSpace:'nowrap', flexShrink:0 }}>
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
              ['Auftraggeber', begehung.auftraggeber_firma || begehung.auftraggeber_name],
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
                <p style={{ fontSize:11, fontWeight:700, color:G.muted, textTransform:'uppercase', letterSpacing:'.5px', margin:'4px 0 2px' }}>Protokoll versenden</p>
                <button onClick={() => setShowPreview('ag_beide')}
                  style={{ background:G.accent, color:'#fff', border:'none', borderRadius:10, padding:'13px 16px', display:'flex', alignItems:'center', justifyContent:'center', gap:8, fontSize:13, fontWeight:700, cursor:'pointer', width:'100%' }}>
                  👁 Vorschau & Beide Protokolle an AG
                </button>
                <button onClick={() => setShowPreview('bauherr')}
                  style={{ background:'#f9fafb', border:`0.5px solid ${G.border}`, borderRadius:10, padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'center', gap:8, fontSize:13, fontWeight:600, color:G.text, cursor:'pointer', width:'100%' }}>
                  👁 Vorschau & Öffentliches an Bauherr
                </button>
                {begehung.status === 'versendet' && (
                  <button style={{ background:G.green, color:'#fff', border:'none', borderRadius:10, padding:'12px 16px', fontSize:13, fontWeight:700, cursor:'pointer', width:'100%', marginTop:4 }} onClick={finalize}>
                    ✓ Als abgeschlossen markieren
                  </button>
                )}
                {begehung.status === 'erstellt' && (
                  <p style={{ fontSize:11, color:G.muted, textAlign:'center', margin:'4px 0 0' }}>Zuerst Protokoll versenden um abzuschließen</p>
                )}
              </div>
            )}
          </>
        )}

        {/* Öffentliches Protokoll */}
        {viewMode === 'oeffentlich' && (
          <div>
            {/* Export Buttons */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:14 }}>
              <button onClick={() => exportPDF('oeffentlich')}
                style={{ background:'#f9fafb', border:`0.5px solid ${G.border}`, borderRadius:10, padding:'10px', display:'flex', alignItems:'center', justifyContent:'center', gap:6, fontSize:12, fontWeight:600, color:G.text, cursor:'pointer' }}>
                📄 PDF Vorschau
              </button>
              <button onClick={() => exportWord('oeffentlich')}
                style={{ background:'#f9fafb', border:`0.5px solid ${G.border}`, borderRadius:10, padding:'10px', display:'flex', alignItems:'center', justifyContent:'center', gap:6, fontSize:12, fontWeight:600, color:G.text, cursor:'pointer' }}>
                📝 Word Export
              </button>
            </div>

            {/* Protokoll Header */}
            <div style={{ background:'#fff', border:`0.5px solid ${G.border}`, borderRadius:12, padding:16, marginBottom:12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12, paddingBottom:12, borderBottom:`0.5px solid ${G.border}` }}>
                <div>
                  <p style={{ fontSize:16, fontWeight:800, color:G.accent, margin:'0 0 4px' }}>Baustellenprüfprotokoll</p>
                  <p style={{ fontSize:12, color:G.muted, margin:0 }}>Öffentlich · Für Auftraggeber & Bauherr</p>
                </div>
                <div style={{ textAlign:'right' }}>
                  <p style={{ fontSize:11, color:G.muted, margin:'0 0 4px' }}>{formatDate(begehung.datum)}</p>
                  {begehung.gesamtnote && <NoteCircle n={begehung.gesamtnote} size={32} />}
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                {[
                  ['Auftraggeber', begehung.auftraggeber_firma || begehung.auftraggeber_name],
                  ['Bauherr', begehung.kunde_name || '–'],
                  ['Sachverständiger', begehung.sachverstaendiger],
                  ['Adresse', begehung.adresse],
                ].map(([k,v]) => (
                  <div key={k} style={{ background:'#f9fafb', borderRadius:8, padding:'8px 10px' }}>
                    <p style={{ fontSize:10, fontWeight:700, color:G.muted, textTransform:'uppercase', margin:'0 0 2px' }}>{k}</p>
                    <p style={{ fontSize:12, fontWeight:600, color:G.text, margin:0 }}>{v || '–'}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Prüfpunkte mit Bearbeitung */}
            {punkte.map((p, i) => {
              const key = p.id + '_oeffentlich'
              const isEditing = editMode[key]
              const displayText = getEditedText(p, 'oeffentlich')
              return (
                <div key={p.id} style={{ background:'#fff', border:`0.5px solid ${G.border}`, borderRadius:12, padding:14, marginBottom:10 }}>
                  <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:10 }}>
                    <NoteCircle n={p.note} size={34} />
                    <div style={{ flex:1 }}>
                      <p style={{ fontWeight:700, fontSize:14, margin:'0 0 2px' }}>{i+1}. {p.titel}</p>
                      <span style={{ fontSize:11, padding:'2px 8px', borderRadius:6, background:NOTEN.find(n=>n.n===p.note)?.bg, color:NOTEN.find(n=>n.n===p.note)?.color, fontWeight:600 }}>{p.status}</span>
                    </div>
                    <button onClick={() => toggleEdit(p, 'oeffentlich')}
                      style={{ background:'#f9fafb', border:`0.5px solid ${G.border}`, borderRadius:7, padding:'5px 10px', fontSize:11, fontWeight:600, color:G.muted, cursor:'pointer', flexShrink:0 }}>
                      {isEditing ? '✕ Abbrechen' : '✏️ Bearbeiten'}
                    </button>
                  </div>
                  {p.fotos?.filter(f=>f.url).slice(0,2).map((f, j) => (
                    <img key={j} src={f.url} alt="" style={{ width:'100%', borderRadius:8, marginBottom:8, maxHeight:220, objectFit:'cover' }} />
                  ))}
                  {isEditing ? (
                    <div>
                      <textarea value={editTexts[key] ?? displayText}
                        onChange={e => setEditTexts(t => ({ ...t, [key]: e.target.value }))}
                        style={{ width:'100%', minHeight:100, fontSize:13, lineHeight:1.7, border:`1px solid ${G.accent}`, borderRadius:8, padding:'10px 12px', color:G.text, background:'#fff', resize:'vertical', outline:'none', boxSizing:'border-box' }} />
                      <button onClick={() => saveEditedText(p, 'oeffentlich')}
                        style={{ background:G.accent, color:'#fff', border:'none', borderRadius:8, padding:'8px 16px', fontSize:12, fontWeight:700, cursor:'pointer', marginTop:6 }}>
                        ✓ Speichern
                      </button>
                    </div>
                  ) : (
                    <p style={{ fontSize:13, color:G.text, lineHeight:1.7, margin:0 }}>{displayText || '–'}</p>
                  )}
                </div>
              )
            })}

            {/* Versand Buttons */}
            <div style={{ marginTop:16, display:'flex', flexDirection:'column', gap:8 }}>
              <button onClick={() => setShowPreview('ag_oeffentlich')}
                style={{ background:G.accent, color:'#fff', border:'none', borderRadius:10, padding:'13px', display:'flex', alignItems:'center', justifyContent:'center', gap:8, fontSize:13, fontWeight:700, cursor:'pointer', width:'100%' }}>
                👁 Vorschau & An Auftraggeber senden
              </button>
              <button onClick={() => setShowPreview('bauherr')}
                style={{ background:'#f9fafb', border:`0.5px solid ${G.border}`, borderRadius:10, padding:'12px', display:'flex', alignItems:'center', justifyContent:'center', gap:8, fontSize:13, fontWeight:600, color:G.text, cursor:'pointer', width:'100%' }}>
                👁 Vorschau & An Bauherr senden
              </button>
            </div>
          </div>
        )}

        {/* Internes Protokoll */}
        {/* ── Historie Tab ── */}
        {viewMode === 'historie' && (
          <div>
            {historyLoading ? (
              <div style={{ textAlign:'center', padding:40, color:G.muted }}>Lädt…</div>
            ) : history.length === 0 ? (
              <div style={{ textAlign:'center', padding:40 }}>
                <p style={{ fontSize:32, marginBottom:8 }}>📋</p>
                <p style={{ color:G.muted, fontSize:13 }}>Noch keine Einträge</p>
              </div>
            ) : (
              <div style={{ position:'relative', paddingLeft:24 }}>
                <div style={{ position:'absolute', left:8, top:0, bottom:0, width:2, background:G.border }} />
                {history.map((h, i) => {
                  const cfg = {
                    protokoll_versendet: { color:'#16a34a', bg:'#f0fdf4', border:'#86efac', icon:'✓', label:'Protokoll versendet' },
                    ki_analyse:          { color:'#d97706', bg:'#fffbeb', border:'#fcd34d', icon:'⚡', label:'KI-Analyse' },
                    pruefpunkt_erstellt: { color:'#2563eb', bg:'#eff6ff', border:'#93c5fd', icon:'+', label:'Prüfpunkt hinzugefügt' },
                    text_bearbeitet:     { color:'#7c3aed', bg:'#f5f3ff', border:'#c4b5fd', icon:'✎', label:'Text bearbeitet' },
                    begehung_erstellt:   { color:'#6b7280', bg:'#f9fafb', border:'#e5e7eb', icon:'◎', label:'Begehung erstellt' },
                  }[h.event_type] || { color:'#6b7280', bg:'#f9fafb', border:'#e5e7eb', icon:'•', label: h.event_type }

                  const dt = new Date(h.created_at)
                  const dateStr = dt.toLocaleDateString('de-AT') + ' · ' + dt.toLocaleTimeString('de-AT', { hour:'2-digit', minute:'2-digit' })

                  return (
                    <div key={h.id} style={{ marginBottom:12, position:'relative', cursor: h.event_type === 'protokoll_versendet' ? 'pointer' : 'default' }}
                      onClick={() => h.event_type === 'protokoll_versendet' ? setHistoryDetail(h) : null}>
                      <div style={{ position:'absolute', left:-20, top:8, width:12, height:12, borderRadius:'50%', background:cfg.color, border:'2px solid #fff', boxShadow:`0 0 0 1px ${cfg.color}` }} />
                      <div style={{ background:cfg.bg, border:`0.5px solid ${cfg.border}`, borderRadius:10, padding:'10px 12px' }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:4 }}>
                          <span style={{ fontSize:12, fontWeight:700, color:cfg.color }}>{cfg.icon} {cfg.label}</span>
                          <span style={{ fontSize:10, color:G.muted, flexShrink:0 }}>{dateStr}</span>
                        </div>
                        {h.event_type === 'protokoll_versendet' && (
                          <div>
                            <p style={{ fontSize:11, color:G.text, margin:'0 0 2px' }}>
                              {h.meta?.recipient === 'ag_beide' ? 'Öffentlich + Intern an AG' : h.meta?.recipient === 'bauherr' ? 'Öffentlich an Bauherr' : 'Öffentlich an AG'}
                            </p>
                            <p style={{ fontSize:10, color:G.muted, margin:0 }}>An: {h.meta?.email || '–'}</p>
                            {h.meta?.link_oeff && <p style={{ fontSize:10, color:'#2563eb', margin:'3px 0 0' }}>📄 PDF verfügbar</p>}
                          </div>
                        )}
                        {h.event_type === 'ki_analyse' && (
                          <p style={{ fontSize:11, color:G.text, margin:0 }}>{h.meta?.pruefpunkte_count || 0} Prüfpunkte analysiert</p>
                        )}
                        {h.event_type === 'text_bearbeitet' && (
                          <p style={{ fontSize:11, color:G.text, margin:0 }}>„{h.meta?.titel || '–'}" – {h.meta?.type === 'oeffentlich' ? 'öffentlicher' : 'interner'} Text</p>
                        )}
                        {h.event_type === 'protokoll_versendet' && <p style={{ fontSize:10, color:G.muted, margin:'4px 0 0' }}>Tippen für Details →</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Detail Modal */}
            {historyDetail && (
              <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:1000 }}
                onClick={() => setHistoryDetail(null)}>
                <div style={{ background:'#fff', borderRadius:'16px 16px 0 0', width:'100%', maxWidth:600, padding:0, maxHeight:'80vh', overflowY:'auto' }}
                  onClick={e => e.stopPropagation()}>
                  <div style={{ background:'#16a34a', padding:'14px 16px', borderRadius:'16px 16px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div>
                      <p style={{ color:'#fff', fontSize:14, fontWeight:700, margin:0 }}>Protokoll versendet</p>
                      <p style={{ color:'rgba(255,255,255,0.8)', fontSize:11, margin:'2px 0 0' }}>
                        {new Date(historyDetail.created_at).toLocaleDateString('de-AT')} · {new Date(historyDetail.created_at).toLocaleTimeString('de-AT', { hour:'2-digit', minute:'2-digit' })} Uhr
                      </p>
                    </div>
                    <button onClick={() => setHistoryDetail(null)} style={{ background:'rgba(255,255,255,0.2)', border:'none', color:'#fff', borderRadius:'50%', width:28, height:28, cursor:'pointer', fontSize:14 }}>✕</button>
                  </div>
                  <div style={{ padding:16 }}>
                    {[
                      ['Typ', historyDetail.meta?.recipient === 'ag_beide' ? 'Öffentlich + Intern' : historyDetail.meta?.recipient === 'bauherr' ? 'Öffentlich (Bauherr)' : 'Öffentlich (AG)'],
                      ['An', historyDetail.meta?.email || '–'],
                      ['Status', '✓ Erfolgreich gesendet'],
                    ].map(([k,v]) => (
                      <div key={k} style={{ display:'flex', gap:12, paddingBottom:8, borderBottom:`0.5px solid ${G.border}`, marginBottom:8 }}>
                        <p style={{ fontSize:12, color:G.muted, fontWeight:600, minWidth:60, margin:0 }}>{k}</p>
                        <p style={{ fontSize:12, color:G.text, fontWeight: k === 'Status' ? 700 : 400, margin:0 }}>{v}</p>
                      </div>
                    ))}
                    {(historyDetail.meta?.link_oeff || historyDetail.meta?.link_intern) && (
                      <div style={{ marginTop:12 }}>
                        <p style={{ fontSize:11, color:G.muted, fontWeight:700, textTransform:'uppercase', margin:'0 0 8px' }}>PDF Links</p>
                        {historyDetail.meta?.link_oeff && (
                          <a href={historyDetail.meta.link_oeff} target="_blank" rel="noreferrer"
                            style={{ display:'block', background:'#fef2f2', border:`0.5px solid ${G.accentBorder}`, borderRadius:8, padding:'10px 12px', marginBottom:6, textDecoration:'none', color:G.accent, fontSize:12, fontWeight:600 }}>
                            📄 Öffentliches Protokoll herunterladen
                          </a>
                        )}
                        {historyDetail.meta?.link_intern && (
                          <a href={historyDetail.meta.link_intern} target="_blank" rel="noreferrer"
                            style={{ display:'block', background:'#fff5f5', border:'0.5px solid #fca5a5', borderRadius:8, padding:'10px 12px', textDecoration:'none', color:'#7f1d1d', fontSize:12, fontWeight:600 }}>
                            🔒 Internes Protokoll herunterladen
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {viewMode === 'intern' && (
          <div>
            {/* Export Buttons */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:14 }}>
              <button onClick={() => exportPDF('intern')}
                style={{ background:'#f9fafb', border:`0.5px solid ${G.border}`, borderRadius:10, padding:'10px', display:'flex', alignItems:'center', justifyContent:'center', gap:6, fontSize:12, fontWeight:600, color:G.text, cursor:'pointer' }}>
                📄 PDF Vorschau
              </button>
              <button onClick={() => exportWord('intern')}
                style={{ background:'#f9fafb', border:`0.5px solid ${G.border}`, borderRadius:10, padding:'10px', display:'flex', alignItems:'center', justifyContent:'center', gap:6, fontSize:12, fontWeight:600, color:G.text, cursor:'pointer' }}>
                📝 Word Export
              </button>
            </div>

            {/* Protokoll Header */}
            <div style={{ background:'#fff', border:`0.5px solid ${G.border}`, borderRadius:12, padding:16, marginBottom:12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:12, paddingBottom:12, borderBottom:`0.5px solid ${G.border}` }}>
                <div>
                  <p style={{ fontSize:16, fontWeight:800, color:G.red, margin:'0 0 4px' }}>Internes Protokoll</p>
                  <p style={{ fontSize:12, color:G.muted, margin:0 }}>Vertraulich · Nur für interne Zwecke</p>
                </div>
                <div style={{ textAlign:'right' }}>
                  <p style={{ fontSize:11, color:G.muted, margin:'0 0 4px' }}>{formatDate(begehung.datum)}</p>
                  {begehung.gesamtnote && <NoteCircle n={begehung.gesamtnote} size={32} />}
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                {[
                  ['Auftraggeber', begehung.auftraggeber_firma || begehung.auftraggeber_name],
                  ['Bauherr', begehung.kunde_name || '–'],
                  ['Sachverständiger', begehung.sachverstaendiger],
                  ['Adresse', begehung.adresse],
                ].map(([k,v]) => (
                  <div key={k} style={{ background:'#f9fafb', borderRadius:8, padding:'8px 10px' }}>
                    <p style={{ fontSize:10, fontWeight:700, color:G.muted, textTransform:'uppercase', margin:'0 0 2px' }}>{k}</p>
                    <p style={{ fontSize:12, fontWeight:600, color:G.text, margin:0 }}>{v || '–'}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Prüfpunkte mit Bearbeitung */}
            {punkte.map((p, i) => {
              const key = p.id + '_intern'
              const isEditing = editMode[key]
              const displayText = getEditedText(p, 'intern')
              return (
                <div key={p.id} style={{ background:'#fff', border:`0.5px solid ${p.note >= 4 ? '#fca5a5' : G.border}`, borderRadius:12, padding:14, marginBottom:10, ...(p.note >= 4 ? { background:'#fff5f5' } : {}) }}>
                  <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:10 }}>
                    <NoteCircle n={p.note} size={34} />
                    <div style={{ flex:1 }}>
                      <p style={{ fontWeight:700, fontSize:14, margin:'0 0 2px' }}>{i+1}. {p.titel}</p>
                      <span style={{ fontSize:11, padding:'2px 8px', borderRadius:6, background:NOTEN.find(n=>n.n===p.note)?.bg, color:NOTEN.find(n=>n.n===p.note)?.color, fontWeight:600 }}>{p.status}</span>
                    </div>
                    <button onClick={() => toggleEdit(p, 'intern')}
                      style={{ background:'#f9fafb', border:`0.5px solid ${G.border}`, borderRadius:7, padding:'5px 10px', fontSize:11, fontWeight:600, color:G.muted, cursor:'pointer', flexShrink:0 }}>
                      {isEditing ? '✕ Abbrechen' : '✏️ Bearbeiten'}
                    </button>
                  </div>
                  {p.fotos?.filter(f=>f.url).map((f, j) => (
                    <img key={j} src={f.url} alt="" style={{ width:'100%', borderRadius:8, marginBottom:8, maxHeight:200, objectFit:'cover' }} />
                  ))}
                  {p.rohtext && <p style={{ fontSize:11, color:G.muted, fontStyle:'italic', margin:'0 0 6px' }}>Rohnotiz: {p.rohtext}</p>}
                  {isEditing ? (
                    <div>
                      <textarea value={editTexts[key] ?? displayText}
                        onChange={e => setEditTexts(t => ({ ...t, [key]: e.target.value }))}
                        style={{ width:'100%', minHeight:100, fontSize:13, lineHeight:1.7, border:`1px solid ${G.red}`, borderRadius:8, padding:'10px 12px', color:G.text, background:'#fff', resize:'vertical', outline:'none', boxSizing:'border-box' }} />
                      <button onClick={() => saveEditedText(p, 'intern')}
                        style={{ background:G.red, color:'#fff', border:'none', borderRadius:8, padding:'8px 16px', fontSize:12, fontWeight:700, cursor:'pointer', marginTop:6 }}>
                        ✓ Speichern
                      </button>
                    </div>
                  ) : (
                    <p style={{ fontSize:13, color:G.text, lineHeight:1.7, margin:0 }}>{displayText || '–'}</p>
                  )}
                  {p.fotos?.[0]?.analyse && !isEditing && (
                    <div style={{ marginTop:8, padding:'8px 12px', background:'rgba(245,158,11,0.08)', borderRadius:8, borderLeft:`3px solid ${G.accent}` }}>
                      <p style={{ fontSize:10, color:G.accent, fontWeight:700, margin:'0 0 2px' }}>KI-Bildanalyse</p>
                      <p style={{ fontSize:11, color:G.muted, margin:0 }}>{p.fotos[0].analyse}</p>
                    </div>
                  )}
                </div>
              )
            })}

            {/* Versand Button */}
            <div style={{ marginTop:16 }}>
              <button onClick={() => setShowPreview('ag_beide')}
                style={{ background:G.accent, color:'#fff', border:'none', borderRadius:10, padding:'13px', display:'flex', alignItems:'center', justifyContent:'center', gap:8, fontSize:13, fontWeight:700, cursor:'pointer', width:'100%' }}>
                👁 Vorschau & Beide Protokolle an AG senden
              </button>
            </div>
          </div>
        )}
      </div>

      <PreviewModal />
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

// ─── AGB ──────────────────────────────────────────────────────
function AGBPage({ setPage }) {
  return (
    <div style={{ paddingBottom:100 }}>
      <div style={{ background:G.accent, padding:'14px 16px', display:'flex', alignItems:'center', gap:10 }}>
        <button onClick={() => setPage('impressum')} style={{ background:'rgba(255,255,255,0.2)', border:'none', color:'#fff', borderRadius:8, width:32, height:32, fontSize:18, cursor:'pointer', flexShrink:0 }}>←</button>
        <p style={{ color:'#fff', fontSize:16, fontWeight:800, margin:0 }}>Allgemeine Geschäftsbedingungen</p>
      </div>
      <div style={{ padding:20 }}>

        <div style={{ background:'#fff', border:`0.5px solid ${G.border}`, borderRadius:12, padding:18, marginBottom:14 }}>
          <p style={{ fontSize:12, color:G.muted, margin:'0 0 16px' }}>Stand: März 2026 · „pi2" d.o.o., Gračanica, Bosnien und Herzegowina</p>

          {[
            ['§ 1 Geltungsbereich', `Diese Allgemeinen Geschäftsbedingungen (AGB) gelten für die Nutzung der SaaS-Plattform „Bauherrenhilfe" (nachfolgend „Plattform"), die von der „pi2" d.o.o., Donja Lohinja, Centar bb, 75320 Gračanica, Bosnien und Herzegowina (nachfolgend „Anbieter") betrieben wird. Mit der Registrierung und Nutzung der Plattform akzeptiert der Nutzer diese AGB.`],
            ['§ 2 Leistungsbeschreibung', `Die Plattform ermöglicht registrierten Sachverständigen und Baufachleuten die digitale Erstellung, Verwaltung und den Versand von Baustellenprüfprotokollen. Der Anbieter stellt die technische Infrastruktur zur Verfügung. Die fachliche Verantwortung für die erstellten Protokolle und Gutachten liegt ausschließlich beim jeweiligen Nutzer.`],
            ['§ 3 Registrierung und Nutzerkonto', `Die Nutzung der Plattform setzt eine Registrierung mit vollständigen und wahrheitsgemäßen Angaben voraus. Der Nutzer ist für die Sicherheit seiner Zugangsdaten verantwortlich. Eine Weitergabe der Zugangsdaten an Dritte ist nicht gestattet. Der Anbieter behält sich das Recht vor, Nutzerkonten bei Verstoß gegen diese AGB zu sperren oder zu löschen.`],
            ['§ 4 Abonnement und Preise', `Die Nutzung der Plattform erfolgt auf Basis monatlicher Abonnements. Die aktuellen Preise und Leistungsumfänge sind im jeweiligen Nutzerkonto einsehbar. Der Anbieter behält sich das Recht vor, Preise mit einer Ankündigungsfrist von 30 Tagen anzupassen. Bei Preiserhöhungen hat der Nutzer das Recht zur außerordentlichen Kündigung.`],
            ['§ 5 Zahlungsbedingungen', `Abonnementgebühren werden monatlich im Voraus fällig. Die Zahlung erfolgt über den vom Anbieter bereitgestellten Zahlungsdienstleister. Bei Zahlungsverzug behält sich der Anbieter vor, den Zugang zur Plattform zu sperren.`],
            ['§ 6 Kündigung', `Das Abonnement kann vom Nutzer jederzeit zum Ende des laufenden Abrechnungszeitraums gekündigt werden. Die Kündigung erfolgt über die Plattform unter „Profil → Account löschen" oder per E-Mail an office@pi-2.eu. Nach der Kündigung werden alle Nutzerdaten innerhalb von 30 Tagen gelöscht.`],
            ['§ 7 Datenschutz', `Die Verarbeitung personenbezogener Daten erfolgt gemäß der Datenschutzerklärung des Anbieters und in Übereinstimmung mit der DSGVO. Die Datenschutzerklärung ist unter „Profil → Impressum & Datenschutz" abrufbar.`],
            ['§ 8 Haftungsbeschränkung', `Der Anbieter haftet nicht für die inhaltliche Richtigkeit der durch Nutzer erstellten Protokolle und Gutachten. Die Plattform wird als technisches Hilfsmittel bereitgestellt. Der Anbieter haftet nur bei Vorsatz und grober Fahrlässigkeit. Die Haftung für leichte Fahrlässigkeit ist ausgeschlossen, soweit keine wesentlichen Vertragspflichten verletzt werden.`],
            ['§ 9 Verfügbarkeit', `Der Anbieter bemüht sich um eine hohe Verfügbarkeit der Plattform, garantiert jedoch keine ununterbrochene Verfügbarkeit. Wartungsarbeiten werden nach Möglichkeit vorab angekündigt. Ein Anspruch auf Verfügbarkeit besteht nicht.`],
            ['§ 10 Änderungen der AGB', `Der Anbieter behält sich das Recht vor, diese AGB mit einer Ankündigungsfrist von 30 Tagen zu ändern. Änderungen werden dem Nutzer per E-Mail mitgeteilt. Widerspricht der Nutzer nicht innerhalb von 30 Tagen, gelten die neuen AGB als akzeptiert.`],
            ['§ 11 Anwendbares Recht und Gerichtsstand', `Es gilt das Recht von Bosnien und Herzegowina. Gerichtsstand ist Gračanica, Bosnien und Herzegowina. Für Verbraucher gelten die zwingenden Verbraucherschutzvorschriften des jeweiligen Wohnsitzlandes.`],
            ['§ 12 Kontakt', `Bei Fragen zu diesen AGB wenden Sie sich an: „pi2" d.o.o. · office@pi-2.eu · Donja Lohinja, Centar bb, 75320 Gračanica, BiH`],
          ].map(([title, text]) => (
            <div key={title} style={{ marginBottom:16, paddingBottom:16, borderBottom:`0.5px solid ${G.border}` }}>
              <p style={{ fontSize:13, fontWeight:700, color:G.accent, margin:'0 0 6px' }}>{title}</p>
              <p style={{ fontSize:12, color:G.text, lineHeight:1.7, margin:0 }}>{text}</p>
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}

// ─── Impressum & Datenschutz ─────────────────────────────────
function ImpressumPage({ setPage }) {
  return (
    <div style={{ paddingBottom:100 }}>
      <div style={{ background:G.accent, padding:'14px 16px', display:'flex', alignItems:'center', gap:10 }}>
        <button onClick={() => setPage('profil')} style={{ background:'rgba(255,255,255,0.2)', border:'none', color:'#fff', borderRadius:8, width:32, height:32, fontSize:18, cursor:'pointer', flexShrink:0 }}>←</button>
        <p style={{ color:'#fff', fontSize:16, fontWeight:800, margin:0 }}>Impressum & Datenschutz</p>
      </div>
      <div style={{ padding:20 }}>

        {/* Impressum */}
        <div style={{ background:'#fff', border:`0.5px solid ${G.border}`, borderRadius:12, padding:18, marginBottom:14 }}>
          <p style={{ fontSize:13, fontWeight:700, color:G.accent, textTransform:'uppercase', letterSpacing:'.5px', margin:'0 0 12px' }}>Impressum</p>
          {[
            ['Betreiber', '"pi2" d.o.o.'],
            ['Geschäftsführerin', 'Mevlija Šestan'],
            ['Adresse', 'Donja Lohinja, Centar bb, 75320 Gračanica, Bosnien und Herzegowina'],
            ['JIB', '4210486660006'],
            ['MBS', '32-01-0009-22'],
            ['E-Mail', 'office@pi-2.eu'],
            ['Plattform', 'Bauherrenhilfe · bauherrenhilfe.at'],
          ].map(([k,v]) => (
            <div key={k} style={{ display:'flex', gap:12, paddingBottom:8, borderBottom:`0.5px solid ${G.border}`, marginBottom:8 }}>
              <p style={{ fontSize:12, color:G.muted, fontWeight:600, margin:0, minWidth:120, flexShrink:0 }}>{k}</p>
              <p style={{ fontSize:12, color:G.text, margin:0 }}>{v}</p>
            </div>
          ))}
        </div>

        {/* Datenschutz */}
        <div style={{ background:'#fff', border:`0.5px solid ${G.border}`, borderRadius:12, padding:18, marginBottom:14 }}>
          <p style={{ fontSize:13, fontWeight:700, color:G.accent, textTransform:'uppercase', letterSpacing:'.5px', margin:'0 0 12px' }}>Datenschutzerklärung</p>
          {[
            ['Verantwortlicher', '"pi2" d.o.o., Gračanica, Bosnien und Herzegowina · office@pi-2.eu'],
            ['Zweck der Verarbeitung', 'Durchführung und Dokumentation von Baustellenprüfungen, Erstellung und Versand von Protokollen'],
            ['Verarbeitete Daten', 'Name, E-Mail-Adresse, Firmendaten, Projektdaten, Fotos von Baustellen'],
            ['Rechtsgrundlage', 'Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung)'],
            ['Auftragsverarbeiter', 'Supabase Inc. (Datenspeicherung), Twilio SendGrid (E-Mail-Versand), Anthropic PBC (KI-Analyse)'],
            ['Datenspeicherung', 'Daten werden auf Servern der EU-Region gespeichert'],
            ['Speicherdauer', 'Daten werden gespeichert solange der Account aktiv ist. Nach Kündigung werden Daten innerhalb von 30 Tagen gelöscht.'],
            ['Ihre Rechte', 'Auskunft, Berichtigung, Löschung, Einschränkung, Widerspruch – Anfragen an office@pi-2.eu'],
          ].map(([k,v]) => (
            <div key={k} style={{ paddingBottom:10, borderBottom:`0.5px solid ${G.border}`, marginBottom:10 }}>
              <p style={{ fontSize:11, fontWeight:700, color:G.muted, textTransform:'uppercase', margin:'0 0 3px' }}>{k}</p>
              <p style={{ fontSize:12, color:G.text, margin:0, lineHeight:1.6 }}>{v}</p>
            </div>
          ))}
        </div>

        {/* AGB */}
        <div style={{ background:'#fff', border:`0.5px solid ${G.border}`, borderRadius:12, padding:18, marginBottom:14 }}>
          <button onClick={() => setPage('agb')}
            style={{ width:'100%', background:'#f9fafb', border:`0.5px solid ${G.border}`, borderRadius:9, padding:'11px', fontSize:13, fontWeight:600, color:G.text, cursor:'pointer' }}>
            📄 Allgemeine Geschäftsbedingungen (AGB)
          </button>
        </div>

        {/* Haftungsausschluss */}
        <div style={{ background:'#fff', border:`0.5px solid ${G.border}`, borderRadius:12, padding:18 }}>
          <p style={{ fontSize:13, fontWeight:700, color:G.accent, textTransform:'uppercase', letterSpacing:'.5px', margin:'0 0 12px' }}>Haftungsausschluss</p>
          <p style={{ fontSize:12, color:G.text, lineHeight:1.7, margin:0 }}>
            Die durch die App erstellten Protokolle und Gutachten dienen der Dokumentation und Information. 
            "pi2" d.o.o. übernimmt keine Haftung für die Richtigkeit der durch Nutzer eingegebenen Daten. 
            Die fachliche Verantwortung für die Inhalte der Prüfprotokolle liegt beim jeweiligen Sachverständigen.
          </p>
        </div>

      </div>
    </div>
  )
}

// ─── Nutzer Einladen ─────────────────────────────────────────
function TeamPage({ user, profile, setPage }) {
  const [members, setMembers] = useState([])
  const [invitations, setInvitations] = useState([])
  const [loading, setLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('gutachter')
  const [sending, setSending] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const companyId = profile?.company_id
    if (!companyId) { setLoading(false); return }
    const [mRes, iRes] = await Promise.all([
      sb.from('profiles').select('id, full_name, firma, role, telefon').eq('company_id', companyId),
      sb.from('invitations').select('*').eq('company_id', companyId).eq('used', false).order('created_at', { ascending: false }),
    ])
    setMembers(mRes.data || [])
    setInvitations(iRes.data || [])
    setLoading(false)
  }

  async function sendInvite() {
    if (!inviteEmail.trim()) { toast.error('E-Mail Pflicht'); return }
    setSending(true)
    const token = crypto.randomUUID().replace(/-/g, '')
    const { error } = await sb.from('invitations').insert({
      company_id: profile.company_id,
      email: inviteEmail.trim().toLowerCase(),
      token,
      role: inviteRole,
      invited_by: user.id,
    })
    if (error) { toast.error(error.message); setSending(false); return }

    // Send invite email
    const inviteLink = window.location.origin + '?invite=' + token
    const res = await fetch('/api/send-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: inviteEmail.trim(),
        inviterName: profile.full_name || 'Ihr Team',
        companyName: profile.firma || 'Bauherrenhilfe',
        inviteLink,
      }),
    })
    if (!res.ok) { toast.error('E-Mail konnte nicht gesendet werden'); setSending(false); return }
    toast.success('Einladung gesendet!')
    setInviteEmail('')
    setSending(false)
    load()
  }

  async function revokeInvite(id) {
    await sb.from('invitations').delete().eq('id', id)
    setInvitations(prev => prev.filter(i => i.id !== id))
    toast.success('Einladung widerrufen')
  }

  const plan = profile?.plan || 'trial'
  const maxUsers = { trial:1, s:3, m:10, l:50 }[plan] || 1

  return (
    <div style={{ paddingBottom:100 }}>
      <div style={{ background:G.accent, padding:'14px 16px', display:'flex', alignItems:'center', gap:10 }}>
        <button onClick={() => setPage('profil')} style={{ background:'rgba(255,255,255,0.2)', border:'none', color:'#fff', borderRadius:8, width:32, height:32, fontSize:18, cursor:'pointer', flexShrink:0 }}>←</button>
        <div>
          <p style={{ color:'#fff', fontSize:16, fontWeight:800, margin:0 }}>Team verwalten</p>
          <p style={{ color:'rgba(255,255,255,0.7)', fontSize:11, margin:'2px 0 0' }}>{profile?.firma} · {members.length}/{maxUsers} Nutzer</p>
        </div>
      </div>

      <div style={{ padding:16 }}>
        {/* Aktive Nutzer */}
        <div style={{ background:'#fff', border:`0.5px solid ${G.border}`, borderRadius:12, padding:16, marginBottom:12 }}>
          <p style={{ fontSize:11, fontWeight:700, color:G.muted, textTransform:'uppercase', margin:'0 0 10px' }}>Aktive Nutzer</p>
          {loading ? <p style={{ color:G.muted, fontSize:13 }}>Lädt…</p> : members.map(m => (
            <div key={m.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:`0.5px solid ${G.border}` }}>
              <div style={{ width:36, height:36, borderRadius:'50%', background:G.accentLight, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:14, color:G.accent, flexShrink:0 }}>
                {(m.full_name || '?')[0].toUpperCase()}
              </div>
              <div style={{ flex:1 }}>
                <p style={{ fontSize:13, fontWeight:600, color:G.text, margin:0 }}>{m.full_name || '–'}</p>
                <p style={{ fontSize:11, color:G.muted, margin:0 }}>{m.role || 'gutachter'}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Einladen */}
        {members.length < maxUsers ? (
          <div style={{ background:'#fff', border:`0.5px solid ${G.border}`, borderRadius:12, padding:16, marginBottom:12 }}>
            <p style={{ fontSize:11, fontWeight:700, color:G.muted, textTransform:'uppercase', margin:'0 0 10px' }}>Neuen Nutzer einladen</p>
            <label style={lbl}>E-Mail Adresse *</label>
            <input style={inp} value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="sv@beispiel.at" type="email" />
            <label style={lbl}>Rolle</label>
            <select style={inp} value={inviteRole} onChange={e => setInviteRole(e.target.value)}>
              <option value="gutachter">Sachverständiger</option>
              <option value="admin">Admin</option>
            </select>
            <button onClick={sendInvite} disabled={sending}
              style={{ width:'100%', background:G.accent, border:'none', borderRadius:9, padding:'12px', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', marginTop:8, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
              {sending ? <span className="spinner"/> : '✉️'} Einladung senden
            </button>
          </div>
        ) : (
          <div style={{ background:G.accentLight, border:`0.5px solid ${G.accentBorder}`, borderRadius:12, padding:16, marginBottom:12 }}>
            <p style={{ fontSize:13, fontWeight:700, color:G.accent, margin:'0 0 4px' }}>Nutzerlimit erreicht</p>
            <p style={{ fontSize:12, color:G.muted, margin:0 }}>Ihr Paket erlaubt max. {maxUsers} Nutzer. Upgrade für mehr Nutzer.</p>
          </div>
        )}

        {/* Offene Einladungen */}
        {invitations.length > 0 && (
          <div style={{ background:'#fff', border:`0.5px solid ${G.border}`, borderRadius:12, padding:16 }}>
            <p style={{ fontSize:11, fontWeight:700, color:G.muted, textTransform:'uppercase', margin:'0 0 10px' }}>Offene Einladungen</p>
            {invitations.map(inv => (
              <div key={inv.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:`0.5px solid ${G.border}` }}>
                <div style={{ flex:1 }}>
                  <p style={{ fontSize:13, color:G.text, margin:0 }}>{inv.email}</p>
                  <p style={{ fontSize:10, color:G.muted, margin:0 }}>Gültig bis {new Date(inv.expires_at).toLocaleDateString('de-AT')}</p>
                </div>
                <button onClick={() => revokeInvite(inv.id)}
                  style={{ background:'#fef2f2', border:`0.5px solid ${G.accentBorder}`, borderRadius:7, padding:'5px 10px', fontSize:11, color:G.accent, cursor:'pointer' }}>
                  Widerrufen
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Profil / Einstellungen ──────────────────────────────────
function ProfilSettings({ user, profile, onUpdate, onLogout, onSetPage }) {
  const [editMode, setEditMode] = useState(false)
  const [form, setForm] = useState({
    full_name: profile?.full_name || '',
    firma: profile?.firma || '',
    uid_nummer: profile?.uid_nummer || '',
    telefon: profile?.telefon || '',
    firma_adresse: profile?.firma_adresse || '',
  })
  const [stempelPreview, setStempelPreview] = useState(profile?.stempel_url || null)
  const [cropMode, setCropMode] = useState(false)
  const [cropImg, setCropImg] = useState(null)
  const [cropData, setCropData] = useState({ x:0, y:0, w:1, h:1 }) // normalized 0-1
  const [stempelSize, setStempelSize] = useState(60) // mm on PDF
  const [rotation, setRotation] = useState(0)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef()
  const canvasRef = useRef()
  const cropCanvasRef = useRef()
  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function saveProfile() {
    setSaving(true)
    const { error } = await sb.from('profiles').update(form).eq('id', user.id)
    if (error) { toast.error(error.message); setSaving(false); return }
    onUpdate(form)
    setEditMode(false)
    toast.success('Profil gespeichert!')
    setSaving(false)
  }

  function handleStempelUpload(file) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = e => {
      setCropImg(e.target.result)
      setCropMode(true)
      setRotation(0)
    }
    reader.readAsDataURL(file)
  }

  function applyAndSave() {
    const img = new Image()
    img.onload = async () => {
      const canvas = document.createElement('canvas')
      const size = 400
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d')
      ctx.save()
      ctx.translate(size/2, size/2)
      ctx.rotate(rotation * Math.PI / 180)
      ctx.translate(-size/2, -size/2)
      // Draw cropped region
      const sx = cropData.x * img.width
      const sy = cropData.y * img.height
      const sw = cropData.w * img.width
      const sh = cropData.h * img.height
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size)
      ctx.restore()
      canvas.toBlob(async (blob) => {
        setSaving(true)
        // Preview
        const previewUrl = URL.createObjectURL(blob)
        setStempelPreview(previewUrl)
        setCropMode(false)
        // Upload
        const { data: stProf } = await sb.from('profiles').select('company_id').eq('id', user.id).maybeSingle()
        const stFolder = stProf?.company_id ? stProf.company_id + '/' + user.id : user.id
        const path = stFolder + '/stempel.png'
        const buffer = await blob.arrayBuffer()
        const { error } = await sb.storage.from('bhh-photos').upload(path, buffer, { contentType: 'image/png', upsert: true })
        if (error) { toast.error(error.message); setSaving(false); return }
        const { data } = sb.storage.from('bhh-photos').getPublicUrl(path)
        const url = data?.publicUrl + '?t=' + Date.now()
        await sb.from('profiles').update({ stempel_url: url, stempel_size_mm: stempelSize }).eq('id', user.id)
        onUpdate({ stempel_url: url, stempel_size_mm: stempelSize })
        setStempelPreview(url)
        setSaving(false)
        toast.success('Stempel gespeichert!')
      }, 'image/png')
    }
    img.src = cropImg
  }

  return (
    <div style={{ paddingBottom:100 }}>
      {/* Header */}
      <div style={{ background:G.accent, padding:'14px 16px', display:'flex', alignItems:'center', gap:12 }}>
        <div style={{ width:42, height:42, borderRadius:'50%', background:'rgba(255,255,255,0.25)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:16, color:'#fff', flexShrink:0 }}>
          {(profile?.full_name || user?.email || 'U')[0].toUpperCase()}
        </div>
        <div>
          <p style={{ color:'#fff', fontSize:15, fontWeight:700, margin:0 }}>{profile?.full_name || user?.email}</p>
          <p style={{ color:'rgba(255,255,255,0.7)', fontSize:11, margin:'2px 0 0' }}>{user?.email}</p>
        </div>
      </div>

      <div style={{ padding:16 }}>
        {/* Firmendaten */}
        <div style={{ background:'#fff', border:`0.5px solid ${G.border}`, borderRadius:12, padding:16, marginBottom:12 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
            <p style={{ fontSize:11, fontWeight:700, color:G.muted, textTransform:'uppercase', margin:0 }}>Firmendaten</p>
            <button onClick={() => setEditMode(!editMode)}
              style={{ background: editMode ? '#f9fafb' : G.accentLight, border:`0.5px solid ${editMode ? G.border : G.accentBorder}`, borderRadius:7, padding:'5px 12px', fontSize:12, fontWeight:600, color: editMode ? G.muted : G.accent, cursor:'pointer' }}>
              {editMode ? '✕ Abbrechen' : '✏️ Bearbeiten'}
            </button>
          </div>

          {editMode ? (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {[
                ['full_name','Name *','Vor- und Nachname'],
                ['firma','Firma *','Firmenname'],
                ['uid_nummer','UID-Nummer','ATU12345678'],
                ['telefon','Telefon','+43 676 460 1097'],
                ['firma_adresse','Firmenadresse','Straße, PLZ Ort'],
              ].map(([k,label,ph]) => (
                <div key={k}>
                  <label style={lbl}>{label}</label>
                  <input style={inp} value={form[k]} onChange={e => upd(k, e.target.value)} placeholder={ph} />
                </div>
              ))}
              <button onClick={saveProfile} disabled={saving}
                style={{ background:G.accent, border:'none', borderRadius:9, padding:'12px', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', marginTop:4, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                {saving ? <span className="spinner"/> : null} Speichern
              </button>
            </div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
              {[
                ['Name', profile?.full_name],
                ['Firma', profile?.firma],
                ['UID', profile?.uid_nummer],
                ['Telefon', profile?.telefon],
                ['Adresse', profile?.firma_adresse],
                ['E-Mail', user?.email],
              ].map(([k,v]) => (
                <div key={k} style={{ background:'#f9fafb', borderRadius:8, padding:'8px 10px' }}>
                  <p style={{ fontSize:10, fontWeight:700, color:G.muted, textTransform:'uppercase', margin:'0 0 2px' }}>{k}</p>
                  <p style={{ fontSize:12, fontWeight:600, color:G.text, margin:0 }}>{v || '–'}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stempel Upload + Crop */}
        <div style={{ background:'#fff', border:`0.5px solid ${G.border}`, borderRadius:12, padding:16, marginBottom:12 }}>
          <p style={{ fontSize:11, fontWeight:700, color:G.muted, textTransform:'uppercase', margin:'0 0 4px' }}>Stempel & Unterschrift</p>
          <p style={{ fontSize:12, color:G.muted, margin:'0 0 12px' }}>Wird auf allen PDFs angezeigt. PNG mit transparentem Hintergrund empfohlen.</p>
          <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e => handleStempelUpload(e.target.files[0])} />

          {cropMode && cropImg ? (
            <div>
              {/* Crop Preview */}
              <div style={{ background:'#f0f0f0', borderRadius:10, padding:10, marginBottom:10, textAlign:'center', position:'relative' }}>
                <img src={cropImg} alt="crop"
                  style={{ maxWidth:'100%', maxHeight:220, objectFit:'contain', display:'block', margin:'0 auto',
                    transform: `rotate(${rotation}deg)`,
                    transition:'transform .2s' }} />
              </div>
              {/* Rotation */}
              <div style={{ marginBottom:10 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                  <p style={{ fontSize:11, fontWeight:600, color:G.text, margin:0 }}>Drehen</p>
                  <p style={{ fontSize:11, color:G.muted, margin:0 }}>{rotation}°</p>
                </div>
                <input type="range" min="-180" max="180" step="1" value={rotation}
                  onChange={e => setRotation(+e.target.value)}
                  style={{ width:'100%' }} />
                <div style={{ display:'flex', gap:6, marginTop:6 }}>
                  {[-90, 0, 90].map(r => (
                    <button key={r} onClick={() => setRotation(r)}
                      style={{ flex:1, background:'#f9fafb', border:`0.5px solid ${G.border}`, borderRadius:7, padding:'6px', fontSize:11, cursor:'pointer', fontWeight: rotation===r ? 700 : 400, color: rotation===r ? G.accent : G.text }}>
                      {r === -90 ? '↺ -90°' : r === 0 ? '0°' : '↻ +90°'}
                    </button>
                  ))}
                </div>
              </div>
              {/* Size */}
              <div style={{ marginBottom:12 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                  <p style={{ fontSize:11, fontWeight:600, color:G.text, margin:0 }}>Größe auf PDF</p>
                  <p style={{ fontSize:11, color:G.muted, margin:0 }}>{stempelSize} mm</p>
                </div>
                <input type="range" min="30" max="100" step="5" value={stempelSize}
                  onChange={e => setStempelSize(+e.target.value)}
                  style={{ width:'100%' }} />
              </div>
              {/* Buttons */}
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={() => setCropMode(false)}
                  style={{ flex:1, background:'#f9fafb', border:`0.5px solid ${G.border}`, borderRadius:9, padding:'10px', fontSize:12, fontWeight:600, color:G.muted, cursor:'pointer' }}>
                  Abbrechen
                </button>
                <button onClick={applyAndSave} disabled={saving}
                  style={{ flex:2, background:G.accent, border:'none', borderRadius:9, padding:'10px', fontSize:12, fontWeight:700, color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                  {saving ? <span className="spinner"/> : '✓'} Speichern
                </button>
              </div>
            </div>
          ) : (
            <div>
              {stempelPreview && (
                <div style={{ background:'#f9fafb', borderRadius:10, padding:12, marginBottom:10, border:`0.5px solid ${G.border}`, textAlign:'center' }}>
                  <img src={stempelPreview} alt="Stempel"
                    style={{ maxWidth:'100%', maxHeight:100, objectFit:'contain', display:'block', margin:'0 auto' }} />
                  <p style={{ fontSize:10, color:G.muted, margin:'6px 0 0' }}>Größe auf PDF: {profile?.stempel_size_mm || stempelSize} mm</p>
                </div>
              )}
              {!stempelPreview && (
                <div onClick={() => fileRef.current?.click()}
                  style={{ border:`1.5px dashed ${G.border}`, borderRadius:10, padding:20, textAlign:'center', cursor:'pointer', marginBottom:10, background:'#f9fafb' }}>
                  <p style={{ fontSize:13, color:G.muted, margin:0 }}>Bild auswählen</p>
                  <p style={{ fontSize:11, color:G.muted, margin:'3px 0 0' }}>PNG empfohlen · transparenter Hintergrund</p>
                </div>
              )}
              <button onClick={() => fileRef.current?.click()}
                style={{ width:'100%', background:'#f9fafb', border:`0.5px solid ${G.border}`, borderRadius:9, padding:'10px', fontSize:12, fontWeight:600, color:G.text, cursor:'pointer' }}>
                {stempelPreview ? '↺ Neues Bild hochladen' : 'Bild wählen'}
              </button>
            </div>
          )}
        </div>

        {/* Team */}
        <div style={{ background:'#fff', border:`0.5px solid ${G.border}`, borderRadius:12, padding:16, marginBottom:12 }}>
          <button onClick={() => onSetPage('team')}
            style={{ width:'100%', background:'#f9fafb', border:`0.5px solid ${G.border}`, borderRadius:9, padding:'11px', fontSize:13, fontWeight:600, color:G.text, cursor:'pointer' }}>
            👥 Team verwalten & Nutzer einladen
          </button>
        </div>

        {/* Impressum & Datenschutz */}
        <div style={{ background:'#fff', border:`0.5px solid ${G.border}`, borderRadius:12, padding:16, marginBottom:12 }}>
          <button onClick={() => onSetPage('impressum')}
            style={{ width:'100%', background:'#f9fafb', border:`0.5px solid ${G.border}`, borderRadius:9, padding:'11px', fontSize:13, fontWeight:600, color:G.text, cursor:'pointer' }}>
            📋 Impressum & Datenschutz
          </button>
        </div>

        {/* Konto */}
        <div style={{ background:'#fff5f5', border:`0.5px solid #fca5a5`, borderRadius:12, padding:16 }}>
          <p style={{ fontSize:11, fontWeight:700, color:G.muted, textTransform:'uppercase', margin:'0 0 10px' }}>Konto</p>
          <button onClick={onLogout}
            style={{ width:'100%', background:'#fef2f2', border:`0.5px solid #fca5a5`, borderRadius:9, padding:'11px', fontSize:13, fontWeight:700, color:G.red, cursor:'pointer', marginBottom:8 }}>
            Abmelden
          </button>
          <button onClick={async () => {
            if (!window.confirm('Account wirklich löschen? Alle Daten werden unwiderruflich gelöscht.')) return
            if (!window.confirm('Letzte Bestätigung: Account und alle Daten löschen?')) return
            await sb.from('begehungen').delete().eq('user_id', user.id)
            await sb.from('profiles').delete().eq('id', user.id)
            await sb.auth.signOut()
            onLogout()
          }}
            style={{ width:'100%', background:'transparent', border:`0.5px solid #fca5a5`, borderRadius:9, padding:'11px', fontSize:12, fontWeight:600, color:G.muted, cursor:'pointer' }}>
            Account löschen
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Projekte ────────────────────────────────────────────────
function Projekte({ setPage, isSuperAdmin, userId }) {
  const [projekte, setProjekte] = useState([])
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [form, setForm] = useState({ name:'', adresse:'', auftraggeber:'' })
  const [filterMonat, setFilterMonat] = useState('')
  const [filterFirma, setFilterFirma] = useState('')
  const MONTHS = ['Jänner','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']

  useEffect(() => { fetchProjekte() }, [isSuperAdmin])

  async function fetchProjekte() {
    setLoading(true)
    if (isSuperAdmin) {
      const [pRes, prRes] = await Promise.all([
        sb.from('projekte').select('*, begehungen(count), profiles(full_name, firma)').order('created_at', { ascending:false }),
        sb.from('profiles').select('id, full_name, firma'),
      ])
      setProjekte(pRes.data || [])
      setProfiles(prRes.data || [])
    } else {
      const { data } = await sb.from('projekte').select('*, begehungen(count)').order('created_at', { ascending:false })
      setProjekte(data || [])
    }
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

  // Filter
  const firmen = [...new Set(profiles.map(p => p.firma).filter(Boolean))]
  const filtered = projekte.filter(p => {
    if (filterFirma && p.profiles?.firma !== filterFirma) return false
    if (filterMonat) {
      const d = new Date(p.created_at)
      if (d.getMonth() !== +filterMonat) return false
    }
    return true
  })

  return (
    <div style={{ paddingBottom:100 }}>
      {/* Header */}
      <div style={{ background:G.accent, padding:'14px 16px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <p style={{ color:'#fff', fontSize:17, fontWeight:800, margin:0 }}>Projekte</p>
        <button onClick={() => setShowNew(true)}
          style={{ background:'rgba(255,255,255,0.2)', border:'none', color:'#fff', borderRadius:8, padding:'7px 14px', fontSize:13, fontWeight:700, cursor:'pointer' }}>
          + Neu
        </button>
      </div>

      <div style={{ padding:16 }}>
        {/* Superadmin Filter */}
        {isSuperAdmin && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:14 }}>
            <div>
              <label style={lbl}>Monat</label>
              <select style={inp} value={filterMonat} onChange={e => setFilterMonat(e.target.value)}>
                <option value=''>Alle Monate</option>
                {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Firma / Ersteller</label>
              <select style={inp} value={filterFirma} onChange={e => setFilterFirma(e.target.value)}>
                <option value=''>Alle Firmen</option>
                {firmen.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          </div>
        )}

        {showNew && (
          <div style={{ background:'#fff', border:`0.5px solid ${G.border}`, borderRadius:12, padding:16, marginBottom:14 }}>
            <label style={lbl}>Projektname *</label>
            <input style={inp} value={form.name} onChange={e => setForm(f => ({ ...f, name:e.target.value }))} placeholder="Bauvorhaben EFH Graz" autoFocus />
            <label style={lbl}>Adresse</label>
            <input style={inp} value={form.adresse} onChange={e => setForm(f => ({ ...f, adresse:e.target.value }))} placeholder="Musterstraße 1, 8010 Graz" />
            <label style={lbl}>Auftraggeber</label>
            <input style={inp} value={form.auftraggeber} onChange={e => setForm(f => ({ ...f, auftraggeber:e.target.value }))} placeholder="Name / Firma" />
            <div style={{ display:'flex', gap:8, marginTop:14 }}>
              <button onClick={() => setShowNew(false)}
                style={{ flex:1, background:'#f9fafb', border:`0.5px solid ${G.border}`, borderRadius:9, padding:'11px', fontSize:13, fontWeight:600, color:G.muted, cursor:'pointer' }}>
                Abbrechen
              </button>
              <button onClick={handleCreate}
                style={{ flex:2, background:G.accent, border:'none', borderRadius:9, padding:'11px', fontSize:13, fontWeight:700, color:'#fff', cursor:'pointer' }}>
                ✓ Anlegen
              </button>
            </div>
          </div>
        )}

        {loading ? <div style={{ textAlign:'center', padding:60, color:G.muted }}>Lädt…</div>
        : filtered.length === 0 ? (
          <div style={{ textAlign:'center', padding:60 }}>
            <p style={{ fontSize:32, marginBottom:8 }}>📁</p>
            <p style={{ color:G.muted }}>Keine Projekte gefunden</p>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {filtered.map(p => (
              <div key={p.id} style={{ background:'#fff', border:`0.5px solid ${G.border}`, borderRadius:12, padding:14 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontWeight:700, fontSize:14, margin:'0 0 3px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</p>
                    {p.adresse && <p style={{ fontSize:12, color:G.muted, margin:0 }}>{p.adresse}</p>}
                  </div>
                  <span style={{ fontSize:11, background:G.accentLight, color:G.accent, borderRadius:7, padding:'3px 9px', fontWeight:700, flexShrink:0, marginLeft:8 }}>
                    {p.begehungen?.[0]?.count || 0} Beg.
                  </span>
                </div>
                {p.auftraggeber && <p style={{ fontSize:11, color:G.muted, margin:'2px 0 0' }}>AG: {p.auftraggeber}</p>}
                {isSuperAdmin && p.profiles && (
                  <p style={{ fontSize:11, color:G.accent, margin:'4px 0 0', fontWeight:600 }}>
                    {p.profiles.firma || p.profiles.full_name}
                  </p>
                )}
                <p style={{ fontSize:10, color:G.muted, margin:'3px 0 0' }}>{formatDate(p.created_at)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Admin Panel ─────────────────────────────────────────────
function AdminPanel() {
  const now = new Date()
  const [adminTab, setAdminTab] = useState('abrechnung')
  const [selMonth, setSelMonth] = useState(now.getMonth())
  const [selYear, setSelYear]   = useState(now.getFullYear())
  const [profiles, setProfiles] = useState([])
  const [begehungen, setBegehungen] = useState([])
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  const MONTHS = ['Jänner','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']
  const YEARS = [2025, 2026, 2027]
  const PLANS = { trial:'Trial', s:'Paket S', m:'Paket M', l:'Paket L' }
  const PLAN_LIMITS = {
    trial: { max_begehungen: 10, max_users: 1 },
    s:     { max_begehungen: 20, max_users: 3 },
    m:     { max_begehungen: 75, max_users: 10 },
    l:     { max_begehungen: 999, max_users: 50 },
  }
  const [editingPlan, setEditingPlan] = useState(null) // company id being edited

  async function changePlan(companyId, newPlan) {
    const limits = PLAN_LIMITS[newPlan]
    // Update company
    await sb.from('companies').update({
      plan: newPlan,
      max_begehungen: limits.max_begehungen,
      max_users: limits.max_users,
    }).eq('id', companyId)
    // Upsert subscription
    const { data: existing } = await sb.from('company_subscriptions').select('id').eq('company_id', companyId).maybeSingle()
    if (existing) {
      await sb.from('company_subscriptions').update({ plan_id: newPlan, status: 'active' }).eq('company_id', companyId)
    } else {
      await sb.from('company_subscriptions').insert({ company_id: companyId, plan_id: newPlan, status: 'active' })
    }
    setCompanies(prev => prev.map(c => c.id === companyId ? { ...c, plan: newPlan, max_begehungen: limits.max_begehungen, max_users: limits.max_users, company_subscriptions: [{ plan_id: newPlan, status: 'active' }] } : c))
    setEditingPlan(null)
    toast.success('Plan geändert auf ' + PLANS[newPlan])
  }

  useEffect(() => {
    async function load() {
      const [bRes, pRes, cRes, uRes] = await Promise.all([
        sb.from('begehungen').select('id, titel, user_id, datum, status, auftraggeber_firma, auftraggeber_name').order('datum', { ascending:false }),
        sb.from('profiles').select('id, full_name, firma, uid_nummer, firma_adresse, telefon, email:id'),
        sb.from('companies').select('*, company_subscriptions(plan_id, status)').order('created_at', { ascending:false }),
        sb.from('usage_events').select('company_id, event_type, created_at').order('created_at', { ascending:false }),
      ])
      setBegehungen(bRes.data || [])
      setProfiles(pRes.data || [])
      setCompanies(cRes.data || [])
      // Usage Events in companies einbauen
      const usageData = uRes.data || []
      setCompanies(prev => (cRes.data || []).map(c => ({
        ...c,
        _begehungen_monat: usageData.filter(u => u.company_id === c.id && u.event_type === 'begehung_erstellt' && new Date(u.created_at).getMonth() === new Date().getMonth()).length,
        _ki_monat: usageData.filter(u => u.company_id === c.id && u.event_type === 'ki_analyse' && new Date(u.created_at).getMonth() === new Date().getMonth()).length,
        _versendet_monat: usageData.filter(u => u.company_id === c.id && u.event_type === 'protokoll_versendet' && new Date(u.created_at).getMonth() === new Date().getMonth()).length,
      })))
      setLoading(false)
    }
    load()
  }, [])

  // Begehungen für gewählten Monat/Jahr filtern
  const filtered = begehungen.filter(b => {
    if (!b.datum) return false
    const d = new Date(b.datum)
    return d.getMonth() === selMonth && d.getFullYear() === selYear
  })

  // Profile-Map
  const profileMap = {}
  for (const p of profiles) profileMap[p.id] = p

  // Immer nach auftraggeber_firma gruppieren
  // Gruppieren nach SV-Firma – nur Begehungen mit bekanntem Profil
  const byCompany = {}
  for (const b of filtered) {
    const profile = profileMap[b.user_id]
    if (!profile?.firma) continue  // kein bekanntes Profil → überspringen
    const svFirma = profile.firma
    if (!byCompany[svFirma]) byCompany[svFirma] = { firma: svFirma, user_id: b.user_id, profile, list: [] }
    byCompany[svFirma].list.push(b)
  }

  const rows = Object.values(byCompany).map(entry => ({
    profile: entry.profile,
    firma: entry.firma,
    count: entry.list.length,
  })).sort((a, b) => b.count - a.count)

  function exportAbrechnungWord() {
    const monat = MONTHS[selMonth] + ' ' + selYear
    const rowsHtml = rows.map((r, i) =>
      '<tr style="border-bottom:1px solid #e5e7eb;">'
      + '<td style="padding:10px 12px;font-weight:600;">' + (i+1) + '.</td>'
      + '<td style="padding:10px 12px;">' + (r.profile.firma || '–') + '</td>'
      + '<td style="padding:10px 12px;">' + (r.profile.full_name || '–') + '</td>'
      + '<td style="padding:10px 12px;">' + (r.profile.uid_nummer || '–') + '</td>'
      + '<td style="padding:10px 12px;font-weight:700;color:#cc1f1f;text-align:center;">' + r.count + '</td>'
      + '</tr>'
    ).join('')
    const html = '<!DOCTYPE html><html><head><meta charset="utf-8">'
      + '<style>body{font-family:Arial,sans-serif;max-width:800px;margin:0 auto;padding:20px;}'
      + 'table{width:100%;border-collapse:collapse;}th{background:#cc1f1f;color:#fff;padding:10px 12px;text-align:left;font-size:12px;}'
      + '</style></head><body>'
      + '<h1 style="color:#cc1f1f;font-size:22px;margin:0 0 4px;">Abrechnungsliste</h1>'
      + '<p style="color:#6b7280;font-size:13px;margin:0 0 20px;">' + monat + ' · Bauherrenhilfe</p>'
      + '<table><thead><tr><th>#</th><th>Firma</th><th>Name</th><th>UID</th><th style="text-align:center;">Begehungen</th></tr></thead>'
      + '<tbody>' + rowsHtml + '</tbody>'
      + '<tfoot><tr><td colspan="4" style="padding:12px;font-weight:700;">Gesamt</td><td style="padding:12px;font-weight:800;color:#cc1f1f;text-align:center;">' + filtered.length + '</td></tr></tfoot>'
      + '</table>'
      + '<p style="font-size:10px;color:#9ca3af;margin-top:20px;">Erstellt: ' + new Date().toLocaleDateString('de-AT') + ' · Bauherrenhilfe</p>'
      + '</body></html>'
    const blob = new Blob(['﻿' + html], { type: 'application/msword' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'Abrechnung_' + MONTHS[selMonth] + '_' + selYear + '.doc'
    a.click()
    URL.revokeObjectURL(url)
  }

  async function sendMonthlyReport() {
    setSending(true)
    try {
      const monat = MONTHS[selMonth] + ' ' + selYear
      await fetch('/api/monthly-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: rows.map(r => ({ firma: r.profile.firma, name: r.profile.full_name, uid: r.profile.uid_nummer, count: r.count })), monat, total: filtered.length }),
      })
      toast.success('Abrechnungsliste per E-Mail versendet!')
    } catch { toast.error('Versand fehlgeschlagen') }
    setSending(false)
  }

  if (loading) return <div style={{ padding:60, textAlign:'center', color:G.muted }}>Lädt…</div>

  const companyBegehungen = (companyId) => begehungen.filter(b => {
    const p = profiles.find(p => p.id === b.user_id)
    return p?.company_id === companyId || companies.find(c => c.id === companyId)
  }).length

  return (
    <div style={{ paddingBottom:100 }}>
      <div style={{ background:G.accent, padding:'14px 16px 0' }}>
        <p style={{ color:'rgba(255,255,255,0.7)', fontSize:11, margin:'0 0 2px' }}>Superadmin</p>
        <p style={{ color:'#fff', fontSize:17, fontWeight:800, margin:'0 0 12px' }}>Admin Panel</p>
        <div style={{ display:'flex', gap:0, overflowX:'auto', borderTop:'1px solid rgba(255,255,255,0.2)' }}>
          {[['abrechnung','Abrechnung'],['companies','Firmen'],['nutzer','Nutzer']].map(([id,label]) => (
            <button key={id} onClick={() => setAdminTab(id)}
              style={{ padding:'10px 18px', border:'none', background:'transparent', color: adminTab===id ? '#fff' : 'rgba(255,255,255,0.6)', fontWeight: adminTab===id ? 700 : 400, fontSize:13, cursor:'pointer', borderBottom: adminTab===id ? '2px solid #fff' : '2px solid transparent', whiteSpace:'nowrap', flexShrink:0 }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding:20 }}>

      {/* ── Firmen Tab ── */}
      {adminTab === 'companies' && (
        <div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
            <div style={{ background:G.accentLight, border:`0.5px solid ${G.accentBorder}`, borderRadius:12, padding:14, textAlign:'center' }}>
              <p style={{ fontSize:26, fontWeight:800, color:G.accent, margin:0 }}>{companies.length}</p>
              <p style={{ fontSize:10, color:G.muted, fontWeight:700, textTransform:'uppercase', margin:'2px 0 0' }}>Firmen gesamt</p>
            </div>
            <div style={{ background:G.greenLight, border:`0.5px solid #86efac`, borderRadius:12, padding:14, textAlign:'center' }}>
              <p style={{ fontSize:26, fontWeight:800, color:G.green, margin:0 }}>{companies.filter(c => c.company_subscriptions?.[0]?.status === 'active' && c.plan !== 'trial').length}</p>
              <p style={{ fontSize:10, color:G.muted, fontWeight:700, textTransform:'uppercase', margin:'2px 0 0' }}>Zahlende Kunden</p>
            </div>
          </div>

          {companies.map(c => {
            const plan = c.company_subscriptions?.[0]?.plan_id || c.plan || 'trial'
            const userCount = profiles.filter(p => p.company_id === c.id).length
            const begCount = begehungen.filter(b => {
              const p = profiles.find(p => p.id === b.user_id)
              return p?.company_id === c.id
            }).length
            return (
              <div key={c.id} style={{ background:'#fff', border:`0.5px solid ${G.border}`, borderRadius:12, padding:14, marginBottom:10 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                  <div style={{ flex:1 }}>
                    <p style={{ fontWeight:700, fontSize:14, margin:'0 0 2px' }}>{c.name}</p>
                    <p style={{ fontSize:11, color:G.muted, margin:0 }}>{c.email} {c.uid_nummer ? '· ' + c.uid_nummer : ''}</p>
                  </div>
                  {editingPlan === c.id ? (
                    <div style={{ display:'flex', gap:4, flexWrap:'wrap', justifyContent:'flex-end' }}>
                      {Object.entries(PLANS).map(([key, label]) => (
                        <button key={key} onClick={() => changePlan(c.id, key)}
                          style={{ fontSize:10, fontWeight:700, background: key === plan ? G.accent : '#f3f4f6', color: key === plan ? '#fff' : G.muted, border:'none', borderRadius:5, padding:'4px 8px', cursor:'pointer' }}>
                          {label}
                        </button>
                      ))}
                      <button onClick={() => setEditingPlan(null)}
                        style={{ fontSize:10, background:'transparent', border:'none', color:G.muted, cursor:'pointer' }}>✕</button>
                    </div>
                  ) : (
                    <span onClick={() => setEditingPlan(c.id)}
                      style={{ fontSize:11, fontWeight:700, background: plan === 'trial' ? '#f3f4f6' : G.accentLight, color: plan === 'trial' ? G.muted : G.accent, borderRadius:6, padding:'3px 9px', flexShrink:0, cursor:'pointer', userSelect:'none' }}
                      title="Klicken zum Ändern">
                      {PLANS[plan] || plan} ✏️
                    </span>
                  )}
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:6 }}>
                  {[
                    ['Nutzer', userCount],
                    ['Beg. Monat', c._begehungen_monat || begCount],
                    ['KI Monat', c._ki_monat || 0],
                    ['Versendet', c._versendet_monat || 0],
                    ['Max Beg.', c.max_begehungen || 10]
                  ].map(([k,v]) => (
                    <div key={k} style={{ background:'#f9fafb', borderRadius:7, padding:'6px 4px', textAlign:'center' }}>
                      <p style={{ fontSize:14, fontWeight:800, color:G.text, margin:0 }}>{v}</p>
                      <p style={{ fontSize:8, color:G.muted, textTransform:'uppercase', margin:0 }}>{k}</p>
                    </div>
                  ))}
                </div>
                {c.adresse && <p style={{ fontSize:11, color:G.muted, margin:'8px 0 0' }}>{c.adresse}</p>}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Nutzer Tab ── */}
      {adminTab === 'nutzer' && (
        <div>
          <p style={{ fontSize:11, fontWeight:700, color:G.muted, textTransform:'uppercase', margin:'0 0 12px' }}>{profiles.length} registrierte Nutzer</p>
          {profiles.map(p => (
            <div key={p.id} style={{ background:'#fff', border:`0.5px solid ${G.border}`, borderRadius:12, padding:14, marginBottom:8 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div>
                  <p style={{ fontWeight:700, fontSize:13, margin:'0 0 2px' }}>{p.full_name || '–'}</p>
                  <p style={{ fontSize:11, color:G.muted, margin:0 }}>{p.firma || '–'}</p>
                </div>
                <span style={{ fontSize:11, fontWeight:700, background: p.role === 'superadmin' ? G.accentLight : '#f3f4f6', color: p.role === 'superadmin' ? G.accent : G.muted, borderRadius:6, padding:'3px 9px' }}>
                  {p.role || 'gutachter'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {adminTab === 'abrechnung' && <div>
        {/* Monat/Jahr Auswahl */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
          <div>
            <label style={lbl}>Monat</label>
            <select style={inp} value={selMonth} onChange={e => setSelMonth(+e.target.value)}>
              {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Jahr</label>
            <select style={inp} value={selYear} onChange={e => setSelYear(+e.target.value)}>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        {/* Summary Card */}
        <div style={{ background:G.accentLight, border:`0.5px solid ${G.accentBorder}`, borderRadius:12, padding:16, marginBottom:16, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <p style={{ fontSize:12, color:G.muted, margin:'0 0 2px' }}>{MONTHS[selMonth]} {selYear}</p>
            <p style={{ fontSize:26, fontWeight:800, color:G.accent, margin:0 }}>{filtered.length}</p>
            <p style={{ fontSize:11, color:G.muted, margin:0 }}>Begehungen · {rows.length} Firmen</p>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <button onClick={exportAbrechnungWord}
              style={{ background:'#fff', border:`0.5px solid ${G.border}`, borderRadius:9, padding:'9px 14px', fontSize:12, fontWeight:600, color:G.text, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
              📝 Word Export
            </button>
            <button onClick={sendMonthlyReport} disabled={sending}
              style={{ background:G.accent, border:'none', borderRadius:9, padding:'9px 14px', fontSize:12, fontWeight:700, color:'#fff', cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
              {sending ? <span className="spinner"/> : '📧'} Per E-Mail senden
            </button>
          </div>
        </div>

        {/* Firmen-Tabelle */}
        {rows.length === 0 ? (
          <div style={{ textAlign:'center', padding:40 }}>
            <p style={{ fontSize:32, marginBottom:8 }}>📋</p>
            <p style={{ color:G.muted, fontSize:13 }}>Keine Begehungen in diesem Monat</p>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {rows.map((r, i) => (
              <div key={i} style={{ background:'#fff', border:`0.5px solid ${G.border}`, borderRadius:12, padding:14 }}>
                <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{ width:36, height:36, borderRadius:9, background:G.accentLight, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:15, color:G.accent, flexShrink:0 }}>
                    {r.count}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <p style={{ fontWeight:700, fontSize:14, margin:'0 0 2px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{r.profile.firma || '–'}</p>
                    <p style={{ fontSize:11, color:G.muted, margin:0 }}>{r.profile.full_name} {r.profile.uid_nummer ? '· ' + r.profile.uid_nummer : ''}</p>
                  </div>
                  <span style={{ fontSize:11, fontWeight:700, color:G.accent, background:G.accentLight, borderRadius:6, padding:'3px 9px', flexShrink:0 }}>
                    {r.count} Beg.
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Alle Nutzer */}
        <div style={{ marginTop:24 }}>
          <p style={{ fontSize:11, fontWeight:700, color:G.muted, textTransform:'uppercase', letterSpacing:'.5px', marginBottom:10 }}>Alle registrierten Firmen</p>
          {profiles.map(p => (
            <div key={p.id} style={{ background:'#fff', border:`0.5px solid ${G.border}`, borderRadius:10, padding:12, marginBottom:8 }}>
              <p style={{ fontWeight:600, fontSize:13, margin:'0 0 2px' }}>{p.firma || '–'}</p>
              <p style={{ fontSize:11, color:G.muted, margin:0 }}>{p.full_name} {p.uid_nummer ? '· ' + p.uid_nummer : ''} {p.telefon ? '· ' + p.telefon : ''}</p>
              {p.firma_adresse && <p style={{ fontSize:11, color:G.muted, margin:'2px 0 0' }}>{p.firma_adresse}</p>}
            </div>
          ))}
        </div>
      </div>}

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
  const [showOnboarding, setShowOnboarding] = useState(false)

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
    const role = (await sb.from('profiles').select('role,company_id').eq('id', u.id).single()).data
    const isSA = role?.role === 'superadmin'
    const [bRes, prjRes, profileRes] = await Promise.all([
      isSA
        ? sb.from('begehungen').select('*').order('created_at', { ascending:false })
        : sb.from('begehungen').select('*').eq('company_id', role?.company_id).order('created_at', { ascending:false }),
      sb.from('projekte').select('count', { count:'exact', head:true }),
      sb.from('profiles').select('*').eq('id', u.id).single(),
    ])
    if (profileRes.data) {
      setProfile(profileRes.data)
      if (!profileRes.data.onboarding_complete) setShowOnboarding(true)
    } else {
      setShowOnboarding(true)
    }
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

  const role = profile?.role || user?.user_metadata?.role || ''
  const isAdmin = role === 'admin' || role === 'superadmin'
  const isSuperAdmin = role === 'superadmin'

  if (loading) return (
    <div style={{ height:'100dvh', display:'flex', alignItems:'center', justifyContent:'center', background:'#f8f8f8' }}>
      <div style={{ textAlign:'center' }}>
        <img src='/logo.png' alt='BHH' style={{ width:80, marginBottom:12 }} />
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
      case 'dashboard':      return <Dashboard user={user} profile={profile} setPage={setPage} stats={stats} setSelectedBegehung={setSelectedBegehung} isSuperAdmin={isSuperAdmin} role={role} />
      case 'begehungen':     return <BegehungenListe setPage={setPage} setSelectedBegehung={setSelectedBegehung} begehungen={begehungen} loading={false} onDelete={id => setBegehungen(prev => prev.filter(b => b.id !== id))} />
      case 'neueBegehung':   return <NeueBegehung user={user} profile={profile} setPage={setPage} onCreated={handleBegehungCreated} />
      case 'begehungDetail': return selectedBegehung ? <BegehungDetail begehung={selectedBegehung} setPage={setPage} user={user} /> : null
      case 'projekte':       return <Projekte setPage={setPage} isSuperAdmin={isSuperAdmin} userId={user?.id} />
      case 'profil':         return <ProfilSettings user={user} profile={profile} onUpdate={data => setProfile(p => ({...p, ...data}))} onLogout={async () => { await sb.auth.signOut(); setUser(null); setProfile(null); }} onSetPage={setPage} />
      case 'impressum':      return <ImpressumPage setPage={setPage} />
      case 'agb':            return <AGBPage setPage={setPage} />
      case 'team':           return <TeamPage user={user} profile={profile} setPage={setPage} />
      case 'admin':          return <AdminPanel />
      default:               return <Dashboard user={user} profile={profile} setPage={setPage} stats={stats} setSelectedBegehung={setSelectedBegehung} isSuperAdmin={isSuperAdmin} role={role} />
    }
  }

  return (
    <div style={{ background:G.bg, minHeight:'100dvh', color:G.text }}>
      <style>{css}</style>
      {renderPage()}
      {page !== 'neueBegehung' && page !== 'begehungDetail' && (
        <BottomNav page={page} setPage={setPage} isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} />
      )}
      {showOnboarding && user && (
        <OnboardingModal user={user} onComplete={data => {
          setProfile(p => ({ ...p, ...data }))
          setShowOnboarding(false)
        }} />
      )}
    </div>
  )
}

// ─── Mount ───────────────────────────────────────────────────
createRoot(document.getElementById('root')).render(
  <>
    <App />
    <Toaster position="top-center" toastOptions={{ style: { background:'#fff', color:'#111', border:'0.5px solid #e5e7eb', fontSize:13, borderRadius:10 } }} />
  </>
)
