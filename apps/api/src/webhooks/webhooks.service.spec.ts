import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { WebhookCryptoService } from './crypto/webhook-crypto.service';
import { WebhooksService } from './webhooks.service';

describe('WebhooksService (Unit)', () => {
  let service: WebhooksService;

  const mockPrisma = {
    webhookEndpoint: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
  };

  const mockCrypto = {
    generateSecret: jest.fn().mockReturnValue('whsec_mock_raw_secret_12345'),
    encryptSecret: jest.fn().mockReturnValue('iv:authtag:encrypted_ciphertext'),
    decryptSecret: jest.fn().mockReturnValue('whsec_mock_raw_secret_12345'),
  };

  const userId = 'usr-test-123';
  const otherUserId = 'usr-other-456';
  const endpointId = 'wh-123';

  const mockEndpointRecord = {
    id: endpointId,
    userId,
    name: 'Production Slack Gateway',
    url: 'https://hooks.slack.com/services/T00/B00/X00',
    description: 'Receives outage events for our internal operations service.',
    events: ['incident.created', 'incident.resolved'],
    isEnabled: true,
    encryptedSecret: 'iv:authtag:encrypted_ciphertext',
    createdAt: new Date('2026-10-26T12:00:00Z'),
    updatedAt: new Date('2026-10-26T12:00:00Z'),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.webhookEndpoint.count.mockResolvedValue(0);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: WebhookCryptoService, useValue: mockCrypto },
      ],
    }).compile();

    service = module.get<WebhooksService>(WebhooksService);
  });

  describe('create', () => {
    it('successfully creates an endpoint, encrypts the secret, and returns the raw secret once', async () => {
      mockPrisma.webhookEndpoint.create.mockResolvedValue(mockEndpointRecord);

      const dto = {
        name: 'Production Slack Gateway',
        url: 'https://hooks.slack.com/services/T00/B00/X00',
        events: ['incident.created', 'incident.resolved'] as any,
      };

      const result = await service.create(userId, dto);

      expect(mockCrypto.generateSecret).toHaveBeenCalled();
      expect(mockCrypto.encryptSecret).toHaveBeenCalledWith('whsec_mock_raw_secret_12345');
      expect(mockPrisma.webhookEndpoint.create).toHaveBeenCalledWith({
        data: {
          userId,
          name: dto.name,
          url: dto.url,
          description: null,
          events: dto.events,
          encryptedSecret: 'iv:authtag:encrypted_ciphertext',
          isEnabled: true,
        },
      });

      expect(result.signingSecret).toBe('whsec_mock_raw_secret_12345');
      expect(result.endpoint.id).toBe(endpointId);
      expect(result.endpoint.name).toBe('Production Slack Gateway');
      expect(result.endpoint.description).toBe('Receives outage events for our internal operations service.');
      expect((result.endpoint as any).encryptedSecret).toBeUndefined();
    });

    it('trims leading/trailing whitespace from name and description before persistence', async () => {
      mockPrisma.webhookEndpoint.create.mockResolvedValue({
        ...mockEndpointRecord,
        name: 'Trimmed Name',
        description: 'Trimmed Context',
      });

      const dto = {
        name: '   Trimmed Name   ',
        url: '  https://hooks.slack.com/services/T00/B00/X00  ',
        description: '   Trimmed Context   ',
        events: ['incident.created'] as any,
      };

      const result = await service.create(userId, dto);

      expect(mockPrisma.webhookEndpoint.create).toHaveBeenCalledWith({
        data: {
          userId,
          name: 'Trimmed Name',
          url: 'https://hooks.slack.com/services/T00/B00/X00',
          description: 'Trimmed Context',
          events: dto.events,
          encryptedSecret: 'iv:authtag:encrypted_ciphertext',
          isEnabled: true,
        },
      });
      expect(result.endpoint.name).toBe('Trimmed Name');
      expect(result.endpoint.description).toBe('Trimmed Context');
    });

    it('rejects invalid URL syntax', async () => {
      await expect(
        service.create(userId, {
          name: 'Invalid Endpoint',
          url: 'not-a-url',
          events: ['incident.created'],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects disallowed protocols (e.g. ftp:)', async () => {
      await expect(
        service.create(userId, {
          name: 'FTP Endpoint',
          url: 'ftp://files.example.com/webhook',
          events: ['incident.created'],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects URLs with embedded credentials', async () => {
      await expect(
        service.create(userId, {
          name: 'Creds Endpoint',
          url: 'https://admin:supersecret@example.com/webhook',
          events: ['incident.created'],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects loopback and private IP literals (SSRF static check)', async () => {
      await expect(
        service.create(userId, {
          name: 'Loopback Endpoint',
          url: 'http://127.0.0.1:8080/hook',
          events: ['incident.created'],
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.create(userId, {
          name: 'Private RFC1918 Endpoint',
          url: 'http://192.168.1.1/hook',
          events: ['incident.created'],
        }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.create(userId, {
          name: 'Cloud Metadata IP',
          url: 'http://169.254.169.254/latest/meta-data',
          events: ['incident.created'],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects cloud metadata hostname literals immediately', async () => {
      await expect(
        service.create(userId, {
          name: 'Metadata Hostname',
          url: 'http://metadata.google.internal/computeMetadata',
          events: ['incident.created'],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('enforces maximum endpoint quota per user', async () => {
      mockPrisma.webhookEndpoint.count.mockResolvedValue(20);

      await expect(
        service.create(userId, {
          name: 'Over quota',
          url: 'https://example.com/hook',
          events: ['incident.created'],
        }),
      ).rejects.toThrow(/Maximum limit/);
    });
  });

  describe('findAll', () => {
    it('lists endpoints scoped to userId and never returns secrets', async () => {
      mockPrisma.webhookEndpoint.findMany.mockResolvedValue([mockEndpointRecord]);

      const result = await service.findAll(userId);

      expect(mockPrisma.webhookEndpoint.findMany).toHaveBeenCalledWith({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      expect(result).toHaveLength(1);
      expect((result[0] as any).encryptedSecret).toBeUndefined();
      expect((result[0] as any).signingSecret).toBeUndefined();
    });
  });

  describe('findOne', () => {
    it('returns endpoint when owned by user', async () => {
      mockPrisma.webhookEndpoint.findFirst.mockResolvedValue(mockEndpointRecord);

      const result = await service.findOne(endpointId, userId);

      expect(result.id).toBe(endpointId);
      expect((result as any).encryptedSecret).toBeUndefined();
    });

    it('throws NotFoundException if endpoint belongs to another user or does not exist', async () => {
      mockPrisma.webhookEndpoint.findFirst.mockResolvedValue(null);

      await expect(service.findOne(endpointId, otherUserId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('update', () => {
    it('updates endpoint fields when owned by user', async () => {
      mockPrisma.webhookEndpoint.findFirst.mockResolvedValue(mockEndpointRecord);
      mockPrisma.webhookEndpoint.update.mockResolvedValue({
        ...mockEndpointRecord,
        name: 'Updated Name',
        description: 'Updated Description',
        isEnabled: false,
      });

      const result = await service.update(endpointId, userId, {
        name: 'Updated Name',
        description: 'Updated Description',
        isEnabled: false,
      });

      expect(mockPrisma.webhookEndpoint.update).toHaveBeenCalledWith({
        where: { id: endpointId },
        data: {
          name: 'Updated Name',
          description: 'Updated Description',
          isEnabled: false,
        },
      });
      expect(result.name).toBe('Updated Name');
      expect(result.description).toBe('Updated Description');
      expect(result.isEnabled).toBe(false);
    });

    it('trims whitespace when updating name and description', async () => {
      mockPrisma.webhookEndpoint.findFirst.mockResolvedValue(mockEndpointRecord);
      mockPrisma.webhookEndpoint.update.mockResolvedValue({
        ...mockEndpointRecord,
        name: 'Clean Name',
        description: 'Clean Desc',
      });

      const result = await service.update(endpointId, userId, {
        name: '   Clean Name   ',
        description: '   Clean Desc   ',
      });

      expect(mockPrisma.webhookEndpoint.update).toHaveBeenCalledWith({
        where: { id: endpointId },
        data: {
          name: 'Clean Name',
          description: 'Clean Desc',
        },
      });
      expect(result.name).toBe('Clean Name');
      expect(result.description).toBe('Clean Desc');
    });

    it('throws NotFoundException on update if endpoint not owned by user', async () => {
      mockPrisma.webhookEndpoint.findFirst.mockResolvedValue(null);

      await expect(
        service.update(endpointId, otherUserId, { name: 'Hacked' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deletes endpoint when owned by user', async () => {
      mockPrisma.webhookEndpoint.findFirst.mockResolvedValue(mockEndpointRecord);
      mockPrisma.webhookEndpoint.delete.mockResolvedValue(mockEndpointRecord);

      const result = await service.remove(endpointId, userId);

      expect(result.success).toBe(true);
      expect(mockPrisma.webhookEndpoint.delete).toHaveBeenCalledWith({
        where: { id: endpointId },
      });
    });

    it('throws NotFoundException on delete if endpoint not owned by user', async () => {
      mockPrisma.webhookEndpoint.findFirst.mockResolvedValue(null);

      await expect(service.remove(endpointId, otherUserId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
