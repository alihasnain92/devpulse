import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { API_KEY_CONFIG, AUTH_COOKIES } from '@devpulse/shared';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ApiKeysService } from '../../api-keys/api-keys.service';

export interface JwtPayload {
  sub: string;
  email: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    @Optional() private readonly apiKeysService?: ApiKeysService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();

    // 1. Check for API key (via x-api-key header or Bearer dp_live_...)
    const apiKeyRaw = this.extractApiKey(request);
    if (apiKeyRaw) {
      if (!this.apiKeysService) {
        throw new UnauthorizedException('API key authentication service not available');
      }
      const validatedKey = await this.apiKeysService.validateRawKey(apiKeyRaw);
      if (!validatedKey) {
        throw new UnauthorizedException('Invalid or revoked API key');
      }

      (request as any).user = {
        id: validatedKey.userId,
        email: validatedKey.email,
      };
      (request as any).apiKey = {
        id: validatedKey.id,
        keyPrefix: validatedKey.keyPrefix,
        scopes: validatedKey.scopes,
      };
      return true;
    }

    // 2. Check for standard user session token (cookie or Bearer JWT)
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token);
      (request as unknown as { user: { id: string; email: string } }).user = {
        id: payload.sub,
        email: payload.email,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired authentication token');
    }
  }

  private extractApiKey(request: Request): string | null {
    const headerKey = request.headers[API_KEY_CONFIG.HEADER_NAME];
    if (typeof headerKey === 'string' && headerKey.startsWith(API_KEY_CONFIG.PREFIX)) {
      return headerKey;
    }

    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith(`Bearer ${API_KEY_CONFIG.PREFIX}`)) {
      return authHeader.substring(7);
    }

    return null;
  }

  private extractToken(request: Request): string | null {
    // Primary: secure HTTP-only cookie
    if (request.cookies && request.cookies[AUTH_COOKIES.ACCESS_TOKEN]) {
      return request.cookies[AUTH_COOKIES.ACCESS_TOKEN];
    }

    // Secondary fallback: Authorization header (for automated testing / CLI tools)
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    return null;
  }
}
