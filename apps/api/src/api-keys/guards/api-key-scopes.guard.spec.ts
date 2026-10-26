import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyScopesGuard } from './api-key-scopes.guard';

describe('ApiKeyScopesGuard', () => {
  let guard: ApiKeyScopesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new ApiKeyScopesGuard(reflector);
  });

  const createMockContext = (apiKey?: { scopes: string[] }) => {
    return {
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => ({
          apiKey,
        }),
      }),
    } as unknown as ExecutionContext;
  };

  it('allows access if no scopes are required by route', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const context = createMockContext({ scopes: ['monitors:read'] });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows full access for user session requests (no apiKey on request)', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['monitors:write']);
    // Authenticated via browser session/cookie: request.apiKey is undefined
    const context = createMockContext(undefined);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows access when API key possesses all required scopes', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['monitors:read']);
    const context = createMockContext({
      scopes: ['monitors:read', 'monitors:write'],
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('throws ForbiddenException when API key lacks required scope', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(['monitors:write']);
    const context = createMockContext({
      scopes: ['monitors:read', 'incidents:read'],
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});
