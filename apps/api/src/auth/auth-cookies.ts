import { Response } from 'express';
import { AUTH_COOKIES, AUTH_EXPIRY } from '@devpulse/shared';

export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
): void {
  const isProduction = process.env.NODE_ENV === 'production';

  res.cookie(AUTH_COOKIES.ACCESS_TOKEN, accessToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: AUTH_EXPIRY.ACCESS_TOKEN_MS,
  });

  res.cookie(AUTH_COOKIES.REFRESH_TOKEN, refreshToken, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: AUTH_EXPIRY.REFRESH_TOKEN_MS,
  });
}

export function clearAuthCookies(res: Response): void {
  const isProduction = process.env.NODE_ENV === 'production';

  res.clearCookie(AUTH_COOKIES.ACCESS_TOKEN, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  });

  res.clearCookie(AUTH_COOKIES.REFRESH_TOKEN, {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
  });
}
