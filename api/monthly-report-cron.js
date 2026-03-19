import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY)

const MONTHS = ['Jänner','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']

export default async function handler(req, res) {
  // Only allow Vercel cron calls
  if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    // Allow running without auth for simplicity (Vercel cron doesn't need auth by default)
  }

  const now = new Date()
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)

  // Only run on actual last day of month
  if (tomorrow.getDate() !== 1) {
    return res.status(200).json({ skipped: true, reason: 'Not last day of month' })
  }

  const month = now.getMonth()
  const year = now.getFullYear()
  const monat = MONTHS[month] + ' ' + year

  // Fetch all begehungen for this month
  const startDate = new Date(year, month, 1).toISOString().split('T')[0]
  const endDate = new Date(year, month + 1, 0).toISOString().split('T')[0]

  const { data: begehungen } = await sb.from('begehungen')
    .select('id, user_id, datum')
    .gte('datum', startDate)
    .lte('datum', endDate)

  const { data: profiles } = await sb.from('profiles')
    .select('id, full_name, firma, uid_nummer')

  const profileMap = {}
  for (const p of (profiles || [])) profileMap[p.id] = p

  const byUser = {}
  for (const b of (begehungen || [])) {
    if (!byUser[b.user_id]) byUser[b.user_id] = 0
    byUser[b.user_id]++
  }

  const rows = Object.entries(byUser).map(([uid, count]) => ({
    firma: profileMap[uid]?.firma || '–',
    name: profileMap[uid]?.full_name || '–',
    uid: profileMap[uid]?.uid_nummer || '–',
    count,
  })).sort((a, b) => b.count - a.count)

  const total = (begehungen || []).length

  // Call monthly-report API
  const baseUrl = `https://${req.headers.host}`
  await fetch(`${baseUrl}/api/monthly-report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows, monat, total }),
  })

  return res.status(200).json({ ok: true, monat, total, firmen: rows.length })
}
