import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Request, Response } from 'express';
import {
  AUTH_COOKIES,
  AuthResponseDto,
  MessageResponseDto,
} from '@devpulse/shared';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Public } from './decorators/public.decorator';
import { clearAuthCookies, setAuthCookies } from './auth-cookies';
import { CsrfGuard } from './guards/csrf.guard';

@Controller('auth')
@UseGuards(CsrfGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const result = await this.authService.register(dto);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    return {
      user: result.user,
      message: 'User registered successfully',
    };
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const result = await this.authService.login(dto);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    return {
      user: result.user,
      message: 'Logged in successfully',
    };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthResponseDto> {
    const rawRefreshToken = req.cookies?.[AUTH_COOKIES.REFRESH_TOKEN];
    const result = await this.authService.refresh(rawRefreshToken);
    setAuthCookies(res, result.accessToken, result.refreshToken);
    return {
      user: result.user,
      message: 'Token refreshed successfully',
    };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MessageResponseDto> {
    const rawRefreshToken = req.cookies?.[AUTH_COOKIES.REFRESH_TOKEN];
    const result = await this.authService.logout(rawRefreshToken);
    clearAuthCookies(res);
    return result;
  }
}
