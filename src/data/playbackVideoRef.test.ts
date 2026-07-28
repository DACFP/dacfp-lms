import { describe, expect, it } from 'vitest';
import {
  PLACEHOLDER_PATH,
  resolveVideoStoragePath,
} from '../../supabase/functions/lms-playback-token/video-ref';

describe('playback video reference resolution', () => {
  it('maps every placeholder scheme ref to the managed placeholder asset', () => {
    expect(resolveVideoStoragePath('placeholder://fpt-introduction')).toBe(
      PLACEHOLDER_PATH,
    );
    expect(resolveVideoStoragePath('placeholder://another-seeded-lesson')).toBe(
      PLACEHOLDER_PATH,
    );
  });

  it('passes literal storage paths through unchanged', () => {
    const storagePath = 'courses/fpt/module-1/core-lesson.mp4';
    expect(resolveVideoStoragePath(storagePath)).toBe(storagePath);
  });
});
