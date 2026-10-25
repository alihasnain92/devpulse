import * as path from 'path';
import * as dotenv from 'dotenv';

// Load repository root .env
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config();
