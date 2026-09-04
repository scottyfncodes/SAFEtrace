/** Player configuration. Accessibility is architecture, not a menu item. */

export interface Settings {
  holdToAim: boolean;
  holdForVision: boolean;
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
}

export const defaultSettings = (): Settings => ({
  holdToAim: true,
  holdForVision: true,
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
