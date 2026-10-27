import { Test, TestingModule } from '@nestjs/testing';
import { Request, Response } from 'express';
import { AUTH_COOKIES } from '@devpulse/shared';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    register: jest.Mock;
    login: jest.Mock;
    refresh: jest.Mock;
    logout: jest.Mock;
  };

  const mockUserDto = {
    id: 'user-uuid-1',
    email: 'test@example.com',
    name: 'Test Engineer',
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(async () => {
    authService = {
      register: jest.fn().mockResolvedValue({
        user: mockUserDto,
        accessToken: 'mock_access_token',
        refreshToken: 'mock_refresh_token',
      }),
      login: jest.fn().mockResolvedValue({
        user: mockUserDto,
        accessToken: 'mock_access_token',
        refreshToken: 'mock_refresh_token',
      }),
      refresh: jest.fn().mockResolvedValue({
        user: mockUserDto,
        accessToken: 'mock_access_token_v2',
        refreshToken: 'mock_refresh_token_v2',
      }),
      logout: jest.fn().mockResolvedValue({
        message: 'Logged out successfully',
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  const createMockResponse = (): Response => {
    const res = {
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    } as unknown as Response;
    return res;
  };

  it('register: should set HTTP-only cookies and return user response', async () => {
    const res = createMockResponse();
    const result = await controller.register(
      { email: 'test@example.com', name: 'Test Engineer', password: 'Password123!' },
      res,
    );

    expect(authService.register).toHaveBeenCalled();
    expect(res.cookie).toHaveBeenCalledWith(
      AUTH_COOKIES.ACCESS_TOKEN,
      'mock_access_token',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/' }),
    );
    expect(res.cookie).toHaveBeenCalledWith(
      AUTH_COOKIES.REFRESH_TOKEN,
      'mock_refresh_token',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/' }),
    );
    expect(result.user).toEqual(mockUserDto);
    expect(result.message).toBe('User registered successfully');
  });

  it('login: should set HTTP-only cookies and return user response', async () => {
    const res = createMockResponse();
    const result = await controller.login(
      { email: 'test@example.com', password: 'Password123!' },
      res,
    );

    expect(authService.login).toHaveBeenCalled();
    expect(res.cookie).toHaveBeenCalledWith(
      AUTH_COOKIES.ACCESS_TOKEN,
      'mock_access_token',
      expect.objectContaining({ httpOnly: true }),
    );
    expect(result.user).toEqual(mockUserDto);
    expect(result.message).toBe('Logged in successfully');
  });

  it('refresh: should extract cookie and issue new cookies', async () => {
    const req = {
      cookies: {
        [AUTH_COOKIES.REFRESH_TOKEN]: 'existing_refresh_token',
      },
    } as unknown as Request;
    const res = createMockResponse();

    const result = await controller.refresh(req, res);

    expect(authService.refresh).toHaveBeenCalledWith('existing_refresh_token');
    expect(res.cookie).toHaveBeenCalledWith(
      AUTH_COOKIES.ACCESS_TOKEN,
      'mock_access_token_v2',
      expect.objectContaining({ httpOnly: true }),
    );
    expect(result.message).toBe('Token refreshed successfully');
  });

  it('logout: should clear cookies and return confirmation', async () => {
    const req = {
      cookies: {
        [AUTH_COOKIES.REFRESH_TOKEN]: 'existing_refresh_token',
      },
    } as unknown as Request;
    const res = createMockResponse();

    const result = await controller.logout(req, res);

    expect(authService.logout).toHaveBeenCalledWith('existing_refresh_token');
    expect(res.clearCookie).toHaveBeenCalledWith(
      AUTH_COOKIES.ACCESS_TOKEN,
      expect.objectContaining({ path: '/' }),
    );
    expect(res.clearCookie).toHaveBeenCalledWith(
      AUTH_COOKIES.REFRESH_TOKEN,
      expect.objectContaining({ path: '/' }),
    );
    expect(result.message).toBe('Logged out successfully');
  });
});
