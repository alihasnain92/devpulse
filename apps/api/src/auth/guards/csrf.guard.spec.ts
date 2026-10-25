import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { SECURITY_CONFIG } from '@devpulse/shared';
import { CsrfGuard } from './csrf.guard';

describe('CsrfGuard', () => {
  let guard: CsrfGuard;

  beforeEach(() => {
    process.env.FRONTEND_URL = 'http://localhost:3000';
    guard = new CsrfGuard();
  });

  const createMockContext = (method: string, headers: Record<string, string>): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          method,
          headers,
        }),
      }),
    }) as unknown as ExecutionContext;

  it('should allow GET and HEAD requests without requiring CSRF headers', () => {
    const getContext = createMockContext('GET', {});
    expect(guard.canActivate(getContext)).toBe(true);

    const headContext = createMockContext('HEAD', {});
    expect(guard.canActivate(headContext)).toBe(true);
  });

  it('should reject state-changing POST requests with mismatched Origin', () => {
    const context = createMockContext('POST', {
      origin: 'https://malicious-site.com',
      [SECURITY_CONFIG.CSRF_HEADER_NAME]: SECURITY_CONFIG.CSRF_HEADER_VALUE,
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should reject state-changing POST requests with missing CSRF header', () => {
    const context = createMockContext('POST', {
      origin: 'http://localhost:3000',
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should allow state-changing POST requests with valid Origin and CSRF header', () => {
    const context = createMockContext('POST', {
      origin: 'http://localhost:3000',
      [SECURITY_CONFIG.CSRF_HEADER_NAME]: SECURITY_CONFIG.CSRF_HEADER_VALUE,
    });

    expect(guard.canActivate(context)).toBe(true);
  });
});
