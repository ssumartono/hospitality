export function ReauthFields({ mfa = false }: { mfa?: boolean }) {
  return (
    <fieldset className="confirmation">
      <legend>Konfirmasi keamanan</legend>
      <label>
        Password konfirmasi
        <input
          name="confirmationPassword"
          type="password"
          autoComplete="current-password"
          maxLength={128}
          required
        />
      </label>
      <label>
        Kode MFA atau kode pemulihan{mfa ? " (wajib)" : " (jika MFA aktif)"}
        <input
          name="confirmationMfa"
          autoComplete="one-time-code"
          maxLength={100}
          required={mfa}
        />
      </label>
    </fieldset>
  );
}
