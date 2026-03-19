# 🏗 Bauherren Hilfe

Professionelle Web+Mobil App für Bausachverständige.

## Setup

### 1. Supabase
1. Neues Projekt auf supabase.com anlegen
2. SQL Editor → `SUPABASE_SCHEMA.sql` ausführen
3. Storage → `bhh-photos` Bucket ist bereits public (via SQL)

### 2. Vercel Environment Variables
Im Vercel Dashboard → Settings → Environment Variables:

```
VITE_SUPABASE_URL        = https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY   = eyJ...
SENDGRID_API_KEY         = SG.xxx
FROM_EMAIL               = noreply@bauherren-hilfe.at
INTERNAL_EMAIL           = intern@bauherren-hilfe.at
ANTHROPIC_API_KEY        = sk-ant-xxx
```

> ⚠️ ANTHROPIC_API_KEY wird aktuell direkt im Frontend genutzt (MVP).
> Für Produktion: API-Calls in Vercel Serverless Functions auslagern.

### 3. Deploy
```bash
git init
git add -A
git commit -m "initial"
git remote add origin https://github.com/raum-2/BHH-Baustellenpr-fung.git
git push -u origin main
```

Vercel deployt automatisch bei jedem Push auf `main`.

## Funktionen MVP

- ✅ Login / Registrierung (Supabase Auth)
- ✅ Neue Begehung anlegen (3-Step Wizard)
- ✅ Prüfpunkte mit Schulnoten 1–5
- ✅ Fotos via Kamera + Galerie
- ✅ KI-Bildanalyse (Claude Vision)
- ✅ KI Dual-Text (öffentlich + intern)
- ✅ Öffentliches + internes Protokoll View
- ✅ E-Mail Versand (SendGrid)
- ✅ Projektverwaltung
- ✅ Admin Panel

## Stack
- React + Vite (Single File App)
- Supabase (Auth + DB + Storage)
- Claude API (KI Analyse + Text)
- SendGrid (E-Mail)
- Vercel (Hosting + API)
