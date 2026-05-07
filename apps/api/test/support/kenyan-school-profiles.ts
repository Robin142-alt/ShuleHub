type SchoolLevel = 'primary' | 'secondary' | 'mixed';
type BoardingModel = 'day' | 'boarding' | 'mixed';
type SchoolLocale = 'urban' | 'peri_urban' | 'rural';
type PlanCode = 'starter' | 'growth' | 'enterprise';

interface KenyanSchoolProfileConfig {
  tenant_count: number;
  min_students: number;
  max_students: number;
  min_teachers: number;
  max_teachers: number;
  school_year: number;
  seed: string;
}

interface KenyanSchoolClassProfile {
  class_name: string;
  level_code: string;
  stream_name: string;
  homeroom_size_estimate: number;
  monthly_fee_amount_minor: string;
}

interface KenyanSchoolTermProfile {
  term: 1 | 2 | 3;
  opens_on: string;
  closes_on: string;
  fee_deadline_on: string;
  report_window_starts_on: string;
}

export interface KenyanSchoolTenantProfile {
  tenant_id: string;
  subdomain: string;
  school_name: string;
  county: string;
  locale: SchoolLocale;
  level: SchoolLevel;
  boarding_model: BoardingModel;
  plan_code: PlanCode;
  timezone: 'Africa/Nairobi';
  student_count: number;
  teacher_count: number;
  class_count: number;
  stream_count: number;
  devices_count: number;
  attendance_adoption_ratio: number;
  offline_attendance_ratio: number;
  mpesa_adoption_ratio: number;
  sms_opt_in_ratio: number;
  report_generation_ratio: number;
  classes: KenyanSchoolClassProfile[];
  terms: KenyanSchoolTermProfile[];
  messaging: {
    guardian_burst_ratio: number;
    teacher_burst_ratio: number;
    channels: ['sms'];
  };
  load_shape: {
    morning_peak_multiplier: number;
    evening_peak_multiplier: number;
    term_opening_multiplier: number;
    fee_deadline_multiplier: number;
    term_closing_multiplier: number;
  };
  metadata: Record<string, unknown>;
}

export interface KenyanSchoolProfileSummary {
  tenant_count: number;
  total_students: number;
  total_teachers: number;
  total_classes: number;
  total_streams: number;
  min_students: number;
  max_students: number;
  median_students: number;
  plan_mix: Record<PlanCode, number>;
  county_mix: Record<string, number>;
}

export interface KenyanSchoolProfileDocument {
  generated_at: string;
  seed: string;
  school_year: number;
  summary: KenyanSchoolProfileSummary;
  profiles: KenyanSchoolTenantProfile[];
}

const COUNTIES = [
  'Nairobi',
  'Kiambu',
  'Machakos',
  'Kajiado',
  'Nakuru',
  'Uasin Gishu',
  'Kisumu',
  'Mombasa',
  'Meru',
  'Nyeri',
  'Kakamega',
  'Bungoma',
  'Kericho',
  'Embu',
  'Muranga',
  'Laikipia',
  'Narok',
  'Migori',
  'Siaya',
  'Kilifi',
];

const SCHOOL_PREFIXES = [
  'St.',
  'Blessed',
  'Cornerstone',
  'Greenfield',
  'Sunrise',
  'Royal',
  'Mwangaza',
  'Imani',
  'Baraka',
  'Hillview',
  'Lakeview',
  'Grace',
  'New Dawn',
  'Victory',
];

const SCHOOL_SUFFIXES = [
  'Academy',
  'School',
  'Junior School',
  'Secondary School',
  'Preparatory School',
  'Learning Centre',
  'Comprehensive School',
];

const STREAM_NAMES = ['North', 'South', 'East', 'West', 'Blue', 'Red', 'Gold', 'Green'];

const PRIMARY_LEVELS = ['PP1', 'PP2', 'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 'Grade 6', 'Grade 7', 'Grade 8'];
const SECONDARY_LEVELS = ['Form 1', 'Form 2', 'Form 3', 'Form 4'];

export const generateKenyanSchoolProfiles = (
  config: KenyanSchoolProfileConfig,
): KenyanSchoolProfileDocument => {
  const rng = createRng(config.seed);
  const profiles = Array.from({ length: config.tenant_count }, (_, index) =>
    buildTenantProfile(config, rng, index + 1),
  );

  return {
    generated_at: new Date().toISOString(),
    seed: config.seed,
    school_year: config.school_year,
    summary: buildSummary(profiles),
    profiles,
  };
};

const buildTenantProfile = (
  config: KenyanSchoolProfileConfig,
  rng: () => number,
  ordinal: number,
): KenyanSchoolTenantProfile => {
  const county = pickOne(COUNTIES, rng);
  const level = pickWeighted<SchoolLevel>(
    [
      ['primary', 0.5],
      ['secondary', 0.28],
      ['mixed', 0.22],
    ],
    rng,
  );
  const locale = pickWeighted<SchoolLocale>(
    [
      ['urban', 0.34],
      ['peri_urban', 0.29],
      ['rural', 0.37],
    ],
    rng,
  );
  const boardingModel = resolveBoardingModel(level, rng);
  const studentCount = skewedInteger(config.min_students, config.max_students, rng, 0.72);
  const teacherCount = clamp(
    Math.round(studentCount / randomBetween(rng, 21, 32)) + randomBetween(rng, 6, 18),
    config.min_teachers,
    config.max_teachers,
  );
  const gradeLevels = resolveGradeLevels(level);
  const streamsPerLevel = resolveStreamsPerLevel(studentCount, level, rng);
  const classes = buildClasses(gradeLevels, streamsPerLevel, studentCount, level, rng);
  const planCode = resolvePlanCode(studentCount, teacherCount);
  const schoolName = buildSchoolName(county, level, rng);
  const tenantSlug = `${slugify(schoolName)}-${ordinal.toString().padStart(4, '0')}`;
  const attendanceAdoptionRatio = roundToTwoDecimals(randomBetween(rng, 82, 98) / 100);
  const offlineAttendanceRatio = roundToTwoDecimals(randomBetween(rng, 20, 52) / 100);
  const mpesaAdoptionRatio = roundToTwoDecimals(randomBetween(rng, 74, 96) / 100);
  const smsOptInRatio = roundToTwoDecimals(randomBetween(rng, 62, 94) / 100);
  const reportGenerationRatio = roundToTwoDecimals(randomBetween(rng, 55, 85) / 100);
  const devicesCount = clamp(
    Math.round(teacherCount * (0.4 + attendanceAdoptionRatio / 2)),
    8,
    72,
  );

  return {
    tenant_id: tenantSlug,
    subdomain: tenantSlug,
    school_name: schoolName,
    county,
    locale,
    level,
    boarding_model: boardingModel,
    plan_code: planCode,
    timezone: 'Africa/Nairobi',
    student_count: studentCount,
    teacher_count: teacherCount,
    class_count: classes.length,
    stream_count: gradeLevels.length * streamsPerLevel.length,
    devices_count: devicesCount,
    attendance_adoption_ratio: attendanceAdoptionRatio,
    offline_attendance_ratio: offlineAttendanceRatio,
    mpesa_adoption_ratio: mpesaAdoptionRatio,
    sms_opt_in_ratio: smsOptInRatio,
    report_generation_ratio: reportGenerationRatio,
    classes,
    terms: buildTerms(config.school_year),
    messaging: {
      guardian_burst_ratio: roundToTwoDecimals(randomBetween(rng, 18, 40) / 100),
      teacher_burst_ratio: roundToTwoDecimals(randomBetween(rng, 5, 16) / 100),
      channels: ['sms'],
    },
    load_shape: {
      morning_peak_multiplier: roundToTwoDecimals(randomBetween(rng, 18, 28) / 10),
      evening_peak_multiplier: roundToTwoDecimals(randomBetween(rng, 14, 24) / 10),
      term_opening_multiplier: roundToTwoDecimals(randomBetween(rng, 15, 26) / 10),
      fee_deadline_multiplier: roundToTwoDecimals(randomBetween(rng, 17, 32) / 10),
      term_closing_multiplier: roundToTwoDecimals(randomBetween(rng, 13, 20) / 10),
    },
    metadata: {
      generated_by: 'kenyan-school-profiles',
      county_cluster: county,
      seeded_ordinal: ordinal,
      class_levels: gradeLevels,
      stream_names: streamsPerLevel,
    },
  };
};

const buildSummary = (
  profiles: KenyanSchoolTenantProfile[],
): KenyanSchoolProfileSummary => {
  const studentCounts = profiles
    .map((profile) => profile.student_count)
    .sort((left, right) => left - right);
  const planMix: Record<PlanCode, number> = {
    starter: 0,
    growth: 0,
    enterprise: 0,
  };
  const countyMix: Record<string, number> = {};

  for (const profile of profiles) {
    planMix[profile.plan_code] += 1;
    countyMix[profile.county] = (countyMix[profile.county] ?? 0) + 1;
  }

  return {
    tenant_count: profiles.length,
    total_students: profiles.reduce((sum, profile) => sum + profile.student_count, 0),
    total_teachers: profiles.reduce((sum, profile) => sum + profile.teacher_count, 0),
    total_classes: profiles.reduce((sum, profile) => sum + profile.class_count, 0),
    total_streams: profiles.reduce((sum, profile) => sum + profile.stream_count, 0),
    min_students: studentCounts[0] ?? 0,
    max_students: studentCounts[studentCounts.length - 1] ?? 0,
    median_students:
      studentCounts.length === 0
        ? 0
        : studentCounts[Math.floor(studentCounts.length / 2)],
    plan_mix: planMix,
    county_mix: countyMix,
  };
};

const buildClasses = (
  gradeLevels: string[],
  streamNames: string[],
  studentCount: number,
  level: SchoolLevel,
  rng: () => number,
): KenyanSchoolClassProfile[] => {
  const baseFeeAmountKes = resolveBaseFeeAmountKes(level, rng);
  const perClassSize = Math.max(24, Math.round(studentCount / (gradeLevels.length * streamNames.length)));

  return gradeLevels.flatMap((gradeLevel, levelIndex) =>
    streamNames.map((streamName, streamIndex) => ({
      class_name: `${gradeLevel} ${streamName}`,
      level_code: gradeLevel,
      stream_name: streamName,
      homeroom_size_estimate: perClassSize + randomBetween(rng, -8, 10),
      monthly_fee_amount_minor: String(
        (baseFeeAmountKes + levelIndex * 2500 + streamIndex * 1500) * 100,
      ),
    })),
  );
};

const buildTerms = (schoolYear: number): KenyanSchoolTermProfile[] => [
  {
    term: 1,
    opens_on: `${schoolYear}-01-06`,
    closes_on: `${schoolYear}-04-04`,
    fee_deadline_on: `${schoolYear}-01-20`,
    report_window_starts_on: `${schoolYear}-03-25`,
  },
  {
    term: 2,
    opens_on: `${schoolYear}-05-06`,
    closes_on: `${schoolYear}-08-01`,
    fee_deadline_on: `${schoolYear}-05-20`,
    report_window_starts_on: `${schoolYear}-07-22`,
  },
  {
    term: 3,
    opens_on: `${schoolYear}-09-01`,
    closes_on: `${schoolYear}-11-21`,
    fee_deadline_on: `${schoolYear}-09-15`,
    report_window_starts_on: `${schoolYear}-11-10`,
  },
];

const buildSchoolName = (
  county: string,
  level: SchoolLevel,
  rng: () => number,
): string => {
  const prefix = pickOne(SCHOOL_PREFIXES, rng);
  const suffix = pickOne(SCHOOL_SUFFIXES, rng);
  const countyStem = county.replace(/\s+/g, ' ').trim().split(' ')[0];
  const levelWord =
    level === 'primary' ? 'Junior' : level === 'secondary' ? 'Senior' : 'Integrated';

  return `${prefix} ${countyStem} ${levelWord} ${suffix}`;
};

const resolvePlanCode = (studentCount: number, teacherCount: number): PlanCode => {
  if (studentCount >= 1500 || teacherCount >= 64) {
    return 'enterprise';
  }

  if (studentCount >= 900 || teacherCount >= 42) {
    return 'growth';
  }

  return 'starter';
};

const resolveBoardingModel = (level: SchoolLevel, rng: () => number): BoardingModel => {
  if (level === 'secondary') {
    return pickWeighted<BoardingModel>(
      [
        ['boarding', 0.38],
        ['mixed', 0.34],
        ['day', 0.28],
      ],
      rng,
    );
  }

  return pickWeighted<BoardingModel>(
    [
      ['day', 0.7],
      ['mixed', 0.24],
      ['boarding', 0.06],
    ],
    rng,
  );
};

const resolveGradeLevels = (level: SchoolLevel): string[] => {
  if (level === 'primary') {
    return PRIMARY_LEVELS;
  }

  if (level === 'secondary') {
    return SECONDARY_LEVELS;
  }

  return [...PRIMARY_LEVELS, ...SECONDARY_LEVELS];
};

const resolveStreamsPerLevel = (
  studentCount: number,
  level: SchoolLevel,
  rng: () => number,
): string[] => {
  const maxStreams =
    level === 'mixed' ? 4 : studentCount >= 1200 ? 4 : studentCount >= 700 ? 3 : 2;
  const streamCount = clamp(randomBetween(rng, 1, maxStreams), 1, STREAM_NAMES.length);

  return STREAM_NAMES.slice(0, streamCount);
};

const resolveBaseFeeAmountKes = (level: SchoolLevel, rng: () => number): number => {
  if (level === 'primary') {
    return randomBetween(rng, 18000, 36000);
  }

  if (level === 'secondary') {
    return randomBetween(rng, 42000, 98000);
  }

  return randomBetween(rng, 26000, 76000);
};

const createRng = (seed: string): (() => number) => {
  let state = hashSeed(seed);

  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const hashSeed = (value: string): number => {
  let hash = 2166136261;

  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
};

const pickOne = <T>(values: readonly T[], rng: () => number): T =>
  values[Math.floor(rng() * values.length)];

const pickWeighted = <T>(
  entries: ReadonlyArray<readonly [T, number]>,
  rng: () => number,
): T => {
  const totalWeight = entries.reduce((sum, [, weight]) => sum + weight, 0);
  const roll = rng() * totalWeight;
  let threshold = 0;

  for (const [value, weight] of entries) {
    threshold += weight;

    if (roll <= threshold) {
      return value;
    }
  }

  return entries[entries.length - 1][0];
};

const randomBetween = (rng: () => number, min: number, max: number): number =>
  Math.floor(rng() * (max - min + 1)) + min;

const skewedInteger = (
  min: number,
  max: number,
  rng: () => number,
  exponent: number,
): number => Math.round(min + (max - min) * Math.pow(rng(), exponent));

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);

const roundToTwoDecimals = (value: number): number => Number(value.toFixed(2));

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));
