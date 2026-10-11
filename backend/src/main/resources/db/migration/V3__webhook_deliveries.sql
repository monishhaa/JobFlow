CREATE TABLE webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL,
  owner_id UUID NOT NULL,
  url TEXT NOT NULL,
  body TEXT NOT NULL,
  status VARCHAR(10) NOT NULL DEFAULT 'PENDING',
  attempts INT NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_webhook_deliveries_pending ON webhook_deliveries (next_attempt_at) WHERE status = 'PENDING';

GRANT SELECT, INSERT, UPDATE, DELETE ON webhook_deliveries TO jobflow_app;
