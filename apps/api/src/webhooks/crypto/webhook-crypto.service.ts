import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { WEBHOOK_CONFIG } from '@devpulse/shared';

@Injectable()
export class WebhookCryptoService {
  private readonly logger = new Logger(WebhookCryptoService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly ivLength = 12; // 96 bits recommended for AES-GCM
  private readonly authTagLength = 16; // 128 bits auth tag

  /**
   * Generates a high-entropy, cryptographically random webhook signing secret.
   * Format: `whsec_` followed by 32 bytes (64 characters) of hex entropy.
   */
  generateSecret(): string {
    const randomHex = crypto.randomBytes(32).toString('hex');
    return `${WEBHOOK_CONFIG.SECRET_PREFIX}${randomHex}`;
  }

  /**
   * Encrypts a webhook signing secret at rest using AES-256-GCM authenticated encryption.
   * Returns a serialized string format: `${ivHex}:${authTagHex}:${ciphertextHex}`.
   */
  encryptSecret(secret: string): string {
    const key = this.getEncryptionKey();
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);

    const encrypted = Buffer.concat([
      cipher.update(secret, 'utf8'),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
  }

  /**
   * Decrypts an encrypted signing secret from its serialized format.
   * Validates the authentication tag to ensure ciphertext integrity and authenticity.
   */
  decryptSecret(encryptedData: string): string {
    const key = this.getEncryptionKey();
    const parts = encryptedData.split(':');

    if (parts.length !== 3) {
      throw new InternalServerErrorException(
        'Malformed encrypted secret payload: expected iv:authTag:ciphertext format',
      );
    }

    const [ivHex, authTagHex, ciphertextHex] = parts;
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const ciphertext = Buffer.from(ciphertextHex, 'hex');

    if (iv.length !== this.ivLength || authTag.length !== this.authTagLength) {
      throw new InternalServerErrorException(
        'Corrupted secret initialization vector or authentication tag length',
      );
    }

    try {
      const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
      decipher.setAuthTag(authTag);

      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);

      return decrypted.toString('utf8');
    } catch {
      throw new InternalServerErrorException(
        'Decryption failed: signature verification failed or invalid encryption key',
      );
    }
  }

  /**
   * Resolves the 32-byte encryption key from the environment.
   * Accepts either 64 hexadecimal characters or 32 raw UTF-8 bytes.
   */
  private getEncryptionKey(): Buffer {
    const rawKey = process.env.WEBHOOK_ENCRYPTION_KEY;

    if (!rawKey) {
      // In development or test without explicit key, fallback to deterministic key with warning
      if (process.env.NODE_ENV !== 'production') {
        return crypto
          .createHash('sha256')
          .update('devpulse_dev_webhook_encryption_key_default')
          .digest();
      }
      throw new InternalServerErrorException(
        'WEBHOOK_ENCRYPTION_KEY environment variable is not configured',
      );
    }

    // If 64-char hex string
    if (rawKey.length === 64 && /^[0-9a-fA-F]+$/.test(rawKey)) {
      return Buffer.from(rawKey, 'hex');
    }

    // Otherwise derive 32-byte key via SHA-256 digest
    return crypto.createHash('sha256').update(rawKey).digest();
  }
}
