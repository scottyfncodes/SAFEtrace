/** Player configuration. Accessibility is architecture, not a menu item. */

export interface Settings {
  holdToAim: boolean;
  /** Let a long hold of Q peek at the plan and close it on release (a tap always toggles). */
  holdForPlanView: boolean;
  /** 0 = no flashing, soft cross-fade only. 1 = full peel. */
  transitionIntensity: number;
  cameraShake: number;
  textScale: number;
  reduceMotion: boolean;
  colourSafeMachine: boolean;
  masterVolume: number;
  worldVolume: number;
  skateVolume: number;
  interfaceVolume: number;
  showDebug: boolean;
  /**
   * The slingshot as it was: SLING stops you and raises a first-person view,
   * the left thumb aims and the right pulls. Off by default — the sling is
   * pulled back from where you are, in the street.
   */
  classicSling: boolean;
}

export const defaultSettings = (): Settings => ({
  holdToAim: true,
  holdForPlanView: true,
  transitionIntensity: 1,
  cameraShake: 1,
  textScale: 1,
  reduceMotion: false,
  colourSafeMachine: false,
  masterVolume: 0.8,
  worldVolume: 1,
  skateVolume: 1,
  interfaceVolume: 1,
  showDebug: false,
  classicSling: false,
});

const KEY = 'safetrace.settings.v1';

export function loadSettings(): Settings {
  const base = defaultSettings();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return base;
    return { ...base, ...(JSON.parse(raw) as Partial<Settings>) };
  } catch {
    return base;
  }
}

export function saveSettings(s: Settings): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ }
}
