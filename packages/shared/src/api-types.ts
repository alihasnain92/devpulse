import {
  ApiKeyScope,
  HttpMethod,
  WebhookAttemptStatus,
  WebhookEventType,
} from './constants';

export interface HealthResponse {
  status: 'ok';
}

export interface UserDto {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

export interface RegisterRequestDto {
  email: string;
  name: string;
  password: string;
}

export interface LoginRequestDto {
  email: string;
  password: string;
}

export interface AuthResponseDto {
  user: UserDto;
  message: string;
}

export interface MessageResponseDto {
  message: string;
}

export interface MonitorDto {
  id: string;
  userId: string;
  name: string;
  url: string;
  method: HttpMethod;
  intervalSeconds: number;
  timeoutMs: number;
  expectedStatus: number;
  isPaused: boolean;
  isSeeded: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMonitorRequestDto {
  name: string;
  url: string;
  method?: HttpMethod;
  intervalSeconds?: number;
  timeoutMs?: number;
  expectedStatus?: number;
}

export interface UpdateMonitorRequestDto {
  name?: string;
  url?: string;
  method?: HttpMethod;
  intervalSeconds?: number;
  timeoutMs?: number;
  expectedStatus?: number;
  isPaused?: boolean;
}

export interface CheckResultDto {
  id: string;
  monitorId: string;
  statusCode: number | null;
  latencyMs: number;
  isSuccess: boolean;
  errorMessage: string | null;
  isSeeded: boolean;
  jobId?: string | null;
  checkedAt: string;
}

export type IncidentState = 'ongoing' | 'resolved';

export interface IncidentDto {
  id: string;
  monitorId: string;
  monitorName?: string;
  state: IncidentState;
  startedAt: string;
  resolvedAt: string | null;
  durationMs: number;
  durationSeconds: number;
  cause: string;
  isResolved: boolean;
  isSeeded: boolean;
}

export interface ImmediateCheckResponse {
  message: string;
  checkJobId: string;
  statusUrl: string;
}

export type StatsWindow = '24h' | '7d' | '30d';

export interface TimeBucketDto {
  timestamp: string;
  label: string;
  uptimePercent: number | null;
  avgLatencyMs: number | null;
  totalChecks: number;
  successfulChecks: number;
  failedChecks: number;
}

export interface MonitorStatsDto {
  monitorId: string;
  window: StatsWindow;
  from: string;
  to: string;
  uptimePercent: number | null;
  totalChecks: number;
  successfulChecks: number;
  failedChecks: number;
  avgLatencyMs: number | null;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  p99LatencyMs: number | null;
  series: TimeBucketDto[];
  isDemo?: boolean;
}

export interface DashboardSummaryDto {
  totalMonitors: number;
  activeMonitors: number;
  pausedMonitors: number;
  passingEndpoints: number;
  failingEndpoints: number;
  neverCheckedEndpoints: number;
  activeIncidents: number;
  systemUptime24h: number | null;
  isDemo?: boolean;
}

export interface WebhookEndpointDto {
  id: string;
  userId: string;
  name: string;
  url: string;
  description: string | null;
  events: WebhookEventType[];
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWebhookRequestDto {
  name: string;
  url: string;
  description?: string;
  events: WebhookEventType[];
}

export interface UpdateWebhookRequestDto {
  name?: string;
  url?: string;
  description?: string;
  events?: WebhookEventType[];
  isEnabled?: boolean;
}

export interface WebhookCreatedResponseDto {
  endpoint: WebhookEndpointDto;
  signingSecret: string;
}

export interface WebhookEventPayload {
  id: string;
  type: WebhookEventType;
  createdAt: string;
  data: {
    incident: {
      id: string;
      monitorId: string;
      monitorName?: string;
      startedAt: string;
      resolvedAt: string | null;
      cause?: string;
    };
  };
}

export interface WebhookEventDto {
  id: string;
  userId: string;
  type: WebhookEventType;
  sourceType: string;
  sourceId: string;
  dedupeKey: string;
  payload: WebhookEventPayload;
  createdAt: string;
}

export interface WebhookDeliveryDto {
  id: string;
  eventId: string;
  endpointId: string;
  status: string;
  attemptCount: number;
  claimedAt: string | null;
  nextAttemptAt: string | null;
  deliveredAt: string | null;
  lastHttpStatus: number | null;
  lastErrorCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WebhookAttemptDto {
  id: string;
  deliveryId: string;
  attemptNumber: number;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  httpStatus: number | null;
  outcome: WebhookAttemptStatus;
  errorCode: string | null;
  responsePreview: string | null;
  createdAt: string;
}

export interface ApiKeyDto {
  id: string;
  userId: string;
  name: string;
  keyPrefix: string;
  scopes: ApiKeyScope[];
  isRevoked: boolean;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateApiKeyRequestDto {
  name: string;
  scopes: ApiKeyScope[];
}

export interface ApiKeyCreatedResponseDto {
  apiKey: ApiKeyDto;
  rawKey: string;
}
