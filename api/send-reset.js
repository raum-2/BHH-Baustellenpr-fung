import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { email } = req.body
  if (!email) return res.status(400).json({ error: 'E-Mail fehlt' })

  const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY
  const FROM_EMAIL = process.env.FROM_EMAIL || 'ferid.m@gesetz.at'

  try {
    // Check if user exists
    const { data: users } = await sb.auth.admin.listUsers()
    const user = users?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase())
    if (!user) {
      // Don't reveal if user exists - just return success
      return res.status(200).json({ ok: true })
    }

    // Generate token
    const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2) + Date.now().toString(36)

    // Delete old tokens for this email
    await sb.from('password_resets').delete().eq('email', email.toLowerCase())

    // Save new token
    await sb.from('password_resets').insert({
      email: email.toLowerCase(),
      token,
    })

    const resetLink = 'https://bhh-baustellenpr-fung.vercel.app?pwreset=' + token

    // Send email via SendGrid
    const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body style="margin:0;padding:0;background:#f5f5f5;">'
      + '<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px;">'
      + '<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">'
      + '<tr><td bgcolor="#cc1f1f" style="border-radius:8px 8px 0 0;padding:24px 28px;">'
      + '<p style="margin:0;font-family:Arial,sans-serif;font-size:20px;font-weight:bold;color:#fff;">Passwort zurücksetzen</p>'
      + '<p style="margin:4px 0 0;font-family:Arial,sans-serif;font-size:13px;color:rgba(255,255,255,0.85);">Bauherrenhilfe</p>'
      + '</td></tr>'
      + '<tr><td bgcolor="#fff" style="border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;padding:24px 28px;">'
      + '<p style="font-family:Arial,sans-serif;font-size:14px;color:#374151;margin:0 0 12px;">Sie haben eine Anfrage zum Zurücksetzen Ihres Passworts gestellt.</p>'
      + '<table width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;">'
      + '<tr><td align="center" bgcolor="#cc1f1f" style="border-radius:8px;padding:14px 24px;text-align:center;">'
      + '<a href="' + resetLink + '" target="_blank" style="font-family:Arial,sans-serif;font-size:14px;font-weight:bold;color:#fff;text-decoration:none;display:block;text-align:center;">Neues Passwort festlegen →</a>'
      + '</td></tr></table>'
      + '<p style="font-family:Arial,sans-serif;font-size:12px;color:#9ca3af;text-align:center;margin:0 0 16px;">Dieser Link ist 1 Stunde gültig. Falls Sie diese Anfrage nicht gestellt haben, ignorieren Sie diese E-Mail.</p>'
      + '<table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #f3f4f6;">'
      + '<tr><td style="padding-top:16px;font-family:Arial,sans-serif;font-size:12px;color:#6b7280;">'
      + 'Bauherrenhilfe · betrieben von "pi2" d.o.o. · office@pi-2.eu'
      + '</td></tr></table>'
      + '</td></tr></table></td></tr></table></body></html>'

    const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + SENDGRID_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: email }] }],
        from: { email: FROM_EMAIL, name: 'Bauherrenhilfe' },
        subject: 'Bauherrenhilfe – Passwort zurücksetzen',
        content: [{ type: 'text/html', value: html }],
      }),
    })

    if (!r.ok) {
      const err = await r.text()
      throw new Error('SendGrid: ' + err)
    }

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('send-reset error:', err)
    return res.status(500).json({ error: err.message })
  }
}
