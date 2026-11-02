import type { Policy } from "./pricing-schema.js";
import { DomainError } from "./security.js";
const date = (s: string) => new Date(s + "T00:00:00Z");
const iso = (d: Date) => d.toISOString().slice(0, 10);
export const daysBetween = (a: string, b: string) =>
  (+date(b) - +date(a)) / 86400000;
export function monthAnchor(start: string, months: number) {
  const d = date(start);
  const first = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1),
  );
  const last = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return iso(
    new Date(
      Date.UTC(
        first.getUTCFullYear(),
        first.getUTCMonth(),
        Math.min(d.getUTCDate(), last),
      ),
    ),
  );
}
const monthStart = (s: string) => s.slice(0, 8) + "01";
export function startOfLocalDate(s: string, zone: string) {
  let t = +date(s);
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let n = 0; n < 4; n++) {
    const p = Object.fromEntries(
      fmt.formatToParts(t).map((x) => [x.type, x.value]),
    );
    const local = Date.UTC(
      +p.year,
      +p.month - 1,
      +p.day,
      +p.hour,
      +p.minute,
      +p.second,
    );
    const delta = +date(s) - local;
    if (!delta) return new Date(t);
    t += delta;
  }
  throw new DomainError(422, "VALIDATION_ERROR");
}
export function halfUp(amount: number, numerator: number, denominator: number) {
  if (
    !Number.isSafeInteger(amount) ||
    amount < 0 ||
    !Number.isInteger(numerator) ||
    numerator < 0 ||
    !Number.isInteger(denominator) ||
    denominator < 1
  )
    throw new DomainError(422, "VALIDATION_ERROR");
  return Number(
    (BigInt(amount) * BigInt(numerator) * 2n + BigInt(denominator)) /
      (2n * BigInt(denominator)),
  );
}
export function discountLine(amount: number, discount: number) {
  if (!Number.isSafeInteger(discount) || discount < 0 || discount > amount)
    throw new DomainError(422, "VALIDATION_ERROR");
  return amount - discount;
}
export type QuoteLine = {
  kind: "rent" | "fee" | "deposit";
  code: string;
  label: string;
  amount: number;
  start: string;
  end: string;
  days: number;
  periodDays: number;
  refundable: boolean;
};
export function calculateQuote(
  p: Policy,
  rate: number,
  start: string,
  end?: string | null,
) {
  const initialEnd =
    p.cycle === "calendar"
      ? monthAnchor(monthStart(start), 1)
      : monthAnchor(start, 1);
  const until = end || initialEnd;
  const lines: QuoteLine[] = [];
  let cursor = start;
  let i = 0;
  while (cursor < until) {
    if (i >= 24) throw new DomainError(422, "QUOTE_RANGE_TOO_LONG");
    const periodStart =
      p.cycle === "calendar" ? monthStart(cursor) : monthAnchor(start, i);
    const periodEnd =
      p.cycle === "calendar"
        ? monthAnchor(periodStart, 1)
        : monthAnchor(start, i + 1);
    const segmentEnd = until < periodEnd ? until : periodEnd;
    const used = daysBetween(cursor, segmentEnd),
      total = daysBetween(periodStart, periodEnd);
    lines.push({
      kind: "rent",
      code: "rent",
      label: "Sewa",
      amount:
        p.cycle === "calendar" && p.prorata === "actual"
          ? halfUp(rate, used, total)
          : rate,
      start: cursor,
      end: segmentEnd,
      days: used,
      periodDays: total,
      refundable: false,
    });
    for (const f of p.fees)
      if (f.frequency === "monthly" || i === 0)
        lines.push({
          kind: "fee",
          code: f.code,
          label: f.label,
          amount: f.amount,
          start: cursor,
          end: segmentEnd,
          days: used,
          periodDays: total,
          refundable: f.refundable,
        });
    if (i === 0 && p.depositEnabled)
      lines.push({
        kind: "deposit",
        code: "deposit",
        label: "Deposit",
        amount: p.depositAmount,
        start: cursor,
        end: segmentEnd,
        days: used,
        periodDays: total,
        refundable: true,
      });
    cursor = segmentEnd;
    i++;
  }
  const total = lines.reduce((a, l) => a + l.amount, 0),
    initialTotal = lines
      .filter((l) => l.start === start)
      .reduce((a, l) => a + l.amount, 0);
  if (!Number.isSafeInteger(total))
    throw new DomainError(422, "VALIDATION_ERROR");
  if (p.bookingMinimum > initialTotal)
    throw new DomainError(422, "BOOKING_MINIMUM_EXCEEDS_INITIAL");
  return {
    currency: "IDR",
    start,
    end: until,
    initialPeriodOnly: !end,
    lines,
    total,
    initialTotal,
    bookingMinimum: p.bookingMinimum,
    remainingAfterBooking: initialTotal - p.bookingMinimum,
    checkinMinimum: Math.max(
      p.bookingMinimum,
      Number(
        (BigInt(initialTotal) * BigInt(p.checkinMinimumPercent) + 99n) / 100n,
      ),
    ),
    electricityMode: p.electricityMode,
    availabilityChecked: false,
  };
}
