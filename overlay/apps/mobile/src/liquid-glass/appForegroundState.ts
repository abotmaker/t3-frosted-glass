/**
 * Lightweight zero-dependency foreground state tracker so stream-driven haptics
 * (e.g. `threadStreamHaptics.ts`) never vibrate while the app is backgrounded
 * or the screen is locked during an active Live Updates foreground service run.
 */
let appForegroundActive = true;

export function setAppForegroundActive(active: boolean): void {
  appForegroundActive = active;
}

export function isAppForegroundActive(): boolean {
  return appForegroundActive;
}
