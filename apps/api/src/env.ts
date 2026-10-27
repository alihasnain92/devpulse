import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

// Traverse upwards to find the root .env file in monorepo
let currentDir = __dirname;
while (currentDir !== path.dirname(currentDir)) {
  const envPath = path.join(currentDir, '.env');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
  currentDir = path.dirname(currentDir);
}

// Fallback to process.cwd() if DATABASE_URL is still missing
if (!process.env.DATABASE_URL) {
  const cwdEnv = path.join(process.cwd(), '.env');
  if (fs.existsSync(cwdEnv)) {
    dotenv.config({ path: cwdEnv });
  }
}

/**
 * Validates critical environment variables required for secure server startup.
 * Throws clean, descriptive errors without leaking secret values.
 */
export function validateEnvironment(): void {
  if (process.env.NODE_ENV === 'test' && !process.env.ENFORCE_ENV_VALIDATION) {
    return;
  }

  const requiredVars = [
    'DATABASE_URL',
    'REDIS_URL',
    'JWT_ACCESS_SECRET',
    'JWT_REFRESH_SECRET',
    'WEBHOOK_ENCRYPTION_KEY',
  ];

  const missing: string[] = [];
  for (const name of requiredVars) {
    const val = process.env[name];
    if (!val || !val.trim()) {
      if (name === 'REDIS_URL' && process.env.REDIS_HOST) {
        continue;
      }
      missing.push(name);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Fatal startup configuration error: Missing required environment variable(s): ${missing.join(', ')}. Please configure them in your environment.`,
    );
  }

  const webhookKey = process.env.WEBHOOK_ENCRYPTION_KEY?.trim();
  if (webhookKey) {
    const is64Hex = /^[0-9a-fA-F]{64}$/.test(webhookKey);
    const is32Raw = Buffer.byteLength(webhookKey, 'utf8') === 32;
    if (!is64Hex && !is32Raw) {
      throw new Error(
        'Fatal startup configuration error: WEBHOOK_ENCRYPTION_KEY must be a valid 32-byte key (either 64 hexadecimal characters or 32 raw bytes).',
      );
    }
  }
}

// Automatically validate when imported in non-test runtime
if (process.env.NODE_ENV !== 'test') {
  validateEnvironment();
}
