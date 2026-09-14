# Professional Voice Clone (PVC) app

A Next.js site where a visitor builds a **Professional Voice Clone (PVC)** —
ElevenLabs' highest-fidelity cloning tier — of their own voice, entirely
through a guided wizard, landing on **your** ElevenLabs account. One project,
one Vercel deploy, no separate backend.

This replaces the earlier Instant Voice Clone (10-second, near-instant) flow.
PVC is a different, heavier product: it needs a good amount of audio (30 min
minimum per ElevenLabs' guidance; this app targets **2 hours** as the
recommended amount), an identity-verification step, and a training job that
runs in the background for a while before the voice is usable.

## Why PVC is a multi-step wizard, not one request

Unlike Instant Voice Clone (one file in, one voice out), PVC is a whole
pipeline on ElevenLabs' side:

1. **Create** the voice (name/language/description) → get a `voice_id`.
2. **Add samples** — as many audio clips as you want, uploaded incrementally
   as they're recorded/uploaded (not batched into one giant request, since a
   couple of hours of audio is too much for a single call).
3. **(Optional) Speaker separation** — if a sample has background noise or
   more than one voice in it, ElevenLabs can split out the individual voices
   so you pick the right one. This is opt-in per sample ("Detect speakers")
   rather than automatic, so clean single-voice recordings skip it entirely.
4. **Identity verification** — ElevenLabs shows a short CAPTCHA-style passage
   and requires a recording of you reading it aloud, to confirm you're
   actually the person whose voice is being cloned. There's a manual-review
   fallback if that's not possible.
5. **Train** — kicks off fine-tuning, which is polled until it's done.

Because this spans several ElevenLabs endpoints and can take a while, the
wizard (`components/PvcWizard.js`) holds all of this state in the browser
(no database — see "No accounts yet" below) and drives each API route in
sequence.

## How it's organized

- `pages/index.js` — the page shell (hero + the wizard).
- `components/PvcWizard.js` — the actual step-by-step flow: details → samples
  → verify → train → done.
- `components/AudioCapture.js` — reusable "record or upload one clip" widget,
  used both for adding voice samples and for the verification recording.
- `components/pvc/SpeakerReview.js` — the optional per-sample speaker
  separation review panel.
- `pages/api/pvc/*.js` — one Vercel **Edge Function** per ElevenLabs PVC
  endpoint (create, samples, separate, speakers, speaker-audio,
  select-speaker, captcha, manual-verification, train, status). Thin
  pass-throughs that add consent/size checks and keep your API key
  server-side.
- `lib/elevenlabs.js` — every ElevenLabs PVC API call, one function each, so
  the API routes stay tiny and the ElevenLabs-specific details (endpoints,
  field names, base64 handling) live in one place.
- `lib/http.js` — tiny shared JSON response / error-handling helpers used by
  every route in `pages/api/pvc/`.

Your ElevenLabs API key lives only in the `ELEVENLABS_API_KEY` server
environment variable. It's never sent to the browser — even the CAPTCHA image
and speaker-preview audio are proxied through Edge routes as data URIs rather
than exposing a direct, key-bearing ElevenLabs URL to the client.

## ⚠️ One thing to verify once you have a live account

`lib/elevenlabs.js` → `getPvcCaptcha()` has a documented ambiguity: ElevenLabs'
own Python quickstart treats the CAPTCHA endpoint's response as an
already-base64-encoded string, while their JS SDK has an open GitHub issue
(`elevenlabs-js#221`) suggesting the raw response is actually binary image
bytes. The code handles both cases defensively (branching on response
`content-type`), but I couldn't confirm which is correct without a live
Creator-plan account making the call. **Test the verification step early** —
if the CAPTCHA image doesn't render, that's the branch to fix first (it's
isolated to that one function).

## Local development

```bash
npm install
cp .env.example .env.local
# edit .env.local and paste your real ElevenLabs API key (Creator plan or above)
npm run dev
```

Visit `http://localhost:3000`.

Note: `getUserMedia` (microphone access) requires a secure context. It works
on `localhost` automatically; once deployed, Vercel serves everything over
HTTPS, so recording works there too.

## Deploying to Vercel

1. Push this project to a GitHub repo.
2. In Vercel, "Add New Project" → import that repo.
3. In the project's **Settings → Environment Variables**, add:
   - `ELEVENLABS_API_KEY` = your ElevenLabs API key (must be Creator plan or
     above — PVC is gated behind that, as shown in the ElevenLabs UI).
4. Deploy. Frontend and all `/api/pvc/*` routes ship together.

## Important things to know before going live

- **Plan requirement.** Professional Voice Cloning requires ElevenLabs
  Creator plan or higher. A request will fail with an ElevenLabs API error if
  the connected account isn't eligible — worth surfacing more prominently in
  the UI if you expect visitors on lower-tier or free accounts.
- **This is slower and heavier than IVC.** Training can take a meaningful
  amount of time (this varies with how much audio was provided). The wizard
  polls `/api/pvc/status` every 5 seconds while training; there's no
  push/webhook wiring here, so if the visitor closes the tab mid-training, the
  voice still finishes training on ElevenLabs' side — they'd just need the
  `voice_id` to check on it later (which, per "no accounts yet" below, isn't
  saved anywhere by this app).
- **No accounts yet, by design.** Anyone can start a PVC clone, and the only
  record of it is the Voice ID shown once at the end — nothing is persisted
  server-side. Every API route is intentionally thin and stateless so that
  when you're ready to add accounts, you can slot in auth + a database (to
  track `voice_id` per user, resume in-progress clones, etc.) without
  rewriting the ElevenLabs integration itself.
- **No abuse protection yet, by your choice.** The endpoints are open —
  anyone can trigger (paid, and comparatively expensive) ElevenLabs PVC
  calls. There are per-request file size caps as basic guardrails, but no
  rate limiting or bot protection. Given PVC's cost and that training runs
  regardless of whether the visitor sticks around, this is worth addressing
  before wide release.
- **Consent & verification.** The consent checkbox is a first layer, and
  ElevenLabs' own voice-verification step (the CAPTCHA reading) is a second,
  stronger one enforced on their end — training won't start without it
  passing (or manual review being approved).
- **Removing samples.** The UI lets someone remove a sample from the current
  session's list, but this doesn't yet call ElevenLabs' delete-sample
  endpoint (`DELETE /v1/voices/pvc/{voice_id}/samples/{sample_id}`) — it's a
  straightforward addition to `lib/elevenlabs.js` + a new route if you want
  removed samples to actually be deleted from ElevenLabs too, rather than
  just hidden from view.

## Suggested next steps (when you add accounts)

- Add auth (NextAuth.js, Clerk, or similar).
- Store `{ userId, voiceId, name, createdAt, trainingState }` in a database so
  people can resume an in-progress clone or come back to a finished one.
- Add real rate limiting / a request quota per user given PVC's cost.
- Add a "generate speech" screen using the returned `voice_id` and
  ElevenLabs' text-to-speech endpoint.
