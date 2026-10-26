import * as dns from 'dns';
import * as ipaddr from 'ipaddr.js';
import { SSRF_CONSTANTS, SsrfErrorCode } from './ssrf.constants';

export class SsrfError extends Error {
  constructor(
    public readonly code: SsrfErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'SsrfError';
  }
}

export interface ResolvedTarget {
  ip: string;
  family: 4 | 6;
  hostname: string;
}

export type DnsLookupFunction = (
  hostname: string,
  options: { all: boolean },
) => Promise<Array<{ address: string; family: number }>>;

const DEFAULT_DNS_LOOKUP: DnsLookupFunction = async (hostname) => {
  return dns.promises.lookup(hostname, { all: true });
};

export class SsrfValidator {
  /**
   * Validates URL syntax, protocol, and presence of embedded credentials.
   */
  static validateUrl(rawUrl: string): URL {
    if (!rawUrl || typeof rawUrl !== 'string') {
      throw new SsrfError(
        SsrfErrorCode.INVALID_URL,
        'Target URL must be a non-empty string',
      );
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl.trim());
    } catch {
      throw new SsrfError(
        SsrfErrorCode.INVALID_URL,
        'Malformed URL syntax',
      );
    }

    // Protocol restriction
    if (
      !SSRF_CONSTANTS.ALLOWED_PROTOCOLS.includes(
        parsed.protocol as (typeof SSRF_CONSTANTS.ALLOWED_PROTOCOLS)[number],
      )
    ) {
      throw new SsrfError(
        SsrfErrorCode.DISALLOWED_PROTOCOL,
        `Disallowed protocol: '${parsed.protocol}'. Only http: and https: are permitted.`,
      );
    }

    // Reject embedded credentials (http://user:pass@host)
    if (parsed.username || parsed.password) {
      throw new SsrfError(
        SsrfErrorCode.CREDENTIALS_DISALLOWED,
        'Embedded credentials in URLs are strictly disallowed',
      );
    }

    // Reject empty or invalid hostname
    if (!parsed.hostname || parsed.hostname.length === 0) {
      throw new SsrfError(
        SsrfErrorCode.INVALID_URL,
        'URL hostname cannot be empty',
      );
    }

    // Reject known cloud metadata and local hostnames immediately
    const lowerHost = parsed.hostname.toLowerCase();
    if (
      (SSRF_CONSTANTS.BANNED_HOSTNAMES as readonly string[]).includes(lowerHost)
    ) {
      throw new SsrfError(
        SsrfErrorCode.SSRF_BLOCKED,
        `Destination host '${parsed.hostname}' is prohibited`,
      );
    }

    return parsed;
  }

  /**
   * Evaluates an IP address against all prohibited internal, loopback,
   * link-local, multicast, metadata, and non-unicast ranges.
   */
  static isIpAllowed(ip: string): {
    allowed: boolean;
    reason?: string;
    normalizedIp: string;
  } {
    if (!ip || !ipaddr.isValid(ip)) {
      return { allowed: false, reason: 'Invalid IP address', normalizedIp: ip };
    }

    // Check explicit metadata IP list
    if (
      (SSRF_CONSTANTS.BANNED_METADATA_IPS as readonly string[]).includes(ip)
    ) {
      return {
        allowed: false,
        reason: 'Cloud provider metadata IP is prohibited',
        normalizedIp: ip,
      };
    }

    let parsedAddr: ipaddr.IPv4 | ipaddr.IPv6;
    try {
      parsedAddr = ipaddr.parse(ip);
    } catch {
      return { allowed: false, reason: 'Failed to parse IP', normalizedIp: ip };
    }

    // Handle IPv4-mapped IPv6 addresses (e.g. ::ffff:127.0.0.1)
    if (parsedAddr.kind() === 'ipv6') {
      const v6 = parsedAddr as ipaddr.IPv6;
      if (v6.isIPv4MappedAddress()) {
        parsedAddr = v6.toIPv4Address();
      }
    }

    const range = parsedAddr.range();
    const normalizedIp = parsedAddr.toString();

    // Check against disallowed ranges
    const disallowedIpv4Ranges = [
      'unspecified', // 0.0.0.0/8
      'broadcast', // 255.255.255.255/32
      'multicast', // 224.0.0.0/4
      'linkLocal', // 169.254.0.0/16
      'loopback', // 127.0.0.0/8
      'carrierGradeNat', // 100.64.0.0/10
      'private', // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
      'reserved', // 240.0.0.0/4
    ];

    const disallowedIpv6Ranges = [
      'unspecified', // ::/128
      'linkLocal', // fe80::/10
      'multicast', // ff00::/8
      'loopback', // ::1/128
      'uniqueLocal', // fc00::/7, fd00::/8
      'reserved',
      'rfc6145',
      'rfc6052',
      '6to4',
      'teredo',
    ];

    if (parsedAddr.kind() === 'ipv4') {
      if (disallowedIpv4Ranges.includes(range)) {
        return {
          allowed: false,
          reason: `Prohibited IPv4 range: '${range}'`,
          normalizedIp,
        };
      }

      // Check documentation and benchmark subnets
      const docSubnets: [ipaddr.IPv4, number][] = [
        [ipaddr.IPv4.parse('192.0.2.0'), 24],
        [ipaddr.IPv4.parse('198.51.100.0'), 24],
        [ipaddr.IPv4.parse('203.0.113.0'), 24],
        [ipaddr.IPv4.parse('198.18.0.0'), 15],
      ];

      for (const [subnet, prefix] of docSubnets) {
        if ((parsedAddr as ipaddr.IPv4).match(subnet, prefix)) {
          return {
            allowed: false,
            reason: 'Documentation or benchmark range is prohibited',
            normalizedIp,
          };
        }
      }
    } else {
      if (disallowedIpv6Ranges.includes(range)) {
        return {
          allowed: false,
          reason: `Prohibited IPv6 range: '${range}'`,
          normalizedIp,
        };
      }

      // IPv6 documentation subnet (2001:db8::/32)
      const docIpv6Subnet = ipaddr.IPv6.parse('2001:db8::');
      if ((parsedAddr as ipaddr.IPv6).match(docIpv6Subnet, 32)) {
        return {
          allowed: false,
          reason: 'Documentation IPv6 range is prohibited',
          normalizedIp,
        };
      }
    }

    return { allowed: true, normalizedIp };
  }

  /**
   * Resolves a hostname via DNS and validates ALL returned IP addresses.
   * If any address is in a prohibited range, rejects the entire resolution
   * to protect against dual-homed DNS rebinding and TOCTOU attacks.
   */
  static async resolveAndValidate(
    hostname: string,
    lookupFn: DnsLookupFunction = DEFAULT_DNS_LOOKUP,
  ): Promise<ResolvedTarget> {
    const cleanHost = hostname.trim().replace(/^\[|\]$/g, '');

    // 1. If host is already an IP address, validate it directly
    if (ipaddr.isValid(cleanHost)) {
      const check = this.isIpAllowed(cleanHost);
      if (!check.allowed) {
        throw new SsrfError(
          SsrfErrorCode.SSRF_BLOCKED,
          `Connection to ${cleanHost} blocked: ${check.reason}`,
        );
      }

      const parsed = ipaddr.parse(cleanHost);
      const isIpv4Mapped =
        parsed.kind() === 'ipv6' &&
        (parsed as ipaddr.IPv6).isIPv4MappedAddress();
      const family = isIpv4Mapped || parsed.kind() === 'ipv4' ? 4 : 6;

      return {
        ip: check.normalizedIp,
        family,
        hostname,
      };
    }

    // 2. Perform DNS resolution
    let records: Array<{ address: string; family: number }>;
    try {
      records = await lookupFn(cleanHost, { all: true });
    } catch (err) {
      throw new SsrfError(
        SsrfErrorCode.DNS_RESOLUTION_FAILED,
        `DNS resolution failed for '${hostname}': ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    if (!records || records.length === 0) {
      throw new SsrfError(
        SsrfErrorCode.DNS_RESOLUTION_FAILED,
        `No DNS records resolved for '${hostname}'`,
      );
    }

    // 3. Dual-Homed & Anti-Rebinding Defense:
    // Validate EVERY resolved address. If any address is banned, reject all.
    for (const record of records) {
      const check = this.isIpAllowed(record.address);
      if (!check.allowed) {
        throw new SsrfError(
          SsrfErrorCode.SSRF_BLOCKED,
          `DNS for '${hostname}' resolved to prohibited address (${record.address}): ${check.reason}`,
        );
      }
    }

    // Select the first valid record
    const selected = records[0];
    const parsed = ipaddr.parse(selected.address);
    const family = parsed.kind() === 'ipv4' ? 4 : 6;

    return {
      ip: selected.address,
      family,
      hostname,
    };
  }
}
