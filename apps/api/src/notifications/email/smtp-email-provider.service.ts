import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import {
  EmailMessage,
  EmailProvider,
  EmailSendResult,
} from './email-provider.interface';

@Injectable()
export class SmtpEmailProviderService implements EmailProvider {
  private readonly logger = new Logger(SmtpEmailProviderService.name);
  private transporter: Transporter | null = null;

  constructor() {
    this.initTransporter();
  }

  private initTransporter(): void {
    const host = process.env.SMTP_HOST;
    if (!host) {
      this.logger.warn(
        'SMTP_HOST is not configured. Outgoing SMTP emails will fail unless mock transporter is provided.',
      );
      return;
    }

    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const secure =
      process.env.SMTP_SECURE === 'true' ||
      process.env.SMTP_PORT === '465';

    const auth = process.env.SMTP_USER
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS || '',
        }
      : undefined;

    try {
      this.transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth,
      });
      this.logger.log(
        `Configured SMTP transport for ${host}:${port} (secure: ${secure})`,
      );
    } catch (err: unknown) {
      this.logger.error(
        `Failed to initialize SMTP transporter: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Allows injecting a custom/mock transporter for tests or dynamic reconfiguration.
   */
  setTransporter(transporter: Transporter | null): void {
    this.transporter = transporter;
  }

  async send(message: EmailMessage): Promise<EmailSendResult> {
    if (!this.transporter) {
      return {
        success: false,
        error: {
          code: 'SMTP_NOT_CONFIGURED',
          message: 'SMTP transport is not initialized or configured',
        },
      };
    }

    const from =
      process.env.EMAIL_FROM || 'DevPulse Alerts <alerts@devpulse.dev>';

    try {
      const info = await this.transporter.sendMail({
        from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });

      this.logger.log(
        `Successfully dispatched email to ${message.to} (MessageId: ${info?.messageId || 'unknown'})`,
      );

      return {
        success: true,
        messageId: info?.messageId,
      };
    } catch (err: unknown) {
      const error = err as { code?: string; message?: string };
      const code = error.code || 'SMTP_SEND_FAILED';
      const errorMessage = error.message || 'Failed to dispatch email over SMTP';

      this.logger.warn(
        `Failed to dispatch email to ${message.to} [${code}]: ${errorMessage}`,
      );

      return {
        success: false,
        error: {
          code,
          message: errorMessage,
        },
      };
    }
  }
}
