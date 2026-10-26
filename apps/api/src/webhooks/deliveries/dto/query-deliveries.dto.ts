import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  WEBHOOK_DELIVERY_ORIGIN,
  WEBHOOK_DELIVERY_STATUS,
  WEBHOOK_EVENT_TYPES,
  WEBHOOK_PAGINATION_CONFIG,
  WebhookDeliveryOrigin,
  WebhookDeliveryStatus,
  WebhookEventType,
} from '@devpulse/shared';

export class QueryWebhookDeliveriesDto {
  @IsOptional()
  @IsUUID()
  endpointId?: string;

  @IsOptional()
  @IsEnum(WEBHOOK_DELIVERY_STATUS)
  status?: WebhookDeliveryStatus;

  @IsOptional()
  @IsEnum(WEBHOOK_EVENT_TYPES)
  eventType?: WebhookEventType;

  @IsOptional()
  @IsEnum(WEBHOOK_DELIVERY_ORIGIN)
  origin?: WebhookDeliveryOrigin;

  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(WEBHOOK_PAGINATION_CONFIG.MAX_LIMIT)
  limit?: number = WEBHOOK_PAGINATION_CONFIG.DEFAULT_LIMIT;
}
