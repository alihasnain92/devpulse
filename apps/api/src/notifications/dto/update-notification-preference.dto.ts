import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateNotificationPreferenceDto {
  @IsOptional()
  @IsBoolean()
  inAppIncidentCreated?: boolean;

  @IsOptional()
  @IsBoolean()
  inAppIncidentResolved?: boolean;

  @IsOptional()
  @IsBoolean()
  emailIncidentCreated?: boolean;

  @IsOptional()
  @IsBoolean()
  emailIncidentResolved?: boolean;
}
