import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { SECURITY_CONFIG } from '@devpulse/shared';

export class RegisterDto {
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(SECURITY_CONFIG.MIN_PASSWORD_LENGTH, {
    message: `Password must be at least ${SECURITY_CONFIG.MIN_PASSWORD_LENGTH} characters long`,
  })
  @MaxLength(SECURITY_CONFIG.MAX_PASSWORD_LENGTH, {
    message: `Password cannot exceed ${SECURITY_CONFIG.MAX_PASSWORD_LENGTH} characters`,
  })
  password!: string;
}
