import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { Api } from "../lib/api-types.js";
import { ReauthFields } from "./ReauthFields.js";
import { Button } from "./ui/button.js";
export function AccountSecurity({
  api,
  verified,
}: {
  api: Api;
  verified: boolean;
}) {
  const [enabled, setEnabled] = useState(false),
    [remaining, setRemaining] = useState(0),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [setup, setSetup] = useState<{
      secret: string;
      otpauthUri: string;
      challengeId: string;
    } | null>(null),
    [recovery, setRecovery] = useState<string[]>([]),
    [disabling, setDisabling] = useState(false);
  async function load() {
    const status = await api("/auth/security");
    setEnabled(status.mfaEnabled);
    setRemaining(status.recoveryCodesRemaining);
  }
  useEffect(() => {
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  async function submit(
    e: FormEvent<HTMLFormElement>,
    fn: (data: FormData) => Promise<void>,
  ) {
    e.preventDefault();
    const form = e.currentTarget,
      data = new FormData(form);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      form
        .querySelectorAll<HTMLInputElement>(
          "input[type=password],input[name=confirmationMfa],input[name=code]",
        )
        .forEach((i) => (i.value = ""));
      setBusy(false);
    }
  }
  async function confirm(data: FormData, action: string) {
    return api("/auth/reauth", "POST", {
      password: data.get("confirmationPassword"),
      action,
      ...(data.get("confirmationMfa")
        ? { mfaCode: data.get("confirmationMfa") }
        : {}),
    });
  }
  return (
    <section
      className="account-section"
      aria-labelledby="account-security-title"
    >
      <article>
        <div className="section-heading">
          <div>
            <div className="eyebrow">AKUN ANDA</div>
            <h2 id="account-security-title">Keamanan akun</h2>
          </div>
          <span className="badge">
            {loading ? "Memuat…" : enabled ? "MFA aktif" : "MFA belum aktif"}
          </span>
        </div>
        {error && (
          <div role="alert" className="alert">
            {error}
          </div>
        )}
        {notice && (
          <div role="status" className="notice">
            {notice}
          </div>
        )}
        {loading ? (
          <p>Memuat pengaturan keamanan…</p>
        ) : (
          <>
            <p>
              Gunakan aplikasi authenticator untuk verifikasi dua langkah saat
              masuk. Simpan kode pemulihan agar akun tetap dapat diakses jika
              perangkat hilang.
            </p>
            {!verified && (
              <div className="alert">
                <p>
                  Verifikasi email melalui tautan yang dikirim saat pendaftaran
                  sebelum mengaktifkan MFA atau mengundang staf.
                </p>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setError("");
                    try {
                      const r = await api(
                        "/auth/verification/resend",
                        "POST",
                        {},
                      );
                      setNotice(r.message);
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Kirim ulang email verifikasi
                </Button>
              </div>
            )}
            {recovery.length > 0 && (
              <div className="recovery-box">
                <h3>Simpan kode pemulihan sekarang</h3>
                <p>
                  Setiap kode hanya berlaku sekali. Kode lengkap tidak dapat
                  ditampilkan kembali setelah layar ini ditutup.
                </p>
                <ul className="recovery-codes">
                  {recovery.map((c) => (
                    <li key={c}>
                      <code>{c}</code>
                    </li>
                  ))}
                </ul>
                <Button onClick={() => setRecovery([])}>
                  Saya sudah menyimpan kode
                </Button>
              </div>
            )}
            {setup ? (
              <div className="mfa-setup">
                <h3>Hubungkan authenticator</h3>
                <p>
                  Tambahkan akun TOTP dengan kunci berikut. Jangan bagikan kunci
                  ini kepada orang lain.
                </p>
                <code className="secret-value">{setup.secret}</code>
                <p>
                  <a href={setup.otpauthUri}>Buka di aplikasi authenticator</a>
                </p>
                <form
                  onSubmit={(e) =>
                    submit(e, async (data) => {
                      const result = await api("/auth/mfa/verify", "POST", {
                        challengeId: setup.challengeId,
                        code: data.get("code"),
                      });
                      setSetup(null);
                      setRecovery(result.recoveryCodes);
                      await load();
                      setNotice("MFA aktif. Sesi lain telah dicabut.");
                    })
                  }
                >
                  <label>
                    Kode authenticator 6 digit
                    <input
                      name="code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      required
                    />
                  </label>
                  <div className="actions">
                    <Button disabled={busy}>Konfirmasi aktivasi MFA</Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => setSetup(null)}
                    >
                      Batalkan
                    </Button>
                  </div>
                </form>
              </div>
            ) : !enabled ? (
              <form
                onSubmit={(e) =>
                  submit(e, async (data) => {
                    const r = await confirm(data, "mfa.enroll");
                    setSetup(
                      await api(
                        "/auth/mfa/enroll",
                        "POST",
                        {},
                        { "X-Reauth-Token": r.reauthToken },
                      ),
                    );
                  })
                }
              >
                <ReauthFields />
                <Button disabled={busy || !verified}>
                  {busy ? "Memproses…" : "Mulai aktivasi MFA"}
                </Button>
              </form>
            ) : (
              <>
                <p className="small">
                  Kode pemulihan tersisa: {remaining}. Kode authenticator yang
                  sudah dipakai tidak dapat dipakai ulang; tunggu kode
                  berikutnya bila perlu konfirmasi ulang.
                </p>
                {!disabling ? (
                  <Button variant="outline" onClick={() => setDisabling(true)}>
                    Nonaktifkan MFA
                  </Button>
                ) : (
                  <form
                    onSubmit={(e) =>
                      submit(e, async (data) => {
                        const r = await confirm(data, "mfa.disable");
                        await api(
                          "/auth/mfa/disable",
                          "POST",
                          {},
                          { "X-Reauth-Token": r.reauthToken },
                        );
                        setDisabling(false);
                        setRecovery([]);
                        await load();
                        setNotice(
                          "MFA dinonaktifkan. Sesi lain telah dicabut.",
                        );
                      })
                    }
                  >
                    <ReauthFields mfa />
                    <div className="actions">
                      <Button disabled={busy}>
                        Konfirmasi nonaktifkan MFA
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() => setDisabling(false)}
                      >
                        Batalkan
                      </Button>
                    </div>
                  </form>
                )}
              </>
            )}
          </>
        )}
      </article>
    </section>
  );
}
