export const JOB_TITLE_OPTIONS = [
  'Financial Advisor',
  'Wealth Manager',
  'Portfolio Manager',
  'Financial Planner',
  'RIA Principal/Owner',
  'Compliance',
  'Operations',
  'Analyst',
  'Executive',
] as const;

export function profileDisplayName(firstName: string, lastName: string) {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
}
