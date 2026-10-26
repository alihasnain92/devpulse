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
  WebhookCreatedResponseDto,
  WebhookEndpointDto,
} from '@devpulse/shared';
import { CurrentUser, AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { CsrfGuard } from '../auth/guards/csrf.guard';
import { RequireScopes } from '../api-keys/decorators/require-scopes.decorator';
import { WebhooksService } from './webhooks.service';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { UpdateWebhookDto } from './dto/update-webhook.dto';

@Controller('webhooks')
@UseGuards(CsrfGuard)
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @RequireScopes('webhooks:write')
  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateWebhookDto,
  ): Promise<WebhookCreatedResponseDto> {
    return this.webhooksService.create(user.id, dto);
  }

  @RequireScopes('webhooks:read')
  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<WebhookEndpointDto[]> {
    return this.webhooksService.findAll(user.id);
  }

  @RequireScopes('webhooks:read')
  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WebhookEndpointDto> {
    return this.webhooksService.findOne(id, user.id);
  }

  @RequireScopes('webhooks:write')
  @Patch(':id')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateWebhookDto,
  ): Promise<WebhookEndpointDto> {
    return this.webhooksService.update(id, user.id, dto);
  }

  @RequireScopes('webhooks:write')
  @Delete(':id')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ success: boolean; message: string }> {
    return this.webhooksService.remove(id, user.id);
  }
}
