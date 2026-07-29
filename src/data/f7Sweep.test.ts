import { describe, expect, it } from 'vitest';
import adminFunction from '../../supabase/functions/lms-admin/index.ts?raw';
import progressFunction from '../../supabase/functions/lms-progress/index.ts?raw';
import migration from '../../supabase/migrations/20260729000000_f7_sweep.sql?raw';
import bridgeBackfill from '../../supabase/migrations/20260729001000_f7_bridge_copy_backfill.sql?raw';

describe('F7 server remediation contracts', () => {
  it('persists bridge_copy through a dedicated audited module RPC', () => {
    expect(adminFunction).toContain("admin.rpc('lms_admin_save_module'");
    expect(migration).toContain("bridge_copy = case when p_payload ? 'bridge_copy'");
    expect(migration).toContain("p_action = 'update_module'");
  });

  it('backfills only missing FPT bridge copy from the committed curriculum', () => {
    expect(bridgeBackfill).toContain("and course.slug = 'fpt-sandbox'");
    expect(bridgeBackfill).toContain('and module.bridge_copy is null');
    expect(bridgeBackfill).toContain('See the full path ahead before beginning the Financial Professional Track.');
  });

  it('creates a scratch quiz during canonical import and names rejected fields', () => {
    expect(migration).toContain('on conflict (module_id) do update');
    expect(migration).toContain('question % field "prompt" must be a non-empty string');
    expect(migration).toContain('question % field "correct" contains unknown choice id');
  });

  it('imports the completion detector used after a reading write', () => {
    expect(progressFunction).toMatch(/import\s*\{[\s\S]*courseComplete,[\s\S]*\}\s*from '\.\/progression\.ts'/);
    expect(progressFunction).toContain('await detectCompletion(admin, access, data)');
  });
});
