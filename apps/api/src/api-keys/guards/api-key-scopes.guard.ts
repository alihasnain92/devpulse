import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiKeyScope } from '@devpulse/shared';
import { REQUIRE_SCOPES_KEY } from '../decorators/require-scopes.decorator';

@Injectable()
export class ApiKeyScopesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredScopes = this.reflector.getAllAndOverride<ApiKeyScope[]>(
      REQUIRE_SCOPES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredScopes || requiredScopes.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const apiKey = request.apiKey as
      | { id: string; keyPrefix: string; scopes: ApiKeyScope[] }
      | undefined;

    // Requests authenticated via full user session (cookie/JWT) have full user permissions
    if (!apiKey) {
      return true;
    }

    // Requests authenticated via API Key must possess all required scopes
    for (const scope of requiredScopes) {
      if (!apiKey.scopes.includes(scope)) {
        throw new ForbiddenException(
          `API key lacks required scope '${scope}'. Granted scopes: [${apiKey.scopes.join(', ')}]`,
        );
      }
    }

    return true;
  }
}
