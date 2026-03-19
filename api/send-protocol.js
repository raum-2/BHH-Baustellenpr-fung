export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { begehung, recipient, pdfOeff, pdfIntern } = req.body
  const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY
  const FROM_EMAIL = process.env.FROM_EMAIL || 'ferid.m@gesetz.at'

  const agEmail = begehung.auftraggeber_email
  const bauherrEmail = begehung.kunde_email
  const titel = begehung.titel || 'Baustellenprüfung'

  function buildBody(type) {
    const isOeff = type === 'oeffentlich'
    return '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">'
      + '<div style="background:#cc1f1f;padding:20px;border-radius:8px 8px 0 0;">'
      + '<h2 style="color:#fff;margin:0 0 4px;">' + (isOeff ? 'Baustellenprüfprotokoll' : 'Internes Protokoll') + '</h2>'
      + '<p style="color:rgba(255,255,255,0.8);font-size:13px;margin:0;">' + titel + '</p>'
      + '</div>'
      + '<div style="padding:20px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">'
      + '<p style="font-size:14px;color:#374151;">Sehr geehrte Damen und Herren,</p>'
      + '<p style="font-size:14px;color:#374151;">anbei übermitteln wir Ihnen das ' + (isOeff ? 'Baustellenprüfprotokoll' : 'interne Protokoll') + ' als PDF-Anhang.</p>'
      + '<table style="width:100%;font-size:13px;border-collapse:collapse;margin:16px 0;">'
      + '<tr><td style="color:#6b7280;padding:4px 0;width:140px;">Bauvorhaben</td><td style="font-weight:600;">' + (begehung.titel || '–') + '</td></tr>'
      + '<tr><td style="color:#6b7280;padding:4px 0;">Adresse</td><td style="font-weight:600;">' + (begehung.adresse || '–') + '</td></tr>'
      + '<tr><td style="color:#6b7280;padding:4px 0;">Auftraggeber</td><td style="font-weight:600;">' + (begehung.auftraggeber_firma || begehung.auftraggeber_name || '–') + '</td></tr>'
      + '<tr><td style="color:#6b7280;padding:4px 0;">Sachverständiger</td><td style="font-weight:600;">' + (begehung.sachverstaendiger || '–') + '</td></tr>'
      + '</table>'
      + '<p style="font-size:13px;color:#6b7280;">Mit freundlichen Grüßen<br><strong>' + (begehung.sachverstaendiger || 'Bauherrenhilfe') + '</strong><br>Bauherrenhilfe · bauherrenhilfe.at</p>'
      + '</div></div>'
  }

  async function sendMail(to, subject, html, attachments) {
    const body = {
      personalizations: [{ to: [{ email: to }] }],
      from: { email: FROM_EMAIL, name: 'Bauherrenhilfe' },
      subject,
      content: [{ type: 'text/html', value: html }],
    }
    if (attachments && attachments.length) body.attachments = attachments
    const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + SENDGRID_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!r.ok) {
      const err = await r.text()
      throw new Error('SendGrid: ' + err)
    }
  }

  try {
    const safeTitle = (titel || 'Protokoll').replace(/[^a-zA-Z0-9_-]/g, '_')

    if (recipient === 'ag_beide') {
      if (!agEmail) return res.status(400).json({ error: 'Keine AG E-Mail' })
      const attachments = []
      if (pdfOeff) attachments.push({ content: pdfOeff, filename: 'Protokoll_Oeffentlich_' + safeTitle + '.pdf', type: 'application/pdf', disposition: 'attachment' })
      if (pdfIntern) attachments.push({ content: pdfIntern, filename: 'Protokoll_Intern_' + safeTitle + '.pdf', type: 'application/pdf', disposition: 'attachment' })
      await sendMail(agEmail, 'Baustellenprotokolle – ' + titel, buildBody('oeffentlich'), attachments)

    } else if (recipient === 'ag_oeffentlich') {
      if (!agEmail) return res.status(400).json({ error: 'Keine AG E-Mail' })
      const attachments = pdfOeff ? [{ content: pdfOeff, filename: 'Protokoll_' + safeTitle + '.pdf', type: 'application/pdf', disposition: 'attachment' }] : []
      await sendMail(agEmail, 'Baustellenprotokoll – ' + titel, buildBody('oeffentlich'), attachments)

    } else if (recipient === 'bauherr') {
      if (!bauherrEmail) return res.status(400).json({ error: 'Keine Bauherr E-Mail' })
      const attachments = pdfOeff ? [{ content: pdfOeff, filename: 'Ihr_Protokoll_' + safeTitle + '.pdf', type: 'application/pdf', disposition: 'attachment' }] : []
      await sendMail(bauherrEmail, 'Ihr Baustellenprotokoll – ' + titel, buildBody('oeffentlich'), attachments)

    } else {
      return res.status(400).json({ error: 'Ungültiger recipient' })
    }

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('send-protocol error:', err)
    return res.status(500).json({ error: err.message })
  }
}
