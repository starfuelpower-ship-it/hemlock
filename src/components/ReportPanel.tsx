import { Report } from "../types";

export default function ReportPanel(props: { title: string; report?: Report | null; onOpenReports: () => void }) {
  return (
    <div className="g-panel p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">{props.title}</div>
        <button className="g-btn" onClick={props.onOpenReports}>Open Inbox</button>
      </div>

      {props.report ? (
        <div className="mt-3">
          <div className="text-lg font-semibold g-emboss">{props.report.title}</div>
          <div className="mt-2 text-sm text-zinc-200/90 leading-relaxed">{props.report.body}</div>
          <div className="mt-3 text-xs text-zinc-400">{new Date(props.report.created_at).toLocaleString()}</div>
        </div>
      ) : (
        <div className="mt-3 text-sm text-zinc-400">No reports yet.</div>
      )}
    </div>
  );
}
