import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Api, Property } from "../lib/api-types.js";
import { Button } from "./ui/button.js";
type Room = { id: string; code: string };
type Block = {
  id: string;
  start: string;
  end: string | null;
  reason: string;
  state: string;
  version: number;
  releaseReason: string | null;
};
const reasonLabel: Record<string, string> = {
  ROOM_NOT_READY: "Kamar belum siap secara fisik",
  ALLOCATION_CONFLICT: "Ada alokasi atau blokir yang bertabrakan",
  ACTIVE_PRESENCE: "Penghuni masih tercatat berada di kamar",
};
export function AllocationWorkspace({
  api,
  org,
  role,
  propertyRevision,
}: {
  api: Api;
  org: string;
  role: string;
  propertyRevision: number;
}) {
  const [locations, setLocations] = useState<Property[]>([]),
    [location, setLocation] = useState(""),
    [rooms, setRooms] = useState<Room[]>([]),
    [room, setRoom] = useState(""),
    [blocks, setBlocks] = useState<Block[]>([]),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [availability, setAvailability] = useState<any>(null);
  const base = "/organizations/" + org;
  const write = ["Owner", "Manager"].includes(role);
  const epoch = useRef(0),
    intent = useRef<{ text: string; key: string } | null>(null);
  const zone =
    locations.find((l) => l.id === location)?.timezone ?? "Asia/Jakarta";
  async function all(path: string) {
    let after: string | null = null;
    const rows: any[] = [];
    do {
      const r = await api(
        path +
          (path.includes("?") ? "&" : "?") +
          "limit=100" +
          (after ? "&after=" + after : ""),
      );
      rows.push(...r.items);
      after = r.nextCursor;
    } while (after);
    return rows;
  }
  useEffect(() => {
    let alive = true;
    all(base + "/properties")
      .then((rows) => {
        if (alive) {
          setLocations(rows);
          setLocation((v) =>
            rows.some((l) => l.id === v) ? v : (rows[0]?.id ?? ""),
          );
        }
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [org, propertyRevision]);
  async function loadRooms() {
    if (!location) return;
    const n = ++epoch.current;
    setLoading(true);
    setError("");
    try {
      const rows = await all(base + "/rooms?propertyId=" + location);
      if (n === epoch.current) {
        setRooms(rows);
        setRoom((v) =>
          rows.some((r) => r.id === v) ? v : (rows[0]?.id ?? ""),
        );
      }
    } catch (e) {
      if (n === epoch.current) setError((e as Error).message);
    } finally {
      if (n === epoch.current) setLoading(false);
    }
  }
  useEffect(() => {
    setAvailability(null);
    setBlocks([]);
    void loadRooms();
    return () => {
      epoch.current++;
    };
  }, [location, propertyRevision]);
  async function loadBlocks() {
    if (!room) return;
    const n = ++epoch.current;
    setLoading(true);
    setError("");
    try {
      const rows = await all(base + "/rooms/" + room + "/blocks");
      if (n === epoch.current) setBlocks(rows);
    } catch (e) {
      if (n === epoch.current) setError((e as Error).message);
    } finally {
      if (n === epoch.current) setLoading(false);
    }
  }
  useEffect(() => {
    setAvailability(null);
    setNotice("");
    setBlocks([]);
    intent.current = null;
    void loadBlocks();
    return () => {
      epoch.current++;
    };
  }, [room]);
  async function mutate(path: string, body: unknown) {
    const text = JSON.stringify({ path, body });
    if (intent.current?.text !== text)
      intent.current = { text, key: crypto.randomUUID() };
    const r = await api(base + path, "POST", body, {
      "Idempotency-Key": intent.current.key,
    });
    intent.current = null;
    return r;
  }
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const f = new FormData(form);
      await mutate("/rooms/" + room + "/blocks", {
        start: f.get("start"),
        end: f.get("end") || null,
        reason: f.get("reason"),
      });
      setNotice("Blokir tersimpan. Kondisi fisik kamar tetap.");
      setAvailability(null);
      form.reset();
      await loadBlocks();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function check(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const f = new FormData(e.currentTarget);
      const query = new URLSearchParams({ start: String(f.get("start")) });
      if (f.get("end")) query.set("end", String(f.get("end")));
      setAvailability(
        await api(base + "/rooms/" + room + "/availability?" + query),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section id="allocation-section" aria-label="Blokir dan ketersediaan">
      <article>
        <div className="section-heading">
          <div>
            <span className="eyebrow">KALENDER KAMAR</span>
            <h2>Blokir dan ketersediaan</h2>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={busy || loading}
            onClick={async () => {
              await loadRooms();
              await loadBlocks();
            }}
          >
            Muat ulang kalender
          </Button>
        </div>
        <p className="small">
          Kondisi fisik, alokasi tanggal, dan keberadaan penghuni diperiksa
          terpisah. Pemeriksaan ini tidak membuat reservasi. Kamar perlu
          inspeksi tetap belum dapat disewakan.
        </p>
        {error && (
          <p className="notice" role="alert">
            {error} Periksa isian atau muat ulang lalu coba lagi.
          </p>
        )}
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        {loading && <p role="status">Memuat kalender…</p>}
        <div className="form-grid">
          <label>
            Lokasi kalender
            <select
              value={location}
              disabled={busy}
              onChange={(e) => {
                epoch.current++;
                setRooms([]);
                setRoom("");
                setLocation(e.target.value);
              }}
            >
              <option value="">Pilih lokasi</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Kamar kalender
            <select
              value={room}
              disabled={busy || loading}
              onChange={(e) => {
                epoch.current++;
                setRoom(e.target.value);
              }}
            >
              <option value="">Pilih kamar</option>
              {rooms.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!rooms.length && !loading && (
          <p>
            Belum ada kamar yang dapat diperiksa. Tambahkan kamar lalu muat
            ulang kalender.
          </p>
        )}
        {room && (
          <>
            <p className="small">
              Tanggal mengikuti lokasi {zone}; akhir eksklusif. Akhir kosong
              berarti tanpa batas akhir, bukan hanya satu bulan.
            </p>
            <form aria-label="Periksa ketersediaan" onSubmit={check}>
              <h3>Periksa interval</h3>
              <div className="form-grid">
                <label>
                  Tanggal mulai pemeriksaan
                  <input name="start" type="date" required />
                </label>
                <label>
                  Tanggal akhir pemeriksaan (opsional)
                  <input name="end" type="date" />
                </label>
              </div>
              <Button disabled={busy || loading}>
                Periksa ketersediaan kamar
              </Button>
            </form>
            {availability && (
              <div aria-label="Hasil ketersediaan">
                <h3>
                  {availability.available
                    ? "Interval tersedia saat diperiksa"
                    : "Belum tersedia"}
                </h3>
                <p>
                  {availability.start} sampai{" "}
                  {availability.end ?? "tanpa batas akhir"}. Diperiksa{" "}
                  {new Date(availability.checkedAt).toLocaleString("id-ID", {
                    timeZone: zone,
                  })}{" "}
                  ({zone}).
                </p>
                <ul>
                  {availability.reasons.map((r: string) => (
                    <li key={r}>{reasonLabel[r] ?? r}</li>
                  ))}
                </ul>
                <p className="small">
                  Hasil pemeriksaan tidak menahan kamar. Ketersediaan akan
                  diperiksa kembali saat booking.
                </p>
              </div>
            )}
            {write && (
              <form aria-label="Form blokir kamar" onSubmit={create}>
                <h3>Tambah blokir operasional</h3>
                <div className="form-grid">
                  <label>
                    Tanggal mulai blokir
                    <input name="start" type="date" required />
                  </label>
                  <label>
                    Tanggal akhir blokir (opsional)
                    <input name="end" type="date" />
                  </label>
                </div>
                <label>
                  Alasan blokir
                  <textarea
                    name="reason"
                    required
                    minLength={3}
                    maxLength={1000}
                  />
                </label>
                <p className="small">
                  Blokir ditolak bila ada alokasi bertabrakan atau penghuni yang
                  masih berada di kamar. Konflik tidak dapat diabaikan.
                </p>
                <Button disabled={busy || loading}>Simpan blokir kamar</Button>
              </form>
            )}
            <h3>Riwayat blokir</h3>
            {!blocks.length && !loading && <p>Belum ada blokir kamar ini.</p>}
            <div className="room-grid">
              {blocks.map((b) => (
                <div className="room-card" key={b.id}>
                  <h4>
                    {b.state === "active" ? "Blokir aktif" : "Blokir dilepas"}
                  </h4>
                  <p>
                    {b.start} sampai {b.end ?? "tanpa batas akhir"}
                  </p>
                  <p>{b.reason}</p>
                  {b.releaseReason && (
                    <p>Alasan pelepasan: {b.releaseReason}</p>
                  )}
                  {write && b.state === "active" && (
                    <form
                      aria-label={"Lepas blokir " + b.start}
                      onSubmit={async (e) => {
                        e.preventDefault();
                        const f = new FormData(e.currentTarget);
                        setBusy(true);
                        setError("");
                        try {
                          await mutate("/room-blocks/" + b.id + "/release", {
                            version: b.version,
                            reason: f.get("reason"),
                          });
                          setAvailability(null);
                          setNotice(
                            "Blokir dilepas; histori dan kondisi fisik tetap tersimpan.",
                          );
                          await loadBlocks();
                        } catch (e) {
                          setError((e as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      <label>
                        Alasan lepas blokir
                        <textarea
                          name="reason"
                          minLength={3}
                          maxLength={1000}
                          required
                        />
                      </label>
                      <Button disabled={busy || loading} variant="outline">
                        Lepas blokir
                      </Button>
                    </form>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </article>
    </section>
  );
}
