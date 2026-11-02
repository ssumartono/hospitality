CREATE TABLE mfa_methods(user_id uuid PRIMARY KEY REFERENCES users(id),secret_cipher text,pending_secret_cipher text,pending_created_at timestamptz,enabled_at timestamptz,last_counter bigint NOT NULL DEFAULT -1,CHECK(enabled_at IS NULL OR secret_cipher IS NOT NULL));
ALTER TABLE sessions ADD COLUMN mfa_verified_at timestamptz;
CREATE TABLE mfa_challenges(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id),session_hash text NOT NULL REFERENCES sessions(token_hash),purpose text NOT NULL CHECK(purpose IN ('login','enroll')),expires_at timestamptz NOT NULL,used_at timestamptz,attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5));
CREATE TABLE mfa_recovery_codes(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id),code_hash text NOT NULL UNIQUE,used_at timestamptz);
CREATE TABLE reauth_tokens(token_hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id),session_hash text NOT NULL REFERENCES sessions(token_hash),action text NOT NULL CHECK(action IN ('mfa.enroll','mfa.disable','staff.invite','staff.revoke','staff.scope','invitation.revoke')),organization_id uuid REFERENCES organizations(id),target_id uuid,expires_at timestamptz NOT NULL,used_at timestamptz);
CREATE TABLE security_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES users(id),action text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE email_outbox ADD COLUMN token_cipher text;
DO $$ DECLARE table_name text; BEGIN FOREACH table_name IN ARRAY ARRAY['mfa_methods','mfa_challenges','mfa_recovery_codes','reauth_tokens','security_events'] LOOP EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',table_name);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',table_name);EXECUTE format('CREATE POLICY self_access ON %I USING(user_id=current_actor()) WITH CHECK(user_id=current_actor())',table_name);END LOOP;END $$;
GRANT SELECT,INSERT,UPDATE ON mfa_methods,mfa_challenges,mfa_recovery_codes,reauth_tokens TO kost_app;
GRANT DELETE ON mfa_recovery_codes TO kost_app;
GRANT SELECT,INSERT ON security_events TO kost_app;
DO $$ BEGIN IF NOT EXISTS(SELECT FROM pg_roles WHERE rolname='kost_worker') THEN CREATE ROLE kost_worker LOGIN PASSWORD 'local-worker-only' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS; END IF;END $$;
GRANT USAGE ON SCHEMA public TO kost_worker;
GRANT SELECT(id,email) ON users TO kost_worker;
GRANT SELECT ON verification_tokens TO kost_worker;
GRANT SELECT,UPDATE ON email_outbox TO kost_worker;

ALTER TABLE mfa_methods ADD COLUMN pending_challenge_id uuid REFERENCES mfa_challenges(id);
