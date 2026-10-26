import { WebhookCryptoService } from './webhook-crypto.service';

describe('WebhookCryptoService', () => {
  let service: WebhookCryptoService;
  const originalEnv = process.env.WEBHOOK_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.WEBHOOK_ENCRYPTION_KEY =
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    service = new WebhookCryptoService();
  });

  afterAll(() => {
    process.env.WEBHOOK_ENCRYPTION_KEY = originalEnv;
  });

  describe('generateSecret', () => {
    it('should generate secrets with whsec_ prefix and high entropy', () => {
      const secret1 = service.generateSecret();
      const secret2 = service.generateSecret();

      expect(secret1).toMatch(/^whsec_[0-9a-f]{64}$/);
      expect(secret2).toMatch(/^whsec_[0-9a-f]{64}$/);
      expect(secret1).not.toBe(secret2);
    });
  });

  describe('encryptSecret and decryptSecret', () => {
    it('should roundtrip encrypt and decrypt a signing secret', () => {
      const secret = service.generateSecret();
      const encrypted = service.encryptSecret(secret);

      expect(encrypted).not.toContain(secret);
      expect(encrypted.split(':')).toHaveLength(3);

      const decrypted = service.decryptSecret(encrypted);
      expect(decrypted).toBe(secret);
    });

    it('should throw when ciphertext is tampered with', () => {
      const secret = service.generateSecret();
      const encrypted = service.encryptSecret(secret);
      const [iv, authTag, ciphertext] = encrypted.split(':');

      // Tamper ciphertext
      const tamperedCiphertext =
        ciphertext.slice(0, -2) + (ciphertext.endsWith('00') ? 'ff' : '00');
      const tampered = `${iv}:${authTag}:${tamperedCiphertext}`;

      expect(() => service.decryptSecret(tampered)).toThrow();
    });

    it('should throw when auth tag is tampered with', () => {
      const secret = service.generateSecret();
      const encrypted = service.encryptSecret(secret);
      const [iv, authTag, ciphertext] = encrypted.split(':');

      const tamperedTag =
        authTag.slice(0, -2) + (authTag.endsWith('00') ? 'ff' : '00');
      const tampered = `${iv}:${tamperedTag}:${ciphertext}`;

      expect(() => service.decryptSecret(tampered)).toThrow();
    });

    it('should throw when decrypted with a different key', () => {
      const secret = service.generateSecret();
      const encrypted = service.encryptSecret(secret);

      process.env.WEBHOOK_ENCRYPTION_KEY =
        'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210';
      const otherService = new WebhookCryptoService();

      expect(() => otherService.decryptSecret(encrypted)).toThrow();
    });

    it('should throw when encrypted data format is malformed', () => {
      expect(() => service.decryptSecret('invalid_data')).toThrow(
        /Malformed encrypted secret payload/,
      );
    });
  });
});
