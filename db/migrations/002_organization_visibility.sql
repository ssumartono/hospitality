-- Qualify outer identifier: unqualified id resolves to memberships.id inside subquery.
DROP POLICY org_read ON organizations;
CREATE POLICY org_read ON organizations FOR SELECT USING(EXISTS(SELECT FROM memberships m WHERE m.organization_id=organizations.id AND m.user_id=current_actor() AND m.revoked_at IS NULL));
