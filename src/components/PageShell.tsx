import { ReactNode } from "react";
import { artpack } from "../lib/artpack";

type Scene =
  | "home"
  | "city"
  | "reports"
  | "pvp"
  | "domains"
  | "inventory"
  | "profile"
  | "chronicle"
  | "court"
  | "legends"
  | "setup"
  | "auth";

export default function PageShell(props: { children: ReactNode; scene?: Scene }) {
  const scene = props.scene ?? "home";
  return (
    <div className={`min-h-screen relative overflow-hidden bg-black hemlock-shell scene-${scene}`}>
      <div
        className="absolute inset-0 hemlock-bg"
        aria-hidden
        style={{
          backgroundImage: `url(${artpack.backgrounds.home})`,
        }}
      />
      <div className="absolute inset-0 g-noise" aria-hidden />
      <div className="g-fog" aria-hidden />
      <div className="relative mx-auto max-w-[1280px] p-3 sm:p-6">{props.children}</div>
    </div>
  );
}
