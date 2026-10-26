import { SetMetadata } from '@nestjs/common';
import { ApiKeyScope } from '@devpulse/shared';

export const REQUIRE_SCOPES_KEY = 'require_scopes';

export const RequireScopes = (...scopes: ApiKeyScope[]) =>
  SetMetadata(REQUIRE_SCOPES_KEY, scopes);
