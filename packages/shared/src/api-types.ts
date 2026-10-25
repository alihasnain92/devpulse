import { HttpMethod } from './constants';

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

export interface CheckResultDto {
  id: string;
  monitorId: string;
  statusCode: number | null;
  latencyMs: number;
  isSuccess: boolean;
  errorMessage: string | null;
  isSeeded: boolean;
  checkedAt: string;
}

export interface IncidentDto {
  id: string;
  monitorId: string;
  startedAt: string;
  resolvedAt: string | null;
  cause: string;
  isResolved: boolean;
  isSeeded: boolean;
}

export interface ImmediateCheckResponse {
  message: string;
  checkJobId: string;
  statusUrl: string;
}
