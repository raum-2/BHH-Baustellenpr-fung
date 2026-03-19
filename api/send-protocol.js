export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { begehung, recipient, linkOeff, linkIntern } = req.body
  const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY
  const FROM_EMAIL = process.env.FROM_EMAIL || 'ferid.m@gesetz.at'

  const agEmail = begehung.auftraggeber_email
  const bauherrEmail = begehung.kunde_email
  const titel = begehung.titel || 'Baustellenprüfung'

  function buildBody({ links }) {
    const dlButtons = links.map(l =>
      '<a href="' + l.url + '" style="display:block;background:' + l.bg + ';color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700;font-size:13px;text-align:center;margin-bottom:8px;">' + l.label + '</a>'
    ).join('')

    return '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">'
      + '<div style="background:#cc1f1f;padding:20px;border-radius:8px 8px 0 0;">'
      + '<h2 style="color:#fff;margin:0 0 4px;">Baustellenprüfprotokoll</h2>'
      + '<p style="color:rgba(255,255,255,0.8);font-size:13px;margin:0;">' + titel + '</p>'
      + '</div>'
      + '<div style="padding:20px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">'
      + '<p style="font-size:14px;color:#374151;">Sehr geehrte Damen und Herren,</p>'
      + '<p style="font-size:14px;color:#374151;">anbei finden Sie die Links zu den Protokollen der Baustellenprüfung.</p>'
      + '<table style="width:100%;font-size:13px;border-collapse:collapse;margin:16px 0;background:#f9fafb;border-radius:8px;overflow:hidden;">'
      + '<tr><td style="color:#6b7280;padding:7px 12px;width:140px;">Bauvorhaben</td><td style="font-weight:600;color:#111;padding:7px 12px;">' + (begehung.titel || '–') + '</td></tr>'
      + '<tr style="background:#fff;"><td style="color:#6b7280;padding:7px 12px;">Adresse</td><td style="font-weight:600;color:#111;padding:7px 12px;">' + (begehung.adresse || '–') + '</td></tr>'
      + '<tr><td style="color:#6b7280;padding:7px 12px;">Auftraggeber</td><td style="font-weight:600;color:#111;padding:7px 12px;">' + (begehung.auftraggeber_firma || begehung.auftraggeber_name || '–') + '</td></tr>'
      + '<tr style="background:#fff;"><td style="color:#6b7280;padding:7px 12px;">Sachverständiger</td><td style="font-weight:600;color:#111;padding:7px 12px;">' + (begehung.sachverstaendiger || '–') + '</td></tr>'
      + '</table>'
      + (links.length ? '<div style="margin:20px 0;">' + dlButtons + '</div>' : '')
      + '<p style="font-size:13px;color:#6b7280;margin-top:20px;padding-top:16px;border-top:1px solid #f3f4f6;">Mit freundlichen Grüßen<br><strong style="color:#111;">' + (begehung.sachverstaendiger || 'Bauherrenhilfe') + '</strong><br>Bauherrenhilfe · bauherrenhilfe.at</p>'
      + '</div></div>'
  }

  async function sendMail(to, subject, html) {
    const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + SENDGRID_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: FROM_EMAIL, name: 'Bauherrenhilfe' },
        subject,
        content: [{ type: 'text/html', value: html }],
      }),
    })
    if (!r.ok) {
      const err = await r.text()
      throw new Error('SendGrid: ' + err)
    }
  }

  try {
    if (recipient === 'ag_beide') {
      if (!agEmail) return res.status(400).json({ error: 'Keine AG E-Mail' })
      const links = []
      if (linkOeff) links.push({ url: linkOeff, label: '📄 Protokoll herunterladen', bg: '#cc1f1f' })
      if (linkIntern) links.push({ url: linkIntern, label: '🔒 Internes Protokoll herunterladen', bg: '#7f1d1d' })
      await sendMail(agEmail, 'Baustellenprotokolle – ' + titel, buildBody({ links }))

    } else if (recipient === 'ag_oeffentlich') {
      if (!agEmail) return res.status(400).json({ error: 'Keine AG E-Mail' })
      const links = linkOeff ? [{ url: linkOeff, label: '📄 Protokoll herunterladen', bg: '#cc1f1f' }] : []
      await sendMail(agEmail, 'Baustellenprotokoll – ' + titel, buildBody({ links }))

    } else if (recipient === 'bauherr') {
      if (!bauherrEmail) return res.status(400).json({ error: 'Keine Bauherr E-Mail' })
      const links = linkOeff ? [{ url: linkOeff, label: '📄 Ihr Protokoll herunterladen', bg: '#cc1f1f' }] : []
      await sendMail(bauherrEmail, 'Ihr Baustellenprotokoll – ' + titel, buildBody({ links }))

    } else {
      return res.status(400).json({ error: 'Ungültiger recipient' })
    }

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('send-protocol error:', err)
    return res.status(500).json({ error: err.message })
  }
}
