import { BookingWorkspace } from "./components/BookingWorkspace.js";
import { AllocationWorkspace } from "./components/AllocationWorkspace.js";
import { PricingWorkspace } from "./components/PricingWorkspace.js";
import { InventoryWorkspace } from "./components/InventoryWorkspace.js";
import { AccountSecurity } from "./components/AccountSecurity.js";
import { StaffManagement } from "./components/StaffManagement.js";
import { errorText } from "./lib/api-types.js";
import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Building2, LogOut, MapPin, ShieldCheck } from "lucide-react";
import { Button } from "./components/ui/button.js";
import "./style.css";
type Org = { id: string; name: string; slug: string; role: string };
type Property = { id: string; name: string; city: string; timezone: string };
function App() {
  const [user, setUser] = useState<{
      id: string;
      email: string;
      verifiedAt: string | null;
    } | null>(null),
    [csrf, setCsrf] = useState(""),
    [orgs, setOrgs] = useState<Org[]>([]),
    [org, setOrg] = useState(""),
    [properties, setProperties] = useState<Property[]>([]),
    [mode, setMode] = useState("login"),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [mfaChallenge, setMfaChallenge] = useState(""),
    [propertyRevision, setPropertyRevision] = useState(0),
    [bookingQuoteId, setBookingQuoteId] = useState(""),
    [acceptanceKey] = useState(() => crypto.randomUUID()),
    [invitation, setInvitation] = useState<{
      org: string;
      id: string;
      token: string;
    } | null>(() => {
      if (location.pathname !== "/invitation") return null;
      const q = new URLSearchParams(location.search),
        h = new URLSearchParams(location.hash.slice(1));
      const org = q.get("organization"),
        id = q.get("id"),
        token = h.get("token");
      return org && id && token ? { org, id, token } : null;
    });
  const propertyIntent = useRef<{ fingerprint: string; key: string } | null>(
    null,
  );
  async function api(
    path: string,
    method = "GET",
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ) {
    const r = await fetch("/api/v1" + path, {
      method,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "X-CSRF-Token": csrf,
        ...extraHeaders,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok && data.error?.code === "AUTH_REQUIRED") {
      setUser(null);
      setOrgs([]);
      setOrg("");
      setCsrf("");
    }
    if (!r.ok)
      throw Error(
        (
          {
            ...errorText,
            AUTH_REQUIRED: "Silakan masuk kembali.",
            INVALID_CREDENTIALS: "Email atau kata sandi tidak cocok.",
            VALIDATION_ERROR: "Periksa kembali isian formulir.",
            VERSION_CONFLICT:
              "Data berubah atau kode sudah digunakan. Muat ulang dan periksa kembali.",
            FORBIDDEN: "Akses tidak diizinkan.",
            NOT_FOUND: "Data tidak ditemukan.",
            RATE_LIMITED: "Terlalu banyak percobaan. Coba lagi nanti.",
          } as Record<string, string>
        )[data.error?.code] ?? "Permintaan gagal. Silakan coba lagi.",
      );
    return data;
  }
  async function allPages(path: string) {
    let items: any[] = [],
      after: string | null = null;
    do {
      const result = await api(
        path +
          (path.includes("?") ? "&" : "?") +
          "limit=100" +
          (after ? "&after=" + after : ""),
      );
      items.push(...result.items);
      after = result.nextCursor;
    } while (after);
    return items;
  }
  async function loadOrgs() {
    const items = await allPages("/organizations");
    setOrgs(items);
    setOrg((old) =>
      items.some((o: Org) => o.id === old) ? old : items[0]?.id || "",
    );
  }
  useEffect(() => {
    api("/auth/session")
      .then((data) => {
        setUser(data.user);
        setCsrf(data.csrfToken);
        return loadOrgs();
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    const params = new URLSearchParams(location.hash.slice(1));
    if (location.pathname === "/verify" && params.has("token")) {
      setMode("verify");
    }
    if (location.pathname === "/reset" && params.has("token")) setMode("reset");
  }, []);
  useEffect(() => {
    if (!org) {
      setProperties([]);
      return;
    }
    let active = true;
    setError("");
    setProperties([]);
    allPages("/organizations/" + org + "/properties")
      .then((items) => {
        if (active) setProperties(items);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [org]);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function form(fn: (data: FormData) => Promise<void>) {
    return (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      const data = new FormData(e.currentTarget);
      void run(() => fn(data));
    };
  }
  if (loading)
    return (
      <main>
        <p role="status">Memuat sesi…</p>
      </main>
    );
  return (
    <>
      <header>
        <a href="/" className="brand">
          <Building2 />
          Kost Hospitality
        </a>
        <span className="badge">Development · Fondasi</span>
        {user && org && (
          <>
            <a className="button button-outline" href="#inventory-section">
              Inventori
            </a>
            <a className="button button-outline" href="#pricing-section">
              Harga dan kebijakan
            </a>
            <a className="button button-outline" href="#allocation-section">
              Kalender kamar
            </a>
            <a className="button button-outline" href="#booking-section">
              Booking dan invoice
            </a>
          </>
        )}
        {user && (
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await api("/auth/logout", "POST", {});
                setUser(null);
                setOrgs([]);
                setOrg("");
              })
            }
          >
            <LogOut size={16} />
            Keluar
          </Button>
        )}
      </header>
      <main>
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
        {invitation && (
          <article className="invitation-banner">
            <h2>Undangan bergabung sebagai staf</h2>
            <p>
              Masuk atau daftar dengan email tujuan undangan, lalu konfirmasikan
              penerimaan. Undangan tidak memberi akses sebelum diterima.
            </p>
            {user && (
              <Button
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await api(
                      "/organizations/" +
                        invitation.org +
                        "/invitations/" +
                        invitation.id +
                        "/accept",
                      "POST",
                      { token: invitation.token },
                      { "Idempotency-Key": acceptanceKey },
                    );
                    await loadOrgs();
                    setOrg(invitation.org);
                    setInvitation(null);
                    history.replaceState(null, "", "/");
                    setNotice(
                      "Undangan diterima. Akses mengikuti peran dan lokasi yang diberikan.",
                    );
                  })
                }
              >
                Terima undangan staf
              </Button>
            )}
          </article>
        )}
        {!user || mode === "verify" || mode === "reset" ? (
          <section className="auth">
            <div className="eyebrow">RUANG UNTUK TUMBUH</div>
            <h1>
              Kelola kost,
              <br />
              sambut penghuni.
            </h1>
            <p>Masuk untuk menyiapkan organisasi dan lokasi Anda.</p>
            <article>
              {mode === "mfa" ? (
                <>
                  <h2>Verifikasi dua langkah</h2>
                  <p>
                    Masukkan kode dari authenticator atau satu kode pemulihan
                    yang belum dipakai.
                  </p>
                  <form
                    onSubmit={form(async (d) => {
                      const result = await api("/auth/mfa/verify", "POST", {
                        challengeId: mfaChallenge,
                        code: d.get("code"),
                      });
                      setCsrf(result.csrfToken);
                      const session = await api("/auth/session");
                      setUser(session.user);
                      setMode("login");
                      setMfaChallenge("");
                      await loadOrgs();
                    })}
                  >
                    <label>
                      Kode MFA atau pemulihan
                      <input
                        name="code"
                        autoComplete="one-time-code"
                        maxLength={100}
                        required
                      />
                    </label>
                    <Button disabled={busy}>Verifikasi dan masuk</Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setMode("login");
                        setMfaChallenge("");
                      }}
                    >
                      Kembali ke masuk
                    </Button>
                  </form>
                </>
              ) : mode === "verify" ? (
                <>
                  <h2>Verifikasi email</h2>
                  <p>Konfirmasi alamat email untuk melanjutkan.</p>
                  <Button
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        const token = new URLSearchParams(
                          location.hash.slice(1),
                        ).get("token");
                        await api("/auth/verify-email", "POST", { token });
                        history.replaceState(null, "", "/");
                        setMode("login");
                        if (user) {
                          const session = await api("/auth/session");
                          setUser(session.user);
                        }
                        setNotice("Email terverifikasi. Silakan masuk.");
                      })
                    }
                  >
                    {busy ? "Memproses…" : "Verifikasi email saya"}
                  </Button>
                </>
              ) : mode === "forgot" || mode === "reset" ? (
                <>
                  <h2>
                    {mode === "forgot"
                      ? "Lupa kata sandi"
                      : "Atur kata sandi baru"}
                  </h2>
                  <form
                    onSubmit={form(async (d) => {
                      if (mode === "forgot") {
                        const result = await api(
                          "/auth/forgot-password",
                          "POST",
                          { email: d.get("email") },
                        );
                        setNotice(result.message);
                      } else {
                        await api("/auth/reset-password", "POST", {
                          token: new URLSearchParams(
                            location.hash.slice(1),
                          ).get("token"),
                          password: d.get("password"),
                        });
                        history.replaceState(null, "", "/");
                        setUser(null);
                        setCsrf("");
                        setOrgs([]);
                        setOrg("");
                        setMode("login");
                        setNotice(
                          "Kata sandi diperbarui. Silakan masuk kembali.",
                        );
                      }
                    })}
                  >
                    {mode === "forgot" ? (
                      <label>
                        Email
                        <input
                          name="email"
                          type="email"
                          autoComplete="email"
                          required
                        />
                      </label>
                    ) : (
                      <label>
                        Kata sandi baru
                        <input
                          name="password"
                          type="password"
                          minLength={12}
                          maxLength={128}
                          autoComplete="new-password"
                          required
                        />
                      </label>
                    )}
                    <Button disabled={busy}>
                      {busy
                        ? "Memproses…"
                        : mode === "forgot"
                          ? "Kirim tautan reset"
                          : "Simpan kata sandi"}
                    </Button>
                  </form>
                  <Button variant="outline" onClick={() => setMode("login")}>
                    Kembali ke masuk
                  </Button>
                </>
              ) : (
                <>
                  <h2>
                    {mode === "register"
                      ? "Buat akun pemilik"
                      : "Selamat datang kembali"}
                  </h2>
                  <form
                    onSubmit={form(async (d) => {
                      const body = {
                        email: d.get("email"),
                        password: d.get("password"),
                      };
                      if (mode === "register") {
                        const data = await api("/auth/register", "POST", body);
                        setNotice(
                          data.message +
                            " Untuk pengujian lokal, periksa Mailpit.",
                        );
                      } else {
                        const result = await api("/auth/login", "POST", body);
                        setCsrf(result.csrfToken);
                        if (result.mfaRequired) {
                          setMfaChallenge(result.challengeId);
                          setMode("mfa");
                          return;
                        }
                        const session = await api("/auth/session");
                        setUser(session.user);
                        await loadOrgs();
                      }
                    })}
                  >
                    <label>
                      Email
                      <input
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                      />
                    </label>
                    <label>
                      Kata sandi
                      <input
                        name="password"
                        type="password"
                        minLength={12}
                        maxLength={128}
                        autoComplete={
                          mode === "register"
                            ? "new-password"
                            : "current-password"
                        }
                        required
                      />
                    </label>
                    <p className="small">Minimal 12 karakter.</p>
                    <Button disabled={busy}>
                      {busy
                        ? "Memproses…"
                        : mode === "register"
                          ? "Daftar"
                          : "Masuk"}
                    </Button>
                  </form>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      setMode(mode === "register" ? "login" : "register")
                    }
                  >
                    {mode === "register"
                      ? "Sudah punya akun? Masuk"
                      : "Buat akun baru"}
                  </Button>
                  {mode === "login" && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => setMode("forgot")}
                    >
                      Lupa kata sandi?
                    </Button>
                  )}
                </>
              )}
            </article>
          </section>
        ) : (
          <>
            <div className="eyebrow">WORKSPACE PEMILIK</div>
            <h1>Mulai dari fondasi yang rapi.</h1>
            <p>Halo, {user.email}. Siapkan organisasi dan lokasi kost Anda.</p>
            <div className="grid">
              <article>
                <ShieldCheck className="icon" />
                <h2>Organisasi Anda</h2>
                {orgs.length ? (
                  <label>
                    Organisasi aktif
                    <select
                      value={org}
                      onChange={(e) => setOrg(e.target.value)}
                    >
                      {orgs.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name} · {o.role}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <p>Belum ada organisasi. Buat organisasi pertama Anda.</p>
                )}
                <form
                  onSubmit={form(async (d) => {
                    const created = await api("/organizations", "POST", {
                      name: d.get("name"),
                      slug: d.get("slug"),
                    });
                    await loadOrgs();
                    setOrg(created.id);
                    setNotice("Organisasi berhasil dibuat.");
                  })}
                >
                  <label>
                    Nama organisasi
                    <input name="name" maxLength={120} required />
                  </label>
                  <label>
                    Slug organisasi
                    <input
                      name="slug"
                      pattern="[a-z0-9]+(-[a-z0-9]+)*"
                      minLength={3}
                      maxLength={60}
                      placeholder="nama-organisasi"
                      required
                    />
                  </label>
                  <Button disabled={busy}>
                    {busy ? "Menyimpan…" : "Buat organisasi"}
                  </Button>
                </form>
              </article>
              <article>
                <MapPin className="icon" />
                <h2>Lokasi kost</h2>
                {properties.length ? (
                  <ul>
                    {properties.map((p) => (
                      <li key={p.id}>
                        <strong>{p.name}</strong>
                        <span>
                          {p.city} · {p.timezone}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Belum ada lokasi pada organisasi ini.</p>
                )}
                {org && orgs.find((o) => o.id === org)?.role === "Owner" && (
                  <form
                    onSubmit={form(async (d) => {
                      const body = {
                        name: d.get("name"),
                        city: d.get("city"),
                        timezone: d.get("timezone"),
                      };
                      const fingerprint = JSON.stringify({ org, body });
                      if (propertyIntent.current?.fingerprint !== fingerprint)
                        propertyIntent.current = {
                          fingerprint,
                          key: crypto.randomUUID(),
                        };
                      await api(
                        "/organizations/" + org + "/properties",
                        "POST",
                        body,
                        { "Idempotency-Key": propertyIntent.current.key },
                      );
                      const items = await allPages(
                        "/organizations/" + org + "/properties",
                      );
                      setProperties(items);
                      setPropertyRevision((v) => v + 1);
                      setNotice("Lokasi tersimpan.");
                      propertyIntent.current = null;
                    })}
                  >
                    <label>
                      Nama lokasi
                      <input name="name" required maxLength={120} />
                    </label>
                    <label>
                      Kota
                      <input name="city" required maxLength={120} />
                    </label>
                    <label>
                      Zona waktu
                      <select name="timezone">
                        <option>Asia/Jakarta</option>
                        <option>Asia/Makassar</option>
                        <option>Asia/Jayapura</option>
                      </select>
                    </label>
                    <Button disabled={busy}>Tambah lokasi</Button>
                  </form>
                )}
              </article>
            </div>
            {org && (
              <InventoryWorkspace
                key={"inventory:" + org}
                api={api}
                org={org}
                role={orgs.find((o) => o.id === org)?.role ?? ""}
                propertyRevision={propertyRevision}
                onChanged={loadOrgs}
              />
            )}
            {org && (
              <PricingWorkspace
                key={"pricing:" + org}
                onQuoteCreated={(q) => setBookingQuoteId(q.id)}
                api={api}
                org={org}
                role={orgs.find((o) => o.id === org)?.role ?? ""}
                propertyRevision={propertyRevision}
              />
            )}
            {org && (
              <AllocationWorkspace
                key={"allocation:" + org}
                api={api}
                org={org}
                role={orgs.find((o) => o.id === org)?.role ?? ""}
                propertyRevision={propertyRevision}
              />
            )}
            {org && (
              <BookingWorkspace
                key={"booking:" + org}
                api={api}
                org={org}
                role={orgs.find((o) => o.id === org)?.role ?? ""}
                propertyRevision={propertyRevision}
                quoteId={bookingQuoteId}
              />
            )}
            <AccountSecurity
              key={user.id}
              api={api}
              verified={Boolean(user.verifiedAt)}
            />
            {org && orgs.find((o) => o.id === org)?.role === "Owner" && (
              <StaffManagement
                key={org}
                api={api}
                org={org}
                userId={user.id}
                propertyRevision={propertyRevision}
                onChanged={loadOrgs}
              />
            )}
            <p className="small">
              Booking petugas dan invoice awal tersedia. Verifikasi pembayaran,
              kontrak/check-in, tagihan rutin dan checkout masih dikembangkan.
            </p>
          </>
        )}
      </main>
      <footer>Data tersimpan pada server lokal · Belum siap produksi</footer>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
