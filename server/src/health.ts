import { EXPECTED_DATABASE_VERSION } from './schema-version';

export type QueryExecutor = {
  query(sql: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>;
};

export type HealthPayload = {
  status: 'ok' | 'error';
  service: 'ai-dish-library';
  database: 'ok' | 'error' | 'not_checked';
  databaseVersion?: number;
  expectedDatabaseVersion?: number;
};

export const getLiveness = (): HealthPayload => ({
  status: 'ok',
  service: 'ai-dish-library',
  database: 'not_checked'
});

export const getReadiness = async (
  executor: QueryExecutor,
  expectedDatabaseVersion = EXPECTED_DATABASE_VERSION
): Promise<HealthPayload> => {
  try {
    await executor.query('SELECT 1 AS ok');
    const result = await executor.query('SELECT COALESCE(MAX(version), 0)::int AS version FROM schema_migrations');
    const databaseVersion = Number(result.rows[0]?.version || 0);
    if (databaseVersion !== expectedDatabaseVersion) {
      return {
        status: 'error',
        service: 'ai-dish-library',
        database: 'error',
        databaseVersion,
        expectedDatabaseVersion
      };
    }
    return {
      status: 'ok',
      service: 'ai-dish-library',
      database: 'ok',
      databaseVersion,
      expectedDatabaseVersion
    };
  } catch {
    return {
      status: 'error',
      service: 'ai-dish-library',
      database: 'error',
      expectedDatabaseVersion
    };
  }
};
