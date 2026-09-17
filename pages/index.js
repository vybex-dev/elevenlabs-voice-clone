import { useEffect, useState } from "react";
import Head from "next/head";
import { useRouter } from "next/router";
import NavBar from "../components/NavBar";
import Waveform from "../components/Waveform";
import PvcWizard from "../components/PvcWizard";
import VoiceLogs from "../components/VoiceLogs";

export default function Home() {
  const router = useRouter();
  const [currentUser, setCurrentUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((res) => {
        if (!res.ok) throw new Error("Unauthenticated");
        return res.json();
      })
      .then((data) => {
        setCurrentUser(data.user);
        setLoadingAuth(false);
      })
      .catch(() => {
        router.replace("/login");
      });
  }, [router]);

  function handleVoiceUpdated() {
    setRefreshKey((prev) => prev + 1);
  }

  if (loadingAuth) {
    return (
      <div className="auth-loading">
        <p>Loading Voice Studio…</p>
        <style jsx>{`
          .auth-loading {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--bg);
            color: var(--text-muted);
            font-size: 0.95rem;
          }
        `}</style>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Professional Voice Clone Studio</title>
        <meta
          name="description"
          content="Build a high-fidelity Professional Voice Clone of your own voice with ElevenLabs."
        />
      </Head>

      <NavBar user={currentUser} />

      <main>
        <section className="hero">
          <div className="hero-text">
            <p className="eyebrow">Professional Voice Cloning</p>
            <h1>
              Your voice.
              <br />
              Studio quality, fully yours.
            </h1>
            <p className="sub">
              Record or upload samples, verify it&rsquo;s really you, and model
              will train a high-fidelity clone of your voice.
            </p>
          </div>
          <Waveform />
        </section>

        <section className="recorder-section">
          <PvcWizard onVoiceUpdated={handleVoiceUpdated} />
        </section>

        <section className="logs-section">
          <VoiceLogs refreshKey={refreshKey} />
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
          padding: 48px 24px 64px;
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
          margin-bottom: 48px;
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
          margin-bottom: 24px;
        }

        .logs-section {
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
