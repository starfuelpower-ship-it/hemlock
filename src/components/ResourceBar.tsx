import { Resources } from "../types";

export default function ResourceBar(props: { resources: Resources; riskLabel: string }) {
  const { gold, vigor, vigor_cap } = props.resources;
  return (
    <div className="flex flex-wrap items-center gap-2 justify-end">
      <span className="g-pill">Gold <b className="text-white">{gold.toLocaleString()}</b></span>
      <span className="g-pill">Vigor <b className="text-white">{vigor}/{vigor_cap}</b></span>
      <span className="g-pill">Risk <b className="text-white">{props.riskLabel}</b></span>
    </div>
  );
}
