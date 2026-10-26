import { DisabledEmailProviderService } from './disabled-email-provider.service';
import { EmailMessage } from './email-provider.interface';

describe('DisabledEmailProviderService', () => {
  let service: DisabledEmailProviderService;

  beforeEach(() => {
    service = new DisabledEmailProviderService();
  });

  it('should always return EMAIL_PROVIDER_NOT_CONFIGURED failure without throwing', async () => {
    const message: EmailMessage = {
      to: 'user@example.com',
      subject: 'Test',
      text: 'Body',
      html: '<p>Body</p>',
    };

    const result = await service.send(message);
    expect(result.success).toBe(false);
    expect(result.error?.code).toBe('EMAIL_PROVIDER_NOT_CONFIGURED');
    expect(result.error?.message).toContain('disabled or SMTP is not configured');
  });
});
