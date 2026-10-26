import { WebhookHttpClientService } from './webhook-http-client.service';
import * as http from 'http';

describe('WebhookHttpClientService (Unit)', () => {
  let service: WebhookHttpClientService;

  beforeEach(() => {
    service = new WebhookHttpClientService();
  });

  describe('Delivery-time SSRF Defense', () => {
    it('blocks loopback IP 127.0.0.1 immediately', async () => {
      const result = await service.executeDelivery(
        'http://127.0.0.1:8080/hook',
        JSON.stringify({ test: true }),
        {},
      );

      expect(result.isSuccess).toBe(false);
      expect(result.errorMessage).toContain('SSRF Protection');
      expect(result.errorMessage).toContain('Prohibited IP');
    });

    it('blocks private RFC 1918 addresses', async () => {
      const result = await service.executeDelivery(
        'http://192.168.1.100/hook',
        JSON.stringify({ test: true }),
        {},
      );

      expect(result.isSuccess).toBe(false);
      expect(result.errorMessage).toContain('SSRF Protection');
    });

    it('blocks cloud metadata 169.254.169.254', async () => {
      const result = await service.executeDelivery(
        'http://169.254.169.254/latest/meta-data',
        JSON.stringify({ test: true }),
        {},
      );

      expect(result.isSuccess).toBe(false);
      expect(result.errorMessage).toContain('SSRF Protection');
    });

    it('blocks unsafe resolutions from DNS lookup', async () => {
      const mockDnsLookup = jest
        .fn()
        .mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);

      const result = await service.executeDelivery(
        'https://attacker-domain.internal/hook',
        JSON.stringify({ test: true }),
        {},
        5000,
        mockDnsLookup,
      );

      expect(result.isSuccess).toBe(false);
      expect(result.errorMessage).toContain('SSRF Protection');
    });
  });

  describe('No-Redirect Policy', () => {
    let mockServer: http.Server;

    beforeAll((done) => {
      mockServer = http.createServer((req, res) => {
        if (req.url === '/redirect') {
          res.writeHead(302, { Location: 'http://example.com/target' });
          res.end('Redirecting');
        } else if (req.url === '/success') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ received: true }));
        } else if (req.url === '/server-error') {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Internal Server Error');
        } else if (req.url === '/not-found') {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
        }
      });

      mockServer.listen(0, '127.0.0.1', () => {
        done();
      });
    });

    afterAll((done) => {
      mockServer.close(done);
    });

    it('does not follow 302 redirects and marks delivery as failed', async () => {
      // Inject custom DNS resolving to the local test server
      const mockDnsLookup = jest
        .fn()
        .mockResolvedValue([{ address: '93.184.216.34', family: 4 }]); // public IP for validation

      // Spy on executePinnedPost to simulate the response directly
      jest
        .spyOn(service as any, 'executePinnedPost')
        .mockResolvedValue({ statusCode: 302, responsePreview: 'Redirecting' });

      const result = await service.executeDelivery(
        'https://webhook.example.com/redirect',
        JSON.stringify({ event: 'incident.created' }),
        { 'X-Custom-Header': '1' },
        5000,
        mockDnsLookup,
      );

      expect(result.isSuccess).toBe(false);
      expect(result.statusCode).toBe(302);
      expect(result.errorMessage).toContain('Redirects prohibited');
      expect(result.responsePreview).toBe('Redirecting');
    });

    it('marks 200 response as success', async () => {
      const mockDnsLookup = jest
        .fn()
        .mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);

      jest
        .spyOn(service as any, 'executePinnedPost')
        .mockResolvedValue({
          statusCode: 200,
          responsePreview: '{"received":true}',
        });

      const result = await service.executeDelivery(
        'https://webhook.example.com/success',
        JSON.stringify({ event: 'incident.created' }),
        {},
        5000,
        mockDnsLookup,
      );

      expect(result.isSuccess).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.errorMessage).toBeNull();
      expect(result.responsePreview).toBe('{"received":true}');
    });

    it('marks 500 response as failed', async () => {
      const mockDnsLookup = jest
        .fn()
        .mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);

      jest
        .spyOn(service as any, 'executePinnedPost')
        .mockResolvedValue({
          statusCode: 500,
          responsePreview: 'Internal Server Error',
        });

      const result = await service.executeDelivery(
        'https://webhook.example.com/server-error',
        JSON.stringify({ event: 'incident.created' }),
        {},
        5000,
        mockDnsLookup,
      );

      expect(result.isSuccess).toBe(false);
      expect(result.statusCode).toBe(500);
      expect(result.errorMessage).toContain('HTTP 500 response received');
    });
  });
});
