import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY)

const MONTHS = ['Jänner','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember']

export default async function handler(req, res) {
  const now = new Date()

  // Vormonat berechnen (läuft am 1. des Folgemonats)
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const month = prevMonth.getMonth()
  const year = prevMonth.getFullYear()
  const monat = MONTHS[month] + ' ' + year

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

  const baseUrl = 'https://' + req.headers.host
  const r = await fetch(baseUrl + '/api/monthly-report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows, monat, total }),
  })

  if (!r.ok) return res.status(500).json({ error: 'Report send failed' })
  return res.status(200).json({ ok: true, monat, total, firmen: rows.length })
}
