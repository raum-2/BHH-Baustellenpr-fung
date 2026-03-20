import { createClient } from '@supabase/supabase-js'

const sb = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { token, password } = req.body
  if (!token || !password) return res.status(400).json({ error: 'Token und Passwort erforderlich' })
  if (password.length < 8) return res.status(400).json({ error: 'Passwort mindestens 8 Zeichen' })

  try {
    // Verify token
    const { data: reset } = await sb.from('password_resets')
      .select('*').eq('token', token).eq('used', false).single()

    if (!reset) return res.status(400).json({ error: 'Ungültiger oder bereits verwendeter Link' })
    if (new Date(reset.expires_at) < new Date()) return res.status(400).json({ error: 'Link abgelaufen. Bitte neuen Link anfordern.' })

    // Find user by email
    const { data: users } = await sb.auth.admin.listUsers()
    const user = users?.users?.find(u => u.email?.toLowerCase() === reset.email.toLowerCase())
    if (!user) return res.status(400).json({ error: 'Benutzer nicht gefunden' })

    // Update password
    const { error } = await sb.auth.admin.updateUserById(user.id, { password })
    if (error) throw error

    // Mark token as used
    await sb.from('password_resets').update({ used: true }).eq('token', token)

    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('verify-reset error:', err)
    return res.status(500).json({ error: err.message })
  }
}
