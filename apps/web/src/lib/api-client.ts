import {
  AuthResponseDto,
  LoginRequestDto,
  MessageResponseDto,
  RegisterRequestDto,
  SECURITY_CONFIG,
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
};
