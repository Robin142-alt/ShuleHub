import 'reflect-metadata';

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';

import { SeederModuleName } from '../modules/seeder/seeder.types';

const loadLocalEnv = (): void => {
  const candidateFiles = [
    '.env',
    '.env.local',
    '.env.vercel.production',
    '.env.production',
  ];

  for (const relativePath of candidateFiles) {
    const absolutePath = resolve(process.cwd(), relativePath);

    if (!existsSync(absolutePath)) {
      continue;
    }

    const lines = readFileSync(absolutePath, 'utf8').split(/\r?\n/);

    for (const line of lines) {
      const trimmedLine = line.trim();

      if (!trimmedLine || trimmedLine.startsWith('#')) {
        continue;
      }

      const separatorIndex = trimmedLine.indexOf('=');

      if (separatorIndex <= 0) {
        continue;
      }

      const key = trimmedLine.slice(0, separatorIndex).trim();

      if (!key || process.env[key] !== undefined) {
        continue;
      }

      let value = trimmedLine.slice(separatorIndex + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"'))
        || (value.startsWith('\'') && value.endsWith('\''))
      ) {
        value = value.slice(1, -1);
      }

      process.env[key] = value;
    }
  }
};

const parseArgument = (name: string): string | undefined => {
  const prefixedName = `--${name}=`;
  const matched = process.argv.find((value) => value.startsWith(prefixedName));

  if (matched) {
    return matched.slice(prefixedName.length);
  }

  const envKey = `npm_config_${name.replace(/-/g, '_')}`;
  return process.env[envKey];
};

const parseModule = (): SeederModuleName | undefined => {
  const moduleName = parseArgument('module');

  if (!moduleName) {
    return undefined;
  }

  if (!['tenant', 'user', 'academic', 'student', 'finance'].includes(moduleName)) {
    throw new Error(`Unsupported seeder module "${moduleName}"`);
  }

  return moduleName as SeederModuleName;
};

const main = async (): Promise<void> => {
  loadLocalEnv();

  const [{ SeedCliModule }, { SeederService }] = await Promise.all([
    import('../seed-cli.module'),
    import('../modules/seeder/seeder.service'),
  ]);
  const app = await NestFactory.createApplicationContext(SeedCliModule, {
    logger: ['log', 'warn', 'error'],
  });

  try {
    const seederService = app.get(SeederService);
    const moduleName = parseModule();
    const summary = moduleName
      ? await seederService.runByModule(moduleName, {
          tenant: parseArgument('tenant') || 'demo',
          school_name: parseArgument('school-name'),
          owner_password: parseArgument('password'),
          plan_code: parseArgument('plan') as 'trial' | 'starter' | 'growth' | 'enterprise' | undefined,
          student_count_per_stream: parseArgument('students-per-stream')
            ? Number(parseArgument('students-per-stream'))
            : undefined,
        })
      : await seederService.runAll({
          tenant: parseArgument('tenant') || 'demo',
          school_name: parseArgument('school-name'),
          owner_password: parseArgument('password'),
          plan_code: parseArgument('plan') as 'trial' | 'starter' | 'growth' | 'enterprise' | undefined,
          student_count_per_stream: parseArgument('students-per-stream')
            ? Number(parseArgument('students-per-stream'))
            : undefined,
        });

    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } finally {
    await app.close();
  }
};

void main().catch((error: unknown) => {
  process.stderr.write(
    `${JSON.stringify(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    )}\n`,
  );
  process.exitCode = 1;
});
