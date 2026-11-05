import { createServer } from 'node:http';
import { createRequestHandler } from './app';
import { loadConfig } from './config';
import { closePool, getPool } from './db';
import { createArkDishImageFallback } from './ark-dish-image-generator';

const config = loadConfig();
const pool = getPool();
const imageFallback = config.arkApiKey && config.arkImageModel
  ? createArkDishImageFallback(pool, {
      apiKey: config.arkApiKey,
      model: config.arkImageModel,
      apiUrl: config.arkImageApiUrl,
      timeoutMs: config.arkImageTimeoutMs,
      imageStorageRoot: config.imageStorageRoot
    })
  : undefined;
const server = createServer(createRequestHandler(
  pool,
  undefined,
  config.imageStorageRoot,
  imageFallback,
  config.adminApiToken
));

server.listen(config.port, config.host, () => {
  process.stdout.write(`ai-dish-library listening on ${config.host}:${config.port}\n`);
});

const shutdown = (): void => {
  server.close(() => {
    void closePool().finally(() => process.exit(0));
  });
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
