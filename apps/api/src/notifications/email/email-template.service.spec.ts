import { EmailTemplateService } from './email-template.service';

describe('EmailTemplateService', () => {
  let service: EmailTemplateService;

  beforeEach(() => {
    service = new EmailTemplateService();
  });

  describe('HTML Escaping', () => {
    it('should escape malicious characters in strings', () => {
      const malicious = '<script>alert("xss")</script>&foo=\'bar\'';
      const escaped = service.escapeHtml(malicious);
      expect(escaped).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;&amp;foo=&#039;bar&#039;',
      );
    });

    it('should escape hostile XSS and special characters strictly', () => {
      expect(service.escapeHtml('<script>alert(1)</script>')).toBe(
        '&lt;script&gt;alert(1)&lt;/script&gt;',
      );
      expect(service.escapeHtml('<img src=x onerror=alert(1)>')).toBe(
        '&lt;img src=x onerror=alert(1)&gt;',
      );
      expect(service.escapeHtml('API & Billing <Primary>')).toBe(
        'API &amp; Billing &lt;Primary&gt;',
      );
      expect(service.escapeHtml('"quoted"')).toBe('&quot;quoted&quot;');
    });

    it('should return empty string for null or undefined', () => {
      expect(service.escapeHtml('')).toBe('');
      expect(service.escapeHtml(null as unknown as string)).toBe('');
    });
  });

  describe('Incident Created Template', () => {
    it('should render correct subject, text, and html with escaped content', () => {
      const rendered = service.renderIncidentCreatedEmail({
        monitorName: '<Production API> & DB',
        monitorId: 'mon-123',
        monitorUrl: 'https://api.example.com/health',
        incidentId: 'inc-456',
        cause: 'HTTP 500 <Internal Server Error>',
        startedAt: new Date('2026-10-27T00:00:00.000Z'),
        appBaseUrl: 'http://localhost:3000',
      });

      expect(rendered.subject).toBe('[Incident Opened] <Production API> & DB is down');
      expect(rendered.text).toContain('Monitor: <Production API> & DB');
      expect(rendered.text).toContain('Target URL: https://api.example.com/health');
      expect(rendered.text).toContain('Cause: HTTP 500 <Internal Server Error>');
      expect(rendered.text).toContain('http://localhost:3000/monitors/mon-123');

      // Verify HTML escaping
      expect(rendered.html).toContain('&lt;Production API&gt; &amp; DB');
      expect(rendered.html).toContain('HTTP 500 &lt;Internal Server Error&gt;');
      expect(rendered.html).not.toContain('<Production API>');
      expect(rendered.html).toContain('http://localhost:3000/monitors/mon-123');
    });
  });

  describe('Incident Resolved Template', () => {
    it('should render correct subject, text, and html with downtime duration', () => {
      const started = new Date('2026-10-27T00:00:00.000Z');
      const resolved = new Date('2026-10-27T00:15:30.000Z'); // 15m 30s

      const rendered = service.renderIncidentResolvedEmail({
        monitorName: 'Auth Service',
        monitorId: 'mon-789',
        incidentId: 'inc-101',
        startedAt: started,
        resolvedAt: resolved,
        appBaseUrl: 'http://localhost:3000',
      });

      expect(rendered.subject).toBe('[Incident Resolved] Auth Service has recovered');
      expect(rendered.text).toContain('Status: Resolved');
      expect(rendered.text).toContain('Downtime Duration: 15m 30s');
      expect(rendered.text).toContain('http://localhost:3000/monitors/mon-789');

      expect(rendered.html).toContain('RESOLVED');
      expect(rendered.html).toContain('15m 30s');
      expect(rendered.html).toContain('Auth Service');
    });
  });
});
