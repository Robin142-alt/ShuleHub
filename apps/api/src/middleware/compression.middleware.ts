import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { createGzip, createDeflate, constants as zlibConstants } from 'node:zlib';

/**
 * Response compression middleware.
 *
 * Applies gzip or deflate compression based on Accept-Encoding header.
 * Reduces bandwidth by 60–80% for JSON/HTML responses.
 *
 * Skips compression for:
 *  - Already-compressed responses (images, videos)
 *  - Responses smaller than 1KB (compression overhead not worth it)
 *  - SSE and WebSocket upgrades
 *  - Health check endpoints (fast path)
 */
@Injectable()
export class CompressionMiddleware implements NestMiddleware {
  private static readonly MIN_COMPRESSIBLE_SIZE = 1024;
  private static readonly COMPRESSIBLE_TYPES = new Set([
    'application/json',
    'text/html',
    'text/plain',
    'text/css',
    'text/javascript',
    'application/javascript',
    'application/xml',
    'text/xml',
    'image/svg+xml',
  ]);

  use(request: Request, response: Response, next: NextFunction): void {
    if (this.shouldSkip(request)) {
      next();
      return;
    }

    const acceptEncoding = (request.headers['accept-encoding'] ?? '').toString().toLowerCase();
    const supportsGzip = acceptEncoding.includes('gzip');
    const supportsDeflate = acceptEncoding.includes('deflate');

    if (!supportsGzip && !supportsDeflate) {
      next();
      return;
    }

    // Intercept response.end() and response.write() to compress
    const originalWrite = response.write.bind(response);
    const originalEnd = response.end.bind(response);
    const chunks: Buffer[] = [];

    response.write = function (chunk: unknown, ...args: unknown[]): boolean {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      }
      // Return true to indicate the data was accepted
      return true;
    } as typeof response.write;

    response.end = function (chunk?: unknown, ...args: unknown[]): Response {
      if (chunk) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      }

      const body = Buffer.concat(chunks);
      const contentType = (response.getHeader('content-type') ?? '').toString().split(';')[0].trim();

      // Skip compression for small responses or non-compressible content types
      if (
        body.length < CompressionMiddleware.MIN_COMPRESSIBLE_SIZE ||
        !CompressionMiddleware.isCompressible(contentType)
      ) {
        response.setHeader('content-length', body.length);
        originalWrite(body);
        return originalEnd();
      }

      const encoding = supportsGzip ? 'gzip' : 'deflate';
      const compressor = supportsGzip
        ? createGzip({ level: zlibConstants.Z_DEFAULT_COMPRESSION })
        : createDeflate({ level: zlibConstants.Z_DEFAULT_COMPRESSION });

      response.removeHeader('content-length');
      response.setHeader('content-encoding', encoding);
      response.setHeader('vary', 'accept-encoding');

      const compressedChunks: Buffer[] = [];

      compressor.on('data', (compressedChunk: Buffer) => {
        compressedChunks.push(compressedChunk);
      });

      compressor.on('end', () => {
        const compressed = Buffer.concat(compressedChunks);
        response.setHeader('content-length', compressed.length);
        originalWrite(compressed);
        originalEnd();
      });

      compressor.write(body);
      compressor.end();

      return response;
    } as typeof response.end;

    next();
  }

  private shouldSkip(request: Request): boolean {
    const path = (request.path || request.originalUrl || request.url).toLowerCase();

    // Skip health checks for minimum latency
    if (path === '/health' || path === '/health/ready') {
      return true;
    }

    // Skip SSE / upgrade requests
    if (request.headers.upgrade || request.headers.accept === 'text/event-stream') {
      return true;
    }

    return false;
  }

  private static isCompressible(contentType: string): boolean {
    if (CompressionMiddleware.COMPRESSIBLE_TYPES.has(contentType)) {
      return true;
    }

    // Catch application/json variants like application/problem+json
    if (contentType.includes('json') || contentType.includes('text')) {
      return true;
    }

    return false;
  }
}
