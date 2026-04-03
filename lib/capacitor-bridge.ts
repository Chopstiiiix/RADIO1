/**
 * Capacitor native bridge — platform detection and plugin wrappers.
 * All functions are no-ops when running in a regular browser.
 */

let _isNative: boolean | null = null;

/** True when running inside Capacitor's native WebView (iOS/Android) */
export function isNative(): boolean {
  if (_isNative === null) {
    _isNative =
      typeof window !== "undefined" &&
      // Capacitor injects this global on native platforms
      !!(window as any).Capacitor?.isNativePlatform?.();
  }
  return _isNative;
}

/** Returns "ios" | "android" | "web" */
export function getPlatform(): string {
  if (!isNative()) return "web";
  return (window as any).Capacitor?.getPlatform?.() ?? "web";
}

/**
 * Activate the native audio session for background playback.
 * On iOS this sets AVAudioSession category to .playback so audio
 * continues when the app is backgrounded or the screen is locked.
 * No-op on web.
 */
export async function activateAudioSession(): Promise<void> {
  if (!isNative()) return;
  try {
    const { StatusBar } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: "DARK" as any });
  } catch {
    // StatusBar plugin may not be available in all contexts
  }
}

/**
 * Trigger a light haptic tap — used on Transport button presses.
 * No-op on web.
 */
export async function hapticTap(): Promise<void> {
  if (!isNative()) return;
  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    // Haptics not available
  }
}

/**
 * Update the lock screen / Control Center media metadata.
 * Uses the standard Media Session API which Capacitor WebViews support.
 */
export function updateMediaSession(meta: {
  title: string;
  artist: string;
  artwork?: string;
}): void {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  navigator.mediaSession.metadata = new MediaMetadata({
    title: meta.title,
    artist: meta.artist,
    album: "Caster Radio",
    artwork: meta.artwork
      ? [{ src: meta.artwork, sizes: "512x512", type: "image/png" }]
      : [],
  });
}

/**
 * Set Media Session playback state and action handlers.
 */
export function setMediaSessionHandlers(handlers: {
  onPlay?: () => void;
  onPause?: () => void;
  onNext?: () => void;
  onPrev?: () => void;
}): void {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
  if (handlers.onPlay) navigator.mediaSession.setActionHandler("play", handlers.onPlay);
  if (handlers.onPause) navigator.mediaSession.setActionHandler("pause", handlers.onPause);
  if (handlers.onNext) navigator.mediaSession.setActionHandler("nexttrack", handlers.onNext);
  if (handlers.onPrev) navigator.mediaSession.setActionHandler("previoustrack", handlers.onPrev);
}
