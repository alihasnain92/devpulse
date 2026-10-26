import { Module } from '@nestjs/common';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysService } from './api-keys.service';
import { ApiKeyScopesGuard } from './guards/api-key-scopes.guard';

@Module({
  controllers: [ApiKeysController],
  providers: [ApiKeysService, ApiKeyScopesGuard],
  exports: [ApiKeysService, ApiKeyScopesGuard],
})
export class ApiKeysModule {}
