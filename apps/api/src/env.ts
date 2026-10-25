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
