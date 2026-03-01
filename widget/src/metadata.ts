import type { BugMetadata } from './types.js';

export function collectMetadata(): BugMetadata {
  return {
    url: window.location.href,
    userAgent: navigator.userAgent,
    screenWidth: screen.width,
    screenHeight: screen.height,
    windowWidth: window.innerWidth,
    windowHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio ?? 1,
    language: navigator.language,
    timestamp: new Date().toISOString(),
  };
}
