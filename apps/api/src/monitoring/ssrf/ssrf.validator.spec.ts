import { SsrfValidator, SsrfError } from './ssrf.validator';
import { SsrfErrorCode } from './ssrf.constants';

describe('SsrfValidator (Unit)', () => {
  describe('validateUrl', () => {
    it('should accept valid HTTP and HTTPS URLs', () => {
      const u1 = SsrfValidator.validateUrl('http://example.com/health');
      expect(u1.protocol).toBe('http:');
      expect(u1.hostname).toBe('example.com');

      const u2 = SsrfValidator.validateUrl('https://api.devpulse.dev:8443/status');
      expect(u2.protocol).toBe('https:');
      expect(u2.hostname).toBe('api.devpulse.dev');
      expect(u2.port).toBe('8443');
    });

    it('should reject non-HTTP/HTTPS protocols', () => {
      const invalidProtocols = [
        'ftp://ftp.example.com',
        'file:///etc/passwd',
        'gopher://gopher.floodgap.com',
        'javascript:alert(1)',
        'data:text/html,<h1>bad</h1>',
        'ws://example.com',
        'wss://example.com',
      ];

      for (const url of invalidProtocols) {
        expect(() => SsrfValidator.validateUrl(url)).toThrow(SsrfError);
        try {
          SsrfValidator.validateUrl(url);
        } catch (e) {
          expect((e as SsrfError).code).toBe(SsrfErrorCode.DISALLOWED_PROTOCOL);
        }
      }
    });

    it('should reject URLs with embedded credentials', () => {
      const credentialUrls = [
        'http://admin:secret@example.com',
        'https://user@example.com/path',
        'http://:password@example.com',
      ];

      for (const url of credentialUrls) {
        expect(() => SsrfValidator.validateUrl(url)).toThrow(SsrfError);
        try {
          SsrfValidator.validateUrl(url);
        } catch (e) {
          expect((e as SsrfError).code).toBe(SsrfErrorCode.CREDENTIALS_DISALLOWED);
        }
      }
    });

    it('should reject malformed or empty URLs', () => {
      expect(() => SsrfValidator.validateUrl('')).toThrow(SsrfError);
      expect(() => SsrfValidator.validateUrl('not-a-url')).toThrow(SsrfError);
      expect(() => SsrfValidator.validateUrl('http://')).toThrow(SsrfError);
    });

    it('should reject prohibited metadata and local hostnames', () => {
      const bannedHosts = [
        'http://metadata.google.internal/computeMetadata/v1/',
        'http://instance-data/latest/meta-data/',
        'http://metadata/v1/',
        'http://localhost:8080/api',
      ];

      for (const url of bannedHosts) {
        expect(() => SsrfValidator.validateUrl(url)).toThrow(SsrfError);
        try {
          SsrfValidator.validateUrl(url);
        } catch (e) {
          expect((e as SsrfError).code).toBe(SsrfErrorCode.SSRF_BLOCKED);
        }
      }
    });
  });

  describe('isIpAllowed', () => {
    it('should allow valid public unicast IPv4 and IPv6 addresses', () => {
      const publicIps = [
        '93.184.216.34',
        '8.8.8.8',
        '1.1.1.1',
        '104.20.23.154',
        '2606:4700:4700::1111',
        '2001:4860:4860::8888',
      ];

      for (const ip of publicIps) {
        const result = SsrfValidator.isIpAllowed(ip);
        expect(result.allowed).toBe(true);
      }
    });

    it('should block IPv4 loopback (127.0.0.0/8)', () => {
      const loopbacks = ['127.0.0.1', '127.0.0.2', '127.1.2.3', '127.255.255.254'];
      for (const ip of loopbacks) {
        const result = SsrfValidator.isIpAllowed(ip);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('loopback');
      }
    });

    it('should block IPv4 private subnets (RFC 1918)', () => {
      const privateIps = [
        '10.0.0.1',
        '10.255.255.255',
        '172.16.0.1',
        '172.31.255.254',
        '192.168.0.1',
        '192.168.100.50',
      ];
      for (const ip of privateIps) {
        const result = SsrfValidator.isIpAllowed(ip);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('private');
      }
    });

    it('should block Cloud Provider Metadata IPs', () => {
      const metadataIps = [
        '169.254.169.254', // AWS, GCP, Azure IMDS
        'fd00:ec2::254', // AWS IPv6 IMDS
        '100.100.100.200', // Alibaba Cloud IMDS
      ];
      for (const ip of metadataIps) {
        const result = SsrfValidator.isIpAllowed(ip);
        expect(result.allowed).toBe(false);
      }
    });

    it('should block IPv4 Link-Local & Carrier-Grade NAT', () => {
      const ips = [
        '169.254.1.1',
        '169.254.200.200',
        '100.64.0.1',
        '100.127.255.254',
      ];
      for (const ip of ips) {
        const result = SsrfValidator.isIpAllowed(ip);
        expect(result.allowed).toBe(false);
      }
    });

    it('should block Unspecified, Multicast, Broadcast, and Reserved IPv4', () => {
      const ips = [
        '0.0.0.0',
        '224.0.0.1',
        '239.255.255.250',
        '240.0.0.1',
        '255.255.255.255',
      ];
      for (const ip of ips) {
        const result = SsrfValidator.isIpAllowed(ip);
        expect(result.allowed).toBe(false);
      }
    });

    it('should block IPv6 Loopback, Link-Local, and Unique-Local (ULA)', () => {
      const ipv6Banned = [
        '::1',
        'fe80::1',
        'fe80::200:5aee:feaa:20a2',
        'fc00::1',
        'fd00::1',
        'fd12:3456:789a::1',
        '::', // Unspecified
        'ff02::1', // Multicast
      ];
      for (const ip of ipv6Banned) {
        const result = SsrfValidator.isIpAllowed(ip);
        expect(result.allowed).toBe(false);
      }
    });

    it('should unwrap and block IPv4-mapped IPv6 addresses', () => {
      const mapped = [
        '::ffff:127.0.0.1',
        '::ffff:10.0.0.1',
        '::ffff:169.254.169.254',
        '::ffff:192.168.1.1',
      ];
      for (const ip of mapped) {
        const result = SsrfValidator.isIpAllowed(ip);
        expect(result.allowed).toBe(false);
      }
    });

    it('should unwrap and allow public IPv4-mapped IPv6 addresses', () => {
      const mappedPublic = '::ffff:93.184.216.34';
      const result = SsrfValidator.isIpAllowed(mappedPublic);
      expect(result.allowed).toBe(true);
      expect(result.normalizedIp).toBe('93.184.216.34');
    });

    it('should block documentation subnets', () => {
      const docs = [
        '192.0.2.1', // TEST-NET-1
        '198.51.100.1', // TEST-NET-2
        '203.0.113.1', // TEST-NET-3
        '2001:db8::1', // IPv6 Doc
      ];
      for (const ip of docs) {
        const result = SsrfValidator.isIpAllowed(ip);
        expect(result.allowed).toBe(false);
      }
    });
  });

  describe('resolveAndValidate', () => {
    it('should resolve and return public IP with injected DNS resolver', async () => {
      const mockLookup = jest.fn().mockResolvedValue([
        { address: '93.184.216.34', family: 4 },
      ]);

      const result = await SsrfValidator.resolveAndValidate(
        'api.example.com',
        mockLookup,
      );

      expect(mockLookup).toHaveBeenCalledWith('api.example.com', { all: true });
      expect(result.ip).toBe('93.184.216.34');
      expect(result.family).toBe(4);
      expect(result.hostname).toBe('api.example.com');
    });

    it('should reject resolution if hostname resolves to loopback/private IP', async () => {
      const mockLookup = jest.fn().mockResolvedValue([
        { address: '127.0.0.1', family: 4 },
      ]);

      await expect(
        SsrfValidator.resolveAndValidate('internal.service.local', mockLookup),
      ).rejects.toThrow(SsrfError);

      try {
        await SsrfValidator.resolveAndValidate(
          'internal.service.local',
          mockLookup,
        );
      } catch (e) {
        expect((e as SsrfError).code).toBe(SsrfErrorCode.SSRF_BLOCKED);
      }
    });

    it('Anti-Rebinding / Dual-Homed Defense: should reject if ANY resolved address is private', async () => {
      // Attacker returns dual-homed DNS: one public, one private
      const mockLookup = jest.fn().mockResolvedValue([
        { address: '93.184.216.34', family: 4 },
        { address: '192.168.1.1', family: 4 },
      ]);

      await expect(
        SsrfValidator.resolveAndValidate('dual-homed.attacker.com', mockLookup),
      ).rejects.toThrow(SsrfError);

      try {
        await SsrfValidator.resolveAndValidate(
          'dual-homed.attacker.com',
          mockLookup,
        );
      } catch (e) {
        expect((e as SsrfError).code).toBe(SsrfErrorCode.SSRF_BLOCKED);
      }
    });

    it('should throw DNS_RESOLUTION_FAILED if DNS returns zero records or fails', async () => {
      const mockLookupEmpty = jest.fn().mockResolvedValue([]);
      await expect(
        SsrfValidator.resolveAndValidate('nonexistent.domain.xyz', mockLookupEmpty),
      ).rejects.toThrow(SsrfError);

      const mockLookupFail = jest
        .fn()
        .mockRejectedValue(new Error('ENOTFOUND'));
      await expect(
        SsrfValidator.resolveAndValidate('failed.domain.xyz', mockLookupFail),
      ).rejects.toThrow(SsrfError);
    });

    it('should directly validate if target is already an IP address without calling DNS', async () => {
      const mockLookup = jest.fn();

      const validResult = await SsrfValidator.resolveAndValidate(
        '93.184.216.34',
        mockLookup,
      );
      expect(mockLookup).not.toHaveBeenCalled();
      expect(validResult.ip).toBe('93.184.216.34');

      await expect(
        SsrfValidator.resolveAndValidate('127.0.0.1', mockLookup),
      ).rejects.toThrow(SsrfError);
      expect(mockLookup).not.toHaveBeenCalled();
    });
  });
});
