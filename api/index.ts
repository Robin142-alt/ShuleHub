import 'reflect-metadata';

process.env.APP_RUNTIME = process.env.APP_RUNTIME ?? 'serverless';
process.env.EVENTS_DISPATCHER_ENABLED =
  process.env.EVENTS_DISPATCHER_ENABLED ?? 'false';
process.env.EVENTS_WORKER_ENABLED = process.env.EVENTS_WORKER_ENABLED ?? 'false';
process.env.OBSERVABILITY_SLO_BACKGROUND_ENABLED =
  process.env.OBSERVABILITY_SLO_BACKGROUND_ENABLED ?? 'false';

import type { Request, Response } from 'express';
import express, { Express } from 'express';
import { ExpressAdapter } from '@nestjs/platform-express';

import { createApp } from '../apps/api/src/app.factory';

let cachedExpressApp: Express | null = null;
let bootstrapPromise: Promise<Express> | null = null;

const getExpressApp = async (): Promise<Express> => {
  if (cachedExpressApp) {
    return cachedExpressApp;
  }

  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
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
  const expressApp = await getExpressApp();
  expressApp(req, res);
}
