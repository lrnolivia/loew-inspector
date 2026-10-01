import { useEffect, useRef, useState } from "react";

export type SignalCardData = {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone?: string;
};

export function SignalDeck({ cards }: { cards: SignalCardData[] }) {
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
    <section className="signal-deck" aria-label="live summary">
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
            <span className="signal-label">{card.label}</span>
            <strong>{card.value}</strong>
            <p>{card.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
