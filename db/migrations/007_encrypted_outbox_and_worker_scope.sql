ALTER POLICY invitation_owner_read ON invitations TO kost_app;
ALTER POLICY invitation_recipient_read ON invitations TO kost_app;
ALTER POLICY invitation_owner_insert ON invitations TO kost_app;
ALTER POLICY invitation_owner_update ON invitations TO kost_app;
ALTER TABLE email_outbox ADD CONSTRAINT no_plaintext_email_tokens CHECK(secret_token IS NULL) NOT VALID;
