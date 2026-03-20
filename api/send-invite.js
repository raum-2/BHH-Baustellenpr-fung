export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { to, inviterName, companyName, inviteLink } = req.body
  const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY
  const FROM_EMAIL = process.env.FROM_EMAIL || 'ferid.m@gesetz.at'

  const html = '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">'
    + '<html><head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8"></head>'
    + '<body style="margin:0;padding:0;background-color:#f5f5f5;">'
    + '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f5f5f5;">'
    + '<tr><td align="center" style="padding:20px 10px;">'
    + '<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">'

    // Header
    + '<tr><td bgcolor="#cc1f1f" style="border-radius:8px 8px 0 0;padding:24px 28px;">'
    + '<p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:20px;font-weight:bold;color:#ffffff;">Sie wurden eingeladen!</p>'
    + '<p style="margin:0;font-family:Arial,sans-serif;font-size:13px;color:rgba(255,255,255,0.85);">' + companyName + ' · Bauherrenhilfe</p>'
    + '</td></tr>'

    // Body
    + '<tr><td bgcolor="#ffffff" style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:24px 28px;">'
    + '<p style="font-family:Arial,sans-serif;font-size:14px;color:#374151;margin:0 0 12px;">Sehr geehrte/r Damen und Herren,</p>'
    + '<p style="font-family:Arial,sans-serif;font-size:14px;color:#374151;margin:0 0 16px;"><strong>' + inviterName + '</strong> hat Sie eingeladen, der Bauherrenhilfe-Plattform beizutreten.</p>'

    // Company box
    + '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;background:#f9fafb;border-radius:8px;">'
    + '<tr><td style="padding:12px 16px;font-family:Arial,sans-serif;font-size:13px;color:#6b7280;">Firma</td>'
    + '<td style="padding:12px 16px;font-family:Arial,sans-serif;font-size:13px;font-weight:bold;color:#111111;">' + companyName + '</td></tr>'
    + '</table>'

    // Button
    + '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">'
    + '<tr><td align="center" bgcolor="#cc1f1f" style="border-radius:8px;padding:14px 24px;text-align:center;">'
    + '<a href="' + inviteLink + '" target="_blank" style="font-family:Arial,sans-serif;font-size:14px;font-weight:bold;color:#ffffff;text-decoration:none;display:block;text-align:center;">Einladung annehmen →</a>'
    + '</td></tr></table>'

    + '<p style="font-family:Arial,sans-serif;font-size:12px;color:#9ca3af;text-align:center;margin:0 0 20px;">Dieser Link ist 7 Tage gültig.</p>'

    // Signature
    + '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #f3f4f6;">'
    + '<tr><td style="padding-top:16px;font-family:Arial,sans-serif;font-size:12px;color:#6b7280;">'
    + 'Mit freundlichen Grüßen<br>'
    + '<strong style="color:#111111;">' + inviterName + '</strong><br>'
    + 'Bauherrenhilfe · bauherrenhilfe.at'
    + '</td></tr></table>'

    + '</td></tr>'
    + '</table>'
    + '</td></tr></table>'
    + '</body></html>'

  try {
    const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + SENDGRID_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: FROM_EMAIL, name: 'Bauherrenhilfe' },
        subject: 'Einladung zu Bauherrenhilfe – ' + companyName,
        content: [{ type: 'text/html', value: html }],
      }),
    })
    if (!r.ok) {
      const err = await r.text()
      throw new Error('SendGrid: ' + err)
    }
    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('send-invite error:', err)
    return res.status(500).json({ error: err.message })
  }
}
