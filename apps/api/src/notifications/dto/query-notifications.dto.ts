import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { NOTIFICATION_PAGINATION_CONFIG } from '@devpulse/shared';

export class QueryNotificationsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(NOTIFICATION_PAGINATION_CONFIG.MAX_LIMIT)
  limit?: number = NOTIFICATION_PAGINATION_CONFIG.DEFAULT_LIMIT;

  @IsOptional()
  @IsIn(['all', 'read', 'unread'])
  status?: 'all' | 'read' | 'unread' = 'all';
}
