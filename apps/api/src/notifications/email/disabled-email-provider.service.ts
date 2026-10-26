import { Injectable, Logger } from '@nestjs/common';
import {
  EmailMessage,
  EmailProvider,
  EmailSendResult,
} from './email-provider.interface';

@Injectable()
export class DisabledEmailProviderService implements EmailProvider {
  private readonly logger = new Logger(DisabledEmailProviderService.name);

  async send(message: EmailMessage): Promise<EmailSendResult> {
    this.logger.debug(
      `Email delivery to ${message.to} skipped: Email provider is disabled or not configured.`,
    );

    return {
      success: false,
      error: {
        code: 'EMAIL_PROVIDER_NOT_CONFIGURED',
        message: 'Email provider is disabled or SMTP is not configured',
      },
    };
  }
}
