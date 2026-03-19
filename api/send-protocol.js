export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { begehung, punkte, recipient } = req.body
  // recipient: 'ag_beide' | 'ag_oeffentlich' | 'bauherr'

  const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY
  const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@bauherrenhilfe.at'

  function formatDate(d) {
    if (!d) return '–'
    return new Date(d).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  function noteLabel(n) {
    const labels = { 1: 'Besser als gefordert', 2: 'Alle Forderungen erfüllt', 3: 'Durchschnittlich', 4: 'Verbesserungsbedarf', 5: 'Fehlerhaft' }
    return labels[n] || '–'
  }

  function noteColor(n) {
    const colors = { 1: '#16a34a', 2: '#2563eb', 3: '#d97706', 4: '#f97316', 5: '#dc2626' }
    return colors[n] || '#6b7280'
  }

  function buildOeffentlichHTML(begehung, punkte) {
    const items = punkte.map((p, i) => `
      <div style="border:1px solid #e5e7eb;border-radius:10px;padding:14px;margin-bottom:12px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <div style="width:36px;height:36px;border-radius:50%;background:${noteColor(p.note)}22;border:2px solid ${noteColor(p.note)};display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:${noteColor(p.note)};flex-shrink:0;">${p.note}</div>
          <div>
            <p style="font-weight:700;font-size:14px;margin:0 0 3px;">${i + 1}. ${p.titel}</p>
            <span style="font-size:11px;background:${noteColor(p.note)}22;color:${noteColor(p.note)};padding:2px 8px;border-radius:6px;font-weight:600;">${p.status || noteLabel(p.note)}</span>
          </div>
        </div>
        ${p.fotos?.filter(f => f.url).slice(0, 2).map(f => `<img src="${f.url}" style="width:100%;max-height:200px;object-fit:cover;border-radius:8px;margin-bottom:8px;" />`).join('') || ''}
        <p style="font-size:13px;color:#374151;line-height:1.7;margin:0;">${p.text_oeffentlich || p.rohtext || '–'}</p>
      </div>
    `).join('')

    return `
    <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#fff;">
      <div style="background:#cc1f1f;padding:24px;border-radius:12px 12px 0 0;">
        <p style="color:#fff;font-size:20px;font-weight:800;margin:0 0 4px;">Baustellenprüfprotokoll</p>
        <p style="color:rgba(255,255,255,0.8);font-size:13px;margin:0;">Öffentliches Protokoll · ${formatDate(begehung.datum)}</p>
      </div>
      <div style="background:#f9fafb;padding:16px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
        <table style="width:100%;font-size:12px;">
          <tr><td style="color:#6b7280;padding:3px 0;width:140px;">Bauvorhaben</td><td style="font-weight:600;color:#111;">${begehung.titel}</td></tr>
          <tr><td style="color:#6b7280;padding:3px 0;">Adresse</td><td style="font-weight:600;color:#111;">${begehung.adresse || '–'}</td></tr>
          <tr><td style="color:#6b7280;padding:3px 0;">Auftraggeber</td><td style="font-weight:600;color:#111;">${begehung.auftraggeber_firma || begehung.auftraggeber_name || '–'}</td></tr>
          <tr><td style="color:#6b7280;padding:3px 0;">Bauherr</td><td style="font-weight:600;color:#111;">${begehung.kunde_name || '–'}</td></tr>
          <tr><td style="color:#6b7280;padding:3px 0;">Sachverständiger</td><td style="font-weight:600;color:#111;">${begehung.sachverstaendiger || '–'}</td></tr>
          <tr><td style="color:#6b7280;padding:3px 0;">Ausbaustufe</td><td style="font-weight:600;color:#111;">${begehung.gewerk || '–'}</td></tr>
        </table>
      </div>
      <div style="padding:16px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
        ${items}
        <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center;">
          Dieses Protokoll wurde automatisch erstellt · Bauherrenhilfe · bauherrenhilfe.at
        </div>
      </div>
    </div>`
  }

  function buildInternHTML(begehung, punkte) {
    const items = punkte.map((p, i) => `
      <div style="border:1px solid ${p.note >= 4 ? '#fca5a5' : '#e5e7eb'};border-radius:10px;padding:14px;margin-bottom:12px;${p.note >= 4 ? 'background:#fff5f5;' : ''}">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
          <div style="width:36px;height:36px;border-radius:50%;background:${noteColor(p.note)}22;border:2px solid ${noteColor(p.note)};display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:${noteColor(p.note)};flex-shrink:0;">${p.note}</div>
          <div>
            <p style="font-weight:700;font-size:14px;margin:0 0 3px;">${i + 1}. ${p.titel}</p>
            <span style="font-size:11px;background:${noteColor(p.note)}22;color:${noteColor(p.note)};padding:2px 8px;border-radius:6px;font-weight:600;">${p.status || noteLabel(p.note)}</span>
          </div>
        </div>
        ${p.fotos?.filter(f => f.url).map(f => `<img src="${f.url}" style="width:100%;max-height:200px;object-fit:cover;border-radius:8px;margin-bottom:8px;" />`).join('') || ''}
        ${p.rohtext ? `<p style="font-size:11px;color:#6b7280;font-style:italic;margin:0 0 6px;">Rohnotiz: ${p.rohtext}</p>` : ''}
        <p style="font-size:13px;color:#374151;line-height:1.7;margin:0;">${p.text_intern || p.rohtext || '–'}</p>
        ${p.fotos?.[0]?.analyse ? `<p style="font-size:11px;color:#6b7280;margin:8px 0 0;padding-top:8px;border-top:1px solid #e5e7eb;">KI-Analyse: ${p.fotos[0].analyse}</p>` : ''}
      </div>
    `).join('')

    return `
    <div style="font-family:Inter,sans-serif;max-width:600px;margin:0 auto;background:#fff;">
      <div style="background:#991515;padding:24px;border-radius:12px 12px 0 0;">
        <p style="color:#fff;font-size:20px;font-weight:800;margin:0 0 4px;">Internes Protokoll</p>
        <p style="color:rgba(255,255,255,0.8);font-size:13px;margin:0;">Vertraulich · Nur für interne Zwecke · ${formatDate(begehung.datum)}</p>
      </div>
      <div style="background:#fff5f5;padding:16px;border-left:1px solid #fca5a5;border-right:1px solid #fca5a5;">
        <table style="width:100%;font-size:12px;">
          <tr><td style="color:#6b7280;padding:3px 0;width:140px;">Bauvorhaben</td><td style="font-weight:600;color:#111;">${begehung.titel}</td></tr>
          <tr><td style="color:#6b7280;padding:3px 0;">Adresse</td><td style="font-weight:600;color:#111;">${begehung.adresse || '–'}</td></tr>
          <tr><td style="color:#6b7280;padding:3px 0;">Auftraggeber</td><td style="font-weight:600;color:#111;">${begehung.auftraggeber_firma || begehung.auftraggeber_name || '–'}</td></tr>
          <tr><td style="color:#6b7280;padding:3px 0;">Bauherr</td><td style="font-weight:600;color:#111;">${begehung.kunde_name || '–'}</td></tr>
          <tr><td style="color:#6b7280;padding:3px 0;">Sachverständiger</td><td style="font-weight:600;color:#111;">${begehung.sachverstaendiger || '–'}</td></tr>
        </table>
      </div>
      <div style="padding:16px;border:1px solid #fca5a5;border-top:none;border-radius:0 0 12px 12px;">
        ${items}
        <div style="margin-top:20px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center;">
          VERTRAULICH · Internes Dokument · Bauherrenhilfe
        </div>
      </div>
    </div>`
  }

  async function sendMail(to, subject, html) {
    const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: FROM_EMAIL, name: 'Bauherrenhilfe' },
        subject,
        content: [{ type: 'text/html', value: html }],
      }),
    })
    if (!r.ok) {
      const err = await r.text()
      throw new Error(`SendGrid: ${err}`)
    }
  }

  try {
    const agEmail = begehung.auftraggeber_email
    const bauherrEmail = begehung.kunde_email
    const titel = begehung.titel || 'Baustellenprüfung'

    if (recipient === 'ag_beide') {
      if (!agEmail) return res.status(400).json({ error: 'Keine AG E-Mail' })
      await sendMail(agEmail, `Öffentliches Protokoll – ${titel}`, buildOeffentlichHTML(begehung, punkte))
      await sendMail(agEmail, `Internes Protokoll – ${titel}`, buildInternHTML(begehung, punkte))
    } else if (recipient === 'ag_oeffentlich') {
      if (!agEmail) return res.status(400).json({ error: 'Keine AG E-Mail' })
      await sendMail(agEmail, `Protokoll – ${titel}`, buildOeffentlichHTML(begehung, punkte))
    } else if (recipient === 'bauherr') {
      if (!bauherrEmail) return res.status(400).json({ error: 'Keine Bauherr E-Mail' })
      await sendMail(bauherrEmail, `Ihr Baustellenprotokoll – ${titel}`, buildOeffentlichHTML(begehung, punkte))
    } else {
      return res.status(400).json({ error: 'Ungültiger recipient' })
    }

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('send-protocol error:', err)
    return res.status(500).json({ error: err.message })
  }
}
