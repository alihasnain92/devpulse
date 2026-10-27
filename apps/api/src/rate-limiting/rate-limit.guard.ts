import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import * as crypto from 'crypto';
import {
  RATE_LIMIT_HEADERS,
  RATE_LIMIT_POLICIES,
  RateLimitPolicy,
} from '@devpulse/shared';
import {
  RATE_LIMIT_METADATA_KEY,
  RateLimitOptions,
  SKIP_RATE_LIMIT_METADATA_KEY,
} from './rate-limit.decorator';
import { RateLimiterService, RateLimitResult } from './rate-limiter.service';

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimiterService: RateLimiterService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isSkip = this.reflector.getAllAndOverride<boolean>(
      SKIP_RATE_LIMIT_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isSkip) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const path = request.path || request.url || '';

    // Public health probes bypass rate limiting completely
    if (path === '/health' || path === '/health/worker') {
      return true;
    }

    // Manual webhook replay handles rate limiting directly in service to allow
    // idempotent retries to succeed even when rate limits are exhausted
    if (
      request.method === 'POST' &&
      path.match(/\/webhooks\/deliveries\/[^/]+\/replay/)
    ) {
      return true;
    }

    // Extract client IP safely respecting trusted proxy configuration
    const clientIp = this.extractClientIp(request);

    // Extract explicit rate limit options from decorator if present
    const explicitOptions = this.reflector.getAllAndOverride<RateLimitOptions>(
      RATE_LIMIT_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Determine request identity and policy
    const user = (request as unknown as { user?: { id: string } }).user;
    const apiKey = (request as unknown as { apiKey?: { id: string } }).apiKey;

    let result: RateLimitResult;

    if (request.method === 'POST' && path.match(/\/monitors\/[^/]+\/check/)) {
      // Monitor manual check: atomic dual-key enforcement (user/actor + target monitor)
      const monitorId = (request.params as { id?: string })?.id || 'unknown';
      const actorId = apiKey?.id ? `key:${apiKey.id}` : user?.id || 'unknown';

      const actorKey = `${RATE_LIMIT_POLICIES.MONITOR_CHECK_USER.keyPrefix}:${actorId}`;
      const targetKey = `${RATE_LIMIT_POLICIES.MONITOR_CHECK_TARGET.keyPrefix}:${monitorId}`;

      result = await this.rateLimiterService.checkMultiRateLimit([
        {
          key: actorKey,
          limit: RATE_LIMIT_POLICIES.MONITOR_CHECK_USER.limit,
          windowMs: RATE_LIMIT_POLICIES.MONITOR_CHECK_USER.ttlMs,
        },
        {
          key: targetKey,
          limit: RATE_LIMIT_POLICIES.MONITOR_CHECK_TARGET.limit,
          windowMs: RATE_LIMIT_POLICIES.MONITOR_CHECK_TARGET.ttlMs,
        },
      ]);
    } else if (apiKey) {
      // 1. Programmatic API Key requests (keyed by apiKeyId, never raw token)
      const policy: RateLimitPolicy =
        explicitOptions?.policy || RATE_LIMIT_POLICIES.API_KEY;
      const key = `${policy.keyPrefix}:${apiKey.id}`;
      result = await this.rateLimiterService.checkRateLimit(
        key,
        explicitOptions?.limit || policy.limit,
        explicitOptions?.ttlMs || policy.ttlMs,
      );
    } else if (user) {
      // 2. Authenticated user session
      let defaultPolicy: RateLimitPolicy =
        request.method === 'GET' || request.method === 'HEAD'
          ? RATE_LIMIT_POLICIES.USER_READ
          : RATE_LIMIT_POLICIES.USER_WRITE;

      if (explicitOptions?.policy) {
        defaultPolicy = explicitOptions.policy;
      }

      const key = `${explicitOptions?.keyPrefix || defaultPolicy.keyPrefix}:${user.id}`;
      result = await this.rateLimiterService.checkRateLimit(
        key,
        explicitOptions?.limit || defaultPolicy.limit,
        explicitOptions?.ttlMs || defaultPolicy.ttlMs,
      );
    } else {
      // 3. Unauthenticated requests (Auth endpoints & public routes)
      if (path.startsWith('/auth/login')) {
        const bodyEmail = (request.body as { email?: string })?.email;
        const emailHash = bodyEmail
          ? crypto
              .createHash('sha256')
              .update(bodyEmail.trim().toLowerCase())
              .digest('hex')
          : 'anonymous';

        const accountKey = `${RATE_LIMIT_POLICIES.AUTH_LOGIN.keyPrefix}:${clientIp}:${emailHash}`;
        const ipLimit =
          process.env.NODE_ENV === 'test'
            ? 5000
            : RATE_LIMIT_POLICIES.AUTH_LOGIN.ipLimit;
        const ipKey = `${RATE_LIMIT_POLICIES.AUTH_LOGIN.keyPrefix}:ip:${clientIp}`;

        result = await this.rateLimiterService.checkMultiRateLimit(
          [
            {
              key: accountKey,
              limit: RATE_LIMIT_POLICIES.AUTH_LOGIN.limit,
              windowMs: RATE_LIMIT_POLICIES.AUTH_LOGIN.ttlMs,
            },
            {
              key: ipKey,
              limit: ipLimit,
              windowMs: RATE_LIMIT_POLICIES.AUTH_LOGIN.ttlMs,
            },
          ],
          { fallbackFailClosed: true },
        );
      } else if (path.startsWith('/auth/register')) {
        const bodyEmail = (request.body as { email?: string })?.email;
        const emailHash = bodyEmail
          ? crypto
              .createHash('sha256')
              .update(bodyEmail.trim().toLowerCase())
              .digest('hex')
          : 'anonymous';

        const accountKey = `${RATE_LIMIT_POLICIES.AUTH_REGISTER.keyPrefix}:${clientIp}:${emailHash}`;
        const ipLimit =
          process.env.NODE_ENV === 'test'
            ? 5000
            : RATE_LIMIT_POLICIES.AUTH_REGISTER.ipLimit;
        const ipKey = `${RATE_LIMIT_POLICIES.AUTH_REGISTER.keyPrefix}:ip:${clientIp}`;

        result = await this.rateLimiterService.checkMultiRateLimit(
          [
            {
              key: accountKey,
              limit: RATE_LIMIT_POLICIES.AUTH_REGISTER.limit,
              windowMs: RATE_LIMIT_POLICIES.AUTH_REGISTER.ttlMs,
            },
            {
              key: ipKey,
              limit: ipLimit,
              windowMs: RATE_LIMIT_POLICIES.AUTH_REGISTER.ttlMs,
            },
          ],
          { fallbackFailClosed: true },
        );
      } else if (path.startsWith('/auth/refresh')) {
        const ipLimit =
          process.env.NODE_ENV === 'test'
            ? 5000
            : RATE_LIMIT_POLICIES.AUTH_REFRESH.limit;
        const ipKey = `${RATE_LIMIT_POLICIES.AUTH_REFRESH.keyPrefix}:${clientIp}`;
        result = await this.rateLimiterService.checkRateLimit(
          ipKey,
          ipLimit,
          RATE_LIMIT_POLICIES.AUTH_REFRESH.ttlMs,
        );
      } else {
        // Fallback for general unauthenticated
        const ipKey = `rl:anon:${clientIp}`;
        result = await this.rateLimiterService.checkRateLimit(
          ipKey,
          explicitOptions?.limit || 60,
          explicitOptions?.ttlMs || 60000,
        );
      }
    }

    // Apply standard rate limit headers to response
    const resetEpochSeconds = Math.ceil((Date.now() + result.resetMs) / 1000);
    response.setHeader(RATE_LIMIT_HEADERS.LIMIT, result.limit.toString());
    response.setHeader(
      RATE_LIMIT_HEADERS.REMAINING,
      Math.max(0, result.remaining).toString(),
    );
    response.setHeader(RATE_LIMIT_HEADERS.RESET, resetEpochSeconds.toString());

    if (!result.allowed) {
      if (result.serviceUnavailable) {
        this.logger.warn(
          `Rate limiter unavailable for authentication request at '${path}' (failing closed). Returning HTTP 503.`,
        );
        throw new HttpException(
          {
            statusCode: HttpStatus.SERVICE_UNAVAILABLE,
            message:
              'Authentication service temporarily unavailable. Please try again later.',
            error: 'Service Unavailable',
          },
          HttpStatus.SERVICE_UNAVAILABLE,
        );
      }

      const retryAfterSeconds = Math.max(1, Math.ceil(result.resetMs / 1000));
      response.setHeader(
        RATE_LIMIT_HEADERS.RETRY_AFTER,
        retryAfterSeconds.toString(),
      );

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'Too many requests. Please try again later.',
          error: 'Too Many Requests',
          retryAfter: retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  /**
   * Safely extracts client IP respecting trusted proxy configuration.
   */
  private extractClientIp(request: Request): string {
    const trustProxyEnv = process.env.TRUST_PROXY;
    const isTrustProxy = trustProxyEnv === 'true' || trustProxyEnv === '1';

    if (isTrustProxy) {
      const xForwardedFor = request.headers['x-forwarded-for'];
      if (typeof xForwardedFor === 'string') {
        const first = xForwardedFor.split(',')[0].trim();
        if (first) return first;
      } else if (Array.isArray(xForwardedFor) && xForwardedFor.length > 0) {
        const first = xForwardedFor[0].split(',')[0].trim();
        if (first) return first;
      }
    }

    return request.socket?.remoteAddress || request.ip || '127.0.0.1';
  }
}
