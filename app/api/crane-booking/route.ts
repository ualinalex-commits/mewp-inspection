import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabase';

type RepeatType = 'none' | 'rest_of_week' | 'specific_days' | 'date_range';
type DayLabel = 'mon' | 'tue' | 'wed' | 'thu' | 'fri';

const DAY_NUM: Record<DayLabel, number> = { mon: 1, tue: 2, wed: 3, thu: 4, fri: 5 };

// ── Date utilities ────────────────────────────────────────────────────────────

function parseLocal(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function toStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shift(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function isWorkday(d: Date): boolean {
  const w = d.getDay();
  return w >= 1 && w <= 5;
}

// All Mon–Fri from `from` through Friday of that week.
function restOfWeekDates(from: string): string[] {
  const start = parseLocal(from);
  const dow = start.getDay();
  if (dow === 0 || dow === 6) return [];
  return Array.from({ length: 5 - dow + 1 }, (_, i) => toStr(shift(start, i)));
}

// Selected weekdays (1=Mon … 5=Fri) for 4 weeks starting from `from`.
function specificDaysDates(from: string, days: number[]): string[] {
  if (!days.length) return [];
  const start = parseLocal(from);
  const dow = start.getDay();
  const back = dow === 0 ? 6 : dow - 1;
  const monday = shift(start, -back);
  const result: string[] = [];
  for (let w = 0; w < 4; w++) {
    for (const day of [...days].sort((a, b) => a - b)) {
      const d = shift(monday, w * 7 + (day - 1));
      if (d >= start) result.push(toStr(d));
    }
  }
  return result;
}

// Every Mon–Fri between `from` and `to` inclusive.
function dateRangeDates(from: string, to: string): string[] {
  const start = parseLocal(from);
  const end = parseLocal(to);
  const result: string[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    if (isWorkday(cur)) result.push(toStr(new Date(cur)));
    cur.setDate(cur.getDate() + 1);
  }
  return result;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    console.log('crane-booking received body:', JSON.stringify(body, null, 2));

    const {
      site, crane, date, start_time, end_time,
      company, booking_details, status,
      repeat_type, repeat_until, repeat_days,
    } = body as {
      site: string;
      crane: string;
      date: string;
      start_time: string;
      end_time: string;
      company: string;
      booking_details?: string;
      status?: string;
      repeat_type?: RepeatType;
      repeat_until?: string;
      repeat_days?: DayLabel[];
    };

    if (!site || !crane || !date || !start_time || !end_time || !company) {
      return NextResponse.json(
        { error: 'Missing required fields: site, crane, date, start_time, end_time, company' },
        { status: 400 },
      );
    }

    // ── Insert original booking ──────────────────────────────────────────────────
    const { data: original, error: originalError } = await supabase
      .from('crane_bookings')
      .insert({
        site_id: site,
        crane,
        date,
        start_time,
        end_time,
        company,
        notes: booking_details ?? null,
        status: status ?? 'approved',
        created_by: 'api',
        is_repeat_copy: false,
      })
      .select('id')
      .single();

    if (originalError || !original) {
      console.error('crane-booking insert error:', originalError);
      return NextResponse.json(
        { error: originalError?.message ?? 'Insert failed' },
        { status: 500 },
      );
    }

    const parentId: string = original.id;
    const rtype: RepeatType = repeat_type ?? 'none';

    if (rtype === 'none') {
      return NextResponse.json({ success: true, created: 1, parent_id: parentId });
    }

    // ── Compute repeat dates (excluding the original date) ───────────────────────
    let allDates: string[] = [];

    if (rtype === 'rest_of_week') {
      allDates = restOfWeekDates(date);
    } else if (rtype === 'specific_days') {
      const dayNums = (repeat_days ?? []).map(d => DAY_NUM[d]).filter(Boolean);
      allDates = specificDaysDates(date, dayNums);
    } else if (rtype === 'date_range') {
      if (!repeat_until) {
        return NextResponse.json(
          { error: 'repeat_until is required for date_range repeat type' },
          { status: 400 },
        );
      }
      allDates = dateRangeDates(date, repeat_until);
    }

    const repeatDates = allDates.filter(d => d !== date);

    if (repeatDates.length === 0) {
      return NextResponse.json({ success: true, created: 1, parent_id: parentId });
    }

    // ── Batch insert repeat copies ───────────────────────────────────────────────
    const copies = repeatDates.map(d => ({
      site_id: site,
      crane,
      date: d,
      start_time,
      end_time,
      company,
      notes: booking_details ?? null,
      status: status ?? 'approved',
      created_by: 'api',
      is_repeat_copy: true,
      parent_booking_id: parentId,
    }));

    const { data: inserted, error: repeatError } = await supabase
      .from('crane_bookings')
      .insert(copies)
      .select('id');

    if (repeatError) {
      console.error('crane-booking repeat insert error:', repeatError);
      // Original succeeded — return 207 so the caller knows it was partial.
      return NextResponse.json(
        {
          error: `Original booking created but repeat inserts failed: ${repeatError.message}`,
          created: 1,
          parent_id: parentId,
        },
        { status: 207 },
      );
    }

    const totalCreated = 1 + (inserted?.length ?? 0);
    return NextResponse.json({ success: true, created: totalCreated, parent_id: parentId });
  } catch (error) {
    console.error('crane-booking unhandled error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
