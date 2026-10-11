CREATE TABLE endpoints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(40) NOT NULL,
  url TEXT NOT NULL,
  method VARCHAR(8) NOT NULL DEFAULT 'POST',
  headers TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, name)
);

ALTER TABLE endpoints ENABLE ROW LEVEL SECURITY;

CREATE POLICY endpoints_isolation ON endpoints
  USING (owner_id = nullif(current_setting('app.user_id', true), '')::uuid OR current_setting('app.is_admin', true) = 'true')
  WITH CHECK (owner_id = nullif(current_setting('app.user_id', true), '')::uuid OR current_setting('app.is_admin', true) = 'true');

GRANT SELECT, INSERT, UPDATE, DELETE ON endpoints TO jobflow_app;
