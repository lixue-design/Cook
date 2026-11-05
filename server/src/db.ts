import { Pool } from 'pg';
import { loadConfig } from './config';

let sharedPool: Pool | undefined;

export const createPool = (): Pool => {
  const config = loadConfig();
  return new Pool({
    connectionString: config.databaseUrl,
    max: config.databasePoolMax,
    connectionTimeoutMillis: config.databaseConnectionTimeoutMs,
    ssl: config.databaseSsl ? { rejectUnauthorized: true } : false,
    application_name: 'cook-ai-dish-library'
  });
};

export const getPool = (): Pool => {
  if (!sharedPool) sharedPool = createPool();
  return sharedPool;
};

export const closePool = async (): Promise<void> => {
  if (!sharedPool) return;
  const pool = sharedPool;
  sharedPool = undefined;
  await pool.end();
};
