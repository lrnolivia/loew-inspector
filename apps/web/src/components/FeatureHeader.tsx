const marks: Record<string, string> = {
  relay: "/brand/relay.png",
  today: "/brand/today.png",
  runner: "/brand/runner.png",
  inspector: "/brand/inspector.png",
  "night-shift": "/brand/night-shift.png"
};

export function FeatureHeader({ feature, title, subtitle }: { feature: string; title: string; subtitle: string }) {
  return (
    <header className="feature-header" data-feature={feature}>
      <div className="feature-mark"><img src={marks[feature] || marks.relay} alt="" /></div>
      <div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
    </header>
  );
}
