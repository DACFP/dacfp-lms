import { describe, expect, it } from 'vitest';

async function source(path: string) {
  const nodeFsModule = 'node:fs';
  const { readFileSync } = await import(nodeFsModule);
  return readFileSync(path, 'utf8');
}

function functionBody(file: string, name: string, nextName: string) {
  return file.slice(file.indexOf(`async function ${name}`), file.indexOf(`async function ${nextName}`));
}

describe('M2 read-only constitution', () => {
  it('keeps every named population security-invoker and service-role SELECT-only', async () => {
    const populations = await source('supabase/migrations/20260801130000_m2_analytics_populations.sql');
    const rider = await source('supabase/migrations/20260801131000_m2_view_acl_rider.sql');

    expect(populations.match(/with \(security_invoker = on\)/g)).toHaveLength(4);
    expect(populations.match(/from public, anon, authenticated/g)).toHaveLength(4);
    expect(rider.match(/from service_role/g)).toHaveLength(4);
    expect(rider.match(/grant select on table/g)).toHaveLength(4);
    expect(rider).not.toMatch(/grant (insert|update|delete|all)/i);
  });

  it('adds no read-path audit or mutation and keeps the survey export free of answer keys', async () => {
    const edge = await source('supabase/functions/lms-admin/index.ts');
    const quizRead = functionBody(edge, 'quizAnalytics', 'listSurveyResponses');
    const surveyList = functionBody(edge, 'listSurveyResponses', 'surveyResponseDetail');
    const surveyDetail = functionBody(edge, 'surveyResponseDetail', 'allFilteredSurveyResponses');
    const surveyExport = functionBody(edge, 'exportM2SurveyResponses', 'exportSurveyResponses');

    for (const readPath of [quizRead, surveyList, surveyDetail]) {
      expect(readPath).not.toContain('audit(');
      expect(readPath).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
    }
    expect(surveyExport).toContain("'export_m2_survey_responses'");
    expect(surveyExport).not.toContain('correct_choice_ids');
    expect(edge).not.toContain("case 'export_quiz_analytics'");
  });

  it('keeps both M2 pages free of mutation hooks and edit affordances', async () => {
    const pages = await source('src/pages/AdminM2Pages.tsx');
    expect(pages).not.toContain('mutate(');
    expect(pages).not.toMatch(/reset_attempt|manual_mark|update_|delete_/);
    expect(pages).toContain('There are no edit, annotation, or status controls.');
  });
});
