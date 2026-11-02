import { useEffect, useRef, useState } from "react";
import type { Api, Property } from "../lib/api-types.js";
import { Button } from "./ui/button.js";
const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
const states: Record<string, string> = {
  pending: "Menunggu persetujuan",
  held: "Menunggu pembayaran minimum",
  confirmed: "Booking dikonfirmasi",
  rejected: "Ditolak",
  expired: "Kedaluwarsa",
  cancelled: "Dibatalkan",
};
export function BookingWorkspace({
  api,
  org,
  role,
  propertyRevision,
  quoteId: incomingQuote,
}: {
  api: Api;
  org: string;
  role: string;
  propertyRevision: number;
  quoteId: string;
}) {
  const base = "/organizations/" + org,
    write = ["Owner", "Manager"].includes(role),
    read = ["Owner", "Manager", "Finance"].includes(role);
  const [locations, setLocations] = useState<Property[]>([]),
    [location, setLocation] = useState(""),
    [rooms, setRooms] = useState<any[]>([]),
    [room, setRoom] = useState(""),
    [bookings, setBookings] = useState<any[]>([]),
    [invoices, setInvoices] = useState<any[]>([]),
    [notes, setNotes] = useState<any[]>([]),
    [customers, setCustomers] = useState<any[]>([]),
    [customer, setCustomer] = useState(""),
    [quoteId, setQuoteId] = useState(incomingQuote),
    [quote, setQuote] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const intent = useRef<{ text: string; key: string } | null>(null),
    generation = useRef(0);
  const zone =
    locations.find((p) => p.id === location)?.timezone ?? "Asia/Jakarta";
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
    if (!read) return;
    all(base + "/properties")
      .then((p) => {
        if (alive) {
          setLocations(p);
          setLocation((v) =>
            p.some((x) => x.id === v) ? v : (p[0]?.id ?? ""),
          );
        }
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [org, propertyRevision, role]);
  useEffect(() => {
    setQuoteId(incomingQuote);
    setQuote(null);
  }, [incomingQuote]);
  async function load() {
    if (!read || !location) return;
    const n = ++generation.current;
    setLoading(true);
    setError("");
    try {
      const [b, i, r, ns, cs] = await Promise.all([
        all(base + "/bookings?propertyId=" + location),
        all(base + "/invoices?propertyId=" + location),
        all(base + "/rooms?propertyId=" + location),
        all(base + "/notifications"),
        all(base + "/customers?propertyId=" + location),
      ]);
      if (n === generation.current) {
        setBookings(b);
        setInvoices(i);
        setRooms(r);
        setNotes(ns);
        setCustomers(cs);
        setRoom((v) => (r.some((x) => x.id === v) ? v : (r[0]?.id ?? "")));
      }
    } catch (e) {
      if (n === generation.current) setError((e as Error).message);
    } finally {
      if (n === generation.current) setLoading(false);
    }
  }
  useEffect(() => {
    setBookings([]);
    setInvoices([]);
    setRooms([]);
    setCustomer("");
    setQuote(null);
    setNotice("");
    void load();
    return () => {
      generation.current++;
    };
  }, [location, propertyRevision]);
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
  async function act(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!read) return null;
  return (
    <section id="booking-section" aria-label="Booking dan invoice">
      <article>
        <div className="section-heading">
          <div>
            <span className="eyebrow">RESERVASI PETUGAS</span>
            <h2>Booking dan invoice awal</h2>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={busy || loading}
            onClick={() => void load()}
          >
            Muat ulang booking
          </Button>
        </div>
        <p className="small">
          Permohonan belum menahan kamar. Persetujuan memeriksa ulang kesiapan
          dan interval serta menerbitkan invoice. Pembayaran belum dapat
          diverifikasi pada build ini.
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
        {loading && <p role="status">Memuat booking…</p>}
        <label>
          Lokasi booking
          <select
            value={location}
            disabled={busy}
            onChange={(e) => {
              generation.current++;
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
        {location && (
          <>
            {write && (
              <>
                <form
                  aria-label="Kesiapan awal kamar"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void act(async () => {
                      const r = rooms.find((r) => r.id === room);
                      await mutate("/rooms/" + room + "/initial-ready", {
                        version: r.version,
                        reason: f.get("reason"),
                      });
                      setNotice(
                        "Kesiapan awal kamar tercatat. Buat quote baru sesudah perubahan ini.",
                      );
                      await load();
                    });
                  }}
                >
                  <h3>Kesiapan awal kamar</h3>
                  <p className="small">
                    Isi checklist fisik di Inventori terlebih dahulu. Hanya
                    kamar inspeksi awal tanpa histori penghuni/lease atau
                    pekerjaan penghalang yang dapat diproses. Kamar setelah
                    dihuni memerlukan turnover tersendiri.
                  </p>
                  <label>
                    Kamar kesiapan awal
                    <select
                      value={room}
                      onChange={(e) => setRoom(e.target.value)}
                      disabled={busy || loading}
                    >
                      <option value="">Pilih kamar</option>
                      {rooms.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.code} ·{" "}
                          {r.condition === "ready"
                            ? "Siap"
                            : r.condition === "inspection"
                              ? "Perlu inspeksi"
                              : r.condition}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Alasan kesiapan awal
                    <textarea
                      name="reason"
                      required
                      minLength={3}
                      maxLength={1000}
                    />
                  </label>
                  <Button
                    disabled={
                      busy ||
                      loading ||
                      !room ||
                      rooms.find((r) => r.id === room)?.condition !==
                        "inspection"
                    }
                  >
                    Catat kesiapan awal
                  </Button>
                </form>
                <form
                  aria-label="Periksa quote untuk booking"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void act(async () => {
                      const q = await api(base + "/quotes/" + quoteId);
                      if (q.snapshot.propertyId !== location)
                        throw Error(
                          "Quote berasal dari lokasi lain. Pilih lokasi yang sesuai.",
                        );
                      if (q.expired)
                        throw Error("Quote kedaluwarsa. Hitung quote baru.");
                      setQuote(q);
                    });
                  }}
                >
                  <h3>Quote calon penghuni</h3>
                  <p className="small">
                    Hitung quote di Harga dan kebijakan. Quote terbaru otomatis
                    mengisi ID berikut; periksa rincian sebelum mencatat
                    konfirmasi calon penghuni.
                  </p>
                  <label>
                    ID quote booking
                    <input
                      value={quoteId}
                      onChange={(e) => {
                        setQuoteId(e.target.value);
                        setQuote(null);
                      }}
                      required
                      pattern="[0-9a-fA-F-]{36}"
                    />
                  </label>
                  <Button disabled={busy || loading}>
                    Periksa quote booking
                  </Button>
                </form>
                {quote && (
                  <div aria-label="Rincian quote booking">
                    <h4>Versi kebijakan {quote.snapshot.policyVersion}</h4>
                    <p>
                      {quote.snapshot.start} ·{" "}
                      {quote.snapshot.initialPeriodOnly
                        ? "Periode awal, sewa ongoing"
                        : "Akhir " + quote.snapshot.end + " eksklusif"}{" "}
                      · {quote.snapshot.occupantCount} penghuni
                    </p>
                    <ul>
                      {quote.snapshot.lines.map((l: any, i: number) => (
                        <li key={i}>
                          {l.label}: {idr(l.amount)} ({l.start}–{l.end})
                        </li>
                      ))}
                    </ul>
                    <p>
                      Total awal {idr(quote.snapshot.initialTotal)}; minimum
                      booking {idr(quote.snapshot.bookingMinimum)}; minimum
                      check-in {idr(quote.snapshot.checkinMinimum)}.
                    </p>
                    <p className="small">
                      Notice {quote.snapshot.policy.noticeDays} hari; batas
                      pembatalan {quote.snapshot.policy.cancellationDays} hari;
                      refund sebelum/sesudah batas{" "}
                      {quote.snapshot.policy.refundBeforePercent}%/
                      {quote.snapshot.policy.refundLatePercent}%; tidak hadir{" "}
                      {quote.snapshot.policy.noShowRefundPercent}%. Deposit{" "}
                      {quote.snapshot.policy.depositEnabled
                        ? idr(quote.snapshot.policy.depositAmount)
                        : "nonaktif"}
                      . Konfirmasi ini dicatat petugas, bukan penerimaan
                      perjanjian oleh akun penghuni.
                    </p>
                  </div>
                )}
                <form
                  aria-label="Permohonan booking petugas"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    void act(async () => {
                      if (!quote || quote.id !== quoteId)
                        throw Error("Periksa quote booking terlebih dahulu.");
                      const body: any = {
                        quoteId,
                        plannedMonths: Number(f.get("plannedMonths")),
                        policyAccepted: true,
                        consentNote: f.get("consentNote"),
                      };
                      if (customer) body.customerId = customer;
                      else
                        body.customer = {
                          name: f.get("name"),
                          phone: f.get("phone"),
                          ...(f.get("email") ? { email: f.get("email") } : {}),
                        };
                      await mutate("/bookings", body);
                      setNotice("Permohonan tersimpan; kamar belum ditahan.");
                      setQuote(null);
                      await load();
                    });
                  }}
                >
                  <h3>Catat permohonan</h3>
                  <label>
                    Pelanggan booking
                    <select
                      value={customer}
                      onChange={(e) => setCustomer(e.target.value)}
                    >
                      <option value="">Pelanggan baru</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} · {c.phone}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!customer && (
                    <div className="form-grid">
                      <label>
                        Nama calon penghuni
                        <input name="name" required maxLength={160} />
                      </label>
                      <label>
                        Kontak calon penghuni
                        <input
                          name="phone"
                          required
                          minLength={5}
                          maxLength={40}
                        />
                      </label>
                      <label>
                        Email calon penghuni (opsional)
                        <input name="email" type="email" maxLength={254} />
                      </label>
                    </div>
                  )}
                  <label>
                    Rencana lama sewa (bulan)
                    <input
                      name="plannedMonths"
                      type="number"
                      min="1"
                      max="60"
                      step="1"
                      required
                    />
                  </label>
                  <p className="small">
                    Rencana lama sewa tidak otomatis mengakhiri sewa ongoing.
                    Tanggal akhir komitmen mengikuti request quote yang
                    dikonfirmasi.
                  </p>
                  <label>
                    <input type="checkbox" required />
                    Saya telah menjelaskan biaya/kebijakan dan mencatat
                    konfirmasi calon penghuni
                  </label>
                  <label>
                    Catatan konfirmasi calon penghuni
                    <textarea
                      name="consentNote"
                      minLength={3}
                      maxLength={1000}
                      required
                    />
                  </label>
                  <Button disabled={busy || loading || !quote}>
                    Simpan permohonan booking
                  </Button>
                </form>
              </>
            )}
            <h3>Daftar booking</h3>
            {!bookings.length && !loading && (
              <p>Belum ada permohonan booking lokasi ini.</p>
            )}
            <div className="room-grid">
              {bookings.map((b) => (
                <div className="room-card" key={b.id}>
                  <h4>
                    {b.customerName} · Kamar {b.roomCode}
                  </h4>
                  <p>{states[b.state] ?? b.state}</p>
                  <p>
                    {b.start} sampai {b.end ?? "tanpa batas akhir"}; rencana{" "}
                    {b.plannedMonths} bulan
                  </p>
                  <p>
                    Total awal {idr(b.snapshot.pricing.initialTotal)}; minimum
                    booking {idr(b.snapshot.pricing.bookingMinimum)}
                  </p>
                  {b.holdDeadline && (
                    <p>
                      Batas hold{" "}
                      {new Date(b.holdDeadline).toLocaleString("id-ID", {
                        timeZone: zone,
                      })}{" "}
                      ({zone})
                    </p>
                  )}
                  {b.decisionReason && <p>Alasan: {b.decisionReason}</p>}
                  {write && b.state === "pending" && (
                    <>
                      <form
                        aria-label={"Keputusan booking " + b.id}
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = new FormData(e.currentTarget);
                          void act(async () => {
                            await mutate("/bookings/" + b.id + "/accept", {
                              version: b.version,
                              reason: f.get("reason"),
                            });
                            setNotice(
                              "Booking disetujui dan invoice awal terbit. Belum ada penerimaan uang.",
                            );
                            await load();
                          });
                        }}
                      >
                        <label>
                          Alasan keputusan booking
                          <textarea
                            name="reason"
                            minLength={3}
                            maxLength={1000}
                            required
                          />
                        </label>
                        <Button disabled={busy || loading}>
                          Setujui booking
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={busy || loading}
                          onClick={(e) => {
                            const form = e.currentTarget.closest("form")!;
                            if (!form.reportValidity()) return;
                            const f = new FormData(form);
                            void act(async () => {
                              await mutate("/bookings/" + b.id + "/reject", {
                                version: b.version,
                                reason: f.get("reason"),
                              });
                              setNotice(
                                "Permohonan ditolak dengan histori tersimpan.",
                              );
                              await load();
                            });
                          }}
                        >
                          Tolak permohonan
                        </Button>
                      </form>
                      <details>
                        <summary>Perbarui quote dan konfirmasi</summary>
                        <form
                          aria-label={"Perbarui quote booking " + b.id}
                          onSubmit={(e) => {
                            e.preventDefault();
                            const f = new FormData(e.currentTarget);
                            void act(async () => {
                              await mutate(
                                "/bookings/" + b.id + "/refresh-quote",
                                {
                                  version: b.version,
                                  quoteId: f.get("quoteId"),
                                  policyAccepted: true,
                                  consentNote: f.get("consentNote"),
                                },
                              );
                              setNotice(
                                "Quote dan konfirmasi baru tersimpan; tinjau sebelum menyetujui.",
                              );
                              await load();
                            });
                          }}
                        >
                          <label>
                            ID quote pengganti
                            <input
                              name="quoteId"
                              required
                              pattern="[0-9a-fA-F-]{36}"
                            />
                          </label>
                          <label>
                            <input type="checkbox" required />
                            Calon penghuni sudah mengonfirmasi ulang rincian
                            quote baru
                          </label>
                          <label>
                            Catatan konfirmasi ulang
                            <textarea
                              name="consentNote"
                              required
                              minLength={3}
                              maxLength={1000}
                            />
                          </label>
                          <Button disabled={busy || loading} variant="outline">
                            Perbarui quote booking
                          </Button>
                        </form>
                      </details>
                    </>
                  )}
                </div>
              ))}
            </div>
            <h3>Invoice awal</h3>
            {!invoices.length && !loading && (
              <p>Belum ada invoice awal lokasi ini.</p>
            )}
            <div className="room-grid">
              {invoices.map((i) => (
                <div className="room-card" key={i.id}>
                  <h4>{i.number}</h4>
                  <p>
                    {i.billTo.name} ·{" "}
                    {i.state === "void" ? "Dibatalkan" : "Diterbitkan"}
                  </p>
                  <p>
                    Total {idr(i.total)}; saldo {idr(i.balance)}; penerimaan
                    terverifikasi {idr(i.verifiedReceived)}
                  </p>
                  <p>
                    {i.state === "void"
                      ? "Invoice void"
                      : i.total === 0
                        ? "Saldo nol, tanpa penerimaan uang"
                        : i.paymentStatus === "overdue"
                          ? "Lewat jatuh tempo"
                          : "Belum dibayar"}
                    . Batas bayar{" "}
                    {new Date(i.dueAt).toLocaleString("id-ID", {
                      timeZone: zone,
                    })}{" "}
                    ({zone})
                  </p>
                  <ul>
                    {i.lines.map((l: any) => (
                      <li key={l.id}>
                        {l.label}: {idr(l.amount)}
                      </li>
                    ))}
                  </ul>
                  {i.voidReason && <p>Alasan void: {i.voidReason}</p>}
                </div>
              ))}
            </div>
            <h3>Notifikasi in-app</h3>
            <p className="small">
              Klik Muat ulang booking untuk mengambil notifikasi yang diproses
              worker. Ini bukan bukti pengiriman email pelanggan.
            </p>
            {!notes.length && <p>Belum ada notifikasi untuk akun ini.</p>}
            <ul>
              {notes.map((n) => (
                <li key={n.id}>
                  {n.title} ·{" "}
                  {new Date(n.createdAt).toLocaleString("id-ID", {
                    timeZone: zone,
                  })}
                </li>
              ))}
            </ul>
          </>
        )}
      </article>
    </section>
  );
}
