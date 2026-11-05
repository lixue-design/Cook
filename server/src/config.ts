export type AppConfig = {
  nodeEnv: string;
  host: string;
  port: number;
  databaseUrl: string;
  databaseSsl: boolean;
  databasePoolMax: number;
  databaseConnectionTimeoutMs: number;
  imageStorageRoot: string;
  arkApiKey: string;
  arkImageModel: string;
  arkImageApiUrl: string;
  arkImageTimeoutMs: number;
  adminApiToken: string;
};

const parseInteger = (name: string, value: string | undefined, fallback: number, minimum: number): number => {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new Error(`${name} must be an integer greater than or equal to ${minimum}`);
  }
  return parsed;
};

const parseBoolean = (name: string, value: string | undefined, fallback: boolean): boolean => {
  if (value === undefined || value === '') return fallback;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be true or false`);
};

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): AppConfig => {
  const databaseUrl = String(env.DATABASE_URL || '').trim();
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  return {
    nodeEnv: String(env.NODE_ENV || 'development'),
    host: String(env.HOST || '0.0.0.0'),
    port: parseInteger('PORT', env.PORT, 3000, 1),
    databaseUrl,
    databaseSsl: parseBoolean('DATABASE_SSL', env.DATABASE_SSL, false),
    databasePoolMax: parseInteger('DATABASE_POOL_MAX', env.DATABASE_POOL_MAX, 10, 1),
    databaseConnectionTimeoutMs: parseInteger(
      'DATABASE_CONNECTION_TIMEOUT_MS',
      env.DATABASE_CONNECTION_TIMEOUT_MS,
      5000,
      1
    ),
    imageStorageRoot: String(env.IMAGE_STORAGE_ROOT || '').trim()
      || path.resolve(__dirname, '../../../storage/dish-images'),
    arkApiKey: String(env.ARK_API_KEY || '').trim(),
    arkImageModel: String(env.ARK_IMAGE_MODEL || '').trim(),
    arkImageApiUrl: String(env.ARK_IMAGE_API_URL || 'https://ark.cn-beijing.volces.com/api/v3/images/generations').trim(),
    arkImageTimeoutMs: parseInteger('ARK_IMAGE_TIMEOUT_MS', env.ARK_IMAGE_TIMEOUT_MS, 180000, 1000),
    adminApiToken: String(env.ADMIN_API_TOKEN || '').trim()
  };
};
import path from 'node:path';
