import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { EmailTemplateService } from './email/email-template.service';
import { SmtpEmailProviderService } from './email/smtp-email-provider.service';
import { DisabledEmailProviderService } from './email/disabled-email-provider.service';
import { EMAIL_PROVIDER } from './email/email-provider.interface';
import { NotificationEmailPublisherService } from './outbox/notification-email-publisher.service';
import { NotificationEmailWorkerService } from './queue/notification-email-worker.service';

@Module({
  imports: [PrismaModule],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    EmailTemplateService,
    SmtpEmailProviderService,
    DisabledEmailProviderService,
    {
      provide: EMAIL_PROVIDER,
      useFactory: (
        smtp: SmtpEmailProviderService,
        disabled: DisabledEmailProviderService,
      ) => {
        if (
          process.env.EMAIL_PROVIDER === 'disabled' ||
          !process.env.SMTP_HOST
        ) {
          return disabled;
        }
        return smtp;
      },
      inject: [SmtpEmailProviderService, DisabledEmailProviderService],
    },
    NotificationEmailPublisherService,
    NotificationEmailWorkerService,
  ],
  exports: [
    NotificationsService,
    EmailTemplateService,
    NotificationEmailPublisherService,
    NotificationEmailWorkerService,
    EMAIL_PROVIDER,
  ],
})
export class NotificationsModule {}
