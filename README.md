# Voice Clone MVP

A minimal website where visitors record or upload a voice sample and get it
cloned into a new voice on **your** ElevenLabs account. One Next.js project,
one Vercel deploy — no separate backend to host.

## How it works

- `pages/index.js` — the page: hero + the record/upload widget.
- `components/VoiceRecorder.js` — handles mic recording (MediaRecorder API),
  file upload, the consent checkbox, and submits to the API route.
- `pages/api/clone-voice.js` — a Vercel **Edge Function**. Receives the audio,
  checks consent + file size, then calls ElevenLabs server-side.
- `lib/elevenlabs.js` — the actual ElevenLabs API call, kept separate so it's
  easy to extend later (e.g. once you add accounts, add per-user metadata,
  usage limits, a database write, etc.) without touching the request handler.

Because the API route runs as an Edge Function bundled into the same Vercel
project as the frontend, there's nothing extra to deploy or keep alive. If a
single clone request errors or times out, it doesn't affect the rest of the
site — every request is isolated.

Your ElevenLabs API key lives only in a server-side environment variable. It
is never sent to the browser.

## Local development

```bash
npm install
cp .env.example .env.local
# edit .env.local and paste your real ElevenLabs API key
npm run dev
```

Visit `http://localhost:3000`.

Note: `getUserMedia` (microphone access) requires a secure context. It works
on `localhost` automatically; once deployed, Vercel serves everything over
HTTPS, so recording will work there too.

## Deploying to Vercel

1. Push this project to a GitHub repo.
2. In Vercel, "Add New Project" → import that repo.
3. In the project's **Settings → Environment Variables**, add:
   - `ELEVENLABS_API_KEY` = your ElevenLabs API key
4. Deploy. That's it — frontend and API route ship together.

## Important things to know before going live

- **Voice limits.** ElevenLabs plans cap how many custom voices you can have
  on an account at once (Free/Starter tiers are quite low; higher tiers allow
  more). Since every visitor's clone lands on your one account, check your
  plan's limit at https://elevenlabs.io/pricing before you get real traffic,
  or you'll start getting errors when the cap is hit.
- **No accounts yet, by design.** Right now anyone can clone a voice, and the
  only record of a clone is the Voice ID shown once on success — nothing is
  stored anywhere. `lib/elevenlabs.js` and the API route are intentionally
  kept separate from the UI so that when you're ready to add accounts, you
  can slot in auth + a database (to associate a `voice_id` with a user) with
  minimal rework.
- **No abuse protection yet, by your choice.** The endpoint is open — anyone
  can trigger a (paid) ElevenLabs call. There's a 25MB file size cap and a
  120-second max recording length as basic guardrails, but no rate limiting
  or CAPTCHA. Worth revisiting before wide release, since this maps directly
  to your ElevenLabs bill.
- **Consent.** ElevenLabs requires that the account holder has the right to
  clone any voice submitted. The consent checkbox in the UI is a first layer
  of that, but you're the one responsible for how it's used at scale.

## Suggested next steps (when you add accounts)

- Add auth (NextAuth.js, Clerk, or similar).
- Store `{ userId, voiceId, name, createdAt }` in a database (Postgres via
  Vercel Postgres/Neon, or Supabase) so users can see their own voices again.
- Move rate limiting to be per-user instead of removing it entirely.
- Optionally add a "generate speech" screen using the returned `voiceId` and
  ElevenLabs' text-to-speech endpoint.
