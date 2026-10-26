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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  AlertCircle,
  AlertTriangle,
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

export default function SettingsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = React.useState<
    'webhooks' | 'deliveries' | 'apikeys'
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
      setCreateWebhookError('Please fill in all required fields and select at least one event.');
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

      // Show secret modal once
      setRevealedSecret({
        name: res.endpoint.name,
        secret: res.signingSecret,
      });

      await loadWebhooks();
    } catch (err) {
      setCreateWebhookError(
        err instanceof ApiClientError ? err.message : 'Failed to register webhook endpoint',
      );
    } finally {
      setCreatingWebhook(false);
    }
  }

  function openEditWebhook(wh: WebhookEndpointDto) {
    setEditingWebhook(wh);
    setEditName(wh.name);
    setEditUrl(wh.url);
    setEditDescription(wh.description || '');
    setEditEvents([...wh.events]);
    setEditEnabled(wh.isEnabled);
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
      setCreateKeyError('Please provide a name and select at least one scope.');
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
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400">
        <RefreshCw className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Settings & Developer Integrations
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Configure automated webhook notifications and programmatic REST API access tokens.
            </p>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex border-b border-slate-800 gap-2">
          <button
            onClick={() => setActiveTab('webhooks')}
            className={`flex items-center gap-2 pb-3 px-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'webhooks'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Webhook className="h-4 w-4" />
            <span>Webhooks</span>
            <Badge variant="secondary" className="ml-1 text-xs">
              {webhooks.length}
            </Badge>
          </button>

          <button
            onClick={() => setActiveTab('deliveries')}
            className={`flex items-center gap-2 pb-3 px-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'deliveries'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="h-4 w-4" />
            <span>Deliveries</span>
          </button>

          <button
            onClick={() => setActiveTab('apikeys')}
            className={`flex items-center gap-2 pb-3 px-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'apikeys'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Key className="h-4 w-4" />
            <span>API Keys</span>
            <Badge variant="secondary" className="ml-1 text-xs">
              {apiKeys.length}
            </Badge>
          </button>
        </div>

        {/* TAB 1: WEBHOOKS */}
        {activeTab === 'webhooks' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Webhook Endpoints</h2>
                <p className="text-xs text-slate-400">
                  Receive cryptographically signed HTTP POST payloads when incidents occur or resolve.
                </p>
              </div>
              <Button
                onClick={() => setShowCreateWebhook(true)}
                className="gap-2 bg-blue-600 hover:bg-blue-500 text-white"
              >
                <Plus className="h-4 w-4" />
                <span>Register Endpoint</span>
              </Button>
            </div>

            {webhookError && (
              <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4 flex items-center gap-3 text-red-300 text-sm">
                <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
                <span>{webhookError}</span>
              </div>
            )}

            {webhooksLoading ? (
              <div className="py-12 flex justify-center text-slate-500">
                <RefreshCw className="h-6 w-6 animate-spin" />
              </div>
            ) : webhooks.length === 0 ? (
              <Card className="border-slate-800 bg-slate-900/50 text-center py-12">
                <CardContent className="space-y-3">
                  <div className="mx-auto w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
                    <Webhook className="h-6 w-6" />
                  </div>
                  <h3 className="text-base font-semibold text-white">No Webhook Endpoints</h3>
                  <p className="text-sm text-slate-400 max-w-sm mx-auto">
                    Register your first endpoint to deliver real-time incident event payloads to PagerDuty, Slack, or your internal API.
                  </p>
                  <Button
                    onClick={() => setShowCreateWebhook(true)}
                    variant="outline"
                    className="border-slate-700 text-slate-200 hover:bg-slate-800"
                  >
                    Register Webhook
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {webhooks.map((wh) => (
                  <Card key={wh.id} className="border-slate-800 bg-slate-900/60 shadow-xs">
                    <CardHeader className="pb-3 flex flex-row items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-3">
                          <CardTitle className="text-base text-white font-semibold">
                            {wh.name}
                          </CardTitle>
                          <Badge
                            variant={wh.isEnabled ? 'default' : 'secondary'}
                            className={`text-xs ${
                              wh.isEnabled
                                ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/30'
                                : 'bg-slate-800 text-slate-400 border border-slate-700'
                            }`}
                          >
                            {wh.isEnabled ? 'Active' : 'Disabled'}
                          </Badge>
                        </div>
                        {wh.description && (
                          <p className="text-xs text-slate-400 pt-0.5 line-clamp-2">
                            {wh.description}
                          </p>
                        )}
                        <div className="text-xs font-mono text-slate-400 break-all flex items-center gap-1.5 pt-0.5">
                          <ExternalLink className="h-3 w-3 shrink-0 text-slate-500" />
                          <span>{wh.url}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditWebhook(wh)}
                          className="text-xs text-slate-400 hover:text-white"
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeletingWebhookId(wh.id)}
                          className="text-xs text-red-400 hover:text-red-300 hover:bg-red-950/30"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardHeader>

                    <CardContent className="pt-0 border-t border-slate-800/60 mt-2 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-slate-500">Events:</span>
                        {wh.events.map((ev) => (
                          <Badge
                            key={ev}
                            variant="outline"
                            className="bg-slate-800/80 text-blue-300 border-blue-500/20 text-xs"
                          >
                            {ev}
                          </Badge>
                        ))}
                      </div>

                      <div>
                        Registered on {new Date(wh.createdAt).toLocaleDateString()}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: DELIVERIES */}
        {activeTab === 'deliveries' && (
          <DeliveriesTab webhooks={webhooks} />
        )}

        {/* TAB 3: API KEYS */}
        {activeTab === 'apikeys' && (
          <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">Personal API Keys</h2>
                <p className="text-xs text-slate-400">
                  Authenticate programmatic REST API calls using HTTP header <code className="text-blue-400">x-api-key: dp_live_...</code>.
                </p>
              </div>
              <Button
                onClick={() => setShowCreateKey(true)}
                className="gap-2 bg-blue-600 hover:bg-blue-500 text-white"
              >
                <Plus className="h-4 w-4" />
                <span>Create API Key</span>
              </Button>
            </div>

            {keyError && (
              <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4 flex items-center gap-3 text-red-300 text-sm">
                <AlertCircle className="h-5 w-5 shrink-0 text-red-400" />
                <span>{keyError}</span>
              </div>
            )}

            {keysLoading ? (
              <div className="py-12 flex justify-center text-slate-500">
                <RefreshCw className="h-6 w-6 animate-spin" />
              </div>
            ) : apiKeys.length === 0 ? (
              <Card className="border-slate-800 bg-slate-900/50 text-center py-12">
                <CardContent className="space-y-3">
                  <div className="mx-auto w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
                    <Key className="h-6 w-6" />
                  </div>
                  <h3 className="text-base font-semibold text-white">No API Keys Generated</h3>
                  <p className="text-sm text-slate-400 max-w-sm mx-auto">
                    Generate an API token with scoped permissions for CI/CD automation, custom scripts, or external integrations.
                  </p>
                  <Button
                    onClick={() => setShowCreateKey(true)}
                    variant="outline"
                    className="border-slate-700 text-slate-200 hover:bg-slate-800"
                  >
                    Create API Key
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4">
                {apiKeys.map((key) => (
                  <Card
                    key={key.id}
                    className={`border-slate-800 bg-slate-900/60 shadow-xs transition-opacity ${
                      key.isRevoked ? 'opacity-60 bg-slate-950/80 border-slate-900' : ''
                    }`}
                  >
                    <CardHeader className="pb-3 flex flex-row items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-3">
                          <CardTitle className="text-base text-white font-semibold">
                            {key.name}
                          </CardTitle>
                          <Badge
                            variant={key.isRevoked ? 'destructive' : 'default'}
                            className={`text-xs ${
                              key.isRevoked
                                ? 'bg-red-950/80 text-red-400 border border-red-500/30'
                                : 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/30'
                            }`}
                          >
                            {key.isRevoked ? 'Revoked' : 'Active'}
                          </Badge>
                        </div>
                        <div className="text-xs font-mono text-slate-400">
                          Prefix: <span className="text-slate-200 font-semibold">{key.keyPrefix}</span>
                        </div>
                      </div>

                      {!key.isRevoked && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setRevokingKeyId(key.id)}
                          className="text-xs border-red-500/30 text-red-400 hover:bg-red-950/30"
                        >
                          Revoke Key
                        </Button>
                      )}
                    </CardHeader>

                    <CardContent className="pt-0 border-t border-slate-800/60 mt-2 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-slate-500">Scopes:</span>
                        {key.scopes.map((s) => (
                          <Badge
                            key={s}
                            variant="outline"
                            className="bg-slate-800/80 text-indigo-300 border-indigo-500/20 text-xs"
                          >
                            {s}
                          </Badge>
                        ))}
                      </div>

                      <div className="flex items-center gap-4 text-slate-400">
                        <span>Created: {new Date(key.createdAt).toLocaleDateString()}</span>
                        <span>
                          Last used:{' '}
                          {key.lastUsedAt
                            ? new Date(key.lastUsedAt).toLocaleDateString()
                            : 'Never'}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* MODAL 1: REGISTER WEBHOOK */}
      {showCreateWebhook && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-6 space-y-5">
            <div>
              <h3 className="text-lg font-semibold text-white">Register Webhook Endpoint</h3>
              <p className="text-xs text-slate-400 mt-1">
                Enter your destination HTTPS endpoint and select the events to subscribe to.
              </p>
            </div>

            {createWebhookError && (
              <div className="rounded-lg border border-red-500/30 bg-red-950/30 p-3 text-xs text-red-300 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                <span>{createWebhookError}</span>
              </div>
            )}

            <form onSubmit={handleCreateWebhook} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="wh-name">Endpoint Name *</Label>
                <Input
                  id="wh-name"
                  placeholder="Production Incident Receiver"
                  value={newWebhookName}
                  onChange={(e) => setNewWebhookName(e.target.value)}
                  maxLength={100}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="wh-url">Destination URL *</Label>
                <Input
                  id="wh-url"
                  placeholder="https://hooks.example.com/devpulse"
                  value={newWebhookUrl}
                  onChange={(e) => setNewWebhookUrl(e.target.value)}
                  required
                />
                <p className="text-[11px] text-slate-500">
                  Must be an HTTP(S) endpoint. Loopback, private IP ranges (RFC1918), and cloud metadata addresses are prohibited.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="wh-desc">Description (Optional)</Label>
                <Input
                  id="wh-desc"
                  placeholder="Receives outage events for our internal operations service."
                  value={newWebhookDescription}
                  onChange={(e) => setNewWebhookDescription(e.target.value)}
                  maxLength={255}
                />
              </div>

              <div className="space-y-2 pt-1">
                <Label>Event Subscriptions</Label>
                <div className="space-y-2">
                  {WEBHOOK_EVENT_TYPES.map((ev) => {
                    const isChecked = newWebhookEvents.includes(ev);
                    return (
                      <label
                        key={ev}
                        className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer"
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
                          className="rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-blue-500 h-4 w-4"
                        />
                        <span className="font-mono font-medium text-slate-200">{ev}</span>
                        <span className="text-slate-500">
                          {ev === 'incident.created' ? '— Triggered on 3 consecutive check failures' : '— Triggered when service recovers'}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateWebhook(false)}
                  disabled={creatingWebhook}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={creatingWebhook}
                  className="bg-blue-600 hover:bg-blue-500 text-white"
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
          <div className="w-full max-w-lg bg-slate-900 border border-emerald-500/30 rounded-xl shadow-2xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-emerald-950/60 border border-emerald-500/30 text-emerald-400">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Save Your Webhook Signing Secret</h3>
                <p className="text-xs text-slate-400 mt-1">
                  Endpoint <strong className="text-slate-200">{revealedSecret.name}</strong> was created. Copy this secret now — you will not be able to see it again!
                </p>
              </div>
            </div>

            <div className="space-y-1.5 bg-slate-950 border border-slate-800 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">HMAC-SHA256 Secret</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(revealedSecret.secret);
                    setCopiedSecret(true);
                    setTimeout(() => setCopiedSecret(false), 2000);
                  }}
                  className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                >
                  {copiedSecret ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedSecret ? 'Copied!' : 'Copy'}</span>
                </button>
              </div>
              <div className="font-mono text-xs text-emerald-400 break-all select-all pt-1">
                {revealedSecret.secret}
              </div>
            </div>

            <div className="rounded-lg bg-amber-950/30 border border-amber-500/30 p-3 text-xs text-amber-300 flex items-start gap-2 leading-relaxed">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
              <span>
                DevPulse will sign all outgoing events with this secret using header <code className="text-white font-mono">x-devpulse-signature: t=timestamp,v1=signature</code>.
              </span>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                onClick={() => setRevealedSecret(null)}
                className="bg-blue-600 hover:bg-blue-500 text-white"
              >
                I have saved this secret
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: EDIT WEBHOOK */}
      {editingWebhook && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-6 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-white">Edit Webhook Endpoint</h3>
              <p className="text-xs text-slate-400 mt-1">
                Update destination URL, event subscriptions, or toggle status.
              </p>
            </div>

            <form onSubmit={handleUpdateWebhook} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-name">Endpoint Name *</Label>
                <Input
                  id="edit-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  maxLength={100}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-url">Destination URL *</Label>
                <Input
                  id="edit-url"
                  value={editUrl}
                  onChange={(e) => setEditUrl(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-desc">Description (Optional)</Label>
                <Input
                  id="edit-desc"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  maxLength={255}
                  placeholder="Optional context about this endpoint"
                />
              </div>

              <div className="space-y-2 pt-1">
                <Label>Event Subscriptions</Label>
                <div className="space-y-2">
                  {WEBHOOK_EVENT_TYPES.map((ev) => {
                    const isChecked = editEvents.includes(ev);
                    return (
                      <label key={ev} className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
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
                          className="rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-blue-500 h-4 w-4"
                        />
                        <span className="font-mono font-medium text-slate-200">{ev}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editEnabled}
                    onChange={(e) => setEditEnabled(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-blue-500 h-4 w-4"
                  />
                  <span>Endpoint is active (receive events)</span>
                </label>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEditingWebhook(null)}
                  disabled={updatingWebhook}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={updatingWebhook}
                  className="bg-blue-600 hover:bg-blue-500 text-white"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-6 space-y-5">
            <div>
              <h3 className="text-lg font-semibold text-white">Create Programmatic API Key</h3>
              <p className="text-xs text-slate-400 mt-1">
                Select least-privilege scopes for automated scripts and monitoring agents.
              </p>
            </div>

            {createKeyError && (
              <div className="rounded-lg border border-red-500/30 bg-red-950/30 p-3 text-xs text-red-300 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                <span>{createKeyError}</span>
              </div>
            )}

            <form onSubmit={handleCreateKey} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="key-name">API Key Friendly Name</Label>
                <Input
                  id="key-name"
                  placeholder="e.g. GitHub Actions CI Probe"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2 pt-1">
                <Label>Allowed Scopes</Label>
                <div className="space-y-2">
                  {API_KEY_SCOPES.map((sc) => {
                    const isChecked = newKeyScopes.includes(sc);
                    return (
                      <label key={sc} className="flex items-center gap-2.5 text-xs text-slate-300 cursor-pointer">
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
                          className="rounded border-slate-700 bg-slate-800 text-blue-600 focus:ring-blue-500 h-4 w-4"
                        />
                        <span className="font-mono font-medium text-slate-200">{sc}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowCreateKey(false)}
                  disabled={creatingKey}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={creatingKey}
                  className="bg-blue-600 hover:bg-blue-500 text-white"
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
          <div className="w-full max-w-lg bg-slate-900 border border-indigo-500/30 rounded-xl shadow-2xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-indigo-950/60 border border-indigo-500/30 text-indigo-400">
                <Key className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Save Your API Key</h3>
                <p className="text-xs text-slate-400 mt-1">
                  API Key <strong className="text-slate-200">{revealedKey.name}</strong> was created. Please copy it now as it cannot be shown again!
                </p>
              </div>
            </div>

            <div className="space-y-1.5 bg-slate-950 border border-slate-800 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">Raw API Token</span>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(revealedKey.rawKey);
                    setCopiedKey(true);
                    setTimeout(() => setCopiedKey(false), 2000);
                  }}
                  className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300"
                >
                  {copiedKey ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedKey ? 'Copied!' : 'Copy'}</span>
                </button>
              </div>
              <div className="font-mono text-xs text-indigo-300 break-all select-all pt-1">
                {revealedKey.rawKey}
              </div>
            </div>

            <div className="rounded-lg bg-slate-800/50 border border-slate-700/50 p-3 text-xs text-slate-300 space-y-1">
              <div className="font-semibold text-white">Usage:</div>
              <div className="font-mono text-[11px] text-slate-400">
                curl -H &quot;x-api-key: {revealedKey.rawKey.slice(0, 16)}...&quot; http://localhost:4000/monitors
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                onClick={() => setRevealedKey(null)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white"
              >
                I have copied my key
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
        description="Are you sure you want to revoke this API key? Any applications or automated CI jobs utilizing this key will immediately be rejected."
        confirmText="Revoke Key"
        isDestructive={true}
        isLoading={isRevokingKey}
        onConfirm={handleRevokeKey}
        onCancel={() => setRevokingKeyId(null)}
      />
    </div>
  );
}
