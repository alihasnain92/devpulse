import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import {
  API_KEY_CONFIG,
  ApiKeyCreatedResponseDto,
  ApiKeyDto,
  ApiKeyScope,
} from '@devpulse/shared';
import { PrismaService } from '../prisma/prisma.service';
import { CreateApiKeyDto } from './dto/create-api-key.dto';

interface PrismaApiKeyRecord {
  id: string;
  userId: string;
  name: string;
  keyPrefix: string;
  hashedKey: string;
  scopes: string[];
  isRevoked: boolean;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class ApiKeysService {
  private readonly logger = new Logger(ApiKeysService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates a new API key for the authenticated user.
   * Generates a high-entropy secret, stores only its SHA-256 one-way hash,
   * and returns the raw key strictly once upon creation.
   */
  async create(
    userId: string,
    dto: CreateApiKeyDto,
  ): Promise<ApiKeyCreatedResponseDto> {
    const activeCount = await this.prisma.apiKey.count({
      where: { userId, isRevoked: false },
    });

    if (activeCount >= API_KEY_CONFIG.MAX_KEYS_PER_USER) {
      throw new BadRequestException(
        `Maximum limit of ${API_KEY_CONFIG.MAX_KEYS_PER_USER} active API keys reached. Revoke an existing key first.`,
      );
    }

    // 24 bytes hex = 48 hex characters
    const entropy = crypto.randomBytes(24).toString('hex');
    const rawKey = `${API_KEY_CONFIG.PREFIX}${entropy}`;
    const keyPrefix = `${rawKey.slice(0, 16)}...`;
    const hashedKey = this.hashKey(rawKey);

    const record = await this.prisma.apiKey.create({
      data: {
        userId,
        name: dto.name.trim(),
        keyPrefix,
        hashedKey,
        scopes: dto.scopes,
        isRevoked: false,
      },
    });

    this.logger.log(
      `Created API key ${record.id} (${keyPrefix}) for user ${userId} with scopes [${dto.scopes.join(', ')}]`,
    );

    return {
      apiKey: this.formatApiKey(record as unknown as PrismaApiKeyRecord),
      rawKey, // Returned strictly once
    };
  }

  /**
   * Lists all API keys owned by the user.
   * Never exposes raw keys or hashes.
   */
  async findAll(userId: string): Promise<ApiKeyDto[]> {
    const records = await this.prisma.apiKey.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return records.map((r: unknown) =>
      this.formatApiKey(r as unknown as PrismaApiKeyRecord),
    );
  }

  /**
   * Revokes an API key, preventing any future authentication with it.
   */
  async revoke(id: string, userId: string): Promise<ApiKeyDto> {
    const existing = await this.prisma.apiKey.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      throw new NotFoundException(`API key with ID '${id}' not found`);
    }

    const updated = await this.prisma.apiKey.update({
      where: { id },
      data: {
        isRevoked: true,
        revokedAt: new Date(),
      },
    });

    this.logger.warn(`Revoked API key ${id} for user ${userId}`);

    return this.formatApiKey(updated as unknown as PrismaApiKeyRecord);
  }

  /**
   * Permanently deletes an API key record.
   */
  async remove(
    id: string,
    userId: string,
  ): Promise<{ success: boolean; message: string }> {
    const existing = await this.prisma.apiKey.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      throw new NotFoundException(`API key with ID '${id}' not found`);
    }

    await this.prisma.apiKey.delete({
      where: { id },
    });

    this.logger.log(`Deleted API key record ${id} for user ${userId}`);

    return {
      success: true,
      message: 'API key deleted successfully',
    };
  }

  /**
   * Validates a raw API key supplied in an authorization header.
   * Rejects revoked keys immediately.
   */
  async validateRawKey(rawKey: string): Promise<{
    id: string;
    userId: string;
    email: string;
    keyPrefix: string;
    scopes: ApiKeyScope[];
  } | null> {
    if (!rawKey || !rawKey.startsWith(API_KEY_CONFIG.PREFIX)) {
      return null;
    }

    const hashedKey = this.hashKey(rawKey);

    const apiKey = await this.prisma.apiKey.findUnique({
      where: { hashedKey },
      include: {
        user: {
          select: { id: true, email: true },
        },
      },
    });

    if (!apiKey || apiKey.isRevoked) {
      return null;
    }

    // Record last used timestamp asynchronously without blocking the request
    this.prisma.apiKey
      .update({
        where: { id: apiKey.id },
        data: { lastUsedAt: new Date() },
      })
      .catch((err: unknown) => {
        this.logger.warn(`Failed to update lastUsedAt for key ${apiKey.id}: ${err}`);
      });

    return {
      id: apiKey.id,
      userId: apiKey.user.id,
      email: apiKey.user.email,
      keyPrefix: apiKey.keyPrefix,
      scopes: apiKey.scopes as ApiKeyScope[],
    };
  }

  /**
   * Calculates a SHA-256 one-way cryptographic hash of a raw key.
   */
  hashKey(rawKey: string): string {
    return crypto.createHash('sha256').update(rawKey, 'utf8').digest('hex');
  }

  /**
   * Formats a database record to an ApiKeyDto, omitting sensitive values.
   */
  private formatApiKey(record: PrismaApiKeyRecord): ApiKeyDto {
    return {
      id: record.id,
      userId: record.userId,
      name: record.name,
      keyPrefix: record.keyPrefix,
      scopes: record.scopes as ApiKeyScope[],
      isRevoked: record.isRevoked,
      revokedAt: record.revokedAt ? record.revokedAt.toISOString() : null,
      lastUsedAt: record.lastUsedAt ? record.lastUsedAt.toISOString() : null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
