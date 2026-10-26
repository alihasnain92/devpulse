import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  API_KEY_SCOPES,
  ApiKeyScope,
  CreateApiKeyRequestDto,
} from '@devpulse/shared';

export class CreateApiKeyDto implements CreateApiKeyRequestDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(60)
  name!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsIn(API_KEY_SCOPES, {
    each: true,
    message: `Each scope must be one of: ${API_KEY_SCOPES.join(', ')}`,
  })
  scopes!: ApiKeyScope[];
}
