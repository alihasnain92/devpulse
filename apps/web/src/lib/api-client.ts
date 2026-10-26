import {
  AuthResponseDto,
  CheckResultDto,
  CreateMonitorRequestDto,
  DashboardSummaryDto,
  ImmediateCheckResponse,
  IncidentDto,
  LoginRequestDto,
  MessageResponseDto,
  MonitorDto,
  MonitorStatsDto,
  RegisterRequestDto,
  SECURITY_CONFIG,
  StatsWindow,
  UpdateMonitorRequestDto,
  UserDto,
} from '@devpulse/shared';

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {},
  isRetry = false,
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const method = (options.method || 'GET').toUpperCase();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  // State-changing requests must include the custom CSRF header
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    headers[SECURITY_CONFIG.CSRF_HEADER_NAME] =
      SECURITY_CONFIG.CSRF_HEADER_VALUE;
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include', // Always send and receive HTTP-only cookies
  });

  // Attempt automatic token refresh once on 401 Unauthorized for non-auth endpoints
  if (
    response.status === 401 &&
    !isRetry &&
    !endpoint.startsWith('/auth/login') &&
    !endpoint.startsWith('/auth/register') &&
    !endpoint.startsWith('/auth/refresh')
  ) {
    try {
      const refreshed = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [SECURITY_CONFIG.CSRF_HEADER_NAME]: SECURITY_CONFIG.CSRF_HEADER_VALUE,
        },
        credentials: 'include',
      });

      if (refreshed.ok) {
        return request<T>(endpoint, options, true);
      }
    } catch {
      // Refresh failed, proceed to throw original 401 error
    }
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (!response.ok) {
    const errorData = data as { message?: string | string[] } | null;
    const errorMessage = Array.isArray(errorData?.message)
      ? errorData.message.join(', ')
      : errorData?.message || `Request failed with status ${response.status}`;

    throw new ApiClientError(errorMessage, response.status, data);
  }

  return data as T;
}

export const apiClient = {
  async register(dto: RegisterRequestDto): Promise<AuthResponseDto> {
    return request<AuthResponseDto>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  async login(dto: LoginRequestDto): Promise<AuthResponseDto> {
    return request<AuthResponseDto>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  async refresh(): Promise<AuthResponseDto> {
    return request<AuthResponseDto>('/auth/refresh', {
      method: 'POST',
    });
  },

  async logout(): Promise<MessageResponseDto> {
    return request<MessageResponseDto>('/auth/logout', {
      method: 'POST',
    });
  },

  async getMe(): Promise<UserDto> {
    return request<UserDto>('/users/me');
  },

  async getMonitors(): Promise<MonitorDto[]> {
    return request<MonitorDto[]>('/monitors');
  },

  async getMonitor(id: string): Promise<MonitorDto> {
    return request<MonitorDto>(`/monitors/${id}`);
  },

  async createMonitor(dto: CreateMonitorRequestDto): Promise<MonitorDto> {
    return request<MonitorDto>('/monitors', {
      method: 'POST',
      body: JSON.stringify(dto),
    });
  },

  async updateMonitor(
    id: string,
    dto: UpdateMonitorRequestDto,
  ): Promise<MonitorDto> {
    return request<MonitorDto>(`/monitors/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(dto),
    });
  },

  async deleteMonitor(id: string): Promise<MessageResponseDto> {
    return request<MessageResponseDto>(`/monitors/${id}`, {
      method: 'DELETE',
    });
  },

  async triggerCheck(id: string): Promise<ImmediateCheckResponse> {
    return request<ImmediateCheckResponse>(`/monitors/${id}/check`, {
      method: 'POST',
    });
  },

  async getLatestCheck(id: string): Promise<CheckResultDto | null> {
    return request<CheckResultDto | null>(`/monitors/${id}/checks/latest`);
  },

  async getChecks(id: string, limit?: number): Promise<CheckResultDto[]> {
    const query = limit ? `?limit=${limit}` : '';
    return request<CheckResultDto[]>(`/monitors/${id}/checks${query}`);
  },

  async getIncidents(params?: {
    status?: 'active' | 'resolved' | 'all';
    limit?: number;
    offset?: number;
  }): Promise<IncidentDto[]> {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));
    const qs = query.toString();
    return request<IncidentDto[]>(`/incidents${qs ? `?${qs}` : ''}`);
  },

  async getMonitorIncidents(
    monitorId: string,
    params?: {
      status?: 'active' | 'resolved' | 'all';
      limit?: number;
      offset?: number;
    },
  ): Promise<IncidentDto[]> {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));
    const qs = query.toString();
    return request<IncidentDto[]>(
      `/monitors/${monitorId}/incidents${qs ? `?${qs}` : ''}`,
    );
  },

  async getIncident(id: string): Promise<IncidentDto> {
    return request<IncidentDto>(`/incidents/${id}`);
  },

  async getMonitorStats(
    id: string,
    window: StatsWindow = '24h',
  ): Promise<MonitorStatsDto> {
    return request<MonitorStatsDto>(`/monitors/${id}/stats?window=${window}`);
  },

  async getDashboardSummary(): Promise<DashboardSummaryDto> {
    return request<DashboardSummaryDto>('/monitors/dashboard/summary');
  },
};
