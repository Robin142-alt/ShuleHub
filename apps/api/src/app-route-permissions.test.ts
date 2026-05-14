import 'reflect-metadata';

import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, sep } from 'node:path';
import test from 'node:test';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';

import {
  IS_PUBLIC_KEY,
  PERMISSIONS_KEY,
  POLICY_KEY,
  ROLES_KEY,
} from './auth/auth.constants';

type ControllerClass = {
  name: string;
  prototype: Record<string, unknown>;
};

const requireCompiled = createRequire(__filename);
const ACCESS_METADATA_KEYS = [
  IS_PUBLIC_KEY,
  PERMISSIONS_KEY,
  POLICY_KEY,
  ROLES_KEY,
] as const;

test('all HTTP route handlers declare explicit access metadata', () => {
  const violations: string[] = [];

  for (const filePath of listControllerFiles(__dirname)) {
    const moduleExports = requireCompiled(filePath) as Record<string, unknown>;
    const relativePath = relative(__dirname, filePath).replaceAll(sep, '/');

    for (const controllerClass of getControllerClasses(moduleExports)) {
      for (const methodName of Object.getOwnPropertyNames(controllerClass.prototype)) {
        if (methodName === 'constructor') {
          continue;
        }

        const handler = controllerClass.prototype[methodName];

        if (typeof handler !== 'function' || !Reflect.hasMetadata(METHOD_METADATA, handler)) {
          continue;
        }

        if (!hasExplicitAccessMetadata(controllerClass, handler)) {
          violations.push(`${relativePath} ${controllerClass.name}.${methodName}`);
        }
      }
    }
  }

  assert.deepEqual(
    violations,
    [],
    [
      'Every HTTP route must declare explicit access metadata.',
      'Add @Public(), @Permissions(...), @Roles(...), or @Policy(...) to each listed handler or controller.',
      ...violations,
    ].join('\n'),
  );
});

function listControllerFiles(directory: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...listControllerFiles(entryPath));
      continue;
    }

    if (
      entry.isFile()
      && entry.name.endsWith('.controller.js')
      && !entry.name.endsWith('.spec.controller.js')
      && !entry.name.endsWith('.test.controller.js')
    ) {
      files.push(entryPath);
    }
  }

  return files.sort();
}

function getControllerClasses(moduleExports: Record<string, unknown>): ControllerClass[] {
  return Object.values(moduleExports).filter((value): value is ControllerClass => {
    return (
      typeof value === 'function'
      && Boolean(value.prototype)
      && Reflect.hasMetadata(PATH_METADATA, value)
    );
  });
}

function hasExplicitAccessMetadata(controllerClass: ControllerClass, handler: Function): boolean {
  return ACCESS_METADATA_KEYS.some((metadataKey) => {
    return (
      Reflect.hasMetadata(metadataKey, handler)
      || Reflect.hasMetadata(metadataKey, controllerClass)
    );
  });
}
