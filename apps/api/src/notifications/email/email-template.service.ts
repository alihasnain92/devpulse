import { Injectable } from '@nestjs/common';

export interface IncidentCreatedTemplateParams {
  monitorName: string;
  monitorId: string;
  monitorUrl?: string;
  incidentId: string;
  cause: string;
  startedAt: Date | string;
  appBaseUrl?: string;
}

export interface IncidentResolvedTemplateParams {
  monitorName: string;
  monitorId: string;
  monitorUrl?: string;
  incidentId: string;
  cause?: string;
  startedAt: Date | string;
  resolvedAt: Date | string;
  durationSeconds?: number;
  appBaseUrl?: string;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

@Injectable()
export class EmailTemplateService {
  /**
   * Sanitizes user-provided text to prevent HTML injection and XSS inside email clients.
   */
  escapeHtml(str: string): string {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  private getBaseUrl(overrideUrl?: string): string {
    return (
      overrideUrl ||
      process.env.APP_BASE_URL ||
      'http://localhost:3000'
    ).replace(/\/+$/, '');
  }

  renderIncidentCreatedEmail(params: IncidentCreatedTemplateParams): RenderedEmail {
    const baseUrl = this.getBaseUrl(params.appBaseUrl);
    const incidentUrl = `${baseUrl}/monitors/${encodeURIComponent(params.monitorId)}`;
    const settingsUrl = `${baseUrl}/settings`;
    const startedIso =
      params.startedAt instanceof Date
        ? params.startedAt.toISOString()
        : new Date(params.startedAt).toISOString();

    const escapedName = this.escapeHtml(params.monitorName);
    const escapedCause = this.escapeHtml(params.cause);
    const escapedUrl = params.monitorUrl
      ? this.escapeHtml(params.monitorUrl)
      : null;

    const subject = `[Incident Opened] ${params.monitorName} is down`;

    const text = [
      `DevPulse Incident Alert: ${params.monitorName} is DOWN`,
      `--------------------------------------------------`,
      `Monitor: ${params.monitorName}`,
      escapedUrl ? `Target URL: ${params.monitorUrl}` : null,
      `Status: Ongoing Outage`,
      `Cause: ${params.cause}`,
      `Started At: ${startedIso}`,
      `Incident ID: ${params.incidentId}`,
      ``,
      `View Incident & Monitor Details:`,
      `${incidentUrl}`,
      ``,
      `Manage notification preferences:`,
      `${settingsUrl}`,
    ]
      .filter((line) => line !== null)
      .join('\n');

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(subject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #090d16; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f1f5f9;">
  <div style="max-width: 600px; margin: 30px auto; background-color: #0f172a; border-radius: 8px; border: 1px solid #1e293b; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.5);">
    <!-- Header -->
    <div style="background-color: #dc2626; padding: 20px 24px; text-align: left;">
      <h1 style="margin: 0; font-size: 20px; font-weight: 700; color: #ffffff; letter-spacing: -0.02em;">
        🚨 DevPulse Alert: Incident Opened
      </h1>
    </div>

    <!-- Content -->
    <div style="padding: 24px;">
      <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.5; color: #cbd5e1;">
        An outage has been detected on monitor <strong>${escapedName}</strong>.
      </p>

      <!-- Details Card -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; background-color: #1e293b; border-radius: 6px; overflow: hidden;">
        <tr>
          <td style="padding: 12px 16px; font-size: 13px; color: #94a3b8; border-bottom: 1px solid #334155; width: 120px;">Monitor</td>
          <td style="padding: 12px 16px; font-size: 14px; font-weight: 600; color: #f8fafc; border-bottom: 1px solid #334155;">${escapedName}</td>
        </tr>
        ${
          escapedUrl
            ? `<tr>
          <td style="padding: 12px 16px; font-size: 13px; color: #94a3b8; border-bottom: 1px solid #334155;">Target URL</td>
          <td style="padding: 12px 16px; font-size: 13px; font-family: monospace; color: #38bdf8; border-bottom: 1px solid #334155;">${escapedUrl}</td>
        </tr>`
            : ''
        }
        <tr>
          <td style="padding: 12px 16px; font-size: 13px; color: #94a3b8; border-bottom: 1px solid #334155;">Status</td>
          <td style="padding: 12px 16px; font-size: 13px; font-weight: 600; color: #ef4444; border-bottom: 1px solid #334155;">DOWN (Ongoing Outage)</td>
        </tr>
        <tr>
          <td style="padding: 12px 16px; font-size: 13px; color: #94a3b8; border-bottom: 1px solid #334155;">Failure Cause</td>
          <td style="padding: 12px 16px; font-size: 13px; color: #fca5a5; font-family: monospace; border-bottom: 1px solid #334155;">${escapedCause}</td>
        </tr>
        <tr>
          <td style="padding: 12px 16px; font-size: 13px; color: #94a3b8;">Started At</td>
          <td style="padding: 12px 16px; font-size: 13px; color: #e2e8f0;">${startedIso}</td>
        </tr>
      </table>

      <!-- CTA Button -->
      <div style="text-align: center; margin: 28px 0;">
        <a href="${incidentUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 6px; display: inline-block;">
          View Monitor & Incident
        </a>
      </div>
    </div>

    <!-- Footer -->
    <div style="background-color: #0b1120; padding: 16px 24px; border-top: 1px solid #1e293b; text-align: center; font-size: 12px; color: #64748b;">
      <p style="margin: 0 0 6px 0;">
        You received this notification because your DevPulse alert preferences are set to notify on incident creation.
      </p>
      <p style="margin: 0;">
        <a href="${settingsUrl}" style="color: #60a5fa; text-decoration: underline;">Manage notification preferences</a>
      </p>
    </div>
  </div>
</body>
</html>
`.trim();

    return { subject, text, html };
  }

  renderIncidentResolvedEmail(params: IncidentResolvedTemplateParams): RenderedEmail {
    const baseUrl = this.getBaseUrl(params.appBaseUrl);
    const incidentUrl = `${baseUrl}/monitors/${encodeURIComponent(params.monitorId)}`;
    const settingsUrl = `${baseUrl}/settings`;

    const startedDate =
      params.startedAt instanceof Date
        ? params.startedAt
        : new Date(params.startedAt);
    const resolvedDate =
      params.resolvedAt instanceof Date
        ? params.resolvedAt
        : new Date(params.resolvedAt);

    const startedIso = startedDate.toISOString();
    const resolvedIso = resolvedDate.toISOString();

    const durationSec =
      params.durationSeconds ??
      Math.max(
        0,
        Math.round((resolvedDate.getTime() - startedDate.getTime()) / 1000),
      );

    const formattedDuration = this.formatDuration(durationSec);

    const escapedName = this.escapeHtml(params.monitorName);
    const escapedUrl = params.monitorUrl
      ? this.escapeHtml(params.monitorUrl)
      : null;

    const subject = `[Incident Resolved] ${params.monitorName} has recovered`;

    const text = [
      `DevPulse Incident Alert: ${params.monitorName} has RECOVERED`,
      `-------------------------------------------------------`,
      `Monitor: ${params.monitorName}`,
      escapedUrl ? `Target URL: ${params.monitorUrl}` : null,
      `Status: Resolved`,
      `Downtime Duration: ${formattedDuration}`,
      `Started At: ${startedIso}`,
      `Resolved At: ${resolvedIso}`,
      `Incident ID: ${params.incidentId}`,
      ``,
      `View Monitor Details:`,
      `${incidentUrl}`,
      ``,
      `Manage notification preferences:`,
      `${settingsUrl}`,
    ]
      .filter((line) => line !== null)
      .join('\n');

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(subject)}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #090d16; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #f1f5f9;">
  <div style="max-width: 600px; margin: 30px auto; background-color: #0f172a; border-radius: 8px; border: 1px solid #1e293b; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.5);">
    <!-- Header -->
    <div style="background-color: #16a34a; padding: 20px 24px; text-align: left;">
      <h1 style="margin: 0; font-size: 20px; font-weight: 700; color: #ffffff; letter-spacing: -0.02em;">
        ✅ DevPulse: Incident Resolved
      </h1>
    </div>

    <!-- Content -->
    <div style="padding: 24px;">
      <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.5; color: #cbd5e1;">
        The incident on monitor <strong>${escapedName}</strong> has been resolved and health checks are passing.
      </p>

      <!-- Details Card -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px; background-color: #1e293b; border-radius: 6px; overflow: hidden;">
        <tr>
          <td style="padding: 12px 16px; font-size: 13px; color: #94a3b8; border-bottom: 1px solid #334155; width: 140px;">Monitor</td>
          <td style="padding: 12px 16px; font-size: 14px; font-weight: 600; color: #f8fafc; border-bottom: 1px solid #334155;">${escapedName}</td>
        </tr>
        ${
          escapedUrl
            ? `<tr>
          <td style="padding: 12px 16px; font-size: 13px; color: #94a3b8; border-bottom: 1px solid #334155;">Target URL</td>
          <td style="padding: 12px 16px; font-size: 13px; font-family: monospace; color: #38bdf8; border-bottom: 1px solid #334155;">${escapedUrl}</td>
        </tr>`
            : ''
        }
        <tr>
          <td style="padding: 12px 16px; font-size: 13px; color: #94a3b8; border-bottom: 1px solid #334155;">Status</td>
          <td style="padding: 12px 16px; font-size: 13px; font-weight: 600; color: #22c55e; border-bottom: 1px solid #334155;">RESOLVED</td>
        </tr>
        <tr>
          <td style="padding: 12px 16px; font-size: 13px; color: #94a3b8; border-bottom: 1px solid #334155;">Total Downtime</td>
          <td style="padding: 12px 16px; font-size: 13px; font-weight: 600; color: #f8fafc; border-bottom: 1px solid #334155;">${this.escapeHtml(formattedDuration)}</td>
        </tr>
        <tr>
          <td style="padding: 12px 16px; font-size: 13px; color: #94a3b8; border-bottom: 1px solid #334155;">Started At</td>
          <td style="padding: 12px 16px; font-size: 13px; color: #e2e8f0; border-bottom: 1px solid #334155;">${startedIso}</td>
        </tr>
        <tr>
          <td style="padding: 12px 16px; font-size: 13px; color: #94a3b8;">Resolved At</td>
          <td style="padding: 12px 16px; font-size: 13px; color: #e2e8f0;">${resolvedIso}</td>
        </tr>
      </table>

      <!-- CTA Button -->
      <div style="text-align: center; margin: 28px 0;">
        <a href="${incidentUrl}" style="background-color: #2563eb; color: #ffffff; padding: 12px 24px; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 6px; display: inline-block;">
          View Monitor Details
        </a>
      </div>
    </div>

    <!-- Footer -->
    <div style="background-color: #0b1120; padding: 16px 24px; border-top: 1px solid #1e293b; text-align: center; font-size: 12px; color: #64748b;">
      <p style="margin: 0 0 6px 0;">
        You received this notification because your DevPulse alert preferences are set to notify on incident resolution.
      </p>
      <p style="margin: 0;">
        <a href="${settingsUrl}" style="color: #60a5fa; text-decoration: underline;">Manage notification preferences</a>
      </p>
    </div>
  </div>
</body>
</html>
`.trim();

    return { subject, text, html };
  }

  private formatDuration(seconds: number): string {
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    if (minutes < 60) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }
}
