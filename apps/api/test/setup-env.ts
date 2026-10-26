import * as path from 'path';
import * as dotenv from 'dotenv';

// Load repository root .env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();

// Enforce test database isolation:
// All tests strictly connect to the dedicated `devpulse_test` database on port 5433,
// guaranteeing the development database (`devpulse`) is never touched, modified, or truncated.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
} else if (process.env.DATABASE_URL) {
  const url = new URL(process.env.DATABASE_URL);
  url.pathname = '/devpulse_test';
  process.env.DATABASE_URL = url.toString();
}

// Isolate Redis for testing (use Redis DB 1)
if (process.env.TEST_REDIS_URL) {
  process.env.REDIS_URL = process.env.TEST_REDIS_URL;
} else if (process.env.REDIS_URL) {
  const redisUrl = new URL(process.env.REDIS_URL);
  redisUrl.pathname = '/1';
  process.env.REDIS_URL = redisUrl.toString();
}
