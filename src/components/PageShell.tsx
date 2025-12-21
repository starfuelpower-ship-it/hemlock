import { ReactNode } from "react";

export default function PageShell(props: { children: ReactNode }) {
  return (
    <div className="min-h-screen relative overflow-hidden bg-black">
      <div className="absolute inset-0 g-noise" />
      <div className="g-fog" />
      <div className="relative mx-auto max-w-[1280px] p-3 sm:p-6">{props.children}</div>
    </div>
  );
}
