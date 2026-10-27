import { validateEnvironment } from './env';

describe('validateEnvironment', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('skips validation when NODE_ENV is test and ENFORCE_ENV_VALIDATION is not set', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.ENFORCE_ENV_VALIDATION;
    delete process.env.DATABASE_URL;

    expect(() => validateEnvironment()).not.toThrow();
  });

  it('throws an error listing missing critical variables when enforced', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.DATABASE_URL;
    delete process.env.JWT_ACCESS_SECRET;
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.JWT_REFRESH_SECRET = 'secret';
    process.env.WEBHOOK_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    expect(() => validateEnvironment()).toThrow(
      'Missing required environment variable(s): DATABASE_URL, JWT_ACCESS_SECRET',
    );
  });

  it('accepts REDIS_HOST as an alternative to REDIS_URL', () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://localhost:5433/db';
    delete process.env.REDIS_URL;
    process.env.REDIS_HOST = 'localhost';
    process.env.JWT_ACCESS_SECRET = 'secret';
    process.env.JWT_REFRESH_SECRET = 'secret';
    process.env.WEBHOOK_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

    expect(() => validateEnvironment()).not.toThrow();
  });

  it('rejects invalid WEBHOOK_ENCRYPTION_KEY format', () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://localhost:5433/db';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.JWT_ACCESS_SECRET = 'secret';
    process.env.JWT_REFRESH_SECRET = 'secret';
    process.env.WEBHOOK_ENCRYPTION_KEY = 'short-key';

    expect(() => validateEnvironment()).toThrow(
      'WEBHOOK_ENCRYPTION_KEY must be a valid 32-byte key',
    );
  });

  it('never prints or exposes secret values in error messages', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.DATABASE_URL;
    process.env.JWT_ACCESS_SECRET = 'super-secret-access-token-xyz';

    try {
      validateEnvironment();
      fail('Expected validateEnvironment to throw');
    } catch (err: unknown) {
      expect((err as Error).message).not.toContain('super-secret-access-token-xyz');
    }
  });
});
