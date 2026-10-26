import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiKeyCreatedResponseDto,
  ApiKeyDto,
} from '@devpulse/shared';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { CsrfGuard } from '../auth/guards/csrf.guard';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

@Controller('api-keys')
@UseGuards(CsrfGuard)
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateApiKeyDto,
  ): Promise<ApiKeyCreatedResponseDto> {
    return this.apiKeysService.create(user.id, dto);
  }

  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiKeyDto[]> {
    return this.apiKeysService.findAll(user.id);
  }

  @Patch(':id/revoke')
  revoke(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ApiKeyDto> {
    return this.apiKeysService.revoke(id, user.id);
  }

  @Delete(':id')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.apiKeysService.remove(id, user.id);
  }
}
