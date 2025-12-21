import { Profile, Resources } from "../types";

export function computeVigorRules(profile: Profile): Pick<Resources, "vigor_cap" | "vigor_regen_minutes"> {
  return profile.premium ? { vigor_cap: 15, vigor_regen_minutes: 5 } : { vigor_cap: 10, vigor_regen_minutes: 15 };
}

export function applyVigorRegen(resources: Resources, lastTick: Date, now: Date): Resources {
  const minutes = (now.getTime() - lastTick.getTime()) / 60000;
  if (minutes <= 0) return resources;
  const gained = Math.floor(minutes / resources.vigor_regen_minutes);
  if (gained <= 0) return resources;
  return { ...resources, vigor: Math.min(resources.vigor_cap, resources.vigor + gained) };
}
