ALTER TABLE rate_policy_versions ADD COLUMN created_xid xid8 NOT NULL DEFAULT pg_current_xact_id();
CREATE FUNCTION guard_policy_override_append() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NOT EXISTS(SELECT 1 FROM rate_policy_versions p WHERE p.organization_id=NEW.organization_id AND p.property_id=NEW.property_id AND p.id=NEW.policy_id AND p.created_xid=pg_current_xact_id()) THEN RAISE EXCEPTION 'INVALID_STATE' USING ERRCODE='P0409';END IF;RETURN NEW;END $$;
CREATE TRIGGER type_rate_append_guard BEFORE INSERT ON policy_type_rates FOR EACH ROW EXECUTE FUNCTION guard_policy_override_append();
CREATE TRIGGER room_rate_append_guard BEFORE INSERT ON policy_room_rates FOR EACH ROW EXECUTE FUNCTION guard_policy_override_append();
