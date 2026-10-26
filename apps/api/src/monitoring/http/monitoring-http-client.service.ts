import * as http from 'http';
import * as https from 'https';
import { Injectable, Logger } from '@nestjs/common';
import { HttpMethod } from '@devpulse/shared';
import {
  SsrfValidator,
  SsrfError,
  DnsLookupFunction,
} from '../ssrf/ssrf.validator';
import { SSRF_CONSTANTS, SsrfErrorCode } from '../ssrf/ssrf.constants';

export interface CheckExecutionResult {
  statusCode: number | null;
  latencyMs: number;
  isSuccess: boolean;
  errorMessage: string | null;
  finalUrl: string;
  redirectHops: number;
  resolvedIp: string | null;
}

@Injectable()
export class MonitoringHttpClientService {
  private readonly logger = new Logger(MonitoringHttpClientService.name);

  /**
   * Executes a secure, SSRF-defended HTTP/HTTPS health check.
   */
  async executeCheck(
    rawUrl: string,
    method: HttpMethod = HttpMethod.GET,
    timeoutMs = 10000,
    expectedStatus = 200,
    dnsLookupFn?: DnsLookupFunction,
  ): Promise<CheckExecutionResult> {
    const startTime = performance.now();
    let currentUrlStr = rawUrl;
    let redirectHops = 0;
    let lastResolvedIp: string | null = null;

    try {
      while (true) {
        // 1. URL syntax and protocol validation
        const parsedUrl = SsrfValidator.validateUrl(currentUrlStr);

        // 2. Resolve DNS and validate target IP against prohibited ranges
        const target = await SsrfValidator.resolveAndValidate(
          parsedUrl.hostname,
          dnsLookupFn,
        );
        lastResolvedIp = target.ip;

        // 3. Execute single request hop using pinned socket transport
        const hopResult = await this.executeSingleHop(
          parsedUrl,
          target.ip,
          target.family,
          method,
          timeoutMs,
        );

        // 4. Check for redirects (301, 302, 303, 307, 308)
        const isRedirect =
          hopResult.statusCode &&
          [301, 302, 303, 307, 308].includes(hopResult.statusCode) &&
          Boolean(hopResult.headers.location);

        if (isRedirect && hopResult.headers.location) {
          redirectHops++;
          if (redirectHops > SSRF_CONSTANTS.MAX_REDIRECT_HOPS) {
            throw new SsrfError(
              SsrfErrorCode.TOO_MANY_REDIRECTS,
              `Exceeded maximum of ${SSRF_CONSTANTS.MAX_REDIRECT_HOPS} redirect hops`,
            );
          }

          // Resolve next URL relative to current hop
          const nextUrl = new URL(hopResult.headers.location, parsedUrl);
          currentUrlStr = nextUrl.toString();

          this.logger.debug(
            `Following validated redirect hop ${redirectHops}: ${currentUrlStr}`,
          );
          continue;
        }

        // Final response reached
        const latencyMs = Math.max(1, Math.round(performance.now() - startTime));
        const isSuccess = hopResult.statusCode === expectedStatus;

        return {
          statusCode: hopResult.statusCode,
          latencyMs,
          isSuccess,
          errorMessage: isSuccess
            ? null
            : `Expected status ${expectedStatus} but received ${hopResult.statusCode}`,
          finalUrl: currentUrlStr,
          redirectHops,
          resolvedIp: lastResolvedIp,
        };
      }
    } catch (err) {
      const latencyMs = Math.max(1, Math.round(performance.now() - startTime));
      const sanitizedError = this.sanitizeError(err);

      return {
        statusCode: null,
        latencyMs,
        isSuccess: false,
        errorMessage: sanitizedError,
        finalUrl: currentUrlStr,
        redirectHops,
        resolvedIp: lastResolvedIp,
      };
    }
  }

  /**
   * Executes a single HTTP/HTTPS request pinning the socket connection
   * directly to the pre-validated IP address.
   */
  private executeSingleHop(
    url: URL,
    pinnedIp: string,
    family: 4 | 6,
    method: HttpMethod,
    timeoutMs: number,
  ): Promise<{ statusCode: number; headers: http.IncomingHttpHeaders }> {
    return new Promise((resolve, reject) => {
      const isHttps = url.protocol === 'https:';
      const transport = isHttps ? https : http;
      const defaultPort = isHttps ? 443 : 80;
      const port = url.port ? Number(url.port) : defaultPort;

      let settled = false;
      let totalBytesRead = 0;

      // Custom lookup function pinning connection to validated IP
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

      const requestOptions: https.RequestOptions = {
        hostname: url.hostname,
        port,
        path: `${url.pathname}${url.search}`,
        method: method,
        lookup: customLookup as unknown as http.RequestOptions['lookup'],
        headers: {
          Host: url.host,
          'User-Agent': 'DevPulse-HealthCheck/1.0',
          Accept: '*/*',
          Connection: 'close',
        },
        timeout: timeoutMs,
        // Disable connection pooling to ensure clean, isolated sockets per check
        agent: false,
        // For HTTPS, preserve the original hostname in TLS SNI for certificate validation
        ...(isHttps && { servername: url.hostname }),
      };

      const req = transport.request(requestOptions, (res) => {
        const statusCode = res.statusCode || 0;

        // For HEAD requests, do not read body stream
        if (method === HttpMethod.HEAD) {
          res.resume();
          if (!settled) {
            settled = true;
            resolve({ statusCode, headers: res.headers });
          }
          return;
        }

        // For GET requests, stream response body up to 1 MB limit
        res.on('data', (chunk: Buffer) => {
          totalBytesRead += chunk.length;
          if (totalBytesRead > SSRF_CONSTANTS.MAX_RESPONSE_BYTES) {
            req.destroy(
              new SsrfError(
                SsrfErrorCode.RESPONSE_TOO_LARGE,
                `Response body exceeded 1 MB limit (${totalBytesRead} bytes read)`,
              ),
            );
          }
        });

        res.on('end', () => {
          if (!settled) {
            settled = true;
            resolve({ statusCode, headers: res.headers });
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
        req.destroy(
          new SsrfError(
            SsrfErrorCode.TIMED_OUT,
            `Request timed out after ${timeoutMs}ms`,
          ),
        );
      });

      req.on('error', (err) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      });

      req.end();
    });
  }

  /**
   * Maps internal network and system errors to standardized,
   * sanitized error codes. Never leaks internal stack traces or secrets.
   */
  private sanitizeError(err: unknown): string {
    if (err instanceof SsrfError) {
      return `${err.code}: ${err.message}`;
    }

    if (err instanceof Error) {
      const code = (err as unknown as { code?: string }).code;

      switch (code) {
        case 'ECONNREFUSED':
          return `${SsrfErrorCode.CONNECTION_REFUSED}: Connection refused by host`;
        case 'ETIMEDOUT':
        case 'ESOCKETTIMEDOUT':
          return `${SsrfErrorCode.TIMED_OUT}: Connection timed out`;
        case 'ENOTFOUND':
          return `${SsrfErrorCode.DNS_RESOLUTION_FAILED}: Domain name not resolved`;
        case 'EHOSTUNREACH':
        case 'ENETUNREACH':
          return `${SsrfErrorCode.NETWORK_ERROR}: Host or network unreachable`;
        case 'CERT_HAS_EXPIRED':
          return `${SsrfErrorCode.SSL_CERT_ERROR}: SSL certificate has expired`;
        case 'UNABLE_TO_VERIFY_LEAF_SIGNATURE':
        case 'SELF_SIGNED_CERT_IN_CHAIN':
        case 'DEPTH_ZERO_SELF_SIGNED_CERT':
          return `${SsrfErrorCode.SSL_CERT_ERROR}: Untrusted or self-signed SSL certificate`;
        default:
          return `${SsrfErrorCode.NETWORK_ERROR}: ${err.message || 'Network request failed'}`;
      }
    }

    return `${SsrfErrorCode.NETWORK_ERROR}: Unknown execution failure`;
  }
}
