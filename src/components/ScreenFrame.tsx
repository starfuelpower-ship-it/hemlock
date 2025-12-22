import { ReactNode } from "react";

/**
 * Renders a full UI "screen frame" image (EMPTY UI FRAME ASSET ONLY)
 * and lets us layer real interactive UI on top.
 *
 * IMPORTANT:
 * - The frame art must never block clicks.
 * - Children must be fully interactive.
 * - We preserve the frame aspect ratio so overlays line up.
 */
export default function ScreenFrame(props: {
  src: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={"relative w-full aspect-[3/2] " + (props.className ?? "")}
      style={{ maxWidth: 1280 }}
    >
      {/* Frame art */}
      <img
        src={props.src}
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full object-contain rounded-2xl shadow-[0_20px_70px_rgba(0,0,0,0.7)]"
      />

      {/* Interactive overlay */}
      <div className="absolute inset-0 rounded-2xl overflow-hidden">
        {/* Very subtle readability tint that does NOT block interaction */}
        <div className="pointer-events-none absolute inset-0 bg-black/10" aria-hidden />
        <div className="relative h-full w-full">{props.children}</div>
      </div>
    </div>
  );
}
