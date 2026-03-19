export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { rows, monat, total } = req.body
  const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY
  const FROM_EMAIL = process.env.FROM_EMAIL || 'noreply@bauherrenhilfe.at'
  const INTERNAL_EMAIL = process.env.INTERNAL_EMAIL || 'intern@bauherrenhilfe.at'

  const rowsHtml = (rows || []).map((r, i) =>
    '<tr style="border-bottom:1px solid #f3f4f6;">'
    + '<td style="padding:10px 14px;color:#6b7280;">' + (i+1) + '.</td>'
    + '<td style="padding:10px 14px;font-weight:600;color:#111;">' + (r.firma || '–') + '</td>'
    + '<td style="padding:10px 14px;color:#374151;">' + (r.name || '–') + '</td>'
    + '<td style="padding:10px 14px;color:#6b7280;">' + (r.uid || '–') + '</td>'
    + '<td style="padding:10px 14px;text-align:center;font-weight:800;font-size:16px;color:#cc1f1f;">' + r.count + '</td>'
    + '</tr>'
  ).join('')

  const html = `
  <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;background:#fff;">
    <div style="background:#cc1f1f;padding:24px;border-radius:12px 12px 0 0;">
      <h1 style="color:#fff;font-size:22px;margin:0 0 4px;">Abrechnungsliste</h1>
      <p style="color:rgba(255,255,255,0.8);font-size:13px;margin:0;">${monat} · Bauherrenhilfe</p>
    </div>
    <div style="background:#fef2f2;padding:16px 24px;border-left:1px solid #fca5a5;border-right:1px solid #fca5a5;">
      <p style="font-size:13px;color:#6b7280;margin:0;">Gesamte Begehungen: <strong style="color:#cc1f1f;font-size:18px;">${total}</strong> in ${(rows||[]).length} Firmen</p>
    </div>
    <div style="padding:0 0 20px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;overflow:hidden;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:#f9fafb;">
            <th style="padding:10px 14px;text-align:left;font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase;">#</th>
            <th style="padding:10px 14px;text-align:left;font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase;">Firma</th>
            <th style="padding:10px 14px;text-align:left;font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase;">Name</th>
            <th style="padding:10px 14px;text-align:left;font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase;">UID</th>
            <th style="padding:10px 14px;text-align:center;font-size:11px;color:#6b7280;font-weight:700;text-transform:uppercase;">Begehungen</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
        <tfoot>
          <tr style="background:#fef2f2;">
            <td colspan="4" style="padding:12px 14px;font-weight:700;color:#111;">Gesamt</td>
            <td style="padding:12px 14px;text-align:center;font-weight:800;font-size:18px;color:#cc1f1f;">${total}</td>
          </tr>
        </tfoot>
      </table>
    </div>
    <p style="font-size:11px;color:#9ca3af;text-align:center;margin-top:16px;">
      Automatisch erstellt · Bauherrenhilfe · ${new Date().toLocaleDateString('de-AT')}
    </p>
  </div>`

  try {
    const r = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: INTERNAL_EMAIL }] }],
        from: { email: FROM_EMAIL, name: 'Bauherrenhilfe' },
        subject: `Abrechnungsliste ${monat} – ${total} Begehungen`,
        content: [{ type: 'text/html', value: html }],
      }),
    })
    if (!r.ok) {
      const err = await r.text()
      throw new Error(err)
    }
    return res.status(200).json({ ok: true })
  } catch (err) {
    console.error('monthly-report error:', err)
    return res.status(500).json({ error: err.message })
  }
}
