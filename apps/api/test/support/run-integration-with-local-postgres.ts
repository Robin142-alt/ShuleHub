import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';

type StartedCluster = {
  rootDir: string;
  dataDir: string;
  logFile: string;
  port: number;
  postgresProcess?: ChildProcess;
};

const DEFAULT_DATABASE_NAME = 'shule_hub';
const POSTGRES_SUPERUSER = 'postgres';
const LOCAL_POSTGRES_CLEANUP_RETRIES = 5;
const LOCAL_POSTGRES_CLEANUP_DELAY_MS = 250;
const LOCAL_POSTGRES_STARTUP_RETRIES = 40;
const LOCAL_POSTGRES_STARTUP_DELAY_MS = 250;

const quoteIfNeeded = (value: string): string =>
  /\s/.test(value) ? `"${value.replace(/"/g, '\\"')}"` : value;

const quoteForWindowsShell = (value: string): string => {
  if (value.length === 0) {
    return '""';
  }

  return `"${value.replace(/"/g, '""')}"`;
};

const runProcess = (
  command: string,
  args: string[],
  options: {
    env?: NodeJS.ProcessEnv;
    stdio?: 'inherit' | 'pipe';
  } = {},
): Promise<void> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: options.env ?? process.env,
      stdio: options.stdio ?? 'inherit',
      shell: false,
      windowsHide: true,
    });

    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `Command failed with exit code ${code}: ${[command, ...args].join(' ')}`,
        ),
      );
    });
  });

const delay = (durationMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, durationMs));

const isWin32RestrictedTokenBootstrapError = (error: unknown): boolean =>
  process.platform === 'win32'
  && error instanceof Error
  && /restricted token/i.test(error.message);

const isSpawnPermissionError = (error: unknown): boolean =>
  error instanceof Error && /spawn EPERM/i.test(error.message);

const resolveLocalBinary = (command: string): string => {
  if (path.isAbsolute(command) || command.includes(path.sep)) {
    return command;
  }

  const binName =
    process.platform === 'win32' && !command.endsWith('.cmd') ? `${command}.cmd` : command;
  const localBin = path.resolve(process.cwd(), 'node_modules', '.bin', binName);

  if (existsSync(localBin)) {
    return localBin;
  }

  return command;
};

const resolveNodeCommand = (
  command: string,
  args: string[],
): { command: string; args: string[] } | null => {
  if (command !== 'jest') {
    return null;
  }

  const jestEntrypoint = path.resolve(process.cwd(), 'node_modules', 'jest', 'bin', 'jest.js');

  if (!existsSync(jestEntrypoint)) {
    return null;
  }

  return {
    command: process.execPath,
    args: [jestEntrypoint, ...args],
  };
};

const resolvePostgresBinDir = async (): Promise<string | null> => {
  const configured = process.env.PG_BIN_DIR?.trim();

  if (configured && existsSync(configured)) {
    return configured;
  }

  if (process.platform === 'win32') {
    const rootDir = 'C:\\Program Files\\PostgreSQL';

    if (!existsSync(rootDir)) {
      return null;
    }

    const versionDirs = await import('node:fs/promises').then(({ readdir }) =>
      readdir(rootDir, { withFileTypes: true }),
    );
    const numericVersions = versionDirs
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => Number(right) - Number(left));

    for (const version of numericVersions) {
      const binDir = path.join(rootDir, version, 'bin');

      if (existsSync(path.join(binDir, process.platform === 'win32' ? 'initdb.exe' : 'initdb'))) {
        return binDir;
      }
    }
  }

  return null;
};

const postgresBinary = (binDir: string | null, name: string): string => {
  const binaryName = process.platform === 'win32' ? `${name}.exe` : name;
  return binDir ? path.join(binDir, binaryName) : name;
};

const waitForServerReady = async (
  binDir: string | null,
  port: number,
): Promise<void> => {
  const pgIsReady = postgresBinary(binDir, 'pg_isready');

  for (let attempt = 1; attempt <= LOCAL_POSTGRES_STARTUP_RETRIES; attempt += 1) {
    try {
      await runProcess(
        pgIsReady,
        ['-h', '127.0.0.1', '-p', String(port), '-U', POSTGRES_SUPERUSER],
        { stdio: 'pipe' },
      );
      return;
    } catch (error) {
      if (attempt === LOCAL_POSTGRES_STARTUP_RETRIES) {
        throw error;
      }

      await delay(LOCAL_POSTGRES_STARTUP_DELAY_MS);
    }
  }
};

const startPostgresProcess = async (
  binDir: string | null,
  dataDir: string,
  logFile: string,
  port: number,
): Promise<ChildProcess> => {
  const postgres = postgresBinary(binDir, 'postgres');
  const fs = await import('node:fs/promises');
  const logHandle = await fs.open(logFile, 'a');
  const child = spawn(
    postgres,
    ['-D', dataDir, '-p', String(port), '-h', '127.0.0.1'],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true,
    },
  );

  child.stdout?.on('data', async (chunk) => {
    await logHandle.appendFile(chunk);
  });
  child.stderr?.on('data', async (chunk) => {
    await logHandle.appendFile(chunk);
  });
  child.once('exit', async () => {
    await logHandle.close();
  });

  await waitForServerReady(binDir, port);

  return child;
};

const reservePort = async (): Promise<number> =>
  new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();

      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Unable to reserve a local PostgreSQL port')));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(port);
      });
    });
  });

const initializeCluster = async (binDir: string | null): Promise<StartedCluster> => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'shule-hub-it-postgres-'));
  const dataDir = path.join(rootDir, 'data');
  const logDir = path.join(rootDir, 'log');
  const logFile = path.join(logDir, 'postgres.log');
  const port = await reservePort();

  await mkdir(dataDir, { recursive: true });
  await mkdir(logDir, { recursive: true });

  const initdb = postgresBinary(binDir, 'initdb');
  const pgCtl = postgresBinary(binDir, 'pg_ctl');
  const createdb = postgresBinary(binDir, 'createdb');

  try {
    await runProcess(initdb, [
      '-D',
      dataDir,
      '-U',
      POSTGRES_SUPERUSER,
      '-A',
      'trust',
      '--encoding=UTF8',
    ]);
  } catch (error) {
    if (
      !isWin32RestrictedTokenBootstrapError(error)
      || !existsSync(path.join(dataDir, 'PG_VERSION'))
    ) {
      throw error;
    }
  }

  let postgresProcess: ChildProcess | undefined;

  try {
    await runProcess(pgCtl, [
      '-D',
      dataDir,
      '-l',
      logFile,
      '-w',
      'start',
      '-o',
      `-p ${port} -h 127.0.0.1`,
    ]);
  } catch (error) {
    if (
      process.platform !== 'win32'
      || (
        !isWin32RestrictedTokenBootstrapError(error)
        && !isSpawnPermissionError(error)
      )
    ) {
      throw error;
    }

    postgresProcess = await startPostgresProcess(binDir, dataDir, logFile, port);
  }

  await runProcess(createdb, [
    '-h',
    '127.0.0.1',
    '-p',
    String(port),
    '-U',
    POSTGRES_SUPERUSER,
    DEFAULT_DATABASE_NAME,
  ]);

  return {
    rootDir,
    dataDir,
    logFile,
    port,
    postgresProcess,
  };
};

const stopCluster = async (binDir: string | null, cluster: StartedCluster | null): Promise<void> => {
  if (!cluster) {
    return;
  }

  try {
    if (cluster.postgresProcess) {
      cluster.postgresProcess.kill();
      await new Promise<void>((resolve) => {
        cluster.postgresProcess?.once('exit', () => resolve());
        setTimeout(() => resolve(), 2_000);
      });
    } else {
      const pgCtl = postgresBinary(binDir, 'pg_ctl');
      await runProcess(
        pgCtl,
        ['-D', cluster.dataDir, '-w', 'stop', '-m', 'fast'],
        { stdio: 'pipe' },
      );
    }
  } catch {
    // Best effort shutdown; cleanup still runs below.
  }

  if (process.env.KEEP_TEST_POSTGRES !== '1') {
    for (let attempt = 1; attempt <= LOCAL_POSTGRES_CLEANUP_RETRIES; attempt += 1) {
      try {
        await rm(cluster.rootDir, { recursive: true, force: true });
        break;
      } catch (error) {
        if (attempt === LOCAL_POSTGRES_CLEANUP_RETRIES) {
          throw error;
        }

        await new Promise((resolve) => setTimeout(resolve, LOCAL_POSTGRES_CLEANUP_DELAY_MS));
      }
    }
  }
};

const runTargetCommand = async (commandArgs: string[], env: NodeJS.ProcessEnv): Promise<number> =>
  new Promise((resolve, reject) => {
    const [command, ...args] = commandArgs;
    const nodeResolvedCommand = resolveNodeCommand(command, args);

    if (nodeResolvedCommand) {
      const child = spawn(nodeResolvedCommand.command, nodeResolvedCommand.args, {
        cwd: process.cwd(),
        env,
        stdio: 'inherit',
        shell: false,
        windowsHide: true,
      });

      child.once('error', reject);
      child.once('exit', (code) => resolve(code ?? 1));
      return;
    }

    const resolvedCommand = resolveLocalBinary(command);
    const isWindowsBatchCommand =
      process.platform === 'win32' && /\.(cmd|bat)$/i.test(resolvedCommand);
    const child = isWindowsBatchCommand
      ? spawn(
          'cmd.exe',
          [
            '/d',
            '/s',
            '/c',
            `${quoteForWindowsShell(resolvedCommand)} ${args
              .map((argument) => quoteForWindowsShell(argument))
              .join(' ')}`.trim(),
          ],
          {
            cwd: process.cwd(),
            env,
            stdio: 'inherit',
            shell: false,
            windowsHide: true,
          },
        )
      : spawn(resolvedCommand, args, {
          cwd: process.cwd(),
          env,
          stdio: 'inherit',
          shell: false,
          windowsHide: true,
        });

    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });

const main = async (): Promise<void> => {
  const targetCommand = process.argv.slice(2);

  if (targetCommand.length === 0) {
    throw new Error('A target command is required after run-integration-with-local-postgres.ts');
  }

  if (process.env.DATABASE_URL?.trim()) {
    const exitCode = await runTargetCommand(targetCommand, process.env);
    process.exit(exitCode);
  }

  const binDir = await resolvePostgresBinDir();

  if (!binDir) {
    throw new Error(
      'DATABASE_URL is not set and no local PostgreSQL binaries were found. Set DATABASE_URL or PG_BIN_DIR.',
    );
  }

  let cluster: StartedCluster | null = null;

  try {
    cluster = await initializeCluster(binDir);
    const databaseUrl = `postgresql://${POSTGRES_SUPERUSER}@127.0.0.1:${cluster.port}/${DEFAULT_DATABASE_NAME}`;
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      DATABASE_URL: databaseUrl,
      APP_BASE_DOMAIN: process.env.APP_BASE_DOMAIN ?? 'integration.test',
    };

    process.stdout.write(
      `\n[local-postgres] Started disposable PostgreSQL on ${quoteIfNeeded(databaseUrl)}\n`,
    );

    const exitCode = await runTargetCommand(targetCommand, env);
    process.exitCode = exitCode;
  } finally {
    await stopCluster(binDir, cluster);
  }
};

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
