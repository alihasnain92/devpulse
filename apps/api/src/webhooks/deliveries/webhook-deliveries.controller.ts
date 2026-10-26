import {
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import {
  PaginatedWebhookDeliveriesDto,
  ReplayWebhookDeliveryResponseDto,
  WebhookAttemptDto,
  WebhookDeliveryDetailDto,
} from '@devpulse/shared';
import { CurrentUser, AuthenticatedUser } from '../../auth/decorators/current-user.decorator';
import { CsrfGuard } from '../../auth/guards/csrf.guard';
import { RequireScopes } from '../../api-keys/decorators/require-scopes.decorator';
import { WebhookDeliveriesService } from './webhook-deliveries.service';
import { QueryWebhookDeliveriesDto } from './dto/query-deliveries.dto';

@Controller('webhooks/deliveries')
@UseGuards(CsrfGuard)
export class WebhookDeliveriesController {
  constructor(
    private readonly deliveriesService: WebhookDeliveriesService,
  ) {}

  @RequireScopes('webhooks:read')
  @Get()
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: QueryWebhookDeliveriesDto,
  ): Promise<PaginatedWebhookDeliveriesDto> {
    return this.deliveriesService.findAll(user.id, query);
  }

  @RequireScopes('webhooks:read')
  @Get(':id')
  findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WebhookDeliveryDetailDto> {
    return this.deliveriesService.findOne(user.id, id);
  }

  @RequireScopes('webhooks:read')
  @Get(':id/attempts')
  getAttempts(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<WebhookAttemptDto[]> {
    return this.deliveriesService.getAttempts(user.id, id);
  }

  @RequireScopes('webhooks:write')
  @Post(':id/replay')
  async replay(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res({ passthrough: true }) res: Response,
    @Headers('idempotency-key') idempotencyKey?: string,
    @Headers('x-idempotency-key') xIdempotencyKey?: string,
  ): Promise<ReplayWebhookDeliveryResponseDto> {
    const key = idempotencyKey || xIdempotencyKey;
    const result = await this.deliveriesService.replay(user.id, id, key);
    res.status(result.isIdempotent ? HttpStatus.OK : HttpStatus.ACCEPTED);
    return {
      message: result.message,
      originalDeliveryId: result.originalDeliveryId,
      replayDelivery: result.replayDelivery,
      delivery: result.delivery,
      isIdempotent: result.isIdempotent,
    };
  }
}
