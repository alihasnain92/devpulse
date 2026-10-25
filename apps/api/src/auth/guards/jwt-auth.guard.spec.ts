import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AUTH_COOKIES } from '@devpulse/shared';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: { getAllAndOverride: jest.Mock };
  let jwtService: { verifyAsync: jest.Mock };

  beforeEach(() => {
    reflector = {
      getAllAndOverride: jest.fn(),
    };
    jwtService = {
      verifyAsync: jest.fn(),
    };
    guard = new JwtAuthGuard(
      reflector as unknown as Reflector,
      jwtService as unknown as JwtService,
    );
  });

  const createMockContext = (request: Record<string, unknown>): ExecutionContext =>
    ({
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    }) as unknown as ExecutionContext;

  it('should allow public routes marked with @Public() without requiring a token', async () => {
    reflector.getAllAndOverride.mockReturnValue(true);
    const context = createMockContext({});

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(jwtService.verifyAsync).not.toHaveBeenCalled();
  });

  it('should throw UnauthorizedException when no token is present on protected route', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const context = createMockContext({ cookies: {}, headers: {} });

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Authentication required'),
    );
  });

  it('should authenticate and set req.user when valid access token cookie is present', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const mockRequest: Record<string, unknown> = {
      cookies: {
        [AUTH_COOKIES.ACCESS_TOKEN]: 'valid_jwt_cookie_token',
      },
      headers: {},
    };
    const context = createMockContext(mockRequest);

    jwtService.verifyAsync.mockResolvedValue({
      sub: 'user-uuid-1',
      email: 'test@example.com',
    });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(jwtService.verifyAsync).toHaveBeenCalledWith('valid_jwt_cookie_token');
    expect(mockRequest.user).toEqual({
      id: 'user-uuid-1',
      email: 'test@example.com',
    });
  });

  it('should throw UnauthorizedException when token verification fails', async () => {
    reflector.getAllAndOverride.mockReturnValue(false);
    const mockRequest = {
      cookies: {
        [AUTH_COOKIES.ACCESS_TOKEN]: 'invalid_or_expired_jwt',
      },
      headers: {},
    };
    const context = createMockContext(mockRequest);

    jwtService.verifyAsync.mockRejectedValue(new Error('jwt expired'));

    await expect(guard.canActivate(context)).rejects.toThrow(
      new UnauthorizedException('Invalid or expired authentication token'),
    );
  });
});
