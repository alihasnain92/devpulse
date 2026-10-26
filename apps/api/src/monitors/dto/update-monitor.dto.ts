import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { HttpMethod, MONITOR_LIMITS } from '@devpulse/shared';
import { IsValidMonitorUrl } from '../validators/is-valid-url.validator';

export class UpdateMonitorDto {
  @IsOptional()
  @IsString({ message: 'Name must be a string' })
  @IsNotEmpty({ message: 'Monitor name cannot be empty' })
  @MaxLength(100, { message: 'Monitor name must not exceed 100 characters' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  name?: string;

  @IsOptional()
  @IsString({ message: 'URL must be a string' })
  @IsNotEmpty({ message: 'URL cannot be empty' })
  @IsValidMonitorUrl()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  url?: string;

  @IsOptional()
  @IsEnum(HttpMethod, {
    message: `Method must be either ${HttpMethod.GET} or ${HttpMethod.HEAD}`,
  })
  method?: HttpMethod;

  @IsOptional()
  @IsInt({ message: 'Interval must be an integer' })
  @Min(MONITOR_LIMITS.MIN_INTERVAL_SECONDS, {
    message: `Interval must be at least ${MONITOR_LIMITS.MIN_INTERVAL_SECONDS} seconds`,
  })
  @Max(MONITOR_LIMITS.MAX_INTERVAL_SECONDS, {
    message: `Interval must not exceed ${MONITOR_LIMITS.MAX_INTERVAL_SECONDS} seconds`,
  })
  intervalSeconds?: number;

  @IsOptional()
  @IsInt({ message: 'Timeout must be an integer' })
  @Min(MONITOR_LIMITS.MIN_TIMEOUT_MS, {
    message: `Timeout must be at least ${MONITOR_LIMITS.MIN_TIMEOUT_MS} ms (1 second)`,
  })
  @Max(MONITOR_LIMITS.MAX_TIMEOUT_MS, {
    message: `Timeout must not exceed ${MONITOR_LIMITS.MAX_TIMEOUT_MS} ms (30 seconds)`,
  })
  timeoutMs?: number;

  @IsOptional()
  @IsInt({ message: 'Expected status must be an integer' })
  @Min(100, { message: 'Expected status must be at least 100' })
  @Max(599, { message: 'Expected status must not exceed 599' })
  expectedStatus?: number;

  @IsOptional()
  @IsBoolean({ message: 'isPaused must be a boolean' })
  isPaused?: boolean;
}
