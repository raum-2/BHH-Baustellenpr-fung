// v2 - button spacing fix
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { begehung, recipient, linkOeff, linkIntern } = req.body
  const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY
  const FROM_EMAIL = process.env.FROM_EMAIL || 'ferid.m@gesetz.at'

  const agEmail = begehung.auftraggeber_email
  const bauherrEmail = begehung.kunde_email
  const titel = begehung.titel || 'Baustellenprüfung'

  function btn(url, label, bg) {
    return '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:10px;">'
      + '<tr><td align="center" bgcolor="' + bg + '" style="border-radius:6px;padding:0;">'
      + '<a href="' + url + '" target="_blank" style="display:inline-block;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;padding:13px 24px;border-radius:6px;background-color:' + bg + ';mso-padding-alt:13px 24px;">'
      + '<!--[if mso]><i style="letter-spacing:24px;mso-font-width:-100%;mso-text-raise:30pt">&nbsp;</i><![endif]-->'
      + label
      + '<!--[if mso]><i style="letter-spacing:24px;mso-font-width:-100%">&nbsp;</i><![endif]-->'
      + '</a>'
      + '</td></tr></table>'
  }

  function buildBody({ links }) {
    const dlButtons = links.map(l => btn(l.url, l.label, l.bg)).join('')

    return '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">'
      + '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">'
      + '<head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
      + '<!--[if !mso]><!--><meta http-equiv="X-UA-Compatible" content="IE=edge"><!--<![endif]-->'
      + '<!--[if mso]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->'
      + '</head>'
      + '<body style="margin:0;padding:0;background-color:#f5f5f5;">'
      + '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f5f5;">'
      + '<tr><td align="center" style="padding:20px 10px;">'
      + '<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">'

      // Header
      + '<tr><td bgcolor="#cc1f1f" style="border-radius:8px 8px 0 0;padding:24px 28px;">'
      + '<p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:20px;font-weight:bold;color:#ffffff;">Baustellenprüfprotokoll</p>'
      + '<p style="margin:0;font-family:Arial,sans-serif;font-size:13px;color:rgba(255,255,255,0.85);">' + titel + '</p>'
      + '</td></tr>'

      // Body
      + '<tr><td bgcolor="#ffffff" style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:24px 28px;">'

      // Greeting
      + '<p style="margin:0 0 8px;font-family:Arial,sans-serif;font-size:14px;color:#374151;">Sehr geehrte Damen und Herren,</p>'
      + '<p style="margin:0 0 20px;font-family:Arial,sans-serif;font-size:14px;color:#374151;">anbei finden Sie die Links zu den Protokollen der Baustellenprüfung.</p>'

      // Info table
      + '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;border-collapse:collapse;">'
      + '<tr style="background-color:#f9fafb;"><td style="padding:8px 12px;font-family:Arial,sans-serif;font-size:13px;color:#6b7280;width:140px;">Bauvorhaben</td><td style="padding:8px 12px;font-family:Arial,sans-serif;font-size:13px;font-weight:bold;color:#111111;">' + (begehung.titel||'–') + '</td></tr>'
      + '<tr style="background-color:#ffffff;"><td style="padding:8px 12px;font-family:Arial,sans-serif;font-size:13px;color:#6b7280;">Adresse</td><td style="padding:8px 12px;font-family:Arial,sans-serif;font-size:13px;font-weight:bold;color:#111111;">' + (begehung.adresse||'–') + '</td></tr>'
      + '<tr style="background-color:#f9fafb;"><td style="padding:8px 12px;font-family:Arial,sans-serif;font-size:13px;color:#6b7280;">Auftraggeber</td><td style="padding:8px 12px;font-family:Arial,sans-serif;font-size:13px;font-weight:bold;color:#111111;">' + (begehung.auftraggeber_firma||begehung.auftraggeber_name||'–') + '</td></tr>'
      + '<tr style="background-color:#ffffff;"><td style="padding:8px 12px;font-family:Arial,sans-serif;font-size:13px;color:#6b7280;">Sachverständiger</td><td style="padding:8px 12px;font-family:Arial,sans-serif;font-size:13px;font-weight:bold;color:#111111;">' + (begehung.sachverstaendiger||'–') + '</td></tr>'
      + '</table>'

      // Download buttons
      + (links.length ? dlButtons : '')

      // Signature
      + '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;border-top:1px solid #f3f4f6;">'
      + '<tr><td style="padding-top:16px;font-family:Arial,sans-serif;font-size:13px;color:#6b7280;">'
      + 'Mit freundlichen Grüßen<br>'
      + '<strong style="color:#111111;">' + (begehung.sachverstaendiger||'Bauherrenhilfe') + '</strong><br>'
      + 'Bauherrenhilfe · bauherrenhilfe.at'
      + '</td></tr></table>'

      + '</td></tr>'
      + '</table>'
      + '</td></tr></table>'
      + '</body></html>'
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
      if (linkOeff) links.push({ url: linkOeff, label: 'Protokoll herunterladen', bg: '#cc1f1f' })
      if (linkIntern) links.push({ url: linkIntern, label: 'Internes Protokoll herunterladen', bg: '#7f1d1d' })
      await sendMail(agEmail, 'Baustellenprotokolle – ' + titel, buildBody({ links }))

    } else if (recipient === 'ag_oeffentlich') {
      if (!agEmail) return res.status(400).json({ error: 'Keine AG E-Mail' })
      const links = linkOeff ? [{ url: linkOeff, label: 'Protokoll herunterladen', bg: '#cc1f1f' }] : []
      await sendMail(agEmail, 'Baustellenprotokoll – ' + titel, buildBody({ links }))

    } else if (recipient === 'bauherr') {
      if (!bauherrEmail) return res.status(400).json({ error: 'Keine Bauherr E-Mail' })
      const links = linkOeff ? [{ url: linkOeff, label: 'Ihr Protokoll herunterladen', bg: '#cc1f1f' }] : []
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
