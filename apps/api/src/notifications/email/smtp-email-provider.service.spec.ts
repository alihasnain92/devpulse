import { SmtpEmailProviderService } from './smtp-email-provider.service';
import { EmailMessage } from './email-provider.interface';

describe('SmtpEmailProviderService', () => {
  let service: SmtpEmailProviderService;

  beforeEach(() => {
    service = new SmtpEmailProviderService();
  });

  it('should return error if transporter is not initialized', async () => {
    service.setTransporter(null);
    const message: EmailMessage = {
      to: 'user@example.com',
      subject: 'Test Subject',
      text: 'Test Body',
      html: '<p>Test Body</p>',
    };

    const result = await service.send(message);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('SMTP_NOT_CONFIGURED');
  });

  it('should send email successfully with custom transporter', async () => {
    const mockTransporter = {
      sendMail: jest.fn().mockResolvedValue({ messageId: 'msg-12345' }),
    };
    service.setTransporter(mockTransporter as any);

    const message: EmailMessage = {
      to: 'user@example.com',
      subject: 'Incident Alert',
      text: 'Monitor is down',
      html: '<p>Monitor is down</p>',
    };

    const result = await service.send(message);
    expect(result.success).toBe(true);
    expect(result.messageId).toBe('msg-12345');
    expect(mockTransporter.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: 'Incident Alert',
        text: 'Monitor is down',
        html: '<p>Monitor is down</p>',
      }),
    );
  });

  it('should capture and map transport sendMail exceptions', async () => {
    const mockTransporter = {
      sendMail: jest.fn().mockRejectedValue({
        code: 'ECONNREFUSED',
        message: 'Connection refused by SMTP server',
      }),
    };
    service.setTransporter(mockTransporter as any);

    const message: EmailMessage = {
      to: 'user@example.com',
      subject: 'Incident Alert',
      text: 'Monitor is down',
      html: '<p>Monitor is down</p>',
    };

    const result = await service.send(message);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('ECONNREFUSED');
    expect(result.error?.message).toContain('Connection refused');
  });
});
