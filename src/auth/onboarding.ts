export type PlayerRace = "Vampire" | "Werewolf";

type OnboardingStateV1 = {
  v: 1;
  race: PlayerRace;
  completedAt: string; // ISO
};

export function onboardingKey(uid: string) {
  return `hemlock:onboarding:v1:${uid}`;
}

export function readOnboarding(uid: string): OnboardingStateV1 | null {
  try {
    const raw = localStorage.getItem(onboardingKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.v !== 1) return null;
    if (parsed.race !== "Vampire" && parsed.race !== "Werewolf") return null;
    if (typeof parsed.completedAt !== "string") return null;
    return parsed as OnboardingStateV1;
  } catch {
    return null;
  }
}

export function writeOnboarding(uid: string, race: PlayerRace) {
  const payload: OnboardingStateV1 = {
    v: 1,
    race,
    completedAt: new Date().toISOString(),
  };
  localStorage.setItem(onboardingKey(uid), JSON.stringify(payload));
}

export function isOnboarded(uid: string) {
  return !!readOnboarding(uid);
}
