import type { LmsModule } from '../data/types';

export function moduleCounterLabel(
  module: LmsModule,
  courseModules: LmsModule[],
) {
  return module.position === 0
    ? 'Introduction'
    : `Module ${module.position} of ${courseModules.length}`;
}
