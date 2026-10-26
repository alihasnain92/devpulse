import * as http from 'http';
import * as https from 'https';
import { Injectable, Logger } from '@nestjs/common';
import { WEBHOOK_RETRY_CONFIG } from '@devpulse/shared';
import {
  SsrfValidator,
  SsrfError,
  DnsLookupFunction,
} from '../../monitoring/ssrf/ssrf.validator';

export interface WebhookHttpExecutionResult {
  statusCode: number | null;
  latencyMs: number;
  isSuccess: boolean;
  errorMessage: string | null;
  responsePreview: string | null;
  resolvedIp: string | null;
}

@Injectable()
export class WebhookHttpClientService {
  private readonly logger = new Logger(WebhookHttpClientService.name);

  /**
   * Executes an outbound HMAC-signed HTTP POST request to a webhook destination
   * with full delivery-time SSRF validation, socket connection pinning, bounded
   * response limits, and strict no-redirect enforcement.
   *
   * @param rawUrl The destination endpoint URL
   * @param payloadString The exact raw string payload to transmit
   * @param headers Outbound headers (including X-DevPulse-Signature, Content-Type, etc.)
   * @param timeoutMs Request timeout in milliseconds
   * @param dnsLookupFn Optional injected DNS lookup function (for testing)
   */
  async executeDelivery(
    rawUrl: string,
    payloadString: string,
    headers: Record<string, string>,
    timeoutMs: number = WEBHOOK_RETRY_CONFIG.DELIVERY_TIMEOUT_MS,
    dnsLookupFn?: DnsLookupFunction,
  ): Promise<WebhookHttpExecutionResult> {
    const startTime = performance.now();
    let resolvedIp: string | null = null;

    try {
      // 1. Static URL syntax and scheme validation
      const parsedUrl = SsrfValidator.validateUrl(rawUrl);

      // 2. Delivery-time DNS resolution and validation against all prohibited IP CIDRs
      const target = await SsrfValidator.resolveAndValidate(
        parsedUrl.hostname,
        dnsLookupFn,
      );
      resolvedIp = target.ip;

      // 3. Outbound HTTP/HTTPS dispatch using socket-pinned transport
      const hopResult = await this.executePinnedPost(
        parsedUrl,
        target.ip,
        target.family,
        payloadString,
        headers,
        timeoutMs,
      );

      const latencyMs = Math.max(1, Math.round(performance.now() - startTime));

      // 4. No-redirect policy: 3xx is treated as a delivery failure
      if (hopResult.statusCode >= 300 && hopResult.statusCode < 400) {
        return {
          statusCode: hopResult.statusCode,
          latencyMs,
          isSuccess: false,
          errorMessage: `Redirects prohibited: received HTTP ${hopResult.statusCode}`,
          responsePreview: hopResult.responsePreview,
          resolvedIp,
        };
      }

      // 5. Success is strictly defined as 2xx
      const isSuccess =
        hopResult.statusCode >= 200 && hopResult.statusCode < 300;

      return {
        statusCode: hopResult.statusCode,
        latencyMs,
        isSuccess,
        errorMessage: isSuccess
          ? null
          : `HTTP ${hopResult.statusCode} response received`,
        responsePreview: hopResult.responsePreview,
        resolvedIp,
      };
    } catch (err: unknown) {
      const latencyMs = Math.max(1, Math.round(performance.now() - startTime));
      const sanitizedError = this.sanitizeError(err);

      return {
        statusCode: null,
        latencyMs,
        isSuccess: false,
        errorMessage: sanitizedError,
        responsePreview: null,
        resolvedIp,
      };
    }
  }

  /**
   * Dispatches the POST request pinning the connection socket directly
   * to the pre-validated IP address, neutralizing DNS rebinding attacks.
   */
  private executePinnedPost(
    url: URL,
    pinnedIp: string,
    family: 4 | 6,
    payloadString: string,
    headers: Record<string, string>,
    timeoutMs: number,
  ): Promise<{ statusCode: number; responsePreview: string }> {
    return new Promise((resolve, reject) => {
      const isHttps = url.protocol === 'https:';
      const transport = isHttps ? https : http;
      const defaultPort = isHttps ? 443 : 80;
      const port = url.port ? Number(url.port) : defaultPort;

      let settled = false;
      let totalBytesRead = 0;
      let responseBodyBuffer = '';

      // Custom DNS lookup callback pinning socket to the validated IP
      const customLookup = (
        _hostname: string,
        options: unknown,
        cb: (
          err: Error | null,
          address: string | Array<{ address: string; family: number }>,
          family?: number,
        ) => void,
      ) => {
        if (typeof options === 'function') {
          (
            options as (
              err: Error | null,
              address: string,
              family: number,
            ) => void
          )(null, pinnedIp, family);
        } else if (
          options &&
          typeof options === 'object' &&
          'all' in options &&
          options.all
        ) {
          cb(null, [{ address: pinnedIp, family }]);
        } else {
          cb(null, pinnedIp, family);
        }
      };

      const payloadBuffer = Buffer.from(payloadString, 'utf8');

      const requestOptions: http.RequestOptions = {
        method: 'POST',
        hostname: url.hostname,
        port,
        path: `${url.pathname}${url.search}`,
        lookup: customLookup,
        timeout: timeoutMs,
        headers: {
          ...headers,
          Host: url.host,
          'Content-Length': String(payloadBuffer.length),
        },
      };

      if (isHttps) {
        (requestOptions as https.RequestOptions).servername = url.hostname;
      }

      const req = transport.request(requestOptions, (res) => {
        const statusCode = res.statusCode ?? 0;

        res.setEncoding('utf8');

        res.on('data', (chunk: string) => {
          totalBytesRead += Buffer.byteLength(chunk, 'utf8');

          if (
            responseBodyBuffer.length <
            WEBHOOK_RETRY_CONFIG.MAX_RESPONSE_PREVIEW_BYTES
          ) {
            const remaining =
              WEBHOOK_RETRY_CONFIG.MAX_RESPONSE_PREVIEW_BYTES -
              responseBodyBuffer.length;
            responseBodyBuffer += chunk.slice(0, remaining);
          }

          // Abort reading if max response size reached to prevent memory exhaustion
          if (
            totalBytesRead > WEBHOOK_RETRY_CONFIG.MAX_RESPONSE_PREVIEW_BYTES * 4
          ) {
            res.destroy();
          }
        });

        res.on('end', () => {
          if (!settled) {
            settled = true;
            resolve({
              statusCode,
              responsePreview: responseBodyBuffer.slice(
                0,
                WEBHOOK_RETRY_CONFIG.MAX_RESPONSE_PREVIEW_BYTES,
              ),
            });
          }
        });

        res.on('error', (err) => {
          if (!settled) {
            settled = true;
            reject(err);
          }
        });
      });

      req.on('timeout', () => {
        req.destroy(new Error(`Webhook request timed out after ${timeoutMs}ms`));
      });

      req.on('error', (err) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      });

      // Transmit the payload
      req.write(payloadBuffer);
      req.end();
    });
  }

  /**
   * Sanitizes network and system errors before persistence.
   */
  private sanitizeError(err: unknown): string {
    if (err instanceof SsrfError) {
      return `SSRF Protection: ${err.message}`;
    }

    if (err instanceof Error) {
      const msg = err.message || '';
      if (msg.includes('timed out')) {
        return 'Request timeout exceeded';
      }
      if (msg.includes('ECONNREFUSED')) {
        return 'Connection refused by target';
      }
      if (msg.includes('ENOTFOUND')) {
        return 'DNS resolution failed: hostname not found';
      }
      if (msg.includes('ECONNRESET')) {
        return 'Connection reset by peer';
      }
      if (msg.includes('CERT_') || msg.includes('certificate')) {
        return 'TLS/SSL certificate validation failed';
      }
      return msg.slice(0, 200);
    }

    return 'Unknown network or transport error';
  }
}
