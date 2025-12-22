import React from "react";

export default function FramePanel(props: {
  frameUrl: string;
  className?: string;
  children?: React.ReactNode;
  paddingClassName?: string;
  ariaLabel?: string;
}) {
  const pad = props.paddingClassName ?? "p-4";
  return (
    <div
      className={`relative overflow-hidden ${props.className ?? ""}`}
      style={{
        backgroundImage: `url(${props.frameUrl})`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        backgroundSize: "100% 100%",
      }}
      aria-label={props.ariaLabel}
    >
      <div className={`relative ${pad}`}>{props.children}</div>
    </div>
  );
}
