import { spawn } from 'node:child_process';
import path from 'node:path';

const scenario = (process.env.MPESA_NETWORK_SCENARIO ?? 'all').trim().toLowerCase();

const scenarioPatterns: Record<string, string> = {
  all: '',
  delayed: 'delayed callbacks still settle one ledger transaction and reconcile cleanly',
  duplicates: '1-5 duplicate callbacks still produce a single MPESA posting',
  missing: 'missing callbacks are detected by reconciliation before they can silently drift',
  orphan: 'STK success without callback is swept to expired so no orphaned payment remains',
  out_of_order: 'out-of-order callbacks do not create duplicate or mismatched ledger state',
  timeout: 'network timeouts fail closed with no persisted payment or ledger drift',
};

if (!(scenario in scenarioPatterns)) {
  const supportedScenarios = Object.keys(scenarioPatterns).join(', ');
  throw new Error(
    `Unsupported MPESA_NETWORK_SCENARIO "${scenario}". Supported values: ${supportedScenarios}`,
  );
}

const jestEntrypoint = path.resolve(process.cwd(), 'node_modules', 'jest', 'bin', 'jest.js');
const args = [
  jestEntrypoint,
  '--config',
  'jest.integration.config.js',
  '--runInBand',
  'apps/api/test/mpesa-network-conditions.integration-spec.ts',
];

if (scenarioPatterns[scenario]) {
  args.push('--testNamePattern', scenarioPatterns[scenario]);
}

const child = spawn(process.execPath, args, {
  stdio: 'inherit',
  cwd: process.cwd(),
  env: process.env,
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});

child.on('error', (error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
