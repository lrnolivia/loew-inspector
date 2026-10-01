import { HashRouter, NavLink, Navigate, Route, Routes } from "react-router-dom";
import { LiveRelayProvider, useLiveRelay } from "./live";
import { TodayPage } from "./pages/TodayPage";
import { RunnerPage } from "./pages/RunnerPage";
import { RunnerWorkPage } from "./pages/RunnerWorkPage";
import { NightShiftPage } from "./pages/NightShiftPage";

function Shell() {
  const { state } = useLiveRelay();
  return (
    <>
      <div className="terra-accent" aria-hidden="true"><span/><span/><span/><span/><span/></div>
      <header className="app-header">
        <a className="relay-brand" href="#/today"><img src="/brand/relay.png" alt="" /><strong>relay</strong></a>
        <nav aria-label="Relay">
          <NavLink to="/today">today</NavLink>
          <NavLink to="/runner">runner</NavLink>
          <a href="/inspector#review">inspector</a>
          <NavLink to="/night-shift">night shift</NavLink>
        </nav>
        <span className="connection-state" data-state={state}><span aria-hidden="true"/>{state}</span>
      </header>
      <main className="app-main">
        <Routes>
          <Route path="/today" element={<TodayPage />} />
          <Route path="/runner" element={<RunnerPage />} />
          <Route path="/runner/:project/:assignment" element={<RunnerWorkPage />} />
          <Route path="/night-shift" element={<NightShiftPage />} />
          <Route path="*" element={<Navigate to="/today" replace />} />
        </Routes>
      </main>
    </>
  );
}

export default function App() {
  return <HashRouter><LiveRelayProvider><Shell /></LiveRelayProvider></HashRouter>;
}
