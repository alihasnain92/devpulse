'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  API_KEY_SCOPES,
  ApiKeyDto,
  ApiKeyScope,
  WEBHOOK_EVENT_TYPES,
  WebhookEndpointDto,
  WebhookEventType,
} from '@devpulse/shared';
import { useAuth } from '@/lib/auth-context';
import { apiClient, ApiClientError } from '@/lib/api-client';
import { Navbar } from '@/components/navbar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { OperationalPageHeader } from '@/components/ui/operational-page-header';
import { StatusIndicator } from '@/components/ui/status-indicator';
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  Check,
  Copy,
  ExternalLink,
  History,
  Key,
  Plus,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Webhook,
} from 'lucide-react';
import { DeliveriesTab } from './deliveries-tab';
import { NotificationsTab } from './notifications-tab';

const API_KEY_SCOPE_DESCRIPTIONS: Record<ApiKeyScope, string> = {
  'monitors:read': 'View monitors, status, and health metrics',
  'monitors:write': 'Create, edit, pause, and delete monitors',
  'incidents:read': 'Access incident history, outages, and timeline',
  'webhooks:read': 'View configured webhook endpoints and delivery logs',
  'webhooks:write': 'Create, update, test, and manage webhook endpoints',
  'notifications:read': 'View alert notification history and channels',
  'notifications:write': 'Update notification preferences and email alerts',
};

export default function SettingsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = React.useState<
    'webhooks' | 'deliveries' | 'notifications' | 'apikeys'
  >('webhooks');

  // Webhooks State
  const [webhooks, setWebhooks] = React.useState<WebhookEndpointDto[]>([]);
  const [webhooksLoading, setWebhooksLoading] = React.useState(true);
  const [webhookError, setWebhookError] = React.useState<string | null>(null);

  // New Webhook Modal State
  const [showCreateWebhook, setShowCreateWebhook] = React.useState(false);
  const [newWebhookName, setNewWebhookName] = React.useState('');
  const [newWebhookUrl, setNewWebhookUrl] = React.useState('');
  const [newWebhookDescription, setNewWebhookDescription] = React.useState('');
  const [newWebhookEvents, setNewWebhookEvents] = React.useState<WebhookEventType[]>([
    'incident.created',
    'incident.resolved',
  ]);
  const [creatingWebhook, setCreatingWebhook] = React.useState(false);
  const [createWebhookError, setCreateWebhookError] = React.useState<string | null>(null);

  // Revealed Secret Modal State
  const [revealedSecret, setRevealedSecret] = React.useState<{
    name: string;
    secret: string;
  } | null>(null);
  const [copiedSecret, setCopiedSecret] = React.useState(false);

  // Edit Webhook Modal State
  const [editingWebhook, setEditingWebhook] = React.useState<WebhookEndpointDto | null>(null);
  const [editName, setEditName] = React.useState('');
  const [editUrl, setEditUrl] = React.useState('');
  const [editDescription, setEditDescription] = React.useState('');
  const [editEvents, setEditEvents] = React.useState<WebhookEventType[]>([]);
  const [editEnabled, setEditEnabled] = React.useState(true);
  const [updatingWebhook, setUpdatingWebhook] = React.useState(false);

  // Delete Webhook State
  const [deletingWebhookId, setDeletingWebhookId] = React.useState<string | null>(null);
  const [isDeletingWebhook, setIsDeletingWebhook] = React.useState(false);

  // API Keys State
  const [apiKeys, setApiKeys] = React.useState<ApiKeyDto[]>([]);
  const [keysLoading, setKeysLoading] = React.useState(true);
  const [keyError, setKeyError] = React.useState<string | null>(null);

  // New API Key Modal State
  const [showCreateKey, setShowCreateKey] = React.useState(false);
  const [newKeyName, setNewKeyName] = React.useState('');
  const [newKeyScopes, setNewKeyScopes] = React.useState<ApiKeyScope[]>([
    'monitors:read',
    'incidents:read',
  ]);
  const [creatingKey, setCreatingKey] = React.useState(false);
  const [createKeyError, setCreateKeyError] = React.useState<string | null>(null);

  // Revealed Raw Key Modal State
  const [revealedKey, setRevealedKey] = React.useState<{
    name: string;
    rawKey: string;
  } | null>(null);
  const [copiedKey, setCopiedKey] = React.useState(false);

  // Revoke Key State
  const [revokingKeyId, setRevokingKeyId] = React.useState<string | null>(null);
  const [isRevokingKey, setIsRevokingKey] = React.useState(false);

  // Redirect to login if not authenticated
  React.useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  // Load Webhooks
  const loadWebhooks = React.useCallback(async () => {
    try {
      setWebhooksLoading(true);
      setWebhookError(null);
      const data = await apiClient.getWebhooks();
      setWebhooks(data);
    } catch (err) {
      setWebhookError(
        err instanceof ApiClientError ? err.message : 'Failed to load webhooks',
      );
    } finally {
      setWebhooksLoading(false);
    }
  }, []);

  // Load API Keys
  const loadApiKeys = React.useCallback(async () => {
    try {
      setKeysLoading(true);
      setKeyError(null);
      const data = await apiClient.getApiKeys();
      setApiKeys(data);
    } catch (err) {
      setKeyError(
        err instanceof ApiClientError ? err.message : 'Failed to load API keys',
      );
    } finally {
      setKeysLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (user) {
      loadWebhooks();
      loadApiKeys();
    }
  }, [user, loadWebhooks, loadApiKeys]);

  // Webhook handlers
  async function handleCreateWebhook(e: React.FormEvent) {
    e.preventDefault();
    if (!newWebhookName.trim() || !newWebhookUrl.trim() || newWebhookEvents.length === 0) {
      setCreateWebhookError('Please provide a name, destination URL, and at least one event subscription.');
      return;
    }

    try {
      setCreatingWebhook(true);
      setCreateWebhookError(null);
      const res = await apiClient.createWebhook({
        name: newWebhookName.trim(),
        url: newWebhookUrl.trim(),
        description: newWebhookDescription.trim() || undefined,
        events: newWebhookEvents,
      });

      setShowCreateWebhook(false);
      setNewWebhookName('');
      setNewWebhookUrl('');
      setNewWebhookDescription('');
      setNewWebhookEvents(['incident.created', 'incident.resolved']);

      // Show revealed secret modal once
      setRevealedSecret({
        name: res.endpoint.name,
        secret: res.signingSecret,
      });

      await loadWebhooks();
    } catch (err) {
      setCreateWebhookError(
        err instanceof ApiClientError ? err.message : 'Failed to register webhook',
      );
    } finally {
      setCreatingWebhook(false);
    }
  }

  function openEditWebhook(webhook: WebhookEndpointDto) {
    setEditingWebhook(webhook);
    setEditName(webhook.name);
    setEditUrl(webhook.url);
    setEditDescription(webhook.description || '');
    setEditEvents([...webhook.events]);
    setEditEnabled(webhook.isEnabled);
  }

  async function handleUpdateWebhook(e: React.FormEvent) {
    e.preventDefault();
    if (!editingWebhook) return;

    try {
      setUpdatingWebhook(true);
      await apiClient.updateWebhook(editingWebhook.id, {
        name: editName.trim(),
        url: editUrl.trim(),
        description: editDescription.trim() || undefined,
        events: editEvents,
        isEnabled: editEnabled,
      });

      setEditingWebhook(null);
      await loadWebhooks();
    } catch (err) {
      alert(err instanceof ApiClientError ? err.message : 'Failed to update webhook');
    } finally {
      setUpdatingWebhook(false);
    }
  }

  async function handleDeleteWebhook() {
    if (!deletingWebhookId) return;

    try {
      setIsDeletingWebhook(true);
      await apiClient.deleteWebhook(deletingWebhookId);
      setDeletingWebhookId(null);
      await loadWebhooks();
    } catch (err) {
      alert(err instanceof ApiClientError ? err.message : 'Failed to delete webhook');
    } finally {
      setIsDeletingWebhook(false);
    }
  }

  // API Key handlers
  async function handleCreateKey(e: React.FormEvent) {
    e.preventDefault();
    if (!newKeyName.trim() || newKeyScopes.length === 0) {
      setCreateKeyError('Please provide a friendly name and select at least one scope.');
      return;
    }

    try {
      setCreatingKey(true);
      setCreateKeyError(null);
      const res = await apiClient.createApiKey({
        name: newKeyName.trim(),
        scopes: newKeyScopes,
      });

      setShowCreateKey(false);
      setNewKeyName('');
      setNewKeyScopes(['monitors:read', 'incidents:read']);

      // Show raw key modal once
      setRevealedKey({
        name: res.apiKey.name,
        rawKey: res.rawKey,
      });

      await loadApiKeys();
    } catch (err) {
      setCreateKeyError(
        err instanceof ApiClientError ? err.message : 'Failed to create API key',
      );
    } finally {
      setCreatingKey(false);
    }
  }

  async function handleRevokeKey() {
    if (!revokingKeyId) return;

    try {
      setIsRevokingKey(true);
      await apiClient.revokeApiKey(revokingKeyId);
      setRevokingKeyId(null);
      await loadApiKeys();
    } catch (err) {
      alert(err instanceof ApiClientError ? err.message : 'Failed to revoke API key');
    } finally {
      setIsRevokingKey(false);
    }
  }

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center text-[var(--text-muted)]">
        <RefreshCw className="h-6 w-6 animate-spin text-[var(--primary)]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--text-primary)] flex flex-col font-sans">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Page Header */}
        <OperationalPageHeader
          eyebrow="Configuration & Integrations"
          title="Settings"
          description="Manage webhook endpoints, inspect delivery histories, configure notification routing, and manage API keys."
        />

        {/* Tab Controls Navigation */}
        <div className="flex border-b border-[var(--border)] overflow-x-auto gap-2">
          <button
            onClick={() => setActiveTab('webhooks')}
            className={`flex items-center gap-2 pb-2.5 px-3 text-xs font-mono font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'webhooks'
                ? 'border-[var(--primary)] text-[var(--text-primary)] font-semibold'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Webhook className="h-3.5 w-3.5" />
            <span>Webhooks</span>
            <Badge variant="secondary" className="font-mono text-[10px] tabular-nums">
              {webhooks.length}
            </Badge>
          </button>

          <button
            onClick={() => setActiveTab('deliveries')}
            className={`flex items-center gap-2 pb-2.5 px-3 text-xs font-mono font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'deliveries'
                ? 'border-[var(--primary)] text-[var(--text-primary)] font-semibold'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <History className="h-3.5 w-3.5" />
            <span>Deliveries</span>
          </button>

          <button
            onClick={() => setActiveTab('notifications')}
            className={`flex items-center gap-2 pb-2.5 px-3 text-xs font-mono font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'notifications'
                ? 'border-[var(--primary)] text-[var(--text-primary)] font-semibold'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Bell className="h-3.5 w-3.5" />
            <span>Notifications</span>
          </button>

          <button
            onClick={() => setActiveTab('apikeys')}
            className={`flex items-center gap-2 pb-2.5 px-3 text-xs font-mono font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'apikeys'
                ? 'border-[var(--primary)] text-[var(--text-primary)] font-semibold'
                : 'border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            <Key className="h-3.5 w-3.5" />
            <span>API Keys</span>
            <Badge variant="secondary" className="font-mono text-[10px] tabular-nums">
              {apiKeys.length}
            </Badge>
          </button>
        </div>

        {/* TAB 1: WEBHOOKS */}
        {activeTab === 'webhooks' && (
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold font-mono text-[var(--text-primary)]">
                  Webhook Endpoints
                </h2>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Receive cryptographically signed HTTP POST payloads when incidents occur or resolve.
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => setShowCreateWebhook(true)}
                className="gap-1.5 font-mono text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Register Endpoint</span>
              </Button>
            </div>

            {webhookError && (
              <div className="rounded-[4px] border border-[var(--status-down)]/40 bg-[var(--status-down-bg)]/20 p-3.5 flex items-center gap-2.5 text-xs text-[var(--status-down)]">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{webhookError}</span>
              </div>
            )}

            {webhooksLoading ? (
              <div className="py-12 flex justify-center text-[var(--text-muted)]">
                <RefreshCw className="h-5 w-5 animate-spin text-[var(--primary)]" />
              </div>
            ) : webhooks.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-16 text-center space-y-2 max-w-sm mx-auto">
                  <div className="text-sm font-semibold text-[var(--text-primary)]">
                    No Webhook Endpoints Configured
                  </div>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    Register an endpoint to stream signed incident payloads to PagerDuty, Slack, or internal event receivers.
                  </p>
                  <div className="pt-2">
                    <Button
                      size="sm"
                      onClick={() => setShowCreateWebhook(true)}
                      className="font-mono text-xs gap-1.5"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Register Webhook</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]">
                {webhooks.map((wh) => (
                  <div key={wh.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-[var(--text-primary)]">
                          {wh.name}
                        </span>
                        <StatusIndicator
                          status={wh.isEnabled ? 'healthy' : 'disabled'}
                          variant="compact"
                          label={wh.isEnabled ? 'Active' : 'Disabled'}
                        />
                      </div>

                      {wh.description && (
                        <p className="text-xs text-[var(--text-secondary)] line-clamp-1">
                          {wh.description}
                        </p>
                      )}

                      <div className="text-[11px] font-mono text-[var(--text-muted)] truncate flex items-center gap-1.5 select-all">
                        <ExternalLink className="h-3 w-3 shrink-0 text-[var(--text-dim)]" />
                        <span>{wh.url}</span>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap pt-1">
                        <span className="text-[10px] font-mono text-[var(--text-dim)]">Events:</span>
                        {wh.events.map((ev) => (
                          <span
                            key={ev}
                            className="font-mono text-[10px] px-1.5 py-0.2 rounded-[2px] bg-[var(--surface-subtle)] text-[var(--primary)] border border-[var(--border-subtle)]"
                          >
                            {ev}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-[var(--border-subtle)]">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEditWebhook(wh)}
                        className="h-7 text-xs font-mono"
                      >
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setDeletingWebhookId(wh.id)}
                        className="h-7 text-xs font-mono text-[var(--status-down)] border-[var(--status-down)]/30 hover:bg-[var(--status-down-bg)]/20"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: DELIVERIES */}
        {activeTab === 'deliveries' && (
          <DeliveriesTab webhooks={webhooks} />
        )}

        {/* TAB 3: NOTIFICATIONS */}
        {activeTab === 'notifications' && (
          <NotificationsTab />
        )}

        {/* TAB 4: API KEYS */}
        {activeTab === 'apikeys' && (
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold font-mono text-[var(--text-primary)]">
                  Personal API Keys
                </h2>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Authenticate programmatic REST API calls using header <code className="font-mono text-[var(--primary)]">x-api-key: dp_live_...</code>.
                </p>
              </div>
              <Button
                size="sm"
                onClick={() => setShowCreateKey(true)}
                className="gap-1.5 font-mono text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Create API Key</span>
              </Button>
            </div>

            {keyError && (
              <div className="rounded-[4px] border border-[var(--status-down)]/40 bg-[var(--status-down-bg)]/20 p-3.5 flex items-center gap-2.5 text-xs text-[var(--status-down)]">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{keyError}</span>
              </div>
            )}

            {keysLoading ? (
              <div className="py-12 flex justify-center text-[var(--text-muted)]">
                <RefreshCw className="h-5 w-5 animate-spin text-[var(--primary)]" />
              </div>
            ) : apiKeys.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-16 text-center space-y-2 max-w-sm mx-auto">
                  <div className="text-sm font-semibold text-[var(--text-primary)]">
                    No API Keys Generated
                  </div>
                  <p className="text-xs text-[var(--text-muted)] leading-relaxed">
                    Generate an API token with scoped permissions for CI/CD automation, custom monitoring scripts, or external integrations.
                  </p>
                  <div className="pt-2">
                    <Button
                      size="sm"
                      onClick={() => setShowCreateKey(true)}
                      className="font-mono text-xs gap-1.5"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>Create API Key</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="rounded-[6px] border border-[var(--border)] bg-[var(--surface)] divide-y divide-[var(--border)]">
                {apiKeys.map((key) => (
                  <div
                    key={key.id}
                    className={`p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                      key.isRevoked ? 'opacity-60 bg-[var(--surface-subtle)]' : ''
                    }`}
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-[var(--text-primary)]">
                          {key.name}
                        </span>
                        <StatusIndicator
                          status={key.isRevoked ? 'disabled' : 'healthy'}
                          variant="compact"
                          label={key.isRevoked ? 'Revoked' : 'Active'}
                        />
                      </div>

                      <div className="text-[11px] font-mono text-[var(--text-muted)]">
                        Prefix: <span className="text-[var(--text-primary)] font-semibold">{key.keyPrefix}</span>
                      </div>

                      <div className="flex items-center gap-2 flex-wrap pt-1">
                        <span className="text-[10px] font-mono text-[var(--text-dim)]">Scopes:</span>
                        {key.scopes.map((s) => (
                          <span
                            key={s}
                            className="font-mono text-[10px] px-1.5 py-0.2 rounded-[2px] bg-[var(--surface-subtle)] text-[var(--text-secondary)] border border-[var(--border-subtle)]"
                          >
                            {s}
                          </span>
                        ))}
                      </div>

                      <div className="flex items-center gap-4 text-[10px] font-mono text-[var(--text-dim)] pt-0.5">
                        <span>Created: {new Date(key.createdAt).toLocaleDateString()}</span>
                        <span>
                          Last used:{' '}
                          {key.lastUsedAt
                            ? new Date(key.lastUsedAt).toLocaleDateString()
                            : 'Never'}
                        </span>
                      </div>
                    </div>

                    {!key.isRevoked && (
                      <div className="shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-[var(--border-subtle)]">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setRevokingKeyId(key.id)}
                          className="h-7 text-xs font-mono text-[var(--status-down)] border-[var(--status-down)]/30 hover:bg-[var(--status-down-bg)]/20"
                        >
                          Revoke Key
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* MODAL 1: REGISTER WEBHOOK */}
      {showCreateWebhook && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-[var(--surface)] border border-[var(--border)] rounded-[6px] shadow-2xl p-5 space-y-4 font-sans">
            <div>
              <h3 className="text-sm font-semibold font-mono text-[var(--text-primary)]">
                Register Webhook Endpoint
              </h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Configure destination HTTPS URL and event subscriptions.
              </p>
            </div>

            {createWebhookError && (
              <div className="rounded-[4px] border border-[var(--status-down)]/40 bg-[var(--status-down-bg)]/20 p-3 text-xs text-[var(--status-down)] flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{createWebhookError}</span>
              </div>
            )}

            <form onSubmit={handleCreateWebhook} className="space-y-3.5">
              <div className="space-y-1">
                <Label htmlFor="wh-name">Endpoint Name *</Label>
                <Input
                  id="wh-name"
                  placeholder="e.g. Production PagerDuty Bridge"
                  value={newWebhookName}
                  onChange={(e) => setNewWebhookName(e.target.value)}
                  maxLength={100}
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="wh-url">Destination URL *</Label>
                <Input
                  id="wh-url"
                  placeholder="https://hooks.example.com/devpulse"
                  value={newWebhookUrl}
                  onChange={(e) => setNewWebhookUrl(e.target.value)}
                  required
                />
                <p className="text-[10px] font-mono text-[var(--text-dim)]">
                  Must be HTTP/HTTPS. Private IP ranges (RFC1918) and cloud metadata addresses are blocked.
                </p>
              </div>

              <div className="space-y-1">
                <Label htmlFor="wh-desc">Description (Optional)</Label>
                <Input
                  id="wh-desc"
                  placeholder="Context about this receiver"
                  value={newWebhookDescription}
                  onChange={(e) => setNewWebhookDescription(e.target.value)}
                  maxLength={255}
                />
              </div>

              <div className="space-y-1.5 pt-1">
                <Label>Event Subscriptions</Label>
                <div className="space-y-1.5">
                  {WEBHOOK_EVENT_TYPES.map((ev) => {
                    const isChecked = newWebhookEvents.includes(ev);
                    return (
                      <label
                        key={ev}
                        className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewWebhookEvents([...newWebhookEvents, ev]);
                            } else {
                              setNewWebhookEvents(newWebhookEvents.filter((item) => item !== ev));
                            }
                          }}
                          className="rounded-[2px] border-[var(--border)] bg-[var(--surface-active)] text-[var(--primary)] focus:ring-[var(--border-focus)] h-4 w-4"
                        />
                        <span className="font-mono text-xs text-[var(--text-primary)]">{ev}</span>
                        <span className="text-[11px] text-[var(--text-muted)]">
                          {ev === 'incident.created' ? '— Triggered on 3 consecutive check failures' : '— Triggered when service recovers'}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)] font-mono text-xs">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCreateWebhook(false)}
                  disabled={creatingWebhook}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={creatingWebhook}
                >
                  {creatingWebhook ? 'Registering...' : 'Register Endpoint'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: REVEAL WEBHOOK SIGNING SECRET (SHOWN ONCE) */}
      {revealedSecret && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-[var(--surface)] border border-[var(--status-healthy)]/40 rounded-[6px] shadow-2xl p-5 space-y-4 font-sans">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-[4px] bg-[var(--status-healthy-bg)]/30 text-[var(--status-healthy)] shrink-0">
                <ShieldAlert className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold font-mono text-[var(--text-primary)]">
                  Save Webhook Signing Secret Immediately
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Endpoint <strong className="text-[var(--text-primary)]">{revealedSecret.name}</strong> was created. This secret is shown only once and cannot be retrieved again!
                </p>
              </div>
            </div>

            <div className="space-y-1 bg-[var(--background)] border border-[var(--border)] rounded-[4px] p-3 font-mono">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase text-[var(--text-dim)]">HMAC-SHA256 Signing Secret</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(revealedSecret.secret);
                    setCopiedSecret(true);
                    setTimeout(() => setCopiedSecret(false), 2000);
                  }}
                  className="flex items-center gap-1 text-[11px] text-[var(--primary)] hover:underline"
                >
                  {copiedSecret ? <Check className="h-3 w-3 text-[var(--status-healthy)]" /> : <Copy className="h-3 w-3" />}
                  <span>{copiedSecret ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <div className="text-xs text-[var(--status-healthy)] break-all select-all pt-1 font-bold">
                {revealedSecret.secret}
              </div>
            </div>

            <div className="rounded-[4px] bg-[var(--surface-subtle)] border border-[var(--border-subtle)] p-2.5 text-[11px] text-[var(--text-secondary)] flex items-start gap-2 leading-relaxed">
              <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--status-warning)] mt-0.5" />
              <span>
                DevPulse signs all outgoing webhook payloads with this secret via HTTP header <code className="font-mono text-[var(--text-primary)]">x-devpulse-signature: t=timestamp,v1=signature</code>.
              </span>
            </div>

            <div className="flex justify-end pt-1">
              <Button
                size="sm"
                onClick={() => setRevealedSecret(null)}
                className="font-mono text-xs"
              >
                I Have Saved This Secret
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: EDIT WEBHOOK */}
      {editingWebhook && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-[var(--surface)] border border-[var(--border)] rounded-[6px] shadow-2xl p-5 space-y-4 font-sans">
            <div>
              <h3 className="text-sm font-semibold font-mono text-[var(--text-primary)]">
                Edit Webhook Endpoint
              </h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Update destination URL, description, or event subscriptions.
              </p>
            </div>

            <form onSubmit={handleUpdateWebhook} className="space-y-3.5">
              <div className="space-y-1">
                <Label htmlFor="edit-name">Endpoint Name *</Label>
                <Input
                  id="edit-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  maxLength={100}
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="edit-url">Destination URL *</Label>
                <Input
                  id="edit-url"
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="edit-desc">Description (Optional)</Label>
                <Input
                  id="edit-desc"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  maxLength={255}
                />
              </div>

              <div className="space-y-1.5 pt-1">
                <Label>Event Subscriptions</Label>
                <div className="space-y-1.5">
                  {WEBHOOK_EVENT_TYPES.map((ev) => {
                    const isChecked = editEvents.includes(ev);
                    return (
                      <label key={ev} className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setEditEvents([...editEvents, ev]);
                            } else {
                              setEditEvents(editEvents.filter((item) => item !== ev));
                            }
                          }}
                          className="rounded-[2px] border-[var(--border)] bg-[var(--surface-active)] text-[var(--primary)] focus:ring-[var(--border-focus)] h-4 w-4"
                        />
                        <span className="font-mono text-xs text-[var(--text-primary)]">{ev}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="pt-1">
                <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editEnabled}
                    onChange={(e) => setEditEnabled(e.target.checked)}
                    className="rounded-[2px] border-[var(--border)] bg-[var(--surface-active)] text-[var(--primary)] focus:ring-[var(--border-focus)] h-4 w-4"
                  />
                  <span>Endpoint is active (receive events)</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)] font-mono text-xs">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setEditingWebhook(null)}
                  disabled={updatingWebhook}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={updatingWebhook}
                >
                  {updatingWebhook ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: CREATE API KEY */}
      {showCreateKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-[var(--surface)] border border-[var(--border)] rounded-[6px] shadow-2xl p-5 space-y-4 font-sans">
            <div>
              <h3 className="text-sm font-semibold font-mono text-[var(--text-primary)]">
                Create Programmatic API Key
              </h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Select least-privilege scopes for automated scripts and integrations.
              </p>
            </div>

            {createKeyError && (
              <div className="rounded-[4px] border border-[var(--status-down)]/40 bg-[var(--status-down-bg)]/20 p-3 text-xs text-[var(--status-down)] flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{createKeyError}</span>
              </div>
            )}

            <form onSubmit={handleCreateKey} className="space-y-3.5">
              <div className="space-y-1">
                <Label htmlFor="key-name">API Key Friendly Name *</Label>
                <Input
                  id="key-name"
                  placeholder="e.g. CI Health Probe"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5 pt-1">
                <Label>Allowed Scopes</Label>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {API_KEY_SCOPES.map((sc) => {
                    const isChecked = newKeyScopes.includes(sc);
                    return (
                      <label
                        key={sc}
                        className="flex items-start gap-2.5 text-xs text-[var(--text-secondary)] cursor-pointer p-1.5 rounded-[4px] hover:bg-[var(--surface-subtle)] transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewKeyScopes([...newKeyScopes, sc]);
                            } else {
                              setNewKeyScopes(newKeyScopes.filter((item) => item !== sc));
                            }
                          }}
                          className="mt-0.5 rounded-[2px] border-[var(--border)] bg-[var(--surface-active)] text-[var(--primary)] focus:ring-[var(--border-focus)] h-4 w-4 shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <span className="font-mono text-xs text-[var(--text-primary)] font-semibold">
                            {sc}
                          </span>
                          <p className="text-[11px] text-[var(--text-muted)] leading-tight">
                            {API_KEY_SCOPE_DESCRIPTIONS[sc]}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)] font-mono text-xs">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCreateKey(false)}
                  disabled={creatingKey}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={creatingKey}
                >
                  {creatingKey ? 'Generating...' : 'Generate API Key'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 5: REVEAL RAW API KEY (SHOWN ONCE) */}
      {revealedKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-[var(--surface)] border border-[var(--primary)]/40 rounded-[6px] shadow-2xl p-5 space-y-4 font-sans">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-[4px] bg-[var(--primary)]/20 text-[var(--primary)] shrink-0">
                <Key className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold font-mono text-[var(--text-primary)]">
                  Save Your API Key Immediately
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  API Key <strong className="text-[var(--text-primary)]">{revealedKey.name}</strong> was created. This token is shown only once and cannot be retrieved again!
                </p>
              </div>
            </div>

            <div className="space-y-1 bg-[var(--background)] border border-[var(--border)] rounded-[4px] p-3 font-mono">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase text-[var(--text-dim)]">Raw API Token</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(revealedKey.rawKey);
                    setCopiedKey(true);
                    setTimeout(() => setCopiedKey(false), 2000);
                  }}
                  className="flex items-center gap-1 text-[11px] text-[var(--primary)] hover:underline"
                >
                  {copiedKey ? <Check className="h-3 w-3 text-[var(--status-healthy)]" /> : <Copy className="h-3 w-3" />}
                  <span>{copiedKey ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <div className="text-xs text-[var(--primary)] break-all select-all pt-1 font-bold">
                {revealedKey.rawKey}
              </div>
            </div>

            <div className="rounded-[4px] bg-[var(--surface-subtle)] border border-[var(--border-subtle)] p-2.5 text-[11px] font-mono text-[var(--text-secondary)] space-y-1">
              <div className="text-[var(--text-dim)] uppercase text-[10px]">Usage Example:</div>
              <div className="text-[var(--text-muted)] break-all">
                curl -H &quot;x-api-key: {revealedKey.rawKey.slice(0, 16)}...&quot; http://localhost:4000/monitors
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <Button
                size="sm"
                onClick={() => setRevealedKey(null)}
                className="font-mono text-xs"
              >
                I Have Copied My Token
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE WEBHOOK DIALOG */}
      <ConfirmDialog
        isOpen={Boolean(deletingWebhookId)}
        title="Delete Webhook Endpoint"
        description="Are you sure you want to permanently delete this webhook endpoint? Outbound event deliveries will immediately cease."
        confirmText="Delete Endpoint"
        isDestructive={true}
        isLoading={isDeletingWebhook}
        onConfirm={handleDeleteWebhook}
        onCancel={() => setDeletingWebhookId(null)}
      />

      {/* CONFIRM REVOKE API KEY DIALOG */}
      <ConfirmDialog
        isOpen={Boolean(revokingKeyId)}
        title="Revoke API Key"
        description="Are you sure you want to revoke this API key? Applications or CI jobs using this token will immediately be rejected."
        confirmText="Revoke Key"
        isDestructive={true}
        isLoading={isRevokingKey}
        onConfirm={handleRevokeKey}
        onCancel={() => setRevokingKeyId(null)}
      />
    </div>
  );
}
