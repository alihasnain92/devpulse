import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import * as ipaddr from 'ipaddr.js';
import {
  WEBHOOK_CONFIG,
  WebhookCreatedResponseDto,
  WebhookEndpointDto,
  WebhookEventType,
} from '@devpulse/shared';
import { PrismaService } from '../prisma/prisma.service';
import { SsrfValidator, SsrfError } from '../monitoring/ssrf/ssrf.validator';
import { WebhookCryptoService } from './crypto/webhook-crypto.service';
import { CreateWebhookDto } from './dto/create-webhook.dto';
import { UpdateWebhookDto } from './dto/update-webhook.dto';

interface PrismaWebhookRecord {
  id: string;
  userId: string;
  name: string;
  url: string;
  description: string | null;
  events: string[];
  isEnabled: boolean;
  encryptedSecret: string;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cryptoService: WebhookCryptoService,
  ) {}

  /**
   * Registers a new webhook endpoint configuration for the authenticated user.
   *
   * Note on SSRF Architecture:
   * Registration performs static URL and IP literal validation WITHOUT making network requests.
   * Full DNS resolution, socket pinning to validated IPs, and redirect verification
   * are executed strictly during delivery time in Phase 8 to prevent TOCTOU DNS rebinding.
   */
  async create(
    userId: string,
    dto: CreateWebhookDto,
  ): Promise<WebhookCreatedResponseDto> {
    // Check maximum active webhook endpoint capacity
    const count = await this.prisma.webhookEndpoint.count({
      where: { userId, deletedAt: null },
    });
    if (count >= WEBHOOK_CONFIG.MAX_ENDPOINTS_PER_USER) {
      throw new BadRequestException(
        `Maximum limit of ${WEBHOOK_CONFIG.MAX_ENDPOINTS_PER_USER} webhook endpoints reached.`,
      );
    }

    // Validate destination URL statically against SSRF rules
    this.validateDestinationUrl(dto.url);

    // Generate cryptographic signing secret and encrypt for storage at rest
    const rawSecret = this.cryptoService.generateSecret();
    const encryptedSecret = this.cryptoService.encryptSecret(rawSecret);

    const record = await this.prisma.webhookEndpoint.create({
      data: {
        userId,
        name: dto.name.trim(),
        url: dto.url.trim(),
        description: dto.description ? dto.description.trim() : null,
        events: dto.events,
        encryptedSecret,
        isEnabled: true,
      },
    });

    this.logger.log(
      `Created webhook endpoint ${record.id} for user ${userId} with events [${dto.events.join(', ')}]`,
    );

    return {
      endpoint: this.formatEndpoint(record as unknown as PrismaWebhookRecord),
      signingSecret: rawSecret, // Returned strictly once upon initial creation
    };
  }

  /**
   * Lists all webhook endpoints configured by the authenticated user.
   * Secrets are never exposed.
   */
  async findAll(userId: string): Promise<WebhookEndpointDto[]> {
    const records = await this.prisma.webhookEndpoint.findMany({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return records.map((r: unknown) =>
      this.formatEndpoint(r as unknown as PrismaWebhookRecord),
    );
  }

  /**
   * Retrieves a single webhook endpoint by ID, enforcing user ownership.
   */
  async findOne(id: string, userId: string): Promise<WebhookEndpointDto> {
    const record = await this.prisma.webhookEndpoint.findFirst({
      where: { id, userId, deletedAt: null },
    });

    if (!record) {
      throw new NotFoundException(`Webhook endpoint with ID '${id}' not found`);
    }

    return this.formatEndpoint(record as unknown as PrismaWebhookRecord);
  }

  /**
   * Updates an existing webhook endpoint configuration.
   */
  async update(
    id: string,
    userId: string,
    dto: UpdateWebhookDto,
  ): Promise<WebhookEndpointDto> {
    const existing = await this.prisma.webhookEndpoint.findFirst({
      where: { id, userId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException(`Webhook endpoint with ID '${id}' not found`);
    }

    if (dto.url) {
      this.validateDestinationUrl(dto.url);
    }

    const updated = await this.prisma.webhookEndpoint.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.url !== undefined ? { url: dto.url.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description ? dto.description.trim() : null }
          : {}),
        ...(dto.events !== undefined ? { events: dto.events } : {}),
        ...(dto.isEnabled !== undefined ? { isEnabled: dto.isEnabled } : {}),
      },
    });

    this.logger.log(`Updated webhook endpoint ${id} for user ${userId}`);

    return this.formatEndpoint(updated as unknown as PrismaWebhookRecord);
  }

  /**
   * Soft deletes a webhook endpoint configuration, enforcing user ownership.
   * Soft deletion preserves all historical WebhookDelivery and WebhookAttempt logs.
   */
  async remove(
    id: string,
    userId: string,
  ): Promise<{ success: boolean; message: string }> {
    const existing = await this.prisma.webhookEndpoint.findFirst({
      where: { id, userId, deletedAt: null },
    });

    if (!existing) {
      throw new NotFoundException(`Webhook endpoint with ID '${id}' not found`);
    }

    await this.prisma.webhookEndpoint.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        isEnabled: false,
      },
    });

    this.logger.log(`Soft-deleted webhook endpoint ${id} for user ${userId}`);

    return {
      success: true,
      message: 'Webhook endpoint deleted successfully',
    };
  }

  /**
   * Validates destination URL syntax and static SSRF prohibitions.
   * Explicitly avoids DNS lookups or outbound requests at registration time.
   */
  private validateDestinationUrl(rawUrl: string): URL {
    let parsed: URL;
    try {
      parsed = SsrfValidator.validateUrl(rawUrl);
    } catch (err: unknown) {
      const message =
        err instanceof SsrfError
          ? err.message
          : 'Invalid or disallowed destination URL syntax';
      throw new BadRequestException(message);
    }

    // If host is an explicit IP address, evaluate prohibited IP ranges immediately
    const cleanHost = parsed.hostname.trim().replace(/^\[|\]$/g, '');
    if (ipaddr.isValid(cleanHost)) {
      const check = SsrfValidator.isIpAllowed(cleanHost);
      if (!check.allowed) {
        throw new BadRequestException(
          `Destination IP ${cleanHost} is prohibited: ${check.reason}`,
        );
      }
    }

    return parsed;
  }

  /**
   * Formats a Prisma record into a clean DTO, ensuring secrets are never leaked.
   */
  private formatEndpoint(record: PrismaWebhookRecord): WebhookEndpointDto {
    return {
      id: record.id,
      userId: record.userId,
      name: record.name,
      url: record.url,
      description: record.description ?? null,
      events: record.events as WebhookEventType[],
      isEnabled: record.isEnabled,
      deletedAt: record.deletedAt ? record.deletedAt.toISOString() : null,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }
}
