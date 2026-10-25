import {
  ConflictException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import {
  AUTH_EXPIRY,
  SECURITY_CONFIG,
  UserDto,
} from '@devpulse/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

export interface AuthTokens {
  user: UserDto;
  accessToken: string;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthTokens> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    // Check email uniqueness before attempting write
    const existing = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existing) {
      throw new ConflictException('A user with this email address already exists');
    }

    const hashedPassword = await bcrypt.hash(
      dto.password,
      SECURITY_CONFIG.BCRYPT_SALT_ROUNDS,
    );

    const user = await this.prisma.user.create({
      data: {
        email: normalizedEmail,
        name: dto.name.trim(),
        hashedPassword,
      },
    });

    this.logger.log(`New user registered: ${user.id}`);

    const accessToken = this.generateAccessToken(user);
    const { refreshToken, hashedRefreshToken } = this.generateRefreshToken();
    const familyId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + AUTH_EXPIRY.REFRESH_TOKEN_MS);

    await this.prisma.refreshSession.create({
      data: {
        userId: user.id,
        hashedRefreshToken,
        familyId,
        expiresAt,
      },
    });

    return {
      user: this.formatUser(user),
      accessToken,
      refreshToken,
    };
  }

  async login(dto: LoginDto): Promise<AuthTokens> {
    const normalizedEmail = dto.email.trim().toLowerCase();

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (!user) {
      // Use generic error to avoid user enumeration
      throw new UnauthorizedException('Invalid email or password');
    }

    const isMatch = await bcrypt.compare(dto.password, user.hashedPassword);
    if (!isMatch) {
      throw new UnauthorizedException('Invalid email or password');
    }

    this.logger.log(`User logged in: ${user.id}`);

    const accessToken = this.generateAccessToken(user);
    const { refreshToken, hashedRefreshToken } = this.generateRefreshToken();
    const familyId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + AUTH_EXPIRY.REFRESH_TOKEN_MS);

    await this.prisma.refreshSession.create({
      data: {
        userId: user.id,
        hashedRefreshToken,
        familyId,
        expiresAt,
      },
    });

    return {
      user: this.formatUser(user),
      accessToken,
      refreshToken,
    };
  }

  async refresh(rawRefreshToken: string): Promise<AuthTokens> {
    if (!rawRefreshToken) {
      throw new UnauthorizedException('Refresh token is required');
    }

    const hashedRefreshToken = this.hashToken(rawRefreshToken);

    const session = await this.prisma.refreshSession.findUnique({
      where: { hashedRefreshToken },
      include: { user: true },
    });

    // If session does not exist, reject without affecting unrelated sessions
    if (!session) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Refresh token reuse detection:
    // If the token record was already revoked, an attacker or concurrent process is attempting reuse!
    // Revoke the entire token family immediately as a protective measure.
    if (session.isRevoked) {
      this.logger.warn(
        `Refresh token reuse detected for family ${session.familyId}! Revoking all sessions in family.`,
      );
      await this.prisma.refreshSession.updateMany({
        where: { familyId: session.familyId },
        data: { isRevoked: true },
      });
      throw new UnauthorizedException(
        'Refresh token has been revoked due to reuse detection',
      );
    }

    // Check expiration
    if (session.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token has expired');
    }

    // Perform atomic rotation
    const { refreshToken: newRefreshToken, hashedRefreshToken: newHashedToken } =
      this.generateRefreshToken();
    const newExpiresAt = new Date(Date.now() + AUTH_EXPIRY.REFRESH_TOKEN_MS);

    await this.prisma.$transaction(async (tx) => {
      const client = tx as unknown as PrismaService;
      // 1. Revoke the presented token
      await client.refreshSession.update({
        where: { id: session.id },
        data: { isRevoked: true },
      });

      // 2. Issue new token in the same family
      await client.refreshSession.create({
        data: {
          userId: session.userId,
          hashedRefreshToken: newHashedToken,
          familyId: session.familyId,
          expiresAt: newExpiresAt,
        },
      });
    });

    const newAccessToken = this.generateAccessToken(session.user);

    return {
      user: this.formatUser(session.user),
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    };
  }

  async logout(rawRefreshToken?: string): Promise<{ message: string }> {
    if (rawRefreshToken) {
      const hashedRefreshToken = this.hashToken(rawRefreshToken);
      await this.prisma.refreshSession.updateMany({
        where: { hashedRefreshToken },
        data: { isRevoked: true },
      });
    }

    return { message: 'Logged out successfully' };
  }

  private generateAccessToken(user: { id: string; email: string }): string {
    return this.jwtService.sign(
      { sub: user.id, email: user.email },
      { expiresIn: AUTH_EXPIRY.ACCESS_TOKEN_SECONDS },
    );
  }

  private generateRefreshToken(): {
    refreshToken: string;
    hashedRefreshToken: string;
  } {
    const refreshToken = crypto.randomBytes(32).toString('hex');
    const hashedRefreshToken = this.hashToken(refreshToken);
    return { refreshToken, hashedRefreshToken };
  }

  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  formatUser(user: {
    id: string;
    email: string;
    name: string;
    createdAt: Date;
  }): UserDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
