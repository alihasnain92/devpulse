import { IsEnum, IsOptional } from 'class-validator';
import { StatsWindow } from '@devpulse/shared';

export class GetMonitorStatsDto {
  @IsOptional()
  @IsEnum(['24h', '7d', '30d'], {
    message: 'Window must be one of: 24h, 7d, 30d',
  })
  window?: StatsWindow = '24h';
}
