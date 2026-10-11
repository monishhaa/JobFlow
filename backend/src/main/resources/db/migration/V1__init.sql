CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  role VARCHAR(10) NOT NULL DEFAULT 'USER',
  status VARCHAR(10) NOT NULL DEFAULT 'ACTIVE',
  max_running INT NOT NULL DEFAULT 3,
  max_queued INT NOT NULL DEFAULT 1000,
  rate_limit_per_min INT NOT NULL DEFAULT 60,
  webhook_secret VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id),
  type VARCHAR(40) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status VARCHAR(12) NOT NULL,
  priority SMALLINT NOT NULL DEFAULT 1,
  attempts INT NOT NULL DEFAULT 0,
  max_attempts INT NOT NULL DEFAULT 5,
  timeout_seconds INT NOT NULL DEFAULT 60,
  next_run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  worker_id VARCHAR(64),
  lease_expires_at TIMESTAMPTZ,
  idempotency_key VARCHAR(100),
  schedule_id UUID,
  callback_url TEXT,
  last_error TEXT,
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, idempotency_key)
);
CREATE INDEX idx_jobs_owner_created ON jobs (owner_id, created_at DESC);
CREATE INDEX idx_jobs_owner_status ON jobs (owner_id, status);
CREATE INDEX idx_jobs_queued ON jobs (next_run_at) WHERE status = 'QUEUED';
CREATE INDEX idx_jobs_lease ON jobs (lease_expires_at) WHERE status = 'RUNNING';
CREATE INDEX idx_jobs_finished ON jobs (finished_at) WHERE finished_at IS NOT NULL;

CREATE TABLE job_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES users(id),
  attempt INT NOT NULL,
  worker_id VARCHAR(64),
  status VARCHAR(12) NOT NULL,
  error TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);
CREATE INDEX idx_exec_job ON job_executions (job_id, attempt);

CREATE TABLE schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id),
  name VARCHAR(100) NOT NULL,
  cron_expr VARCHAR(100) NOT NULL,
  timezone VARCHAR(50) NOT NULL DEFAULT 'UTC',
  job_type VARCHAR(40) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  enabled BOOLEAN NOT NULL DEFAULT true,
  next_fire_at TIMESTAMPTZ,
  last_fire_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_schedules_due ON schedules (next_fire_at) WHERE enabled;

CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id UUID NOT NULL,
  token_hash VARCHAR(64) UNIQUE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  replaced_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_refresh_user ON refresh_tokens (user_id);
CREATE INDEX idx_refresh_family ON refresh_tokens (family_id);

CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  key_prefix VARCHAR(16) NOT NULL,
  key_hash VARCHAR(64) UNIQUE NOT NULL,
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workers (
  id VARCHAR(64) PRIMARY KEY,
  host VARCHAR(100),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  running_count INT NOT NULL DEFAULT 0,
  version VARCHAR(20)
);

CREATE TABLE audit_log (
  id BIGSERIAL PRIMARY KEY,
  actor_id UUID,
  action VARCHAR(60) NOT NULL,
  target_type VARCHAR(30),
  target_id VARCHAR(64),
  ip VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- idempotency record for the simulated email handler (at-least-once => handlers must be idempotent)
CREATE TABLE email_outbox (
  job_id UUID PRIMARY KEY,
  recipient VARCHAR(255) NOT NULL,
  subject VARCHAR(255),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
