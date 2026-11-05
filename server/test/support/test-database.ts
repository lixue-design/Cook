import { randomUUID } from 'node:crypto';

export type TestDatabaseConfig = {
  connectionString: string;
  schemaName: string;
};

const canonicalUrl = (value: string): string => {
  const url = new URL(value);
  url.hash = '';
  return url.toString();
};

export const loadTestDatabaseConfig = (
  env: NodeJS.ProcessEnv = process.env
): TestDatabaseConfig => {
  const connectionString = String(env.TEST_DATABASE_URL || '').trim();
  if (!connectionString) {
    throw new Error('TEST_DATABASE_URL is required for database integration tests');
  }

  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('TEST_DATABASE_URL must be a valid PostgreSQL URL');
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    throw new Error('TEST_DATABASE_URL must use the postgres or postgresql protocol');
  }

  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!/(^|[-_])test(?:[-_]|$)/i.test(databaseName)) {
    throw new Error('TEST_DATABASE_URL database name must contain a standalone test marker');
  }

  const applicationUrl = String(env.DATABASE_URL || '').trim();
  if (applicationUrl && canonicalUrl(applicationUrl) === canonicalUrl(connectionString)) {
    throw new Error('TEST_DATABASE_URL must not equal DATABASE_URL');
  }

  return {
    connectionString,
    schemaName: `phase1_test_${process.pid}_${randomUUID().replaceAll('-', '')}`
  };
};

export const quoteIdentifier = (identifier: string): string => (
  `"${identifier.replaceAll('"', '""')}"`
);
