import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Request } from 'express';
import { SECURITY_CONFIG } from '@devpulse/shared';

@Injectable()
export class CsrfGuard implements CanActivate {
  private readonly allowedOrigins: string[];

  constructor() {
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    this.allowedOrigins = [frontendUrl];
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const method = request.method.toUpperCase();

    // Safe read-only HTTP methods are exempt from CSRF checks
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      return true;
    }

    // 1. Origin and Referer validation
    const origin = request.headers.origin;
    const referer = request.headers.referer;

    if (origin) {
      if (!this.allowedOrigins.includes(origin)) {
        throw new ForbiddenException(`Cross-origin request forbidden: ${origin}`);
      }
    } else if (referer) {
      try {
        const refererOrigin = new URL(referer).origin;
        if (!this.allowedOrigins.includes(refererOrigin)) {
          throw new ForbiddenException(`Cross-origin referer forbidden: ${refererOrigin}`);
        }
      } catch {
        throw new ForbiddenException('Malformed referer header');
      }
    }

    // 2. Custom CSRF Header validation for state-changing browser requests
    const csrfHeader = request.headers[SECURITY_CONFIG.CSRF_HEADER_NAME];
    if (csrfHeader !== SECURITY_CONFIG.CSRF_HEADER_VALUE) {
      throw new ForbiddenException(
        `Missing or invalid CSRF header. Please provide '${SECURITY_CONFIG.CSRF_HEADER_NAME}: ${SECURITY_CONFIG.CSRF_HEADER_VALUE}'`,
      );
    }

    return true;
  }
}
