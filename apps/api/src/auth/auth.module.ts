import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AUTH_EXPIRY } from '@devpulse/shared';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CsrfGuard } from './guards/csrf.guard';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({
      secret:
        process.env.JWT_SECRET ||
        process.env.JWT_ACCESS_SECRET ||
        'devpulse_default_jwt_secret_dev_only_change_in_production',
      signOptions: {
        expiresIn: `${AUTH_EXPIRY.ACCESS_TOKEN_SECONDS}s`,
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard, CsrfGuard],
  exports: [AuthService, JwtModule, JwtAuthGuard],
})
export class AuthModule {}
