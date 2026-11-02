import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Api, Property } from "../lib/api-types.js";
import { ReauthFields } from "./ReauthFields.js";
import { Button } from "./ui/button.js";
type Member = {
  id: string;
  userId: string;
  email: string;
  role: string;
  propertyIds: string[];
};
type Invitation = {
  id: string;
  email: string;
  role: string;
  propertyIds: string[];
  state: string;
  expiresAt: string;
  emailStatus: string;
};
type Action = {
  kind: "scope" | "revoke" | "invitation";
  id: string;
  email: string;
  userId?: string;
};
const roles = {
  Owner: "Pemilik (Owner)",
  Manager: "Manajer",
  Finance: "Keuangan",
  Operations: "Operasional",
};
const stateLabels: Record<string, string> = {
  pending: "Menunggu penerimaan",
  accepted: "Diterima",
  revoked: "Dicabut",
  expired: "Kedaluwarsa",
};
const emailLabels: Record<string, string> = {
  pending: "Antre email",
  smtp_accepted: "Diterima server email",
  failed: "Pengiriman gagal",
};
export function StaffManagement({
  api,
  org,
  userId,
  onChanged,
  propertyRevision,
}: {
  api: Api;
  org: string;
  userId: string;
  onChanged: () => Promise<void>;
  propertyRevision: number;
}) {
  const [members, setMembers] = useState<Member[]>([]),
    [invitations, setInvitations] = useState<Invitation[]>([]),
    [properties, setProperties] = useState<Property[]>([]),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [role, setRole] = useState("Manager"),
    [selected, setSelected] = useState<string[]>([]),
    [action, setAction] = useState<Action | null>(null),
    [editRole, setEditRole] = useState("Manager"),
    [editSelected, setEditSelected] = useState<string[]>([]);
  const intent = useRef<{ fingerprint: string; key: string } | null>(null);
  async function all(path: string) {
    let items: any[] = [],
      after: string | null = null;
    do {
      const result = await api(
        path + "?limit=100" + (after ? "&after=" + after : ""),
      );
      items.push(...result.items);
      after = result.nextCursor;
    } while (after);
    return items;
  }
  async function load() {
    const [m, i, p] = await Promise.all([
      all("/organizations/" + org + "/memberships"),
      all("/organizations/" + org + "/invitations"),
      all("/organizations/" + org + "/properties"),
    ]);
    setMembers(m);
    setInvitations(i);
    setProperties(p);
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    setMembers([]);
    setInvitations([]);
    setProperties([]);
    setAction(null);
    setSelected([]);
    setError("");
    setNotice("");
    intent.current = null;
    Promise.all([
      all("/organizations/" + org + "/memberships"),
      all("/organizations/" + org + "/invitations"),
      all("/organizations/" + org + "/properties"),
    ])
      .then(([m, i, p]) => {
        if (active) {
          setMembers(m);
          setInvitations(i);
          setProperties(p);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [org, propertyRevision]);
  function key(payload: unknown) {
    const fingerprint = JSON.stringify(payload);
    if (intent.current?.fingerprint !== fingerprint)
      intent.current = { fingerprint, key: crypto.randomUUID() };
    return intent.current.key;
  }
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
          "input[type=password],input[name=confirmationMfa]",
        )
        .forEach((i) => (i.value = ""));
      setBusy(false);
    }
  }
  async function confirm(data: FormData, action: string, targetId?: string) {
    const r = await api("/auth/reauth", "POST", {
      password: data.get("confirmationPassword"),
      action,
      organizationId: org,
      ...(targetId ? { targetId } : {}),
      ...(data.get("confirmationMfa")
        ? { mfaCode: data.get("confirmationMfa") }
        : {}),
    });
    return r.reauthToken as string;
  }
  function locationPicker(
    value: string[],
    change: (next: string[]) => void,
    currentRole: string,
  ) {
    return currentRole === "Owner" ? (
      <p className="small">Owner memiliki akses seluruh lokasi organisasi.</p>
    ) : (
      <fieldset className="location-picker">
        <legend>Lokasi yang diizinkan</legend>
        {properties.length ? (
          properties.map((p) => (
            <label className="checkbox-label" key={p.id}>
              <input
                type="checkbox"
                value={p.id}
                checked={value.includes(p.id)}
                onChange={(e) =>
                  change(
                    e.target.checked
                      ? [...value, p.id]
                      : value.filter((id) => id !== p.id),
                  )
                }
              />
              {p.name}
            </label>
          ))
        ) : (
          <p>
            Tambahkan lokasi terlebih dahulu untuk mengundang staf selain Owner.
          </p>
        )}
      </fieldset>
    );
  }
  const roleOptions = Object.entries(roles).map(([value, label]) => (
    <option value={value} key={value}>
      {label}
    </option>
  ));
  function locationNames(member: { role: string; propertyIds: string[] }) {
    return member.role === "Owner"
      ? "Semua lokasi"
      : member.propertyIds
          .map(
            (id) =>
              properties.find((p) => p.id === id)?.name ?? "Lokasi terbatas",
          )
          .join(", ");
  }
  return (
    <section
      className="account-section"
      aria-labelledby="staff-management-title"
    >
      <article>
        <div className="section-heading">
          <div>
            <div className="eyebrow">TIM PENGELOLA</div>
            <h2 id="staff-management-title">Staf dan akses lokasi</h2>
          </div>
          <Button
            variant="outline"
            disabled={busy || loading}
            onClick={async () => {
              setError("");
              try {
                await load();
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            Muat ulang staf
          </Button>
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
          <p role="status">Memuat staf…</p>
        ) : (
          <>
            <div className="staff-grid">
              <div>
                <h3>Undang staf</h3>
                <p>
                  Undangan berlaku 72 jam. Penerima harus masuk dengan email
                  tujuan yang sudah terverifikasi.
                </p>
                <form
                  aria-label="Undang staf"
                  onSubmit={(e) =>
                    submit(e, async (data) => {
                      if (role !== "Owner" && !selected.length)
                        throw Error(
                          "Pilih setidaknya satu lokasi untuk staf ini.",
                        );
                      const payload = {
                        email: String(data.get("email")).trim().toLowerCase(),
                        role,
                        propertyIds:
                          role === "Owner" ? [] : [...selected].sort(),
                      };
                      const idempotencyKey = key({
                        kind: "invite",
                        ...payload,
                      });
                      const token = await confirm(data, "staff.invite");
                      await api(
                        "/organizations/" + org + "/invitations",
                        "POST",
                        payload,
                        {
                          "Idempotency-Key": idempotencyKey,
                          "X-Reauth-Token": token,
                        },
                      );
                      intent.current = null;
                      setSelected([]);
                      await load();
                      setNotice(
                        "Undangan tersimpan dan masuk antrean email. Periksa status pengiriman di daftar undangan.",
                      );
                    })
                  }
                >
                  <label>
                    Email staf
                    <input
                      name="email"
                      type="email"
                      autoComplete="off"
                      required
                      maxLength={254}
                    />
                  </label>
                  <label>
                    Peran staf
                    <select
                      value={role}
                      onChange={(e) => {
                        setRole(e.target.value);
                        setSelected([]);
                      }}
                    >
                      {roleOptions}
                    </select>
                  </label>
                  {locationPicker(selected, setSelected, role)}
                  <ReauthFields />
                  <Button disabled={busy}>
                    {busy ? "Memproses…" : "Kirim undangan staf"}
                  </Button>
                </form>
              </div>
              <div>
                <h3>Staf aktif ({members.length})</h3>
                <ul className="member-list">
                  {members.map((m) => (
                    <li key={m.id}>
                      <strong>
                        {m.email}
                        {m.userId === userId ? " (Anda)" : ""}
                      </strong>
                      <span>
                        {roles[m.role as keyof typeof roles]} ·{" "}
                        {locationNames(m)}
                      </span>
                      <div className="actions">
                        <Button
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            intent.current = null;
                            setAction({
                              kind: "scope",
                              id: m.id,
                              email: m.email,
                              userId: m.userId,
                            });
                            setEditRole(m.role);
                            setEditSelected(m.propertyIds);
                          }}
                        >
                          Ubah akses
                        </Button>
                        <Button
                          variant="outline"
                          disabled={
                            busy ||
                            (m.role === "Owner" &&
                              members.filter((x) => x.role === "Owner")
                                .length === 1)
                          }
                          onClick={() => {
                            intent.current = null;
                            setAction({
                              kind: "revoke",
                              id: m.id,
                              email: m.email,
                              userId: m.userId,
                            });
                          }}
                        >
                          Cabut akses
                        </Button>
                      </div>
                      {m.role === "Owner" &&
                        members.filter((x) => x.role === "Owner").length ===
                          1 && (
                          <p className="small">
                            Owner terakhir harus tetap aktif.
                          </p>
                        )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            {action && (
              <div className="access-editor">
                <h3>
                  {action.kind === "scope"
                    ? "Ubah akses"
                    : action.kind === "invitation"
                      ? "Cabut undangan"
                      : "Cabut akses staf"}
                  : {action.email}
                </h3>
                <form
                  aria-label="Konfirmasi perubahan akses"
                  onSubmit={(e) =>
                    submit(e, async (data) => {
                      const reason = String(data.get("reason")).trim();
                      const kind = action.kind;
                      const actionName =
                        kind === "scope"
                          ? "staff.scope"
                          : kind === "invitation"
                            ? "invitation.revoke"
                            : "staff.revoke";
                      if (
                        kind === "scope" &&
                        editRole !== "Owner" &&
                        !editSelected.length
                      )
                        throw Error(
                          "Pilih setidaknya satu lokasi untuk staf ini.",
                        );
                      const payload =
                        kind === "scope"
                          ? {
                              role: editRole,
                              propertyIds:
                                editRole === "Owner"
                                  ? []
                                  : [...editSelected].sort(),
                              reason,
                            }
                          : { reason };
                      const idempotencyKey = key({
                        kind,
                        id: action.id,
                        ...payload,
                      });
                      const token = await confirm(data, actionName, action.id);
                      const path =
                        "/organizations/" +
                        org +
                        (kind === "invitation"
                          ? "/invitations/"
                          : "/memberships/") +
                        action.id +
                        "/" +
                        (kind === "scope" ? "scope" : "revoke");
                      await api(
                        path,
                        "POST",
                        kind === "scope"
                          ? { ...payload, reauthToken: token }
                          : payload,
                        {
                          "Idempotency-Key": idempotencyKey,
                          "X-Reauth-Token": token,
                        },
                      );
                      const losesOwnAccess =
                        action.userId === userId &&
                        (kind === "revoke" ||
                          (kind === "scope" && editRole !== "Owner"));
                      setAction(null);
                      intent.current = null;
                      if (losesOwnAccess) {
                        await onChanged();
                        return;
                      }
                      await load();
                      await onChanged();
                      setNotice(
                        "Perubahan akses tersimpan. Izin baru berlaku pada request berikutnya.",
                      );
                    })
                  }
                >
                  {action.kind === "scope" && (
                    <>
                      <label>
                        Peran baru
                        <select
                          value={editRole}
                          onChange={(e) => {
                            setEditRole(e.target.value);
                            setEditSelected([]);
                          }}
                        >
                          {roleOptions}
                        </select>
                      </label>
                      {locationPicker(editSelected, setEditSelected, editRole)}
                    </>
                  )}
                  <label>
                    Alasan perubahan
                    <textarea
                      name="reason"
                      required
                      minLength={3}
                      maxLength={500}
                      rows={3}
                    />
                  </label>
                  <p className="small">
                    Cantumkan alasan tanpa password, kode MFA, atau data
                    identitas sensitif.
                  </p>
                  <ReauthFields />
                  <div className="actions">
                    <Button disabled={busy}>Simpan perubahan akses</Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setAction(null);
                        intent.current = null;
                      }}
                    >
                      Batalkan perubahan
                    </Button>
                  </div>
                </form>
              </div>
            )}
            <h3>Riwayat undangan</h3>
            {invitations.length ? (
              <ul className="member-list">
                {invitations.map((i) => (
                  <li key={i.id}>
                    <strong>{i.email}</strong>
                    <span>
                      {roles[i.role as keyof typeof roles]} · {locationNames(i)}
                    </span>
                    <span>
                      {stateLabels[i.state] ?? i.state} ·{" "}
                      {emailLabels[i.emailStatus] ?? i.emailStatus}
                    </span>
                    <span>
                      Berlaku sampai{" "}
                      {new Date(i.expiresAt).toLocaleString("id-ID")}
                    </span>
                    {i.state === "pending" && (
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          intent.current = null;
                          setAction({
                            kind: "invitation",
                            id: i.id,
                            email: i.email,
                          });
                        }}
                      >
                        Cabut undangan
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p>Belum ada undangan staf.</p>
            )}
          </>
        )}
      </article>
    </section>
  );
}
