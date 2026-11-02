-- An already-authorized command may revoke its actor membership. Its result must
-- commit atomically with that revocation. Read access still requires membership.
CREATE POLICY idempotency_result_insert ON idempotency_requests FOR INSERT TO kost_app WITH CHECK(organization_id=current_org() AND actor_id=current_actor());
