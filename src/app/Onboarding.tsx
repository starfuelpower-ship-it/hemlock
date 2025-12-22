import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import PageShell from "../components/PageShell";
import FramePanel from "../components/FramePanel";
import TopBar from "../components/TopBar";
import { artpack } from "../lib/artpack";
import { useAuth } from "../auth/AuthProvider";
import { PlayerRace, writeOnboarding } from "../auth/onboarding";

export default function Onboarding() {
  const nav = useNavigate();
  const loc = useLocation() as any;
  const { configured, user } = useAuth();

  const from = useMemo(() => loc?.state?.from ?? "/home", [loc]);

  const [race, setRace] = useState<PlayerRace | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    // If auth is disabled (offline), skip onboarding gate.
    if (!configured) {
      nav("/home", { replace: true });
      return;
    }
    // If we lost auth, send home.
    if (!user) {
      nav("/", { replace: true });
      return;
    }
  }, [configured, user, nav]);

  function onContinue() {
    setErr(null);
    if (!user) {
      setErr("You must be logged in to continue.");
      return;
    }
    if (!race) {
      setErr("Choose a race to continue.");
      return;
    }
    writeOnboarding(user.id, race);
    nav(from, { replace: true });
  }

  return (
    <PageShell scene="auth">
      <div className="space-y-4">
        <TopBar />

        <div className="max-w-[980px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7">
            <FramePanel frameUrl={artpack.frames.cta} ariaLabel="Choose your Bloodline">
              <div className="text-xl font-semibold g-emboss">Choose Your Bloodline</div>
              <div className="mt-2 text-sm text-zinc-200/90">
                This is your starting identity. You can expand into deeper systems later — for now, pick the path you want to begin with.
              </div>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRace("Vampire")}
                  className={`g-panel p-4 text-left transition border ${
                    race === "Vampire" ? "border-purple-400/50 bg-purple-900/20" : "border-zinc-800/60 hover:bg-zinc-900/30"
                  }`}
                >
                  <div className="text-sm font-semibold g-emboss">Vampire</div>
                  <div className="mt-1 text-xs text-zinc-300">
                    Patience, influence, and the long view. Thrive in the slow wars of wealth, courts, and secrets.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setRace("Werewolf")}
                  className={`g-panel p-4 text-left transition border ${
                    race === "Werewolf" ? "border-purple-400/50 bg-purple-900/20" : "border-zinc-800/60 hover:bg-zinc-900/30"
                  }`}
                >
                  <div className="text-sm font-semibold g-emboss">Werewolf</div>
                  <div className="mt-1 text-xs text-zinc-300">
                    Momentum, pressure, and daring operations. Hunt the weak, strike fast, and build fear.
                  </div>
                </button>
              </div>

              {err && <div className="mt-4 text-sm text-red-300">{err}</div>}

              <div className="mt-5 flex items-center justify-end gap-2">
                <button className="g-btn" type="button" onClick={() => nav("/")}>Back</button>
                <button className="g-btn-primary" type="button" onClick={onContinue}>
                  Continue
                </button>
              </div>
            </FramePanel>
          </div>

          <div className="lg:col-span-5 space-y-4">
            <FramePanel frameUrl={artpack.frames.tutorial} ariaLabel="What happens next">
              <div className="text-sm font-semibold g-emboss">What happens next</div>
              <div className="mt-2 text-xs text-zinc-200/90">
                After you choose a bloodline, you will enter the City and begin generating Chronicle reports.
                A guided tutorial will be added later.
              </div>
            </FramePanel>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
