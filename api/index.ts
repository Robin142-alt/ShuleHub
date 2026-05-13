import 'reflect-metadata';

process.env.APP_RUNTIME = process.env.APP_RUNTIME ?? 'serverless';
process.env.EVENTS_DISPATCHER_ENABLED =
  process.env.EVENTS_DISPATCHER_ENABLED ?? 'false';
process.env.EVENTS_WORKER_ENABLED = process.env.EVENTS_WORKER_ENABLED ?? 'false';
process.env.OBSERVABILITY_SLO_BACKGROUND_ENABLED =
  process.env.OBSERVABILITY_SLO_BACKGROUND_ENABLED ?? 'false';

import type { Express, Request, Response } from 'express';

let cachedExpressApp: Express | null = null;
let bootstrapPromise: Promise<Express> | null = null;

const getExpressApp = async (): Promise<Express> => {
  if (cachedExpressApp) {
    return cachedExpressApp;
  }

  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const [{ default: express }, { ExpressAdapter }, { createApp }] =
        await Promise.all([
          import('express'),
          import('@nestjs/platform-express'),
          import('../apps/api/src/app.factory'),
        ]);
      const expressApp = express();
      const app = await createApp(new ExpressAdapter(expressApp));
      await app.init();
      cachedExpressApp = expressApp;
      return expressApp;
    })();
  }

  return bootstrapPromise;
};

export default async function handler(req: Request, res: Response): Promise<void> {
  if (req.url === '/__ping' || req.url?.startsWith('/__ping?')) {
    res.status(200).json({
      status: 'ok',
      runtime: 'serverless',
      generated_at: new Date().toISOString(),
    });
    return;
  }

  try {
    const expressApp = await getExpressApp();
    expressApp(req, res);
  } catch (error) {
    bootstrapPromise = null;
    console.error(
      'API bootstrap failed',
      error instanceof Error ? error.stack : error,
    );
    res.status(503).json({
      status: 'degraded',
      error: {
        code: 'api_bootstrap_failed',
        message: 'API runtime is not ready. Check production environment variables and backing services.',
      },
      generated_at: new Date().toISOString(),
    });
  }
}
