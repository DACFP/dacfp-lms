export const M2_DEFINITIONS_CHANGED_NOTICE =
  'Definitions changed since this data was collected.';

export type M2DefinitionColumn = 'module_id' | 'survey_id';

export type M2DefinitionMutationRow = {
  changed_at: string;
  module_id: string | null;
  survey_id: string | null;
};

export type M2CollectedDefinitionRow = {
  definition_id: string;
  collected_at: string;
};

export function deriveM2DefinitionStatus(
  mutationRows: M2DefinitionMutationRow[],
  definitionColumn: M2DefinitionColumn,
  collectedRows: M2CollectedDefinitionRow[],
  populationView: string,
) {
  const earliestCollectionByDefinition = new Map<string, number>();
  for (const row of collectedRows) {
    const collectedAt = Date.parse(row.collected_at);
    if (!Number.isFinite(collectedAt)) continue;
    const current = earliestCollectionByDefinition.get(row.definition_id);
    if (current === undefined || collectedAt < current) {
      earliestCollectionByDefinition.set(row.definition_id, collectedAt);
    }
  }

  const postdatingMutations = mutationRows
    .filter((mutation) => {
      const definitionId = mutation[definitionColumn];
      if (!definitionId) return false;
      const earliestCollection = earliestCollectionByDefinition.get(definitionId);
      const changedAt = Date.parse(mutation.changed_at);
      return earliestCollection !== undefined
        && Number.isFinite(changedAt)
        && changedAt > earliestCollection;
    })
    .sort((left, right) => Date.parse(right.changed_at) - Date.parse(left.changed_at));

  return {
    changed_since_data: postdatingMutations.length > 0,
    latest_change_at: postdatingMutations[0]?.changed_at ?? null,
    mutation_count: postdatingMutations.length,
    population_view: populationView,
  };
}
