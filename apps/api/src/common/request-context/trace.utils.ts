import { randomBytes, randomUUID } from 'node:crypto';

export const generateTraceId = (): string => randomUUID().replace(/-/g, '');

export const generateSpanId = (): string => randomBytes(8).toString('hex');

