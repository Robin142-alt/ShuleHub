export const EXPERIENCE_AUDIENCES = [
  "superadmin",
  "school",
  "portal",
] as const;

export type ExperienceAudience = (typeof EXPERIENCE_AUDIENCES)[number];

export function isExperienceAudience(
  value: string | null | undefined,
): value is ExperienceAudience {
  return EXPERIENCE_AUDIENCES.includes(value as ExperienceAudience);
}
