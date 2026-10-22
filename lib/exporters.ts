// CSV and iCalendar builders (pure).

/** CSV cell escaping, with a guard against spreadsheet formula injection (=, +, -, @ at the start). */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]) {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

const icsEscape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Fold lines longer than 75 octets as required by RFC 5545. */
function fold(line: string) {
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch, 'utf8') > 75) { out.push(cur); cur = ' ' + ch; } else cur += ch;
  }
  out.push(cur);
  return out.join('\r\n');
}

export interface IcsEvent {
  uid: string;
  date: string;          // YYYY-MM-DD, all-day
  summary: string;
  description?: string;
  rrule?: string;        // e.g. FREQ=MONTHLY;INTERVAL=1
  alarmDaysBefore?: number;
}

export function buildIcs(events: IcsEvent[], stamp = new Date()) {
  const dt = stamp.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Spendly//Bill reminders//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Spendly bills'];
  for (const e of events) {
    const day = e.date.replace(/-/g, '');
    lines.push('BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${dt}`, `DTSTART;VALUE=DATE:${day}`, `SUMMARY:${icsEscape(e.summary)}`);
    if (e.description) lines.push(`DESCRIPTION:${icsEscape(e.description)}`);
    if (e.rrule) lines.push(`RRULE:${e.rrule}`);
    if (e.alarmDaysBefore !== undefined) {
      lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(e.summary)}`, `TRIGGER:-P${Math.max(0, e.alarmDaysBefore)}D`, 'END:VALARM');
    }
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
