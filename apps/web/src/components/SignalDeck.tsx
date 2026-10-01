import { useEffect, useRef, useState } from "react";

export type SignalCardData = {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone?: string;
};

const marks: Record<string, string> = {
  relay: "/brand/relay.png", today: "/brand/today.png", runner: "/brand/runner.png",
  inspector: "/brand/inspector.png", "night-shift": "/brand/night-shift.png"
};

export function SignalDeck({ cards, feature = "relay" }: { cards: SignalCardData[]; feature?: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches || cards.length <= 2) return;
    const timer = window.setInterval(() => {
      if (paused || !track.current) return;
      const element = track.current;
      const children = [...element.children] as HTMLElement[];
      if (!children.length) return;
      const current = children.findIndex(child => child.offsetLeft >= element.scrollLeft - 8);
      const next = children[(Math.max(current, 0) + 1) % children.length];
      element.scrollTo({ left: next?.offsetLeft || 0, behavior: "smooth" });
    }, 6500);
    return () => window.clearInterval(timer);
  }, [cards.length, paused]);

  return (
    <section className="signal-deck" data-feature={feature} aria-label="live summary">
      <div
        className="signal-track"
        ref={track}
        onPointerDown={() => setPaused(true)}
        onPointerUp={() => window.setTimeout(() => setPaused(false), 3500)}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
        onBlurCapture={() => setPaused(false)}
      >
        {cards.map(card => (
          <article className="signal-card" data-tone={card.tone || "quiet"} key={card.id} tabIndex={0}>
            <img className="signal-mark" src={marks[feature] || marks.relay} width="76" height="76" alt="" />
            <span className="signal-label">{card.label}</span>
            <strong data-value-kind={/^[\d.,%]+$/.test(card.value) ? "number" : "text"}>{card.value}</strong>
            <p>{card.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
