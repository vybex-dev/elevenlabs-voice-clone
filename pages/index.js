import Head from "next/head";
import Link from "next/link";
import Waveform from "../components/Waveform";
import VoiceRecorder from "../components/VoiceRecorder";

export default function Home() {
  return (
    <>
      <Head>
        <title>Clone your voice</title>
        <meta
          name="description"
          content="Record or upload a short sample and get a digital clone of your own voice."
        />
      </Head>

      <main>
        <section className="hero">
          <div className="hero-text">
            <p className="eyebrow">Voice cloning</p>
            <h1>
              Speak once.
              <br />
              Sound like you, anywhere.
            </h1>
            <p className="sub">
              Record or upload around 30 minutes of clean audio, verify it&rsquo;s
              you, and we&rsquo;ll train a professional-grade clone of your voice.
              Training takes a while, so you can check back on the{" "}
              <Link href="/status">status page</Link> once you&rsquo;re done.
            </p>
          </div>
          <Waveform />
        </section>

        <section className="recorder-section">
          <VoiceRecorder />
        </section>

        <footer>
          <p>
            By using this tool you confirm the voice belongs to you or you have
            permission to clone it.
          </p>
        </footer>
      </main>

      <style jsx>{`
        main {
          max-width: 1040px;
          margin: 0 auto;
          padding: 72px 24px 48px;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .hero {
          width: 100%;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 40px;
          margin-bottom: 64px;
          flex-wrap: wrap;
        }

        .hero-text {
          max-width: 560px;
        }

        .eyebrow {
          color: var(--accent);
          font-size: 0.9rem;
          margin: 0 0 14px;
        }

        h1 {
          font-family: var(--font-display);
          font-weight: 500;
          font-size: clamp(2.4rem, 5vw, 3.4rem);
          line-height: 1.08;
          margin: 0 0 20px;
        }

        .sub {
          color: var(--text-muted);
          font-size: 1.05rem;
          line-height: 1.6;
          max-width: 46ch;
          margin: 0;
        }

        .recorder-section {
          width: 100%;
          display: flex;
          justify-content: center;
          margin-bottom: 48px;
        }

        footer {
          color: var(--text-muted);
          font-size: 0.8rem;
          text-align: center;
        }

        footer p {
          margin: 0;
        }
      `}</style>
    </>
  );
}
