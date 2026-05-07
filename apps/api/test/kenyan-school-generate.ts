import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  KenyanSchoolProfileDocument,
  generateKenyanSchoolProfiles,
} from './support/kenyan-school-profiles';

interface GeneratorConfig {
  tenant_count: number;
  min_students: number;
  max_students: number;
  min_teachers: number;
  max_teachers: number;
  school_year: number;
  seed: string;
  output_path: string | null;
}

const main = async (): Promise<void> => {
  const config = parseConfig();
  const document = generateKenyanSchoolProfiles({
    tenant_count: config.tenant_count,
    min_students: config.min_students,
    max_students: config.max_students,
    min_teachers: config.min_teachers,
    max_teachers: config.max_teachers,
    school_year: config.school_year,
    seed: config.seed,
  });

  if (config.output_path) {
    const resolvedPath = path.resolve(config.output_path);
    await mkdir(path.dirname(resolvedPath), { recursive: true });
    await writeFile(resolvedPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  }

  process.stdout.write(`${JSON.stringify(buildOutput(document, config), null, 2)}\n`);
};

const buildOutput = (
  document: KenyanSchoolProfileDocument,
  config: GeneratorConfig,
): Record<string, unknown> => ({
  generated_at: document.generated_at,
  seed: document.seed,
  school_year: document.school_year,
  output_path: config.output_path ? path.resolve(config.output_path) : null,
  summary: document.summary,
  sample_tenants: document.profiles.slice(0, 3).map((profile) => ({
    tenant_id: profile.tenant_id,
    school_name: profile.school_name,
    county: profile.county,
    student_count: profile.student_count,
    teacher_count: profile.teacher_count,
    class_count: profile.class_count,
    stream_count: profile.stream_count,
    plan_code: profile.plan_code,
  })),
});

const parseConfig = (): GeneratorConfig => ({
  tenant_count: parseInteger(process.env.KENYA_TENANTS, 1000, 1, 10000),
  min_students: parseInteger(process.env.KENYA_MIN_STUDENTS, 300, 50, 10000),
  max_students: parseInteger(process.env.KENYA_MAX_STUDENTS, 2000, 50, 10000),
  min_teachers: parseInteger(process.env.KENYA_MIN_TEACHERS, 20, 5, 500),
  max_teachers: parseInteger(process.env.KENYA_MAX_TEACHERS, 80, 5, 500),
  school_year: parseInteger(process.env.KENYA_SCHOOL_YEAR, new Date().getUTCFullYear(), 2020, 2100),
  seed: process.env.KENYA_PROFILE_SEED?.trim() || 'kenyan-school-load-2026',
  output_path:
    process.env.KENYA_PROFILE_OUTPUT_PATH?.trim()
    || path.join(process.cwd(), 'artifacts', 'kenyan-school-profiles.json'),
});

const parseInteger = (
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number => {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`Expected an integer between ${min} and ${max}, received "${value}"`);
  }

  return parsed;
};

void main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

