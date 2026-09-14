const BAR_COUNT = 28;

// Deterministic-looking but varied bar heights/delays so the equalizer
// doesn't feel perfectly regular.
const bars = Array.from({ length: BAR_COUNT }, (_, i) => {
  const seed = Math.sin(i * 12.9898) * 43758.5453;
  const frac = seed - Math.floor(seed);
  return {
    height: 18 + frac * 64,
    delay: (frac * 1.6).toFixed(2),
    duration: (0.9 + frac * 0.8).toFixed(2),
    tone: i % 5 === 0 ? "var(--meter)" : "var(--accent)",
  };
});

export default function Waveform() {
  return (
    <div className="waveform" aria-hidden="true">
      {bars.map((bar, i) => (
        <span
          key={i}
          className="bar"
          style={{
            "--h": `${bar.height}px`,
            "--delay": `${bar.delay}s`,
            "--duration": `${bar.duration}s`,
            "--tone": bar.tone,
          }}
        />
      ))}
      <style jsx>{`
        .waveform {
          display: flex;
          align-items: center;
          gap: 6px;
          height: 96px;
        }
        .bar {
          width: 5px;
          border-radius: 3px;
          background: var(--tone);
          height: var(--h);
          opacity: 0.85;
          animation: pulse var(--duration) ease-in-out var(--delay) infinite
            alternate;
          transform-origin: center;
        }
        @keyframes pulse {
          from {
            transform: scaleY(0.45);
            opacity: 0.55;
          }
          to {
            transform: scaleY(1);
            opacity: 0.95;
          }
        }
      `}</style>
    </div>
  );
}
