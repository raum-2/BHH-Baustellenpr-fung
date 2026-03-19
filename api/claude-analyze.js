export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { imageBase64, mediaType, context } = req.body;

  if (!imageBase64) {
    return res.status(400).json({ error: 'imageBase64 fehlt' });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType || 'image/jpeg',
                  data: imageBase64,
                },
              },
              {
                type: 'text',
                text: `Du bist ein erfahrener Bausachverständiger. Analysiere dieses Baufoto.
${context ? `Kontext: ${context}` : ''}

Antworte mit JSON (nur JSON, kein Markdown):
{
  "oeffentlich": "Kurze sachliche Beschreibung für den Bauherrn (2-3 Sätze)",
  "intern": "Detaillierte technische Einschätzung für den Sachverständigen (3-5 Sätze)"
}`,
              },
            ],
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({ error: data.error?.message || 'Claude API Fehler' });
    }

    const text = data.content[0].text;
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    return res.status(200).json(parsed);
  } catch (err) {
    console.error('claude-analyze error:', err);
    return res.status(500).json({ error: err.message });
  }
}
