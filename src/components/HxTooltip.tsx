import { ReactNode, useId, useState } from "react";

/**
 * Lightweight, reusable tooltip used across Hemlock.
 * - No external deps
 * - Works with keyboard focus
 */
export default function HxTooltip(props: {
  content: ReactNode;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);

  if (props.disabled) return <>{props.children}</>;

  return (
    <span
      className={"relative inline-flex " + (props.className ?? "")}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      aria-describedby={open ? id : undefined}
    >
      {props.children}
      {open ? (
        <span
          id={id}
          role="tooltip"
          className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 w-max max-w-[260px] -translate-x-1/2 rounded-lg border border-purple-400/25 bg-black/90 px-3 py-2 text-xs text-zinc-100 shadow-[0_0_30px_rgba(168,85,247,0.20)]"
        >
          {props.content}
        </span>
      ) : null}
    </span>
  );
}
