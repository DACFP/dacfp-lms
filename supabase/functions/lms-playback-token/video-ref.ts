const PLACEHOLDER_SCHEME = 'placeholder://';
export const PLACEHOLDER_PATH = 'placeholder/dacfp-lms-placeholder.mp4';

/** Convert authored video references into paths in the lms-video bucket. */
export function resolveVideoStoragePath(videoRef: string) {
  return videoRef.startsWith(PLACEHOLDER_SCHEME) ? PLACEHOLDER_PATH : videoRef;
}
