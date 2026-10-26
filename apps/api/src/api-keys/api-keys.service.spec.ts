import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { API_KEY_CONFIG } from '@devpulse/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ApiKeysService } from './api-keys.service';

describe('ApiKeysService (Unit)', () => {
  let service: ApiKeysService;

  const mockPrisma = {
    apiKey: {
      count: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      delete: jest.fn(),
    },
  };

  const userId = 'usr-test-123';
  const otherUserId = 'usr-other-456';
  const keyId = 'key-uuid-1';

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.apiKey.count.mockResolvedValue(0);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ApiKeysService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ApiKeysService>(ApiKeysService);
  });

  describe('create', () => {
    it('creates an API key with raw key returned once and one-way hash stored', async () => {
      mockPrisma.apiKey.create.mockImplementation(({ data }) => ({
        id: keyId,
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
        revokedAt: null,
        lastUsedAt: null,
      }));

      const dto = {
        name: 'CI Automation Probe Key',
        scopes: ['monitors:read' as const, 'monitors:write' as const],
      };

      const result = await service.create(userId, dto);

      expect(result.rawKey).toMatch(/^dp_live_[0-9a-f]{48}$/);
      expect(result.apiKey.keyPrefix).toBe(result.rawKey.slice(0, 16) + '...');
      expect(result.apiKey.scopes).toEqual(dto.scopes);

      // Verify DB write did NOT store the raw key
      expect(mockPrisma.apiKey.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          name: dto.name,
          isRevoked: false,
          hashedKey: service.hashKey(result.rawKey),
        }),
      });

      expect((result.apiKey as any).hashedKey).toBeUndefined();
    });

    it('enforces maximum active keys quota per user', async () => {
      mockPrisma.apiKey.count.mockResolvedValue(API_KEY_CONFIG.MAX_KEYS_PER_USER);

      await expect(
        service.create(userId, {
          name: 'Excess Key',
          scopes: ['monitors:read'],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('returns user-scoped keys without hashes or raw keys', async () => {
      mockPrisma.apiKey.findMany.mockResolvedValue([
        {
          id: keyId,
          userId,
          name: 'My Key',
          keyPrefix: 'dp_live_abcdef12...',
          hashedKey: 'super_secret_sha256_hash',
          scopes: ['monitors:read'],
          isRevoked: false,
          revokedAt: null,
          lastUsedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await service.findAll(userId);

      expect(mockPrisma.apiKey.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      });

      expect(result).toHaveLength(1);
      expect((result[0] as any).hashedKey).toBeUndefined();
      expect((result[0] as any).rawKey).toBeUndefined();
    });
  });

  describe('revoke', () => {
    it('revokes an API key belonging to user', async () => {
      mockPrisma.apiKey.findFirst.mockResolvedValue({ id: keyId, userId });
      mockPrisma.apiKey.update.mockResolvedValue({
        id: keyId,
        userId,
        name: 'Revoked Key',
        keyPrefix: 'dp_live_12345678...',
        scopes: ['monitors:read'],
        isRevoked: true,
        revokedAt: new Date(),
        lastUsedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.revoke(keyId, userId);

      expect(result.isRevoked).toBe(true);
      expect(result.revokedAt).toBeDefined();
      expect(mockPrisma.apiKey.update).toHaveBeenCalledWith({
        where: { id: keyId },
        data: expect.objectContaining({ isRevoked: true }),
      });
    });

    it('throws NotFoundException when revoking key belonging to another user', async () => {
      mockPrisma.apiKey.findFirst.mockResolvedValue(null);

      await expect(service.revoke(keyId, otherUserId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('validateRawKey', () => {
    const rawKey = 'dp_live_0123456789abcdef0123456789abcdef0123456789abcdef';

    it('validates active key and returns user and scope details', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValue({
        id: keyId,
        isRevoked: false,
        keyPrefix: 'dp_live_01234567...',
        scopes: ['monitors:read', 'incidents:read'],
        user: {
          id: userId,
          email: 'admin@devpulse.dev',
        },
      });

      const result = await service.validateRawKey(rawKey);

      expect(result).toEqual({
        id: keyId,
        userId,
        email: 'admin@devpulse.dev',
        keyPrefix: 'dp_live_01234567...',
        scopes: ['monitors:read', 'incidents:read'],
      });
    });

    it('rejects revoked keys immediately', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValue({
        id: keyId,
        isRevoked: true,
        user: { id: userId, email: 'admin@devpulse.dev' },
      });

      const result = await service.validateRawKey(rawKey);
      expect(result).toBeNull();
    });

    it('rejects unknown key hashes', async () => {
      mockPrisma.apiKey.findUnique.mockResolvedValue(null);

      const result = await service.validateRawKey(rawKey);
      expect(result).toBeNull();
    });

    it('rejects malformed raw keys missing prefix', async () => {
      const result = await service.validateRawKey('invalid_key_format');
      expect(result).toBeNull();
      expect(mockPrisma.apiKey.findUnique).not.toHaveBeenCalled();
    });
  });
});
