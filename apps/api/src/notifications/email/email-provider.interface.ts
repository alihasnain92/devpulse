export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  error?: {
    code?: string;
    message: string;
  };
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<EmailSendResult>;
}

export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');
