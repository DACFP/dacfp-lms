import { describe, expect, it } from 'vitest';
import {
  deriveM2DefinitionStatus,
  M2_DEFINITIONS_CHANGED_NOTICE,
} from '../../supabase/functions/lms-admin/m2-definitions';

const populationView = 'v_lms_m2_definition_mutation_population';

describe('M2 current-definitions audit derivation', () => {
  it('does not flag older, same-time, unrelated, or invalid mutation rows', () => {
    const status = deriveM2DefinitionStatus(
      [
        { changed_at: '2026-07-31T23:59:59Z', module_id: 'module-a', survey_id: null },
        { changed_at: '2026-08-01T00:00:00Z', module_id: 'module-a', survey_id: null },
        { changed_at: '2026-08-02T00:00:00Z', module_id: 'module-b', survey_id: null },
        { changed_at: 'invalid', module_id: 'module-a', survey_id: null },
      ],
      'module_id',
      [{ definition_id: 'module-a', collected_at: '2026-08-01T00:00:00Z' }],
      populationView,
    );

    expect(status).toEqual({
      changed_since_data: false,
      latest_change_at: null,
      mutation_count: 0,
      population_view: populationView,
    });
  });

  it('flags each matching postdated mutation and reports the latest one', () => {
    const status = deriveM2DefinitionStatus(
      [
        { changed_at: '2026-08-02T00:00:00Z', module_id: null, survey_id: 'survey-a' },
        { changed_at: '2026-08-03T00:00:00Z', module_id: null, survey_id: 'survey-a' },
        { changed_at: '2026-08-04T00:00:00Z', module_id: null, survey_id: 'survey-b' },
      ],
      'survey_id',
      [{ definition_id: 'survey-a', collected_at: '2026-08-01T00:00:00Z' }],
      populationView,
    );

    expect(status).toEqual({
      changed_since_data: true,
      latest_change_at: '2026-08-03T00:00:00Z',
      mutation_count: 2,
      population_view: populationView,
    });
    expect(M2_DEFINITIONS_CHANGED_NOTICE).toBe(
      'Definitions changed since this data was collected.',
    );
  });
});
