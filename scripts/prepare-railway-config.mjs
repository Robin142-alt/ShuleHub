import { copyFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const [, , configPathArg] = process.argv;

if (!configPathArg) {
  console.error('Usage: node scripts/prepare-railway-config.mjs <path-to-railway-config>');
  process.exit(1);
}

const repoRoot = process.cwd();
const sourcePath = path.resolve(repoRoot, configPathArg);
const destinationPath = path.resolve(repoRoot, 'railway.json');

await copyFile(sourcePath, destinationPath);
console.log(`Copied ${configPathArg} to railway.json`);
