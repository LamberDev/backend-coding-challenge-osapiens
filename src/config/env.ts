import * as dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const schema = z.object({
  /** SQLite database file path */
  DB_PATH: z.string().default('data/database.sqlite'),
  /** Drop and recreate the schema on every start */
  DB_DROP_SCHEMA: z.stringbool().default(true),
  /** Auto-sync TypeORM entities to the DB schema on start */
  DB_SYNCHRONIZE: z.stringbool().default(true),
  /** Task worker polling interval in milliseconds */
  WORKER_POLL_INTERVAL_MS: z.coerce.number().default(5000),
});

const result = schema.safeParse(process.env);

if (!result.success) {
  const fieldErrors = result.error.flatten().fieldErrors;
  const readable = Object.entries(fieldErrors)
    .map(([key, msgs]) => `  ${key}: ${(msgs ?? []).join(', ')}`)
    .join('\n');
  process.stderr.write(
    `[env] Invalid environment variables:\n${readable}\n` +
      `Fix the above variables (or remove them to use defaults) and restart.\n`,
  );
  process.exit(1);
}

const parsed = result.data;

export const config = Object.freeze({
  dbPath: parsed.DB_PATH,
  dropSchema: parsed.DB_DROP_SCHEMA,
  synchronize: parsed.DB_SYNCHRONIZE,
  workerPollIntervalMs: parsed.WORKER_POLL_INTERVAL_MS,
}) satisfies {
  dbPath: string;
  dropSchema: boolean;
  synchronize: boolean;
  workerPollIntervalMs: number;
};

export type Config = typeof config;
