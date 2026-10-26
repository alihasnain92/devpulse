import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { WEBHOOK_CONFIG } from '@devpulse/shared';

export interface WebhookSignatureResult {
  header: string;
  timestamp: number;
  signature: string;
}

export interface WebhookVerificationResult {
  isValid: boolean;
  reason?: string;
  timestamp?: number;
}

@Injectable()
export class WebhookSignerService {
  /**
   * Generates a versioned HMAC-SHA256 signature header for an outbound webhook payload.
   *
   * Specification:
   * 1. Header Name: `x-devpulse-signature`
   * 2. Header Value Format: `t=${timestamp},v1=${signature}`
   * 3. Signed Payload: `${timestamp}.${serializedPayload}`
   * 4. Signature: HMAC-SHA256(rawSecret, signedPayload) in lowercase hexadecimal
   *
   * @param rawSecret The unencrypted endpoint signing secret (`whsec_...`)
   * @param payload The serialized JSON payload string or plain object
   * @param timestamp Optional explicit timestamp in seconds (defaults to now)
   */
  signPayload(
    rawSecret: string,
    payload: string | Record<string, unknown>,
    timestamp?: number,
  ): WebhookSignatureResult {
    const payloadString =
      typeof payload === 'string' ? payload : JSON.stringify(payload);
    const t = timestamp ?? Math.floor(Date.now() / 1000);

    const signedPayload = `${t}.${payloadString}`;
    const signature = crypto
      .createHmac('sha256', rawSecret)
      .update(signedPayload, 'utf8')
      .digest('hex');

    const header = `t=${t},${WEBHOOK_CONFIG.SIGNATURE_VERSION}=${signature}`;

    return {
      header,
      timestamp: t,
      signature,
    };
  }

  /**
   * Verifies an incoming webhook signature header against the payload and raw secret.
   *
   * Security Controls:
   * 1. Header parsing validates presence of timestamp `t` and version `v1` digest.
   * 2. Replay attack protection: Rejects requests with timestamps outside the tolerance window.
   * 3. Constant-time comparison: Employs `crypto.timingSafeEqual` to neutralize timing side-channel attacks.
   *
   * @param rawSecret The endpoint signing secret
   * @param payload The raw received payload string
   * @param headerValue The value of `x-devpulse-signature`
   * @param options Verification options (tolerance seconds and reference timestamp)
   */
  verifySignature(
    rawSecret: string,
    payload: string | Record<string, unknown>,
    headerValue: string,
    options?: {
      toleranceSeconds?: number;
      currentTimestamp?: number;
    },
  ): WebhookVerificationResult {
    if (!headerValue || typeof headerValue !== 'string') {
      return { isValid: false, reason: 'Missing or malformed signature header' };
    }

    const payloadString =
      typeof payload === 'string' ? payload : JSON.stringify(payload);

    // Parse header elements: e.g. "t=1700000000,v1=abcdef..."
    const parts = headerValue.split(',').map((p) => p.trim());
    let timestampStr: string | null = null;
    let signatureHex: string | null = null;

    for (const part of parts) {
      const [key, val] = part.split('=');
      if (key === 't' && val) {
        timestampStr = val;
      } else if (key === WEBHOOK_CONFIG.SIGNATURE_VERSION && val) {
        signatureHex = val;
      }
    }

    if (!timestampStr || !signatureHex) {
      return {
        isValid: false,
        reason: 'Header missing required timestamp (t) or signature version (v1)',
      };
    }

    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp) || timestamp <= 0) {
      return { isValid: false, reason: 'Invalid timestamp format in header' };
    }

    // Verify timestamp within replay tolerance window
    const now = options?.currentTimestamp ?? Math.floor(Date.now() / 1000);
    const tolerance =
      options?.toleranceSeconds ?? WEBHOOK_CONFIG.DEFAULT_TOLERANCE_SECONDS;

    if (Math.abs(now - timestamp) > tolerance) {
      return {
        isValid: false,
        reason: `Timestamp outside tolerance window (${tolerance}s)`,
        timestamp,
      };
    }

    // Calculate expected signature
    const signedPayload = `${timestamp}.${payloadString}`;
    const expectedSignature = crypto
      .createHmac('sha256', rawSecret)
      .update(signedPayload, 'utf8')
      .digest('hex');

    // Constant-time comparison
    const sigBuf = Buffer.from(signatureHex, 'utf8');
    const expectedBuf = Buffer.from(expectedSignature, 'utf8');

    if (sigBuf.length !== expectedBuf.length) {
      return { isValid: false, reason: 'Signature digest length mismatch', timestamp };
    }

    const match = crypto.timingSafeEqual(sigBuf, expectedBuf);
    if (!match) {
      return { isValid: false, reason: 'Signature mismatch', timestamp };
    }

    return { isValid: true, timestamp };
  }
}
