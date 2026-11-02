import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Api, Property } from "../lib/api-types.js";
import { Button } from "./ui/button.js";
type Profile = Property & {
  version: number;
  code: string | null;
  floors: number | null;
  segment: string | null;
  address: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
};
type Type = {
  id: string;
  name: string;
  defaultCapacity: number;
  defaultFacilities: string[];
  version: number;
};
type Room = {
  id: string;
  code: string;
  floor: number;
  typeId: string;
  typeName: string;
  capacity: number;
  facilities: string[];
  condition: string;
  version: number;
  checklistVersion: number;
  water: boolean;
  electric: boolean;
  lock: boolean;
  furniture: boolean;
  clean: boolean;
  checklistComplete: boolean;
};
type Preview = {
  alreadyApplied: boolean;
  previewChecksum?: string;
  typeName?: string;
  rooms: {
    code: string;
    floor: number;
    capacity: number;
    facilities: string[];
  }[];
};
const conditions: Record<string, string> = {
  inspection: "Perlu inspeksi",
  dirty: "Kotor",
  maintenance: "Perawatan",
  inactive: "Nonaktif",
  ready: "Siap",
};
const checks = {
  water: "Air berfungsi",
  electric: "Kelistrikan diperiksa",
  lock: "Kunci dan akses diperiksa",
  furniture: "Perlengkapan sesuai yang disepakati (termasuk tanpa furnitur)",
  clean: "Kebersihan diperiksa",
};
const pilotExample = () =>
  [1, 2]
    .flatMap((f) =>
      Array.from({ length: 6 }, (_, i) => String(f * 100 + i + 1) + "," + f),
    )
    .join("\n");
const facilityList = (value: FormDataEntryValue | null) =>
  String(value ?? "")
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
export function InventoryWorkspace({
  api,
  org,
  role,
  propertyRevision,
  onChanged,
}: {
  api: Api;
  org: string;
  role: string;
  propertyRevision: number;
  onChanged: () => Promise<void>;
}) {
  const [locations, setLocations] = useState<Property[]>([]),
    [location, setLocation] = useState(""),
    [profile, setProfile] = useState<Profile | null>(null),
    [types, setTypes] = useState<Type[]>([]),
    [rooms, setRooms] = useState<Room[]>([]),
    [next, setNext] = useState<string | null>(null),
    [quota, setQuota] = useState<any>(null),
    [tab, setTab] = useState("rooms"),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [typeEdit, setTypeEdit] = useState<Type | null>(null),
    [roomEdit, setRoomEdit] = useState<Room | "new" | null>(null),
    [roomType, setRoomType] = useState(""),
    [inherit, setInherit] = useState(true),
    [checkEdit, setCheckEdit] = useState<Room | null>(null),
    [mode, setMode] = useState("pilot"),
    [preview, setPreview] = useState<Preview | null>(null),
    [confirmedCodes, setConfirmedCodes] = useState(false),
    [confirmedLayout, setConfirmedLayout] = useState(false),
    [search, setSearch] = useState("");
  const intent = useRef<{ fingerprint: string; key: string } | null>(null),
    generator = useRef<HTMLFormElement>(null);
  const manage = role === "Owner" || role === "Manager",
    checkAllowed = manage || role === "Operations";
  async function all(path: string) {
    let items: any[] = [],
      cursor: string | null = null;
    do {
      const data = await api(
        path +
          (path.includes("?") ? "&" : "?") +
          "limit=100" +
          (cursor ? "&after=" + cursor : ""),
      );
      items.push(...data.items);
      cursor = data.nextCursor;
    } while (cursor);
    return items;
  }
  async function refreshQuota() {
    if (role === "Owner")
      setQuota(await api("/organizations/" + org + "/subscriptions"));
  }
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    Promise.all([
      all("/organizations/" + org + "/properties"),
      role === "Owner"
        ? api("/organizations/" + org + "/subscriptions")
        : Promise.resolve(null),
    ])
      .then(([p, q]) => {
        if (active) {
          setLocations(p);
          setQuota(q);
          setLocation((old) =>
            p.some((x: Property) => x.id === old) ? old : (p[0]?.id ?? ""),
          );
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
  async function loadRooms(cursor?: string, query = search) {
    if (!location) return;
    const result = await api(
      "/organizations/" +
        org +
        "/rooms?propertyId=" +
        location +
        "&limit=25" +
        (cursor ? "&after=" + cursor : "") +
        (query ? "&search=" + encodeURIComponent(query) : ""),
    );
    setRooms((old) => (cursor ? [...old, ...result.items] : result.items));
    setNext(result.nextCursor);
  }
  async function refresh() {
    if (!location) return;
    const [p, t] = await Promise.all([
      api("/organizations/" + org + "/properties/" + location),
      all("/organizations/" + org + "/room-types?propertyId=" + location),
    ]);
    setProfile(p);
    setTypes(t);
    setSearch("");
    await loadRooms(undefined, "");
    await refreshQuota();
  }
  useEffect(() => {
    let active = true;
    setError("");
    setNotice("");
    setRoomEdit(null);
    setCheckEdit(null);
    setTypeEdit(null);
    setPreview(null);
    setProfile(null);
    setTypes([]);
    setRooms([]);
    setNext(null);
    setSearch("");
    intent.current = null;
    if (!location) return;
    setLoading(true);
    Promise.all([
      api("/organizations/" + org + "/properties/" + location),
      all("/organizations/" + org + "/room-types?propertyId=" + location),
      api(
        "/organizations/" + org + "/rooms?propertyId=" + location + "&limit=25",
      ),
    ])
      .then(([p, t, r]) => {
        if (active) {
          setProfile(p);
          setTypes(t);
          setRooms(r.items);
          setNext(r.nextCursor);
          setTab(!p.code || !p.floors || !p.segment ? "profile" : "rooms");
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
  }, [location]);
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
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn(new FormData(e.currentTarget));
      intent.current = null;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function command(path: string, body: unknown) {
    return api("/organizations/" + org + path, "POST", body, {
      "Idempotency-Key": key({ path, body }),
    });
  }
  function openRoom(r: Room | "new") {
    setRoomEdit(r);
    setCheckEdit(null);
    setRoomType(r === "new" ? (types[0]?.id ?? "") : r.typeId);
    setInherit(r === "new");
    intent.current = null;
    setError("");
  }
  const configured = Boolean(
      profile?.code && profile.floors && profile.segment,
    ),
    selectedType = types.find((t) => t.id === roomType),
    restricted =
      quota?.configured === false ||
      ["restricted", "cancelled"].includes(quota?.state);
  function bulkBody(data: FormData) {
    const typeId = String(data.get("typeId"));
    if (mode === "sequence")
      return {
        propertyId: location,
        typeId,
        prefix: String(data.get("prefix") ?? ""),
        startNumber: Number(data.get("startNumber")),
        count: Number(data.get("count")),
        floor: Number(data.get("floor")),
        padding: Number(data.get("padding")),
      };
    const rows = String(data.get("rows") ?? "")
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        const m = line.match(/^(.+),\s*(\d+)$/);
        if (!m)
          throw Error("Gunakan satu kode,lantai per baris, misalnya A01,1.");
        return { code: m[1].trim(), floor: Number(m[2]) };
      });
    return { mode, propertyId: location, typeId, rooms: rows };
  }
  return (
    <section
      id="inventory-section"
      className="account-section"
      aria-labelledby="inventory-title"
    >
      <article>
        <div className="section-heading">
          <div>
            <div className="eyebrow">INVENTORI KOST</div>
            <h2 id="inventory-title">Lokasi, tipe, dan kamar</h2>
          </div>
          <Button
            variant="outline"
            disabled={busy || !location}
            onClick={async () => {
              setBusy(true);
              setError("");
              setRoomEdit(null);
              setCheckEdit(null);
              setTypeEdit(null);
              setPreview(null);
              try {
                await refresh();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Muat ulang inventori
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
        {quota && (
          <div className="quota-box">
            {quota.configured ? (
              <>
                <div className="section-heading">
                  <strong>{quota.planLabel}</strong>
                  <span className="badge">
                    {quota.kind === "development"
                      ? "Lokal · bukan paket produksi"
                      : quota.state}
                  </span>
                </div>
                <div className="quota-grid">
                  <span>
                    <strong>
                      {quota.roomsUsed} / {quota.roomLimit}
                    </strong>{" "}
                    kamar
                  </span>
                  <span>
                    <strong>
                      {quota.propertiesUsed} / {quota.propertyLimit}
                    </strong>{" "}
                    lokasi
                  </span>
                  <span>
                    <strong>
                      {quota.staffUsed} / {quota.staffLimit}
                    </strong>{" "}
                    staf aktif
                  </span>
                </div>
                {restricted && (
                  <p className="alert">
                    Paket membatasi penambahan baru. Data lama dan checklist
                    tetap dapat diakses.
                  </p>
                )}
              </>
            ) : (
              <p className="alert">
                Paket belum dikonfigurasi. Penambahan kamar/lokasi memerlukan
                konfigurasi pengelola platform.
              </p>
            )}
          </div>
        )}
        {locations.length ? (
          <label>
            Lokasi inventori
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              disabled={busy}
            >
              {locations.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          !loading && (
            <p>
              Tambahkan lokasi terlebih dahulu sebelum menyiapkan tipe dan
              kamar.
            </p>
          )
        )}
        {loading ? (
          <p role="status">Memuat inventori…</p>
        ) : (
          profile && (
            <>
              <nav className="inventory-menu" aria-label="Menu inventori">
                {[
                  ["rooms", "Kamar"],
                  ["types", "Tipe kamar"],
                  ...(manage ? [["generator", "Generator kamar"]] : []),
                  ["profile", "Profil lokasi"],
                ].map(([id, label]) => (
                  <Button
                    key={id}
                    variant={tab === id ? "default" : "outline"}
                    disabled={busy}
                    aria-pressed={tab === id}
                    onClick={() => {
                      setTab(id);
                      setError("");
                      setNotice("");
                    }}
                  >
                    {label}
                  </Button>
                ))}
              </nav>
              {!configured && (
                <p className="alert">
                  Lengkapi kode lokasi, jumlah lantai, dan segmen penghuni
                  sebelum menambah kamar.
                  {role !== "Owner" ? " Minta Owner melengkapinya." : ""}
                </p>
              )}
              {tab === "profile" && (
                <div>
                  <h3>Profil lokasi untuk inventori</h3>
                  <p>
                    {profile.name} · {profile.city} · {profile.timezone}
                  </p>
                  {role === "Owner" ? (
                    <form
                      key={profile.id + ":" + profile.version}
                      aria-label="Profil lokasi inventori"
                      onSubmit={(e) =>
                        submit(e, async (d) => {
                          const payload = {
                            version: profile.version,
                            code: String(d.get("code")),
                            floors: Number(d.get("floors")),
                            segment: String(d.get("segment")),
                            address: String(d.get("address") ?? ""),
                            contactPhone: String(d.get("contactPhone") ?? ""),
                            contactEmail: String(d.get("contactEmail") ?? ""),
                          };
                          await command(
                            "/properties/" + location + "/profile",
                            payload,
                          );
                          await refresh();
                          setTab(types.length ? "rooms" : "types");
                          await onChanged();
                          setNotice(
                            "Profil lokasi tersimpan. Lanjutkan tipe dan kamar.",
                          );
                        })
                      }
                    >
                      <div className="form-grid">
                        <label>
                          Kode lokasi
                          <input
                            name="code"
                            defaultValue={profile.code ?? ""}
                            maxLength={32}
                            required
                          />
                        </label>
                        <label>
                          Jumlah lantai
                          <input
                            name="floors"
                            type="number"
                            min={1}
                            step={1}
                            defaultValue={profile.floors ?? ""}
                            required
                          />
                        </label>
                        <label>
                          Segmen penghuni
                          <select
                            name="segment"
                            defaultValue={profile.segment ?? ""}
                            required
                          >
                            <option value="">
                              Pilih sesuai kebijakan lokasi
                            </option>
                            <option>Mahasiswi</option>
                            <option>Karyawati</option>
                            <option>Mahasiswi & karyawati</option>
                          </select>
                        </label>
                        <label>
                          Kontak telepon (opsional)
                          <input
                            name="contactPhone"
                            defaultValue={profile.contactPhone ?? ""}
                            maxLength={60}
                          />
                        </label>
                        <label>
                          Email kontak (opsional)
                          <input
                            name="contactEmail"
                            type="email"
                            defaultValue={profile.contactEmail ?? ""}
                          />
                        </label>
                      </div>
                      <label>
                        Alamat detail (opsional)
                        <textarea
                          name="address"
                          defaultValue={profile.address ?? ""}
                          rows={3}
                          maxLength={1000}
                        />
                      </label>
                      <p className="small">
                        Isi data aktual. Alamat dan kontak belum dipublikasikan
                        pada tahap ini.
                      </p>
                      <Button disabled={busy}>Simpan profil lokasi</Button>
                    </form>
                  ) : (
                    <dl>
                      <dt>Kode lokasi</dt>
                      <dd>{profile.code ?? "Belum diisi"}</dd>
                      <dt>Jumlah lantai</dt>
                      <dd>{profile.floors ?? "Belum diisi"}</dd>
                      <dt>Segmen</dt>
                      <dd>{profile.segment ?? "Belum diisi"}</dd>
                    </dl>
                  )}
                </div>
              )}
              {tab === "types" && (
                <div className="staff-grid">
                  <div>
                    <h3>Tipe kamar lokasi ini</h3>
                    {types.length ? (
                      <ul className="member-list">
                        {types.map((t) => (
                          <li key={t.id}>
                            <strong>{t.name}</strong>
                            <span>
                              Kapasitas default {t.defaultCapacity} orang
                            </span>
                            <span>
                              {t.defaultFacilities.join(", ") ||
                                "Fasilitas belum dicatat"}
                            </span>
                            {manage && (
                              <Button
                                variant="outline"
                                disabled={busy}
                                onClick={() => {
                                  setTypeEdit(t);
                                  intent.current = null;
                                }}
                              >
                                Ubah tipe
                              </Button>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p>Belum ada tipe kamar di lokasi ini.</p>
                    )}
                  </div>
                  {manage && (
                    <div>
                      <h3>
                        {typeEdit ? "Ubah default tipe" : "Tambah tipe kamar"}
                      </h3>
                      <p className="small">
                        Perubahan default tidak menimpa kapasitas/fasilitas
                        kamar yang sudah ada.
                      </p>
                      <form
                        key={typeEdit?.id ?? "new"}
                        aria-label="Form tipe kamar"
                        onSubmit={(e) =>
                          submit(e, async (d) => {
                            const payload = {
                              name: String(d.get("name")),
                              defaultCapacity: Number(d.get("capacity")),
                              defaultFacilities: facilityList(
                                d.get("facilities"),
                              ),
                            };
                            await command(
                              typeEdit
                                ? "/room-types/" + typeEdit.id + "/update"
                                : "/room-types",
                              typeEdit
                                ? { ...payload, version: typeEdit.version }
                                : { ...payload, propertyId: location },
                            );
                            setTypeEdit(null);
                            await refresh();
                            setNotice(
                              "Tipe kamar tersimpan; kamar lama tidak diubah.",
                            );
                          })
                        }
                      >
                        <label>
                          Nama tipe kamar
                          <input
                            name="name"
                            defaultValue={typeEdit?.name ?? ""}
                            maxLength={100}
                            required
                          />
                        </label>
                        <label>
                          Kapasitas default
                          <input
                            name="capacity"
                            type="number"
                            min={1}
                            step={1}
                            defaultValue={typeEdit?.defaultCapacity ?? 1}
                            required
                          />
                        </label>
                        <label>
                          Fasilitas default (pisahkan dengan koma)
                          <textarea
                            name="facilities"
                            defaultValue={
                              typeEdit?.defaultFacilities.join(", ") ?? ""
                            }
                            rows={3}
                          />
                        </label>
                        <div className="actions">
                          <Button disabled={busy}>Simpan tipe kamar</Button>
                          {typeEdit && (
                            <Button
                              type="button"
                              variant="outline"
                              disabled={busy}
                              onClick={() => setTypeEdit(null)}
                            >
                              Batal ubah tipe
                            </Button>
                          )}
                        </div>
                      </form>
                    </div>
                  )}
                </div>
              )}
              {tab === "rooms" && (
                <div>
                  <div className="section-heading">
                    <h3>Daftar kamar ({rooms.length} dimuat)</h3>
                    {manage && (
                      <Button
                        disabled={
                          busy || !configured || !types.length || restricted
                        }
                        onClick={() => openRoom("new")}
                      >
                        Tambah kamar
                      </Button>
                    )}
                  </div>
                  <p className="small">
                    Kondisi fisik bukan ketersediaan sewa. Checklist lengkap
                    tidak otomatis menandai kamar siap.
                  </p>
                  <form
                    className="search-form"
                    onSubmit={(e) =>
                      submit(e, async () => {
                        await loadRooms(undefined, search);
                      })
                    }
                  >
                    <label>
                      Cari kode kamar
                      <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        maxLength={32}
                      />
                    </label>
                    <Button disabled={busy}>Cari kamar</Button>
                  </form>
                  {roomEdit && manage && (
                    <div className="access-editor">
                      <h3>
                        {roomEdit === "new"
                          ? "Tambah kamar individual"
                          : "Ubah kamar " + roomEdit.code}
                      </h3>
                      <form
                        key={roomEdit === "new" ? "new" : roomEdit.id}
                        aria-label="Form kamar"
                        onSubmit={(e) =>
                          submit(e, async (d) => {
                            const effectiveCapacity = inherit
                              ? selectedType?.defaultCapacity
                              : Number(d.get("capacity"));
                            const effectiveFacilities = inherit
                              ? selectedType?.defaultFacilities
                              : facilityList(d.get("facilities"));
                            const payload = {
                              code: String(d.get("code")),
                              floor: Number(d.get("floor")),
                              typeId: roomType,
                            };
                            await command(
                              roomEdit === "new"
                                ? "/rooms"
                                : "/rooms/" + roomEdit.id + "/update",
                              roomEdit === "new"
                                ? {
                                    ...payload,
                                    propertyId: location,
                                    ...(!inherit
                                      ? {
                                          capacity: effectiveCapacity,
                                          facilities: effectiveFacilities,
                                        }
                                      : {}),
                                  }
                                : {
                                    ...payload,
                                    version: roomEdit.version,
                                    capacity: effectiveCapacity,
                                    facilities: effectiveFacilities,
                                    condition: String(d.get("condition")),
                                    applyTypeDefaults: inherit,
                                    reason: String(d.get("reason")),
                                  },
                            );
                            setRoomEdit(null);
                            await refresh();
                            setNotice(
                              "Kamar tersimpan. Kondisi dan checklist perlu diperiksa sebelum siap disewakan.",
                            );
                          })
                        }
                      >
                        <div className="form-grid">
                          <label>
                            Kode kamar
                            <input
                              name="code"
                              defaultValue={
                                roomEdit === "new" ? "" : roomEdit.code
                              }
                              maxLength={32}
                              required
                            />
                          </label>
                          <label>
                            Lantai kamar
                            <input
                              name="floor"
                              type="number"
                              min={1}
                              max={profile.floors ?? undefined}
                              step={1}
                              defaultValue={
                                roomEdit === "new" ? 1 : roomEdit.floor
                              }
                              required
                            />
                          </label>
                          <label>
                            Tipe untuk kamar
                            <select
                              value={roomType}
                              onChange={(e) => setRoomType(e.target.value)}
                              required
                            >
                              {types.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                </option>
                              ))}
                            </select>
                          </label>
                          {roomEdit !== "new" && (
                            <label>
                              Kondisi fisik
                              <select
                                name="condition"
                                defaultValue={roomEdit.condition}
                              >
                                {Object.entries(conditions)
                                  .filter(([v]) => v !== "ready")
                                  .map(([v, label]) => (
                                    <option key={v} value={v}>
                                      {label}
                                    </option>
                                  ))}
                              </select>
                            </label>
                          )}
                        </div>
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={inherit}
                            onChange={(e) => setInherit(e.target.checked)}
                          />
                          {roomEdit === "new"
                            ? "Gunakan default kapasitas/fasilitas tipe"
                            : "Terapkan default terbaru tipe ke kamar ini"}
                        </label>
                        {inherit ? (
                          <p>
                            Kapasitas {selectedType?.defaultCapacity} ·{" "}
                            {selectedType?.defaultFacilities.join(", ") ||
                              "Fasilitas belum dicatat"}
                          </p>
                        ) : (
                          <>
                            <label>
                              Kapasitas kamar
                              <input
                                name="capacity"
                                type="number"
                                min={1}
                                step={1}
                                defaultValue={
                                  roomEdit === "new"
                                    ? selectedType?.defaultCapacity
                                    : roomEdit.capacity
                                }
                                required
                              />
                            </label>
                            <label>
                              Fasilitas kamar (pisahkan dengan koma)
                              <textarea
                                name="facilities"
                                defaultValue={
                                  roomEdit === "new"
                                    ? selectedType?.defaultFacilities.join(", ")
                                    : roomEdit.facilities.join(", ")
                                }
                                rows={3}
                              />
                            </label>
                          </>
                        )}
                        {roomEdit !== "new" && (
                          <label>
                            Alasan ubah kamar
                            <textarea
                              name="reason"
                              minLength={3}
                              maxLength={500}
                              required
                              rows={2}
                            />
                          </label>
                        )}
                        <div className="actions">
                          <Button disabled={busy}>Simpan kamar</Button>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={busy}
                            onClick={() => setRoomEdit(null)}
                          >
                            Batal ubah kamar
                          </Button>
                        </div>
                      </form>
                    </div>
                  )}
                  {checkEdit && checkAllowed && (
                    <div className="access-editor">
                      <h3>Checklist kamar {checkEdit.code}</h3>
                      <form
                        key={checkEdit.id + ":" + checkEdit.checklistVersion}
                        aria-label="Checklist kamar"
                        onSubmit={(e) =>
                          submit(e, async (d) => {
                            await command(
                              "/rooms/" + checkEdit.id + "/checklist",
                              {
                                version: checkEdit.checklistVersion,
                                roomVersion: checkEdit.version,
                                ...Object.fromEntries(
                                  Object.keys(checks).map((k) => [
                                    k,
                                    d.get(k) === "on",
                                  ]),
                                ),
                              },
                            );
                            setCheckEdit(null);
                            await refresh();
                            setNotice(
                              "Checklist tersimpan. Kamar belum otomatis ready atau tersedia.",
                            );
                          })
                        }
                      >
                        {Object.entries(checks).map(([k, label]) => (
                          <label key={k} className="checkbox-label">
                            <input
                              type="checkbox"
                              name={k}
                              defaultChecked={Boolean(
                                checkEdit[k as keyof Room],
                              )}
                            />
                            {label}
                          </label>
                        ))}
                        <div className="actions">
                          <Button disabled={busy}>Simpan checklist</Button>
                          <Button
                            variant="outline"
                            type="button"
                            disabled={busy}
                            onClick={() => setCheckEdit(null)}
                          >
                            Tutup checklist
                          </Button>
                        </div>
                      </form>
                    </div>
                  )}
                  {rooms.length ? (
                    <div className="room-grid">
                      {rooms.map((r) => (
                        <article className="room-card" key={r.id}>
                          <div className="section-heading">
                            <h4>Kamar {r.code}</h4>
                            <span className="badge">
                              {conditions[r.condition]}
                            </span>
                          </div>
                          <p>
                            Lantai {r.floor} · {r.typeName} · {r.capacity} orang
                          </p>
                          <p className="small">
                            {r.facilities.join(", ") ||
                              "Fasilitas belum dicatat"}
                          </p>
                          <p className="small">
                            {r.checklistComplete
                              ? "Checklist lengkap; menunggu proses kesiapan final"
                              : "Checklist belum lengkap"}
                          </p>
                          <div className="actions">
                            {manage && (
                              <Button
                                variant="outline"
                                disabled={busy}
                                onClick={() => openRoom(r)}
                              >
                                Ubah kamar
                              </Button>
                            )}
                            {checkAllowed && (
                              <Button
                                variant="outline"
                                disabled={busy}
                                onClick={() => {
                                  setCheckEdit(r);
                                  setRoomEdit(null);
                                  intent.current = null;
                                }}
                              >
                                Isi checklist
                              </Button>
                            )}
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p>
                      Belum ada kamar yang cocok. Buat kamar individual atau
                      gunakan generator setelah profil dan tipe lengkap.
                    </p>
                  )}
                  {next && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        try {
                          await loadRooms(next);
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Muat kamar lainnya
                    </Button>
                  )}
                </div>
              )}
              {tab === "generator" && manage && (
                <div>
                  <h3>Preview sebelum membuat kamar</h3>
                  <p>
                    Semua kamar baru mulai perlu inspeksi. Kode dan pembagian
                    lantai harus disesuaikan dengan denah aktual.
                  </p>
                  <form
                    ref={generator}
                    key={mode}
                    aria-label="Generator kamar"
                    onChange={() => {
                      setPreview(null);
                      setConfirmedCodes(false);
                      setConfirmedLayout(false);
                    }}
                    onSubmit={(e) =>
                      submit(e, async (d) => {
                        const result = await api(
                          "/organizations/" + org + "/rooms/bulk-preview",
                          "POST",
                          bulkBody(d),
                        );
                        setPreview(result);
                        setConfirmedCodes(false);
                        setConfirmedLayout(false);
                        if (result.alreadyApplied)
                          setNotice(
                            "Contoh pilot sudah pernah diterapkan. Tidak ada kamar baru yang dibuat.",
                          );
                      })
                    }
                  >
                    <label>
                      Mode generator
                      <select
                        value={mode}
                        onChange={(e) => {
                          setMode(e.target.value);
                          setPreview(null);
                        }}
                      >
                        <option value="pilot">
                          Contoh pilot: 12 kamar, 2 lantai
                        </option>
                        <option value="sequence">
                          Kode berurutan satu lantai
                        </option>
                        <option value="manual">
                          Daftar kode dan lantai manual
                        </option>
                      </select>
                    </label>
                    <label>
                      Tipe kamar generator
                      <select
                        name="typeId"
                        required
                        defaultValue={types[0]?.id ?? ""}
                      >
                        <option value="">Pilih tipe kamar</option>
                        {types.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {mode === "sequence" ? (
                      <div className="form-grid">
                        <label>
                          Awalan kode
                          <input name="prefix" maxLength={24} />
                        </label>
                        <label>
                          Nomor awal
                          <input
                            name="startNumber"
                            type="number"
                            min={1}
                            defaultValue={1}
                            required
                          />
                        </label>
                        <label>
                          Jumlah kamar
                          <input
                            name="count"
                            type="number"
                            min={1}
                            max={100}
                            defaultValue={1}
                            required
                          />
                        </label>
                        <label>
                          Lantai generator
                          <input
                            name="floor"
                            type="number"
                            min={1}
                            max={profile.floors ?? undefined}
                            defaultValue={1}
                            required
                          />
                        </label>
                        <label>
                          Jumlah digit nomor
                          <input
                            name="padding"
                            type="number"
                            min={1}
                            max={12}
                            defaultValue={3}
                            required
                          />
                        </label>
                      </div>
                    ) : (
                      <>
                        <label>
                          {mode === "pilot"
                            ? "Kode,lantai contoh pilot (dapat disesuaikan)"
                            : "Daftar kode,lantai (satu per baris)"}
                          <textarea
                            name="rows"
                            defaultValue={
                              mode === "pilot" ? pilotExample() : ""
                            }
                            rows={mode === "pilot" ? 12 : 5}
                            required
                          />
                        </label>
                        {mode === "pilot" && (
                          <p className="small">
                            101–106 dan 201–206, enam kamar per lantai, hanya
                            contoh. Periksa atau ubah daftar agar sesuai kondisi
                            aktual sebelum preview.
                          </p>
                        )}
                      </>
                    )}
                    <Button
                      disabled={
                        busy || !configured || !types.length || restricted
                      }
                    >
                      Buat preview kamar
                    </Button>
                  </form>
                  {preview && !preview.alreadyApplied && (
                    <div className="preview-box">
                      <h3>Preview {preview.rooms.length} kamar</h3>
                      <p>
                        {preview.typeName}; kapasitas/fasilitas mengikuti
                        snapshot tipe saat preview.
                      </p>
                      <div className="preview-room-grid">
                        {preview.rooms.map((r, i) => (
                          <div className="preview-room" key={r.code + ":" + i}>
                            <strong>{r.code}</strong>
                            <span>Lantai {r.floor}</span>
                            <span>{r.capacity} orang</span>
                          </div>
                        ))}
                      </div>
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={confirmedCodes}
                          onChange={(e) => setConfirmedCodes(e.target.checked)}
                        />
                        Saya sudah memeriksa kode kamar
                      </label>
                      <label className="checkbox-label">
                        <input
                          type="checkbox"
                          checked={confirmedLayout}
                          onChange={(e) => setConfirmedLayout(e.target.checked)}
                        />
                        Saya sudah memastikan lantai sesuai denah
                      </label>
                      <Button
                        disabled={busy || !confirmedCodes || !confirmedLayout}
                        onClick={async () => {
                          setBusy(true);
                          setError("");
                          try {
                            const result = await command("/rooms/bulk-commit", {
                              propertyId: location,
                              previewChecksum: preview.previewChecksum,
                              confirmCodes: true,
                              confirmLayout: true,
                            });
                            setPreview(null);
                            setTab("rooms");
                            await refresh();
                            intent.current = null;
                            setNotice(
                              result.created +
                                " kamar tersimpan dengan kondisi perlu inspeksi.",
                            );
                          } catch (e) {
                            setError((e as Error).message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        Simpan kamar dari preview
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </>
          )
        )}
      </article>
    </section>
  );
}
