import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { Api, Property } from "../lib/api-types.js";
import { Button } from "./ui/button.js";
type Rate = {
  id: string;
  version: number;
  effectiveAt: string;
  baseRent: number;
  config: any;
};
type Room = { id: string; code: string; typeId: string };
const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
const numbers = [
  ["baseRent", "Sewa dasar per bulan", 0, 1000000000000],
  ["dueDay", "Hari jatuh tempo", 1, 28],
  ["invoiceLeadDays", "Terbitkan tagihan berapa hari sebelumnya", 0, 30],
  ["bookingMinimum", "Minimum pembayaran booking", 0, 1000000000000],
  ["checkinMinimumPercent", "Minimum check-in (%)", 1, 100],
  ["holdHours", "Batas hold (jam)", 1, 168],
  ["reviewHours", "Tambahan review bukti (jam)", 1, 168],
  ["noticeDays", "Notice checkout (hari)", 0, 3650],
  ["cancellationDays", "Batas pembatalan sebelum masuk (hari)", 0, 3650],
  ["refundBeforePercent", "Refund sebelum batas (%)", 0, 100],
  ["refundLatePercent", "Refund sesudah batas (%)", 0, 100],
  ["noShowRefundPercent", "Refund tidak hadir (%)", 0, 100],
] as const;
function localInput(iso: string, zone: string) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: zone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map((x) => [x.type, x.value]),
  );
  return p.year + "-" + p.month + "-" + p.day + "T" + p.hour + ":" + p.minute;
}
function utcInput(value: string, zone: string) {
  const intended = Date.parse(value + "Z");
  let t = intended;
  for (let i = 0; i < 4; i++) {
    const rendered = Date.parse(
      localInput(new Date(t).toISOString(), zone) + "Z",
    );
    const delta = intended - rendered;
    if (delta === 0) return new Date(t).toISOString();
    t += delta;
  }
  throw Error("Waktu lokasi tidak valid.");
}
export function PricingWorkspace({
  api,
  org,
  role,
  propertyRevision,
  onQuoteCreated,
}: {
  api: Api;
  org: string;
  role: string;
  propertyRevision: number;
  onQuoteCreated?: (quote: any) => void;
}) {
  const [locations, setLocations] = useState<Property[]>([]),
    [location, setLocation] = useState(""),
    [rates, setRates] = useState<Rate[]>([]),
    [version, setVersion] = useState(0),
    [rooms, setRooms] = useState<Room[]>([]),
    [types, setTypes] = useState<{ id: string; name: string }[]>([]),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [edit, setEdit] = useState(false),
    [draft, setDraft] = useState<any>({}),
    [deposit, setDeposit] = useState(false),
    [penalty, setPenalty] = useState(false),
    [fees, setFees] = useState<any[]>([]),
    [typeRates, setTypeRates] = useState<Record<string, string>>({}),
    [roomRates, setRoomRates] = useState<Record<string, string>>({}),
    [quote, setQuote] = useState<any>(null),
    [quoteId, setQuoteId] = useState("");
  const loadGeneration = useRef(0);
  const intent = useRef<{ body: string; key: string } | null>(null);
  const canWrite = ["Owner", "Manager"].includes(role);
  const zone =
    locations.find((p) => p.id === location)?.timezone ?? "Asia/Jakarta";
  const base = "/organizations/" + org;
  async function all(path: string) {
    let rows: any[] = [];
    let after: string | null = null;
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
    let live = true;
    setLoading(true);
    all(base + "/properties")
      .then((p) => {
        if (live) {
          setLocations(p);
          setLocation((v) =>
            p.some((x) => x.id === v) ? v : (p[0]?.id ?? ""),
          );
        }
      })
      .catch((e) => live && setError(e.message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [org, propertyRevision]);
  async function load() {
    if (!location || !["Owner", "Manager", "Finance"].includes(role)) return;
    const generation = ++loadGeneration.current;
    setLoading(true);
    setError("");
    try {
      const [ps, rs, ts] = await Promise.all([
        all(base + "/rate-policies?propertyId=" + location),
        all(base + "/rooms?propertyId=" + location),
        all(base + "/room-types?propertyId=" + location),
      ]);
      if (generation !== loadGeneration.current) return;
      setRates(ps.sort((a, b) => b.version - a.version));
      setVersion(ps.reduce((a, p) => Math.max(a, p.version), 0));
      setRooms(rs);
      setTypes(ts);
    } catch (e) {
      if (generation === loadGeneration.current) setError((e as Error).message);
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }
  useEffect(() => {
    setEdit(false);
    setQuote(null);
    setQuoteId("");
    setNotice("");
    intent.current = null;
    void load();
    return () => {
      loadGeneration.current++;
    };
  }, [location, propertyRevision]);
  function begin() {
    const prev = rates[0];
    const d = prev ? { ...prev.config, baseRent: prev.baseRent } : {};
    setDraft(d);
    setDeposit(d.depositEnabled ?? false);
    setPenalty(d.penaltyEnabled ?? false);
    setFees(d.fees ?? []);
    setTypeRates(
      Object.fromEntries(
        Object.entries(d.typeRates ?? {}).map(([k, v]) => [k, String(v)]),
      ),
    );
    setRoomRates(
      Object.fromEntries(
        Object.entries(d.roomRates ?? {}).map(([k, v]) => [k, String(v)]),
      ),
    );
    setEdit(true);
    setNotice("");
    intent.current = null;
  }
  async function mutation(path: string, body: unknown) {
    const text = JSON.stringify({ path, body });
    if (intent.current?.body !== text)
      intent.current = { body: text, key: crypto.randomUUID() };
    const result = await api(base + path, "POST", body, {
      "Idempotency-Key": intent.current.key,
    });
    intent.current = null;
    return result;
  }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const f = new FormData(e.currentTarget),
        values: any = {};
      for (const [name] of numbers) values[name] = Number(f.get(name));
      const map = (rates: Record<string, string>) =>
        Object.fromEntries(
          Object.entries(rates)
            .filter(([, v]) => v !== "")
            .map(([id, v]) => [id, Number(v)]),
        );
      const body = {
        ...values,
        propertyId: location,
        expectedVersion: version,
        effectiveAt: utcInput(String(f.get("effectiveLocal")), zone),
        cycle: f.get("cycle"),
        prorata: f.get("prorata"),
        electricityMode: f.get("electricityMode"),
        depositEnabled: deposit,
        depositAmount: deposit ? Number(f.get("depositAmount")) : 0,
        penaltyEnabled: penalty,
        penaltyAmount: penalty ? Number(f.get("penaltyAmount")) : 0,
        penaltyCap: penalty ? Number(f.get("penaltyCap")) : 0,
        graceDays: penalty ? Number(f.get("graceDays")) : 0,
        notes: String(f.get("notes")),
        fees: fees.map((x) => ({ ...x, amount: Number(x.amount) })),
        typeRates: map(typeRates),
        roomRates: map(roomRates),
      };
      await mutation("/rate-policies", body);
      setEdit(false);
      setNotice("Versi kebijakan tersimpan. Quote lama tetap utuh.");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function preview(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const f = new FormData(e.currentTarget);
      const q = await mutation("/quotes", {
        roomId: f.get("roomId"),
        start: f.get("start"),
        end: f.get("end") || null,
        occupantCount: Number(f.get("occupantCount")),
      });
      setQuote(q);
      onQuoteCreated?.(q);
      setQuoteId(q.id);
      setNotice("Quote internal tersimpan; belum menjadi booking.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!["Owner", "Manager", "Finance"].includes(role)) return null;
  return (
    <section id="pricing-section" aria-label="Harga dan kebijakan">
      <article>
        <div className="section-heading">
          <div>
            <span className="eyebrow">TARIF SEWA</span>
            <h2>Harga, kebijakan, dan quote</h2>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => void load()}
            disabled={loading || busy}
          >
            Muat ulang harga
          </Button>
        </div>
        <p className="small">
          Isi harga dan kebijakan usaha yang sudah disepakati. Quote internal
          belum memeriksa ketersediaan, membuat booking, atau menerbitkan
          tagihan.
        </p>
        {error && (
          <p className="notice" role="alert">
            {error} Muat ulang atau periksa isian lalu coba lagi.
          </p>
        )}
        {notice && (
          <p className="notice" role="status">
            {notice}
          </p>
        )}
        {loading && <p role="status">Memuat harga…</p>}
        <label>
          Lokasi tarif
          <select
            value={location}
            onChange={(e) => {
              loadGeneration.current++;
              setRates([]);
              setRooms([]);
              setVersion(0);
              setLocation(e.target.value);
            }}
            disabled={busy}
          >
            <option value="">Pilih lokasi</option>
            {locations.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        {!locations.length && !loading && (
          <p>Tambahkan lokasi untuk mengatur tarif.</p>
        )}
        {location && (
          <>
            <p className="small">
              Zona waktu lokasi: {zone}. Versi terbaru: {version || "belum ada"}
              .
            </p>
            {canWrite && (
              <Button
                disabled={busy || loading || edit}
                type="button"
                onClick={begin}
              >
                Buat versi kebijakan
              </Button>
            )}
            {!rates.length && !loading && (
              <p>Belum ada kebijakan. Harga contoh tidak dipasang otomatis.</p>
            )}
            {edit && (
              <form aria-label="Form kebijakan harga" onSubmit={save}>
                <h3>Versi baru setelah versi {version}</h3>
                <p>
                  Prorata hanya untuk kalender; anniversary menagih periode
                  penuh. Semua isian angka harus Anda tentukan, termasuk nol.
                  Mengubah versi tidak mengubah quote atau transaksi lama.
                </p>
                <div className="grid">
                  <label>
                    Berlaku mulai (waktu lokasi)
                    <input
                      type="datetime-local"
                      name="effectiveLocal"
                      required
                    />
                  </label>
                  {numbers.map(([name, label, min, max]) => (
                    <label key={name}>
                      {label}
                      <input
                        type="number"
                        name={name}
                        min={min}
                        max={max}
                        step="1"
                        required
                        defaultValue={draft[name] ?? ""}
                      />
                    </label>
                  ))}
                  <label>
                    Siklus sewa
                    <select
                      name="cycle"
                      defaultValue={draft.cycle ?? ""}
                      required
                    >
                      <option value="">Pilih siklus</option>
                      <option value="anniversary">
                        Tanggal masuk (anniversary)
                      </option>
                      <option value="calendar">Bulan kalender</option>
                    </select>
                  </label>
                  <label>
                    Prorata sewa
                    <select
                      name="prorata"
                      defaultValue={draft.prorata ?? ""}
                      required
                    >
                      <option value="">Pilih prorata</option>
                      <option value="actual">
                        Kalender: hari aktual bulan
                      </option>
                      <option value="none">Tanpa prorata</option>
                    </select>
                  </label>
                  <label>
                    Listrik
                    <select
                      name="electricityMode"
                      defaultValue={draft.electricityMode ?? ""}
                      required
                    >
                      <option value="">Pilih pengaturan listrik</option>
                      <option value="prepaid_per_room">
                        Token per kamar dibayar penghuni
                      </option>
                      <option value="included">Termasuk sewa</option>
                      <option value="manual">Tagihan manual</option>
                    </select>
                  </label>
                </div>
                <label>
                  <input
                    type="checkbox"
                    checked={deposit}
                    onChange={(e) => setDeposit(e.target.checked)}
                  />
                  Aktifkan deposit
                </label>
                {deposit && (
                  <label>
                    Nominal deposit
                    <input
                      type="number"
                      name="depositAmount"
                      required
                      min="0"
                      max="1000000000000"
                      step="1"
                      defaultValue={draft.depositAmount ?? ""}
                    />
                  </label>
                )}
                <label>
                  <input
                    type="checkbox"
                    checked={penalty}
                    onChange={(e) => setPenalty(e.target.checked)}
                  />
                  Aktifkan denda
                </label>
                {penalty && (
                  <div className="grid">
                    {[
                      ["penaltyAmount", "Denda sekali per invoice"],
                      ["penaltyCap", "Batas maksimum denda"],
                      ["graceDays", "Grace denda (hari)"],
                    ].map(([name, label]) => (
                      <label key={name}>
                        {label}
                        <input
                          type="number"
                          name={name}
                          required
                          min={name === "graceDays" ? 0 : 1}
                          max={name === "graceDays" ? 3650 : 1000000000000}
                          step="1"
                          defaultValue={draft[name] ?? ""}
                        />
                      </label>
                    ))}
                  </div>
                )}
                <h4>Override tipe kamar</h4>
                <p className="small">
                  Kosong = mengikuti tarif lokasi. Nol adalah override gratis
                  yang eksplisit.
                </p>
                <div className="grid">
                  {types.map((t) => (
                    <label key={t.id}>
                      Tarif tipe {t.name}
                      <input
                        type="number"
                        min="0"
                        max="1000000000000"
                        step="1"
                        value={typeRates[t.id] ?? ""}
                        onChange={(e) =>
                          setTypeRates({ ...typeRates, [t.id]: e.target.value })
                        }
                      />
                    </label>
                  ))}
                </div>
                <details>
                  <summary>Override kamar individual</summary>
                  <div className="grid">
                    {rooms.map((r) => (
                      <label key={r.id}>
                        Tarif kamar {r.code}
                        <input
                          type="number"
                          min="0"
                          max="1000000000000"
                          step="1"
                          value={roomRates[r.id] ?? ""}
                          onChange={(e) =>
                            setRoomRates({
                              ...roomRates,
                              [r.id]: e.target.value,
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                </details>
                <h4>Biaya tambahan</h4>
                <p className="small">
                  Biaya bulanan tidak diprorata. Biaya sekali dan deposit hanya
                  pada awal. Token listrik prabayar tidak ditagih otomatis.
                </p>
                {fees.map((f, i) => (
                  <fieldset key={i}>
                    <legend>Biaya {i + 1}</legend>
                    <div className="grid">
                      {[
                        ["code", "Kode biaya"],
                        ["label", "Nama biaya"],
                        ["amount", "Nominal biaya"],
                      ].map(([key, label]) => (
                        <label key={key}>
                          {label} {i + 1}
                          <input
                            required
                            type={key === "amount" ? "number" : "text"}
                            min="0"
                            max={key === "amount" ? "1000000000000" : undefined}
                            step="1"
                            value={f[key]}
                            onChange={(e) =>
                              setFees(
                                fees.map((x, j) =>
                                  j === i ? { ...x, [key]: e.target.value } : x,
                                ),
                              )
                            }
                          />
                        </label>
                      ))}
                      <label>
                        Frekuensi biaya {i + 1}
                        <select
                          value={f.frequency}
                          onChange={(e) =>
                            setFees(
                              fees.map((x, j) =>
                                j === i
                                  ? { ...x, frequency: e.target.value }
                                  : x,
                              ),
                            )
                          }
                        >
                          <option value="once">Sekali</option>
                          <option value="monthly">Bulanan utuh</option>
                        </select>
                      </label>
                    </div>
                    <label>
                      <input
                        type="checkbox"
                        checked={f.refundable}
                        onChange={(e) =>
                          setFees(
                            fees.map((x, j) =>
                              j === i
                                ? { ...x, refundable: e.target.checked }
                                : x,
                            ),
                          )
                        }
                      />
                      Biaya {i + 1} dapat dikembalikan sesuai kebijakan
                    </label>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setFees(fees.filter((_, j) => i !== j))}
                    >
                      Hapus biaya {i + 1}
                    </Button>
                  </fieldset>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  disabled={fees.length >= 30}
                  onClick={() =>
                    setFees([
                      ...fees,
                      {
                        code: "",
                        label: "",
                        amount: "",
                        frequency: "once",
                        refundable: false,
                      },
                    ])
                  }
                >
                  Tambah biaya
                </Button>
                <label>
                  Catatan kebijakan
                  <textarea
                    name="notes"
                    maxLength={4000}
                    defaultValue={draft.notes ?? ""}
                  />
                </label>
                <div className="actions">
                  <Button disabled={busy || loading}>
                    Simpan versi kebijakan
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setEdit(false)}
                  >
                    Batal
                  </Button>
                </div>
              </form>
            )}
            <h3>Riwayat kebijakan</h3>
            <div className="grid">
              {rates.map((r) => (
                <div className="inventory-card" key={r.id}>
                  <h4>Versi {r.version}</h4>
                  <p>
                    Berlaku{" "}
                    {new Date(r.effectiveAt).toLocaleString("id-ID", {
                      timeZone: zone,
                    })}{" "}
                    ({zone})
                  </p>
                  <p>Sewa dasar {idr(r.baseRent)}</p>
                  <p>
                    {r.config.cycle === "calendar" ? "Kalender" : "Anniversary"}{" "}
                    ·{" "}
                    {r.config.cycle === "anniversary"
                      ? "periode penuh"
                      : r.config.prorata === "actual"
                        ? "prorata aktual"
                        : "tanpa prorata"}{" "}
                    · deposit{" "}
                    {r.config.depositEnabled
                      ? idr(r.config.depositAmount)
                      : "nonaktif"}
                  </p>
                  <details>
                    <summary>Detail kebijakan versi {r.version}</summary>
                    <dl>
                      {numbers
                        .filter(([n]) => n !== "baseRent")
                        .map(([n, label]) => (
                          <div key={n}>
                            <dt>{label}</dt>
                            <dd>{r.config[n]}</dd>
                          </div>
                        ))}
                      <dt>Listrik</dt>
                      <dd>{r.config.electricityMode}</dd>
                      <dt>Catatan</dt>
                      <dd>{r.config.notes || "—"}</dd>
                    </dl>
                    <p>
                      Denda{" "}
                      {r.config.penaltyEnabled
                        ? idr(r.config.penaltyAmount) +
                          "; cap " +
                          idr(r.config.penaltyCap) +
                          "; grace " +
                          r.config.graceDays +
                          " hari"
                        : "nonaktif"}
                    </p>
                    {r.config.fees.map((f: any) => (
                      <p key={f.code}>
                        {f.label}: {idr(f.amount)} (
                        {f.frequency === "monthly" ? "bulanan" : "sekali"})
                      </p>
                    ))}
                    {Object.entries(r.config.typeRates).map(([id, n]) => (
                      <p key={id}>
                        Tipe {types.find((t) => t.id === id)?.name ?? id}:{" "}
                        {idr(Number(n))}
                      </p>
                    ))}
                    {Object.entries(r.config.roomRates).map(([id, n]) => (
                      <p key={id}>
                        Kamar {rooms.find((t) => t.id === id)?.code ?? id}:{" "}
                        {idr(Number(n))}
                      </p>
                    ))}
                  </details>
                </div>
              ))}
            </div>
            {canWrite && (
              <>
                <form aria-label="Form quote internal" onSubmit={preview}>
                  <h3>Hitung quote internal</h3>
                  <div className="grid">
                    <label>
                      Kamar quote
                      <select name="roomId" required disabled={busy || loading}>
                        <option value="">Pilih kamar</option>
                        {rooms.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.code}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Tanggal masuk
                      <input type="date" name="start" required />
                    </label>
                    <label>
                      Tanggal akhir eksklusif (opsional)
                      <input type="date" name="end" />
                    </label>
                    <label>
                      Jumlah penghuni
                      <input
                        type="number"
                        name="occupantCount"
                        min="1"
                        max="100"
                        step="1"
                        required
                      />
                    </label>
                  </div>
                  <p className="small">
                    Akhir kosong menghitung periode awal saja. Tarif dipilih
                    pada tanggal masuk di zona lokasi; maksimal 24 periode.
                  </p>
                  <Button
                    disabled={busy || loading || !rooms.length || !rates.length}
                  >
                    Hitung dan simpan quote
                  </Button>
                </form>
                <form
                  aria-label="Buka quote tersimpan"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setBusy(true);
                    setError("");
                    try {
                      setQuote(await api(base + "/quotes/" + quoteId));
                    } catch (e) {
                      setError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <label>
                    ID quote tersimpan
                    <input
                      value={quoteId}
                      onChange={(e) => setQuoteId(e.target.value)}
                      required
                      pattern="[0-9a-fA-F-]{36}"
                    />
                  </label>
                  <Button disabled={busy} variant="outline">
                    Buka snapshot quote
                  </Button>
                </form>
              </>
            )}
            {quote && (
              <div aria-label="Hasil quote">
                <h3>Quote versi kebijakan {quote.snapshot.policyVersion}</h3>
                <p>
                  {quote.snapshot.initialPeriodOnly
                    ? "Periode awal saja"
                    : "Seluruh interval yang diminta"}{" "}
                  · {quote.snapshot.start} sampai {quote.snapshot.end} (akhir
                  eksklusif)
                </p>
                <p>
                  Tarif {idr(quote.snapshot.resolvedRent)} dari{" "}
                  {
                    (
                      { room: "kamar", type: "tipe", property: "lokasi" } as any
                    )[quote.snapshot.rateSource]
                  }
                  .
                </p>
                <p>
                  Berlaku sampai{" "}
                  {new Date(quote.expiresAt).toLocaleString("id-ID", {
                    timeZone: zone,
                  })}{" "}
                  ({zone}){quote.expired ? " · Kedaluwarsa" : ""}. Perubahan
                  kebijakan memerlukan quote dan persetujuan baru pada alur
                  booking mendatang.
                </p>
                <ul>
                  {quote.snapshot.lines.map((l: any, i: number) => (
                    <li key={i}>
                      {l.label} ({l.start}–{l.end}): {idr(l.amount)}
                      {l.kind === "rent"
                        ? " · " + l.days + "/" + l.periodDays + " hari"
                        : ""}
                    </li>
                  ))}
                </ul>
                <p>
                  <strong>Total quote: {idr(quote.snapshot.total)}</strong>
                </p>
                <p>
                  Total periode awal: {idr(quote.snapshot.initialTotal)}.
                  Minimum booking: {idr(quote.snapshot.bookingMinimum)}. Sisa
                  setelah minimum: {idr(quote.snapshot.remainingAfterBooking)}.
                  Minimum check-in: {idr(quote.snapshot.checkinMinimum)}.
                </p>
                <p className="small">
                  Belum ada pembayaran, invoice, reservasi, atau persetujuan
                  pelanggan.
                </p>
              </div>
            )}
          </>
        )}
      </article>
    </section>
  );
}
