'use client';

import * as React from 'react';
import {
  NotificationPreferenceDto,
  NOTIFICATION_PREFERENCE_DEFAULTS,
} from '@devpulse/shared';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  AlertCircle,
  Bell,
  Check,
  Info,
  Mail,
  RefreshCw,
  Save,
} from 'lucide-react';

export function NotificationsTab() {
  const [_preferences, setPreferences] = React.useState<NotificationPreferenceDto | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  // Form states
  const [inAppCreated, setInAppCreated] = React.useState<boolean>(
    NOTIFICATION_PREFERENCE_DEFAULTS.inAppIncidentCreated,
  );
  const [inAppResolved, setInAppResolved] = React.useState<boolean>(
    NOTIFICATION_PREFERENCE_DEFAULTS.inAppIncidentResolved,
  );
  const [emailCreated, setEmailCreated] = React.useState<boolean>(
    NOTIFICATION_PREFERENCE_DEFAULTS.emailIncidentCreated,
  );
  const [emailResolved, setEmailResolved] = React.useState<boolean>(
    NOTIFICATION_PREFERENCE_DEFAULTS.emailIncidentResolved,
  );

  const loadPreferences = React.useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiClient.getNotificationPreferences();
      setPreferences(data);
      setInAppCreated(data.inAppIncidentCreated);
      setInAppResolved(data.inAppIncidentResolved);
      setEmailCreated(data.emailIncidentCreated);
      setEmailResolved(data.emailIncidentResolved);
    } catch (err: unknown) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to load notification preferences',
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadPreferences();
  }, [loadPreferences]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    try {
      setIsSaving(true);
      setError(null);
      setSuccessMessage(null);

      const updated = await apiClient.updateNotificationPreferences({
        inAppIncidentCreated: inAppCreated,
        inAppIncidentResolved: inAppResolved,
        emailIncidentCreated: emailCreated,
        emailIncidentResolved: emailResolved,
      });

      setPreferences(updated);
      setSuccessMessage('Notification routing preferences saved successfully.');
      setTimeout(() => {
        setSuccessMessage(null);
      }, 4000);
    } catch (err: unknown) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : 'Failed to update notification preferences',
      );
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12 text-[var(--text-muted)] space-x-2">
        <RefreshCw className="h-5 w-5 animate-spin text-[var(--primary)]" />
        <span className="text-xs font-mono">Loading routing preferences...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-base font-semibold font-mono text-[var(--text-primary)]">
          Notification Routing Preferences
        </h2>
        <p className="text-xs text-[var(--text-muted)] mt-0.5">
          Configure automated alert channels triggered on incident detection and recovery events.
        </p>
      </div>

      {error && (
        <div className="rounded-[4px] border border-[var(--status-down)]/40 bg-[var(--status-down-bg)]/20 p-3.5 flex items-center gap-2.5 text-xs text-[var(--status-down)]">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="rounded-[4px] border border-[var(--status-healthy)]/40 bg-[var(--status-healthy-bg)]/20 p-3.5 flex items-center gap-2.5 text-xs text-[var(--status-healthy)]">
          <Check className="h-4 w-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* In-App Notifications Section */}
        <Card className="p-0 overflow-hidden">
          <div className="p-4 border-b border-[var(--border)] bg-[var(--surface-subtle)] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Bell className="h-4 w-4 text-[var(--primary)]" />
              <div>
                <h3 className="text-xs font-mono font-semibold text-[var(--text-primary)] uppercase tracking-wider">
                  In-App Notification Center
                </h3>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Dispatched to the navigation bar feed and alerts page.
                </p>
              </div>
            </div>
            <Badge variant="outline" className="text-[10px] font-mono text-[var(--text-secondary)]">
              In-App
            </Badge>
          </div>

          <CardContent className="p-4 space-y-3">
            <label className="flex items-start gap-3 p-3 rounded-[4px] border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer">
              <input
                type="checkbox"
                checked={inAppCreated}
                onChange={(e) => setInAppCreated(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded-[2px] border-[var(--border)] bg-[var(--surface-active)] text-[var(--primary)] focus:ring-[var(--border-focus)]"
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-[var(--text-primary)]">
                  Incident Opened Alerts
                </div>
                <div className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                  Generate an in-app alert when a target fails 3 consecutive health checks and opens an active outage.
                </div>
              </div>
              <span className="text-[10px] font-mono text-[var(--text-dim)] shrink-0 hidden sm:inline">
                Default: Enabled
              </span>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-[4px] border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer">
              <input
                type="checkbox"
                checked={inAppResolved}
                onChange={(e) => setInAppResolved(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded-[2px] border-[var(--border)] bg-[var(--surface-active)] text-[var(--primary)] focus:ring-[var(--border-focus)]"
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-[var(--text-primary)]">
                  Incident Resolved Alerts
                </div>
                <div className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                  Generate an in-app alert when a previously failing target recovers and health checks pass.
                </div>
              </div>
              <span className="text-[10px] font-mono text-[var(--text-dim)] shrink-0 hidden sm:inline">
                Default: Enabled
              </span>
            </label>
          </CardContent>
        </Card>

        {/* Email Notifications Section */}
        <Card className="p-0 overflow-hidden">
          <div className="p-4 border-b border-[var(--border)] bg-[var(--surface-subtle)] flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Mail className="h-4 w-4 text-[var(--primary)]" />
              <div>
                <h3 className="text-xs font-mono font-semibold text-[var(--text-primary)] uppercase tracking-wider">
                  Email Outbox Dispatch
                </h3>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Transactional emails sent to your registered user address.
                </p>
              </div>
            </div>
            <Badge variant="outline" className="text-[10px] font-mono text-[var(--text-secondary)]">
              SMTP
            </Badge>
          </div>

          <CardContent className="p-4 space-y-3">
            {/* Operational note on SMTP and demo account */}
            <div className="p-3 rounded-[4px] bg-[var(--surface-subtle)] border border-[var(--border-subtle)] text-xs text-[var(--text-secondary)] flex items-start gap-2.5">
              <Info className="h-4 w-4 shrink-0 text-[var(--primary)] mt-0.5" />
              <div className="text-[11px] leading-relaxed">
                Email dispatch uses a transactional outbox queue with automated background retry workers. For the DevPulse demo account (<code className="font-mono text-[var(--primary)]">demo@devpulse.dev</code>), external SMTP transmission is skipped. The email delivery is simulated and recorded by DevPulse without sending a real email.
              </div>
            </div>

            <label className="flex items-start gap-3 p-3 rounded-[4px] border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer">
              <input
                type="checkbox"
                checked={emailCreated}
                onChange={(e) => setEmailCreated(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded-[2px] border-[var(--border)] bg-[var(--surface-active)] text-[var(--primary)] focus:ring-[var(--border-focus)]"
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-[var(--text-primary)]">
                  Email on Incident Opened
                </div>
                <div className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                  Send an email notification when an outage is confirmed after 3 consecutive failures.
                </div>
              </div>
              <span className="text-[10px] font-mono text-[var(--text-dim)] shrink-0 hidden sm:inline">
                Opt-in
              </span>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-[4px] border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-hover)] transition-colors cursor-pointer">
              <input
                type="checkbox"
                checked={emailResolved}
                onChange={(e) => setEmailResolved(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded-[2px] border-[var(--border)] bg-[var(--surface-active)] text-[var(--primary)] focus:ring-[var(--border-focus)]"
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-[var(--text-primary)]">
                  Email on Incident Resolved
                </div>
                <div className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                  Send an email summary with total downtime duration when service recovers.
                </div>
              </div>
              <span className="text-[10px] font-mono text-[var(--text-dim)] shrink-0 hidden sm:inline">
                Opt-in
              </span>
            </label>
          </CardContent>
        </Card>

        {/* Action Button */}
        <div className="flex justify-end pt-2">
          <Button
            type="submit"
            disabled={isSaving}
            className="gap-2 font-mono text-xs"
          >
            {isSaving ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" />
            )}
            <span>{isSaving ? 'Saving Preferences...' : 'Save Preferences'}</span>
          </Button>
        </div>
      </form>
    </div>
  );
}
