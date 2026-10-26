'use client';

import * as React from 'react';
import {
  NotificationPreferenceDto,
  NOTIFICATION_PREFERENCE_DEFAULTS,
} from '@devpulse/shared';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
      setSuccessMessage('Notification preferences saved successfully.');
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
      <div className="flex items-center justify-center p-12 text-slate-400">
        <RefreshCw className="h-6 w-6 animate-spin mr-2" />
        <span>Loading preferences...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
            <Bell className="h-5 w-5 text-blue-400" />
            <span>Incident Alert Preferences</span>
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Choose how you would like to be notified when your monitors experience outages or recover.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-red-950/40 border border-red-800 text-red-300 text-sm flex items-center gap-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-lg bg-emerald-950/40 border border-emerald-800 text-emerald-300 text-sm flex items-center gap-3">
          <Check className="h-5 w-5 shrink-0 text-emerald-400" />
          <span>{successMessage}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* In-App Notifications Card */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                <Bell className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold text-white">
                  In-App Notifications
                </CardTitle>
                <CardDescription className="text-xs text-slate-400">
                  Receive notifications inside the DevPulse navigation bar and notifications center.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-800 bg-slate-950/50 hover:bg-slate-950 transition-colors cursor-pointer">
              <input
                type="checkbox"
                checked={inAppCreated}
                onChange={(e) => setInAppCreated(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-500"
              />
              <div className="flex-1">
                <div className="text-sm font-medium text-slate-200">
                  Incident Opened Alerts
                </div>
                <div className="text-xs text-slate-400">
                  Generate an in-app alert when a monitor fails 3 consecutive checks and opens an incident.
                </div>
              </div>
              <Badge variant="outline" className="text-xs border-slate-700 text-slate-300">
                Default: Enabled
              </Badge>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-800 bg-slate-950/50 hover:bg-slate-950 transition-colors cursor-pointer">
              <input
                type="checkbox"
                checked={inAppResolved}
                onChange={(e) => setInAppResolved(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-500"
              />
              <div className="flex-1">
                <div className="text-sm font-medium text-slate-200">
                  Incident Resolved Alerts
                </div>
                <div className="text-xs text-slate-400">
                  Generate an in-app alert when health checks pass and an open incident is resolved.
                </div>
              </div>
              <Badge variant="outline" className="text-xs border-slate-700 text-slate-300">
                Default: Enabled
              </Badge>
            </label>
          </CardContent>
        </Card>

        {/* Email Notifications Card */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-indigo-500/10 flex items-center justify-center text-indigo-400">
                <Mail className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-base font-semibold text-white">
                  Email Notifications
                </CardTitle>
                <CardDescription className="text-xs text-slate-400">
                  Dispatch email notifications directly to your user account email address.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <div className="p-3.5 rounded-lg bg-blue-950/30 border border-blue-900/40 text-blue-300 text-xs flex items-start gap-2.5">
              <Info className="h-4 w-4 shrink-0 text-blue-400 mt-0.5" />
              <div className="leading-relaxed">
                Email delivery uses the transactional outbox pipeline and requires SMTP credentials configured on the server. If using the demo account (<code className="text-blue-200">demo@devpulse.dev</code>), real external SMTP transmission is bypassed and recorded as a simulated email delivery to prevent outbound network traffic.
              </div>
            </div>

            <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-800 bg-slate-950/50 hover:bg-slate-950 transition-colors cursor-pointer">
              <input
                type="checkbox"
                checked={emailCreated}
                onChange={(e) => setEmailCreated(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-500"
              />
              <div className="flex-1">
                <div className="text-sm font-medium text-slate-200">
                  Email on Incident Opened
                </div>
                <div className="text-xs text-slate-400">
                  Send an email notification immediately when an outage begins.
                </div>
              </div>
              <Badge variant="outline" className="text-xs border-slate-700 text-slate-400">
                Opt-in
              </Badge>
            </label>

            <label className="flex items-start gap-3 p-3 rounded-lg border border-slate-800 bg-slate-950/50 hover:bg-slate-950 transition-colors cursor-pointer">
              <input
                type="checkbox"
                checked={emailResolved}
                onChange={(e) => setEmailResolved(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-900 text-blue-600 focus:ring-blue-500"
              />
              <div className="flex-1">
                <div className="text-sm font-medium text-slate-200">
                  Email on Incident Resolved
                </div>
                <div className="text-xs text-slate-400">
                  Send an email notification when monitor recovers with total downtime duration.
                </div>
              </div>
              <Badge variant="outline" className="text-xs border-slate-700 text-slate-400">
                Opt-in
              </Badge>
            </label>
          </CardContent>
        </Card>

        {/* Action Button */}
        <div className="flex justify-end">
          <Button
            type="submit"
            disabled={isSaving}
            className="gap-2 bg-blue-600 hover:bg-blue-500 text-white"
          >
            {isSaving ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            <span>{isSaving ? 'Saving...' : 'Save Alert Preferences'}</span>
          </Button>
        </div>
      </form>
    </div>
  );
}
