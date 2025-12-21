import { ActionKind } from "../types";
import { ACTIONS } from "../systems/actions";

export default function ActionCard(props: { kind: ActionKind; disabled?: boolean; hint?: string; onRun: () => void }) {
  const a = ACTIONS[props.kind];
  const mins = Math.round(a.duration_seconds / 60);

  return (
    <div className="g-panel p-4">
      <div className="text-sm text-zinc-300">{a.label}</div>
      <div className="mt-1 text-xs text-zinc-400">{a.description}</div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className="g-pill">Vigor: <b className="text-white">{a.vigor_cost}</b></span>
        <span className="g-pill">Time: <b className="text-white">{mins}m</b></span>
      </div>

      {props.hint ? <div className="mt-2 text-xs text-zinc-500">{props.hint}</div> : null}

      <div className="mt-4">
        <button className={props.disabled ? "g-btn opacity-50 cursor-not-allowed" : "g-btn-primary"} disabled={props.disabled} onClick={props.onRun}>
          Begin
        </button>
      </div>
    </div>
  );
}
