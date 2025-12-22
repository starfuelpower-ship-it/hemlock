import { ReactNode } from "react";

/**
 * Renders a full UI "screen frame" image (EMPTY UI FRAME ASSET ONLY)
 * and lets us layer real interactive UI on top.
 */
export default function ScreenFrame(props: {
  src: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div className={"relative w-full aspect-video " + (props.className ?? "")}
      style={{ maxWidth: 1280 }}
    >
      <img
        src={props.src}
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full object-cover rounded-2xl shadow-[0_20px_70px_rgba(0,0,0,0.7)]"
      />
      <div className="pointer-events-none absolute inset-0 rounded-2xl overflow-hidden">
        {/* A subtle readability layer for real content, while preserving the frame art. */}
        <div className="pointer-events-none absolute inset-0 bg-black/25" aria-hidden />
        <div className="relative h-full w-full">{props.children}</div>
      </div>
    </div>
  );
}
