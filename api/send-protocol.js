import sgMail from '@sendgrid/mail'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const { begehung, punkte, type } = req.body
  sgMail.setApiKey(process.env.SENDGRID_API_KEY)

  const isPublic = type === 'oeffentlich'
  const subject  = isPublic
    ? `Begehungsprotokoll – ${begehung.titel} – ${begehung.datum}`
    : `[INTERN] Protokoll – ${begehung.titel} – ${begehung.datum}`

  const to = isPublic
    ? begehung.auftraggeber_email
    : process.env.INTERNAL_EMAIL || 'intern@bauherren-hilfe.at'

  const punkte_html = punkte.map((p, i) => {
    const noteColor = p.note <= 2 ? '#10b981' : p.note <= 3 ? '#f59e0b' : '#ef4444'
    const text = isPublic ? (p.text_oeffentlich || p.rohtext || '–') : (p.text_intern || p.rohtext || '–')
    const fotos = (p.fotos || []).filter(f => f.url).map(f =>
      `<img src="${f.url}" style="width:100%;max-width:400px;border-radius:8px;margin:6px 0;" />`
    ).join('')
    return `
      <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-bottom:14px;background:#fff;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <div style="width:36px;height:36px;border-radius:50%;background:${noteColor}20;border:2px solid ${noteColor};display:flex;align-items:center;justify-content:center;font-weight:800;color:${noteColor};font-size:16px;flex-shrink:0;">${p.note || '–'}</div>
          <div>
            <p style="margin:0;font-weight:700;font-size:15px;">${i+1}. ${p.titel}</p>
            <p style="margin:0;font-size:12px;color:#6b7280;">${p.status || ''}</p>
          </div>
        </div>
        ${fotos}
        <p style="font-size:14px;color:#374151;line-height:1.7;margin-top:8px;">${text}</p>
      </div>`
  }).join('')

  const avgNote = punkte.length > 0 ? Math.round(punkte.reduce((s,p) => s + (p.note||3), 0) / punkte.length) : null
  const noteLabel = avgNote ? ['','Besser als gefordert','Alle Anforderungen erfüllt','Durchschnittlich','Verbesserungsbedarf','Fehlerhaft'][avgNote] : '–'
  const noteColor = avgNote <= 2 ? '#10b981' : avgNote <= 3 ? '#f59e0b' : '#ef4444'

  const html = `
<!DOCTYPE html>
<html lang="de">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:'Segoe UI',sans-serif;">
  <div style="max-width:640px;margin:0 auto;padding:20px;">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1e293b,#0f172a);border-radius:14px;padding:24px;margin-bottom:20px;color:white;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
        <div style="width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#f59e0b,#f97316);display:flex;align-items:center;justify-content:center;font-size:24px;">🏗</div>
        <div>
          <p style="margin:0;font-size:12px;opacity:.6;text-transform:uppercase;letter-spacing:.5px;">${isPublic ? 'Öffentliches Protokoll' : '🔒 Internes Protokoll'}</p>
          <h1 style="margin:0;font-size:20px;font-weight:800;">${begehung.titel}</h1>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:13px;">
        <div><p style="margin:0;opacity:.6;font-size:11px;text-transform:uppercase;">Auftraggeber</p><p style="margin:0;font-weight:600;">${begehung.auftraggeber_name}</p></div>
        <div><p style="margin:0;opacity:.6;font-size:11px;text-transform:uppercase;">Datum</p><p style="margin:0;font-weight:600;">${new Date(begehung.datum).toLocaleDateString('de-AT')}</p></div>
        <div><p style="margin:0;opacity:.6;font-size:11px;text-transform:uppercase;">Sachverständiger</p><p style="margin:0;font-weight:600;">${begehung.sachverstaendiger}</p></div>
        <div><p style="margin:0;opacity:.6;font-size:11px;text-transform:uppercase;">Gewerk</p><p style="margin:0;font-weight:600;">${begehung.gewerk}</p></div>
      </div>
    </div>

    <!-- Gesamtnote -->
    ${avgNote ? `
    <div style="background:${noteColor}15;border:1px solid ${noteColor}40;border-radius:10px;padding:14px 18px;margin-bottom:20px;display:flex;align-items:center;gap:14px;">
      <div style="width:44px;height:44px;border-radius:50%;background:${noteColor}25;border:2px solid ${noteColor};display:flex;align-items:center;justify-content:center;font-weight:800;color:${noteColor};font-size:20px;flex-shrink:0;">${avgNote}</div>
      <div><p style="margin:0;font-weight:700;color:${noteColor};">Gesamtnote: ${avgNote}</p><p style="margin:0;font-size:12px;color:#6b7280;">${noteLabel} · ${punkte.length} Prüfpunkte</p></div>
    </div>` : ''}

    <!-- Prüfpunkte -->
    <h2 style="font-size:16px;font-weight:700;margin-bottom:14px;color:#1e293b;">Prüfpunkte (${punkte.length})</h2>
    ${punkte_html}

    <!-- Footer -->
    <div style="text-align:center;padding:20px;font-size:11px;color:#9ca3af;">
      <p style="margin:0 0 4px;font-weight:700;">Bauherren Hilfe</p>
      <p style="margin:0;">Dieses ${isPublic ? 'Protokoll wurde automatisch generiert' : 'ist ein vertrauliches internes Dokument'}.</p>
      <p style="margin:4px 0 0;">Versanddatum: ${new Date().toLocaleString('de-AT')}</p>
    </div>
  </div>
</body>
</html>`

  try {
    await sgMail.send({ to, from: process.env.FROM_EMAIL || 'noreply@bauherren-hilfe.at', subject, html })
    // Log in DB
    res.status(200).json({ ok: true })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
}
