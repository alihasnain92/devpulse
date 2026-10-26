import { WebhookSignerService } from './webhook-signer.service';

describe('WebhookSignerService', () => {
  let service: WebhookSignerService;
  const secret = 'whsec_0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const samplePayload = {
    event: 'incident.created',
    data: {
      id: 'inc-123',
      monitorId: 'mon-456',
      cause: 'HTTP 500 Internal Server Error',
    },
  };

  beforeEach(() => {
    service = new WebhookSignerService();
  });

  describe('signPayload', () => {
    it('should generate a valid versioned signature header with timestamp', () => {
      const timestamp = 1700000000;
      const result = service.signPayload(secret, samplePayload, timestamp);

      expect(result.timestamp).toBe(timestamp);
      expect(result.signature).toMatch(/^[0-9a-f]{64}$/);
      expect(result.header).toBe(`t=${timestamp},v1=${result.signature}`);
    });

    it('should generate identical signatures for identical payloads and timestamps', () => {
      const timestamp = 1700000000;
      const res1 = service.signPayload(secret, samplePayload, timestamp);
      const res2 = service.signPayload(secret, samplePayload, timestamp);

      expect(res1.header).toBe(res2.header);
      expect(res1.signature).toBe(res2.signature);
    });

    it('should generate different signatures for different timestamps', () => {
      const res1 = service.signPayload(secret, samplePayload, 1700000000);
      const res2 = service.signPayload(secret, samplePayload, 1700000001);

      expect(res1.signature).not.toBe(res2.signature);
    });

    it('should generate different signatures for different payloads', () => {
      const timestamp = 1700000000;
      const res1 = service.signPayload(secret, samplePayload, timestamp);
      const res2 = service.signPayload(
        secret,
        { ...samplePayload, event: 'incident.resolved' },
        timestamp,
      );

      expect(res1.signature).not.toBe(res2.signature);
    });
  });

  describe('verifySignature', () => {
    it('should verify a valid signature within the tolerance window', () => {
      const now = 1700000100;
      const sentTime = 1700000050; // 50 seconds ago

      const { header } = service.signPayload(secret, samplePayload, sentTime);
      const verification = service.verifySignature(secret, samplePayload, header, {
        currentTimestamp: now,
        toleranceSeconds: 300,
      });

      expect(verification.isValid).toBe(true);
      expect(verification.timestamp).toBe(sentTime);
    });

    it('should reject a tampered payload', () => {
      const now = 1700000000;
      const { header } = service.signPayload(secret, samplePayload, now);

      const tamperedPayload = {
        ...samplePayload,
        data: { ...samplePayload.data, cause: 'Tampered Cause' },
      };

      const verification = service.verifySignature(
        secret,
        tamperedPayload,
        header,
        { currentTimestamp: now },
      );

      expect(verification.isValid).toBe(false);
      expect(verification.reason).toBe('Signature mismatch');
    });

    it('should reject when a different secret is used for verification', () => {
      const now = 1700000000;
      const { header } = service.signPayload(secret, samplePayload, now);
      const wrongSecret =
        'whsec_9999999999abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

      const verification = service.verifySignature(
        wrongSecret,
        samplePayload,
        header,
        { currentTimestamp: now },
      );

      expect(verification.isValid).toBe(false);
      expect(verification.reason).toBe('Signature mismatch');
    });

    it('should reject signatures with timestamps older than tolerance window (replay attack prevention)', () => {
      const now = 1700000500;
      const staleTime = 1700000000; // 500 seconds ago (tolerance is 300s)

      const { header } = service.signPayload(secret, samplePayload, staleTime);
      const verification = service.verifySignature(secret, samplePayload, header, {
        currentTimestamp: now,
        toleranceSeconds: 300,
      });

      expect(verification.isValid).toBe(false);
      expect(verification.reason).toContain('tolerance window');
    });

    it('should reject future timestamps beyond the tolerance window', () => {
      const now = 1700000000;
      const futureTime = 1700000400; // 400 seconds in future

      const { header } = service.signPayload(secret, samplePayload, futureTime);
      const verification = service.verifySignature(secret, samplePayload, header, {
        currentTimestamp: now,
        toleranceSeconds: 300,
      });

      expect(verification.isValid).toBe(false);
      expect(verification.reason).toContain('tolerance window');
    });

    it('should reject malformed header strings', () => {
      expect(
        service.verifySignature(secret, samplePayload, 'malformed-header').isValid,
      ).toBe(false);
      expect(
        service.verifySignature(secret, samplePayload, 't=invalid,v1=abcdef').isValid,
      ).toBe(false);
      expect(
        service.verifySignature(secret, samplePayload, 't=1700000000').isValid,
      ).toBe(false);
      expect(
        service.verifySignature(secret, samplePayload, 'v1=abcdef').isValid,
      ).toBe(false);
    });
  });
});
