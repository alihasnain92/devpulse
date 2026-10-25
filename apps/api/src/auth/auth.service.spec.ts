import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: {
      findUnique: jest.Mock;
      create: jest.Mock;
    };
    refreshSession: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let jwtService: {
    sign: jest.Mock;
    verifyAsync: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
      refreshSession: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    jwtService = {
      sign: jest.fn().mockReturnValue('mock_access_jwt'),
      verifyAsync: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    const registerDto = {
      email: 'test@example.com',
      name: 'Test Engineer',
      password: 'StrongPassword123!',
    };

    it('should successfully register a new user with hashed password and return tokens', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'user-uuid-1',
        email: 'test@example.com',
        name: 'Test Engineer',
        hashedPassword: 'hashed_password_val',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      prisma.refreshSession.create.mockResolvedValue({
        id: 'session-1',
        userId: 'user-uuid-1',
      });

      const result = await service.register(registerDto);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
      expect(prisma.user.create).toHaveBeenCalled();
      // Ensure password stored is hashed, not plaintext
      const createArgs = prisma.user.create.mock.calls[0][0];
      expect(createArgs.data.hashedPassword).not.toBe(registerDto.password);
      expect(prisma.refreshSession.create).toHaveBeenCalled();
      expect(result.user).toEqual({
        id: 'user-uuid-1',
        email: 'test@example.com',
        name: 'Test Engineer',
        createdAt: '2026-01-01T00:00:00.000Z',
      });
      // Never expose password hash in response
      expect((result.user as unknown as Record<string, unknown>).hashedPassword).toBeUndefined();
      expect(result.accessToken).toBe('mock_access_jwt');
      expect(result.refreshToken).toBeDefined();
    });

    it('should throw ConflictException on duplicate email registration', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'existing-user-id',
        email: 'test@example.com',
      });

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const loginDto = {
      email: 'test@example.com',
      password: 'StrongPassword123!',
    };

    it('should successfully authenticate with valid credentials and issue tokens', async () => {
      const realHash = await bcrypt.hash(loginDto.password, 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-uuid-1',
        email: 'test@example.com',
        name: 'Test Engineer',
        hashedPassword: realHash,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      prisma.refreshSession.create.mockResolvedValue({ id: 'session-1' });

      const result = await service.login(loginDto);

      expect(result.user.email).toBe('test@example.com');
      expect(result.accessToken).toBe('mock_access_jwt');
      expect(result.refreshToken).toBeDefined();
      expect(prisma.refreshSession.create).toHaveBeenCalled();
    });

    it('should throw generic UnauthorizedException if user does not exist', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(
        new UnauthorizedException('Invalid email or password'),
      );
    });

    it('should throw generic UnauthorizedException if password does not match', async () => {
      const mismatchedHash = await bcrypt.hash('DifferentPassword', 10);
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-uuid-1',
        email: 'test@example.com',
        name: 'Test Engineer',
        hashedPassword: mismatchedHash,
        createdAt: new Date(),
      });

      await expect(service.login(loginDto)).rejects.toThrow(
        new UnauthorizedException('Invalid email or password'),
      );
    });
  });

  describe('refresh-token rotation', () => {
    const mockRawToken = 'raw_refresh_token_hex_string_12345';
    const familyId = 'family-uuid-1';

    it('should rotate valid refresh token, revoke old session and issue new tokens in same family', async () => {
      const tokenHash = service.hashToken(mockRawToken);
      const mockSession = {
        id: 'session-1',
        userId: 'user-1',
        familyId,
        hashedRefreshToken: tokenHash,
        isRevoked: false,
        expiresAt: new Date(Date.now() + 100000),
        user: {
          id: 'user-1',
          email: 'test@example.com',
          name: 'Test User',
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        },
      };

      prisma.refreshSession.findUnique.mockResolvedValue(mockSession);
      prisma.$transaction.mockImplementation(async (callback) => {
        const txMock = {
          refreshSession: {
            update: jest.fn().mockResolvedValue({}),
            create: jest.fn().mockResolvedValue({}),
          },
        };
        return callback(txMock);
      });

      const result = await service.refresh(mockRawToken);

      expect(result.user.email).toBe('test@example.com');
      expect(result.accessToken).toBe('mock_access_jwt');
      expect(result.refreshToken).toBeDefined();
      expect(result.refreshToken).not.toBe(mockRawToken);
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('should reject entirely unknown refresh token without revoking unrelated sessions', async () => {
      prisma.refreshSession.findUnique.mockResolvedValue(null);

      await expect(service.refresh('unknown_token')).rejects.toThrow(
        new UnauthorizedException('Invalid refresh token'),
      );
      expect(prisma.refreshSession.updateMany).not.toHaveBeenCalled();
    });

    it('should reject expired refresh token', async () => {
      const tokenHash = service.hashToken(mockRawToken);
      prisma.refreshSession.findUnique.mockResolvedValue({
        id: 'session-1',
        familyId,
        hashedRefreshToken: tokenHash,
        isRevoked: false,
        expiresAt: new Date(Date.now() - 10000), // Expired
      });

      await expect(service.refresh(mockRawToken)).rejects.toThrow(
        new UnauthorizedException('Refresh token has expired'),
      );
    });

    it('should detect reuse of already-revoked refresh token and revoke the entire token family', async () => {
      const tokenHash = service.hashToken(mockRawToken);
      prisma.refreshSession.findUnique.mockResolvedValue({
        id: 'session-1',
        familyId: 'compromised-family-id',
        hashedRefreshToken: tokenHash,
        isRevoked: true, // Already rotated/revoked!
        expiresAt: new Date(Date.now() + 100000),
      });

      await expect(service.refresh(mockRawToken)).rejects.toThrow(
        new UnauthorizedException(
          'Refresh token has been revoked due to reuse detection',
        ),
      );

      // Verify that the whole family is revoked
      expect(prisma.refreshSession.updateMany).toHaveBeenCalledWith({
        where: { familyId: 'compromised-family-id' },
        data: { isRevoked: true },
      });
    });
  });

  describe('logout', () => {
    it('should revoke active refresh session when token is provided', async () => {
      prisma.refreshSession.updateMany.mockResolvedValue({ count: 1 });

      const res = await service.logout('some_raw_refresh_token');

      expect(res.message).toBe('Logged out successfully');
      expect(prisma.refreshSession.updateMany).toHaveBeenCalledWith({
        where: {
          hashedRefreshToken: service.hashToken('some_raw_refresh_token'),
        },
        data: { isRevoked: true },
      });
    });
  });
});
