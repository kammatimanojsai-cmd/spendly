import { route } from '@/lib/server/api';
import { query } from '@/lib/server/db';
import { buildIcs } from '@/lib/exporters';
import { occurrence } from '@/lib/recurrence';
import { formatMoney } from '@/lib/money';

// Bill reminders for any calendar app (Google, Apple, Outlook) with an alert N days before each due date.
export const GET = route(async ({ req, user }) => {
  const rules = await query(`SELECT * FROM sp_recurring WHERE user_id = $1 AND active AND mode = 'bill' ORDER BY id`, [user.id]);
  const host = new URL(req.url).host;
  const freq = { daily: 'DAILY', weekly: 'WEEKLY', monthly: 'MONTHLY', yearly: 'YEARLY' } as Record<string, string>;
  const ics = buildIcs(rules.map((r: any) => {
    const first = occurrence(r, r.next_index);
    const day = Number(r.start_date.slice(8));
    // a bill on the 31st means "last day of the month"; calendars would otherwise skip short months
    const byDay = r.freq === 'monthly' && day === 31 ? ';BYMONTHDAY=-1' : '';
    const until = r.end_date ? `;UNTIL=${r.end_date.replace(/-/g, '')}` : '';
    return {
      uid: `bill-${r.id}@${host}`,
      date: first,
      summary: `${r.title} — ${formatMoney(r.amount, user.currency)}`,
      description: `Spendly bill reminder. Mark it paid in Spendly when done.`,
      rrule: `FREQ=${freq[r.freq]};INTERVAL=${r.interval}${byDay}${until}`,
      alarmDaysBefore: r.remind_days,
    };
  }));
  return new Response(ics, { headers: {
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': 'attachment; filename="spendly-bills.ics"',
    'Cache-Control': 'no-store' } });
});
