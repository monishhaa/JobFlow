export interface User {
  id: string;
  email: string;
  role: 'ADMIN' | 'USER';
}

export interface AuthResponse {
  accessToken: string;
  expiresIn: number;
  user: User;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  traceId?: string;
}

export interface Quotas {
  maxRunning: number;
  maxQueued: number;
  rateLimitPerMin: number;
}

export interface Usage {
  running: number;
  maxRunning: number;
  queued: number;
  maxQueued: number;
  requestsThisMinute: number;
  rateLimitPerMin: number;
}

export interface MeResponse {
  id: string;
  email: string;
  role: 'ADMIN' | 'USER';
  webhookSecret: string;
  quotas: Quotas;
  usage: Usage;
}

export interface ApiKey {
  id: string;
  name: string;
  key?: string; // only returned once on creation
  createdAt: string;
  lastUsedAt?: string | null;
}

export interface Endpoint {
  id: string;
  name: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  createdAt?: string;
}

export type JobStatus = 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'DEAD' | 'CANCELLED';

export interface Job {
  id: string;
  type: string;
  payload: Record<string, unknown> | unknown;
  status: JobStatus;
  priority: number; // 0 high, 1 normal, 2 low
  attempts: number;
  maxAttempts: number;
  timeoutSeconds: number;
  nextRunAt?: string | null;
  workerId?: string | null;
  idempotencyKey?: string | null;
  callbackUrl?: string | null;
  lastError?: string | null;
  result?: Record<string, unknown> | unknown;
  createdAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
}

export type ExecutionStatus = 'SUCCEEDED' | 'FAILED' | 'TIMEOUT' | 'LEASE_LOST';

export interface Execution {
  attempt: number;
  workerId?: string | null;
  status: ExecutionStatus;
  error?: string | null;
  startedAt: string;
  finishedAt?: string | null;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  size: number;
}

export interface StatsSummary {
  counts: {
    QUEUED: number;
    RUNNING: number;
    SUCCEEDED: number;
    DEAD: number;
    CANCELLED: number;
  };
  retrying: number;
  succeeded24h: number;
  dead24h: number;
  successRate24h: number;
  avgDurationMs: number;
  usage: Usage;
}

export interface TimeseriesPoint {
  t: string;
  succeeded: number;
  failed: number;
}

export interface Schedule {
  id: string;
  name: string;
  cronExpr: string;
  timezone: string;
  jobType: string;
  payload: Record<string, unknown> | unknown;
  enabled: boolean;
  createdAt?: string;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
}

export interface AdminUser {
  id: string;
  email: string;
  role: 'ADMIN' | 'USER';
  status: 'ACTIVE' | 'DISABLED';
  maxRunning: number;
  maxQueued: number;
  rateLimitPerMin: number;
  createdAt: string;
}

export interface AdminWorker {
  id: string;
  host: string;
  lastHeartbeatAt: string;
  runningCount: number;
  heartbeatAgeSec: number;
}

export interface AdminQueues {
  redisDepth: {
    high: number;
    normal: number;
    low: number;
  };
  jobsByStatus: Record<string, number>;
}

export interface JobEvent {
  jobId: string;
  type: string;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  at: string;
}
