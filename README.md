# Voice Clone MVP (Professional Voice Cloning)

A website where visitors go through ElevenLabs' **Professional Voice Clone**
(PVC) flow — the highest-fidelity option — and end up with a new voice on
**your** ElevenLabs account. One Next.js project, one Vercel deploy — no
separate backend to host.

PVC is a multi-step process, not a single upload:

1. **Collect ~30 minutes of audio** — record continuously in the browser
   (auto-uploaded in 5-minute chunks in the background) or upload one or more
   files.
2. **Verify** — ElevenLabs sends back an image containing text; the user
   reads it aloud and records that, proving they're a real, consenting
   person.
3. **Train** — a background job ElevenLabs runs on their end, which can take
   a while. There's no instant result here.
4. **Check status** — since there are no accounts yet, the /status page lets
   anyone paste their Voice ID to see whether training has finished.

## How it works

- `pages/index.js` — hero + the step-by-step wizard.
- `components/VoiceRecorder.js` — the wizard itself: setup → collect samples
  → verify → train → done. Handles mic recording (chunked for long takes),
  file uploads, the consent checkbox, and polling for training status.
- `pages/status.js` — standalone page to check a Voice ID's training status.
- `pages/api/pvc/*.js` — five Vercel **Edge Functions**, one per PVC API step
  (`create`, `samples`, `captcha`, `verify-captcha`, `status`). `verify-captcha`
  also kicks off training immediately after a successful verification.
- `lib/elevenlabs.js` — the actual ElevenLabs API calls, kept separate from
  the route handlers so it's easy to extend later (per-user metadata, usage
  limits, a database write, etc.) without touching request handling.

Because every API route runs as an Edge Function bundled into the same
Vercel project as the frontend, there's nothing extra to deploy or keep
alive, and one failing request doesn't take the rest of the site down.

Your ElevenLabs API key lives only in a server-side environment variable. It
is never sent to the browser.

### One thing to verify before relying on it

The CAPTCHA image step (`getPvcCaptcha` in `lib/elevenlabs.js`) is the one
part of this flow where ElevenLabs' public docs don't fully specify the raw
HTTP response shape — their official SDK returns a base64 string, but not
whether the actual REST response is JSON-wrapped, plain text, or a raw image.
The code handles all three cases defensively, but **test this step for real
early** (with a real API key) rather than assuming it works from the docs
alone. If it needs adjusting, that function is the only place to change.

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

- **Requires the Creator plan or above on ElevenLabs.** This applies to the
  API, not just the dashboard — PVC calls will fail on lower tiers regardless
  of what this app does.
- **Voice limits.** ElevenLabs plans cap how many custom voices an account
  can hold. Since every visitor's clone lands on your one account, check your
  plan's limit at https://elevenlabs.io/pricing before real traffic hits, or
  you'll start getting errors when the cap is reached.
- **This is slow by nature, not by a bug.** Collecting 30 minutes of audio,
  verifying, and training all take real time. Set that expectation for users
  up front — this isn't a "clone your voice in 10 seconds" tool.
- **No accounts yet, by design.** The only record of a clone is the Voice ID
  shown at the end — nothing is stored anywhere on this app's side. If
  someone closes the tab mid-training, their Voice ID (shown right after the
  verification step) is the only way to find it again via `/status`.
  `lib/elevenlabs.js` and the API routes are kept separate from the UI
  specifically so adding accounts + a database later is a small change.
- **No abuse protection yet, by your choice.** The endpoints are open. Since
  PVC uploads can add up to real storage/processing cost on ElevenLabs' side
  across many users, this is worth revisiting sooner rather than later —
  more so than it was for quick Instant Voice Clone.
- **Single speaker assumed.** This build skips ElevenLabs' speaker-separation
  step, which exists for recordings with multiple people talking. Samples
  should be one person, alone, in a quiet room.
- **Consent.** ElevenLabs requires that the account holder has the right to
  clone any voice submitted; the CAPTCHA read-aloud step is itself a strong
  consent signal (the actual person has to be present and speaking), on top
  of the checkbox at setup.

## Suggested next steps (when you add accounts)

- Add auth (NextAuth.js, Clerk, or similar).
- Store `{ userId, voiceId, name, status, createdAt }` in a database
  (Postgres via Vercel Postgres/Neon, or Supabase) so users can find their
  own voices without needing to save a Voice ID themselves.
- Replace the manual `/status` polling page with a notification (email once
  training finishes) once you're collecting user emails via accounts.
- Add rate limiting, scoped per-user instead of left fully open.
- Optionally add a "generate speech" screen using the trained `voiceId` and
  ElevenLabs' text-to-speech endpoint.
