CREATE FUNCTION guard_last_owner() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF OLD.role='Owner' AND OLD.revoked_at IS NULL AND (TG_OP='DELETE' OR NEW.role<>'Owner' OR NEW.revoked_at IS NOT NULL) THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('owner:'||OLD.organization_id::text,0));
    IF NOT EXISTS(SELECT 1 FROM public.memberships WHERE organization_id=OLD.organization_id AND id<>OLD.id AND role='Owner' AND revoked_at IS NULL) THEN
      RAISE EXCEPTION 'LAST_OWNER_REQUIRED' USING ERRCODE='23514';
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER protect_last_owner BEFORE UPDATE OR DELETE ON memberships FOR EACH ROW EXECUTE FUNCTION guard_last_owner();
REVOKE ALL ON FUNCTION guard_last_owner() FROM PUBLIC;
