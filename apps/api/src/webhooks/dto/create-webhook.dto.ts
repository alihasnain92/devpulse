import {
  IsArray,
  ArrayNotEmpty,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import {
  CreateWebhookRequestDto,
  WEBHOOK_CONFIG,
  WEBHOOK_EVENT_TYPES,
  WebhookEventType,
} from '@devpulse/shared';

export class CreateWebhookDto implements CreateWebhookRequestDto {
  @IsString({ message: 'Name must be a string' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsNotEmpty({ message: 'Webhook name is required and cannot be empty' })
  @MinLength(1, { message: 'Webhook name must contain at least 1 character' })
  @MaxLength(WEBHOOK_CONFIG.MAX_NAME_LENGTH, {
    message: `Webhook name must not exceed ${WEBHOOK_CONFIG.MAX_NAME_LENGTH} characters`,
  })
  name!: string;

  @IsString({ message: 'URL must be a string' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsNotEmpty({ message: 'URL is required' })
  url!: string;

  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @MaxLength(WEBHOOK_CONFIG.MAX_DESCRIPTION_LENGTH, {
    message: `Description must not exceed ${WEBHOOK_CONFIG.MAX_DESCRIPTION_LENGTH} characters`,
  })
  description?: string;

  @IsArray()
  @ArrayNotEmpty({ message: 'At least one event subscription is required' })
  @IsIn(WEBHOOK_EVENT_TYPES, {
    each: true,
    message: `Each event must be one of: ${WEBHOOK_EVENT_TYPES.join(', ')}`,
  })
  events!: WebhookEventType[];
}
