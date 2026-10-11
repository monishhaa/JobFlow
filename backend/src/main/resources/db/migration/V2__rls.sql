-- Application role used by the API profile. It does NOT bypass RLS.
-- The table owner (migration user, also used by workers) is not subject to the policies
-- because we do not FORCE row level security: workers are trusted system processes.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'jobflow_app') THEN
    EXECUTE format('CREATE ROLE jobflow_app LOGIN PASSWORD %L', '${appDbPassword}');
  END IF;
END $$;

GRANT USAGE ON SCHEMA public TO jobflow_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO jobflow_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO jobflow_app;

ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY jobs_isolation ON jobs
  USING (owner_id = nullif(current_setting('app.user_id', true), '')::uuid OR current_setting('app.is_admin', true) = 'true')
  WITH CHECK (owner_id = nullif(current_setting('app.user_id', true), '')::uuid OR current_setting('app.is_admin', true) = 'true');
CREATE POLICY executions_isolation ON job_executions
  USING (owner_id = nullif(current_setting('app.user_id', true), '')::uuid OR current_setting('app.is_admin', true) = 'true')
  WITH CHECK (owner_id = nullif(current_setting('app.user_id', true), '')::uuid OR current_setting('app.is_admin', true) = 'true');
CREATE POLICY schedules_isolation ON schedules
  USING (owner_id = nullif(current_setting('app.user_id', true), '')::uuid OR current_setting('app.is_admin', true) = 'true')
  WITH CHECK (owner_id = nullif(current_setting('app.user_id', true), '')::uuid OR current_setting('app.is_admin', true) = 'true');
