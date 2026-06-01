'use client';

import { useState, useEffect, useMemo, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '../../lib/supabase';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from 'recharts';

type CraneLog = {
  site: string;
  crane: string;
  company: string;
  status: string;
  date: string;
  start_time: string;
  end_time: string;
  supervisor_name: string;
  load_description: string;
};

type SortDir = 'asc' | 'desc';

const BRAND = '#d02a35';
const COLORS = [
  BRAND, '#2563eb', '#16a34a', '#ea580c',
  '#7c3aed', '#0891b2', '#be185d', '#ca8a04', '#0f766e', '#9333ea',
];
const DEFAULT_DAY_START_MINS = 480;  // 08:00
const DEFAULT_DAY_END_MINS   = 1080; // 18:00

const LOG_COLS: { key: string; label: string }[] = [
  { key: 'date', label: 'Date' },
  { key: 'site', label: 'Site' },
  { key: 'crane', label: 'Crane' },
  { key: 'supervisor', label: 'Supervisor' },
  { key: 'company', label: 'Company' },
  { key: 'load', label: 'Load Description' },
  { key: 'status', label: 'Status' },
  { key: 'start', label: 'Start Time' },
  { key: 'end', label: 'End Time' },
  { key: 'duration', label: 'Duration' },
];

function parseMins(start: string | null, end: string | null): number {
  if (!start || !end) return 0;
  const s = new Date(start.replace(' ', 'T'));
  const e = new Date(end.replace(' ', 'T'));
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return 0;
  return Math.max(0, (e.getTime() - s.getTime()) / 60000);
}

function fmtMins(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function fmtTime(dt: string | null): string {
  if (!dt) return '—';
  const d = new Date(dt.replace(' ', 'T'));
  if (isNaN(d.getTime())) return dt;
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function fmtDateLong(d: string): string {
  const [y, mo, day] = d.split('-');
  const mNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${parseInt(day)} ${mNames[parseInt(mo) - 1]} ${y}`;
}

function shortDate(d: string): string {
  const [, mo, day] = d.split('-');
  const mNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${parseInt(day)} ${mNames[parseInt(mo) - 1]}`;
}

// Convert Supabase TIME string "HH:MM:SS" → minutes from midnight
function timeStrToMins(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

// Extract time-of-day minutes from a datetime string like "2024-01-15 18:30:00"
function dtToTimeMins(dt: string | null): number {
  if (!dt) return 0;
  const d = new Date(dt.replace(' ', 'T'));
  if (isNaN(d.getTime())) return 0;
  return d.getHours() * 60 + d.getMinutes();
}

// Format minutes-from-midnight as "HH:MM"
function minsToTimeStr(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function isoMonthStart(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function isoMonthEnd(): string {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return last.toISOString().slice(0, 10);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BarTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '0.5rem 0.75rem', boxShadow: '0 4px 12px rgba(0,0,0,0.12)', fontSize: '0.8rem', minWidth: '130px' }}>
      <div style={{ fontWeight: 700, marginBottom: '0.3rem', color: '#111827' }}>{label}</div>
      {payload.map((p: { name: string; value: number; color?: string }, i: number) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', color: '#374151' }}>
          <span style={{ color: p.color ?? '#374151' }}>{p.name}</span>
          <strong>{fmtMins(p.value)}</strong>
        </div>
      ))}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PieTip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const { name, value } = payload[0];
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '0.5rem 0.75rem', boxShadow: '0 4px 12px rgba(0,0,0,0.12)', fontSize: '0.8rem' }}>
      <div style={{ fontWeight: 700, color: '#111827', marginBottom: '0.15rem' }}>{name}</div>
      <div style={{ color: '#6b7280' }}>{fmtMins(value)}</div>
    </div>
  );
}

function StatCard({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ background: '#fff', borderRadius: '12px', padding: '1rem 1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
      <div style={{ fontSize: '1.45rem', fontWeight: 800, color: '#111827', lineHeight: 1, wordBreak: 'break-word' }}>{value}</div>
      <div style={{ fontSize: '0.67rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '0.45rem' }}>{label}</div>
    </div>
  );
}

function ChartCard({ title, sub, children, fullWidth, style }: { title: string; sub?: string; children: React.ReactNode; fullWidth?: boolean; style?: React.CSSProperties }) {
  return (
    <div style={{ background: '#fff', borderRadius: '12px', padding: '1.25rem 1.25rem 1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', gridColumn: fullWidth ? '1 / -1' : undefined, ...style }}>
      <div style={{ fontSize: '0.73rem', fontWeight: 800, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{title}</div>
      <div style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: '0.1rem', marginBottom: '1.1rem' }}>{sub ?? ' '}</div>
      {children}
    </div>
  );
}

function PieLegend({ data, total }: { data: { name: string; value: number }[]; total: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.38rem', justifyContent: 'center' }}>
      {data.map((item, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', fontSize: '0.72rem' }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS[i % COLORS.length], flexShrink: 0 }} />
          <span style={{ flex: 1, color: '#374151', wordBreak: 'break-word' }}>{item.name}</span>
          <span style={{ color: '#6b7280', flexShrink: 0, marginLeft: '0.25rem' }}>{fmtMins(item.value)}</span>
          <span style={{ color: '#9ca3af', flexShrink: 0, minWidth: '30px', textAlign: 'right' }}>
            {total > 0 ? `${Math.round((item.value / total) * 100)}%` : '0%'}
          </span>
        </div>
      ))}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  background: '#f9fafb',
  border: '2px solid #e5e7eb',
  borderRadius: '8px',
  color: '#111827',
  padding: '0.55rem 0.75rem',
  fontSize: '0.9rem',
  fontFamily: 'system-ui, sans-serif',
  outline: 'none',
  cursor: 'pointer',
  width: '100%',
};

const inputStyle: React.CSSProperties = {
  background: '#f9fafb',
  border: '2px solid #e5e7eb',
  borderRadius: '8px',
  color: '#111827',
  padding: '0.55rem 0.75rem',
  fontSize: '0.9rem',
  fontFamily: 'system-ui, sans-serif',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.67rem',
  fontWeight: 700,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  display: 'block',
  marginBottom: '0.3rem',
};

const thBase: React.CSSProperties = {
  padding: '0.6rem 0.75rem',
  textAlign: 'left',
  fontSize: '0.67rem',
  fontWeight: 700,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  whiteSpace: 'nowrap',
  borderBottom: '2px solid #f3f4f6',
  background: '#fff',
};

const tdBase: React.CSSProperties = {
  padding: '0.55rem 0.75rem',
  fontSize: '0.82rem',
  color: '#374151',
  whiteSpace: 'nowrap',
  borderBottom: '1px solid #f3f4f6',
};

function CraneAnalyticsContent() {
  const searchParams = useSearchParams();
  const [startDate, setStartDate] = useState(isoMonthStart());
  const [endDate, setEndDate] = useState(isoMonthEnd());
  const [site, setSite] = useState('');
  const [crane, setCrane] = useState('');
  const [lockedSiteName, setLockedSiteName] = useState<string | null>(null);
  const [siteParamResolved, setSiteParamResolved] = useState(false);
  const [dayStartMins, setDayStartMins] = useState(DEFAULT_DAY_START_MINS);
  const [dayEndMins, setDayEndMins] = useState(DEFAULT_DAY_END_MINS);
  const [rows, setRows] = useState<CraneLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [pdfLoading, setPdfLoading] = useState(false);

  const chartWorkingByDay = useRef<HTMLDivElement>(null);
  const chartIdleByCrane = useRef<HTMLDivElement>(null);
  const chartIdleByDay = useRef<HTMLDivElement>(null);
  const chartByCompany = useRef<HTMLDivElement>(null);
  const chartByStatus = useRef<HTMLDivElement>(null);

  const effectiveSite = lockedSiteName ?? site;

  useEffect(() => {
    const siteId = searchParams?.get('siteId');
    console.log('[crane-analytics] siteId from URL:', siteId);
    if (!siteId) { setSiteParamResolved(true); return; }
    supabase
      .from('crane_logs_sites')
      .select('site_name, day_start_time, day_end_time')
      .eq('id', siteId)
      .single()
      .then(({ data, error: err }) => {
        console.log('[crane-analytics] crane_logs_sites lookup result:', { data, err });
        if (data?.site_name) setLockedSiteName(data.site_name);
        if (data?.day_start_time) setDayStartMins(timeStrToMins(data.day_start_time));
        if (data?.day_end_time) setDayEndMins(timeStrToMins(data.day_end_time));
        setSiteParamResolved(true);
      });
  }, [searchParams]);

  // Fetch hours for dropdown-selected site
  useEffect(() => {
    if (lockedSiteName) return;
    if (!site) {
      setDayStartMins(DEFAULT_DAY_START_MINS);
      setDayEndMins(DEFAULT_DAY_END_MINS);
      return;
    }
    supabase
      .from('crane_logs_sites')
      .select('day_start_time, day_end_time')
      .eq('site_name', site)
      .single()
      .then(({ data }) => {
        setDayStartMins(data?.day_start_time ? timeStrToMins(data.day_start_time) : DEFAULT_DAY_START_MINS);
        setDayEndMins(data?.day_end_time   ? timeStrToMins(data.day_end_time)   : DEFAULT_DAY_END_MINS);
      });
  }, [site, lockedSiteName]);

  useEffect(() => {
    if (!siteParamResolved) return;
    setLoading(true);
    setError(null);
    let query = supabase
      .from('crane_logs')
      .select('site, crane, company, status, date, start_time, end_time, supervisor_name, load_description')
      .gte('date', startDate)
      .lte('date', endDate);
    if (lockedSiteName) query = query.eq('site', lockedSiteName);
    query.then(({ data, error: err }) => {
      setLoading(false);
      if (err) { setError(err.message); return; }
      setRows((data as CraneLog[]) ?? []);
    });
  }, [startDate, endDate, siteParamResolved, lockedSiteName]);

  const sites = useMemo(
    () => Array.from(new Set(rows.map(r => r.site).filter(Boolean))).sort(),
    [rows]
  );

  const cranes = useMemo(() => {
    const base = effectiveSite ? rows.filter(r => r.site === effectiveSite) : rows;
    return Array.from(new Set(base.map(r => r.crane).filter(Boolean))).sort();
  }, [rows, effectiveSite]);

  useEffect(() => {
    if (crane && !cranes.includes(crane)) setCrane('');
  }, [cranes, crane]);

  const filtered = useMemo(() => {
    let d = rows.filter(r => r.start_time && r.end_time);
    if (effectiveSite) d = d.filter(r => r.site === effectiveSite);
    if (crane) d = d.filter(r => r.crane === crane);
    return d;
  }, [rows, effectiveSite, crane]);

  // Per-crane, per-day working minutes map
  const craneDay = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const r of filtered) {
      if (!map[r.crane]) map[r.crane] = {};
      map[r.crane][r.date] = (map[r.crane][r.date] ?? 0) + parseMins(r.start_time, r.end_time);
    }
    return map;
  }, [filtered]);

  // Per-crane, per-day latest lift end time in minutes-from-midnight (for overtime detection)
  const craneDayMaxEnd = useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    for (const r of filtered) {
      if (!map[r.crane]) map[r.crane] = {};
      const endMins = dtToTimeMins(r.end_time);
      map[r.crane][r.date] = Math.max(map[r.crane][r.date] ?? 0, endMins);
    }
    return map;
  }, [filtered]);

  const stats = useMemo(() => {
    let totalMins = 0;
    let totalIdleMins = 0;
    let totalIdlePctSum = 0;
    let totalCraneDayPairs = 0;
    const craneCounts: Record<string, number> = {};
    const dayMins: Record<string, number> = {};

    for (const r of filtered) {
      const m = parseMins(r.start_time, r.end_time);
      totalMins += m;
      craneCounts[r.crane] = (craneCounts[r.crane] ?? 0) + 1;
      dayMins[r.date] = (dayMins[r.date] ?? 0) + m;
    }
    for (const [craneName, days] of Object.entries(craneDay)) {
      for (const [date, working] of Object.entries(days)) {
        const maxEnd = craneDayMaxEnd[craneName]?.[date] ?? dayEndMins;
        const window = Math.max(dayEndMins, maxEnd) - dayStartMins;
        const idle = Math.max(0, window - working);
        totalIdleMins += idle;
        totalIdlePctSum += window > 0 ? (idle / window) * 100 : 0;
        totalCraneDayPairs++;
      }
    }

    const totalLifts = filtered.length;
    const avgMins = totalLifts > 0 ? totalMins / totalLifts : 0;
    const avgDailyIdlePct = totalCraneDayPairs > 0 ? totalIdlePctSum / totalCraneDayPairs : 0;
    const topCrane = Object.entries(craneCounts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? '—';
    const busiestDay = Object.entries(dayMins).sort(([, a], [, b]) => b - a)[0]?.[0];

    return {
      totalLifts,
      totalMins,
      avgMins,
      topCrane,
      totalIdleMins,
      avgDailyIdlePct,
      busiestDayFmt: busiestDay ? shortDate(busiestDay) : '—',
    };
  }, [filtered, craneDay, craneDayMaxEnd, dayStartMins, dayEndMins]);

  const workingByDay = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of filtered) {
      map[r.date] = (map[r.date] ?? 0) + parseMins(r.start_time, r.end_time);
    }
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, mins]) => ({ date: shortDate(date), mins: Math.round(mins) }));
  }, [filtered]);

  const idleByDay = useMemo(() => {
    const map: Record<string, number> = {};
    for (const [craneName, days] of Object.entries(craneDay)) {
      for (const [date, working] of Object.entries(days)) {
        const maxEnd = craneDayMaxEnd[craneName]?.[date] ?? dayEndMins;
        const window = Math.max(dayEndMins, maxEnd) - dayStartMins;
        map[date] = (map[date] ?? 0) + Math.max(0, window - working);
      }
    }
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, idle]) => ({ date: shortDate(date), idle: Math.round(idle) }));
  }, [craneDay, craneDayMaxEnd, dayStartMins, dayEndMins]);

  const idleByCrane = useMemo(() => {
    return Object.entries(craneDay)
      .map(([craneName, days]) => {
        const vals = Object.entries(days).map(([date, working]) => {
          const maxEnd = craneDayMaxEnd[craneName]?.[date] ?? dayEndMins;
          const window = Math.max(dayEndMins, maxEnd) - dayStartMins;
          return { working, window };
        });
        const avgWorking = Math.round(vals.reduce((a, b) => a + b.working, 0) / vals.length);
        const avgWindow  = Math.round(vals.reduce((a, b) => a + b.window,  0) / vals.length);
        return { crane: craneName, working: avgWorking, idle: Math.max(0, avgWindow - avgWorking), window: avgWindow };
      })
      .sort((a, b) => b.idle - a.idle)
      .slice(0, 16);
  }, [craneDay, craneDayMaxEnd, dayStartMins, dayEndMins]);

  const byCompany = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of filtered) {
      const k = r.company?.trim();
      if (!k) continue;
      map[k] = (map[k] ?? 0) + parseMins(r.start_time, r.end_time);
    }
    return Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([name, value]) => ({ name, value: Math.round(value) }));
  }, [filtered]);

  const byStatus = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of filtered) {
      const k = r.status?.trim() || 'Unknown';
      map[k] = (map[k] ?? 0) + parseMins(r.start_time, r.end_time);
    }
    return Object.entries(map)
      .sort(([, a], [, b]) => b - a)
      .map(([name, value]) => ({ name, value: Math.round(value) }));
  }, [filtered]);

  const dailyBreakdown = useMemo(() => {
    type Row = {
      date: string; crane: string; lifts: number; workingMins: number;
      firstLift: string | null; lastLift: string | null;
    };
    const map: Record<string, Row> = {};
    for (const r of filtered) {
      const key = `${r.date}__${r.crane}`;
      if (!map[key]) map[key] = { date: r.date, crane: r.crane, lifts: 0, workingMins: 0, firstLift: null, lastLift: null };
      map[key].lifts++;
      map[key].workingMins += parseMins(r.start_time, r.end_time);
      if (!map[key].firstLift || r.start_time < map[key].firstLift!) map[key].firstLift = r.start_time;
      if (!map[key].lastLift || r.end_time > map[key].lastLift!) map[key].lastLift = r.end_time;
    }
    return Object.values(map)
      .sort((a, b) => a.date.localeCompare(b.date) || a.crane.localeCompare(b.crane))
      .map(row => {
        const w = Math.round(row.workingMins);
        const maxEnd = craneDayMaxEnd[row.crane]?.[row.date] ?? dayEndMins;
        const window = Math.max(dayEndMins, maxEnd) - dayStartMins;
        const idle = Math.max(0, window - w);
        return { ...row, workingMins: w, idleMins: idle, idlePct: window > 0 ? Math.round((idle / window) * 100) : 0 };
      });
  }, [filtered, craneDayMaxEnd, dayStartMins, dayEndMins]);

  const sortedLogs = useMemo(() => {
    const base = rows.filter(r => (!effectiveSite || r.site === effectiveSite) && (!crane || r.crane === crane));
    return [...base].sort((a, b) => {
      let va: string | number = '';
      let vb: string | number = '';
      if (sortCol === 'date')       { va = a.date ?? '';              vb = b.date ?? ''; }
      else if (sortCol === 'site')  { va = a.site ?? '';              vb = b.site ?? ''; }
      else if (sortCol === 'crane') { va = a.crane ?? '';             vb = b.crane ?? ''; }
      else if (sortCol === 'supervisor') { va = a.supervisor_name ?? ''; vb = b.supervisor_name ?? ''; }
      else if (sortCol === 'company')    { va = a.company ?? '';         vb = b.company ?? ''; }
      else if (sortCol === 'load')       { va = a.load_description ?? ''; vb = b.load_description ?? ''; }
      else if (sortCol === 'status')     { va = a.status ?? '';           vb = b.status ?? ''; }
      else if (sortCol === 'start')      { va = a.start_time ?? '';       vb = b.start_time ?? ''; }
      else if (sortCol === 'end')        { va = a.end_time ?? '';         vb = b.end_time ?? ''; }
      else if (sortCol === 'duration')   { va = parseMins(a.start_time, a.end_time); vb = parseMins(b.start_time, b.end_time); }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [rows, effectiveSite, crane, sortCol, sortDir]);

  const downloadPDF = useCallback(async () => {
    setPdfLoading(true);
    try {
      const { jsPDF } = await import('jspdf');
      const html2canvas = (await import('html2canvas')).default;

      const doc  = new jsPDF('l', 'mm', 'a4');
      const PW   = doc.internal.pageSize.getWidth();   // 297
      const PH   = doc.internal.pageSize.getHeight();  // 210
      const mg   = 12;
      const cW   = PW - mg * 2;                        // 273
      const hW   = (cW - 5) / 2;                       // 134 — half-width for side-by-side
      const HDR_H     = 6.5;
      const ROW_H     = 5.5;
      const LOG_ROW_H = 5;
      const STAT_H    = 15;
      const bottomEdge = PH - mg - 11;
      const footerY    = PH - 5;

      // ── Convert hex colour to RGB ─────────────────────────────────
      const hexRgb = (hex: string) => {
        const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 128, g: 128, b: 128 };
      };

      // ── Clip text to fit a column (mm width → approx char count) ──
      const clip = (s: string, maxMm: number, cw = 1.75): string => {
        if (!s) return '—';
        const max = Math.floor(maxMm / cw);
        return s.length > max ? s.substring(0, max - 1) + '…' : s;
      };

      // ── Brand-red section heading ─────────────────────────────────
      const secHdr = (label: string, y: number): number => {
        doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor('#d02a35');
        doc.text(label, mg, y);
        return y + 5;
      };

      // ── Table header — y0 = top of header rect; returns top of 1st data row ──
      const tblHdr = (hs: string[], ws: number[], x0: number, y0: number): number => {
        const tw = ws.reduce((a, b) => a + b, 0);
        doc.setFillColor(243, 244, 246);
        doc.rect(x0, y0, tw, HDR_H, 'F');
        doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor('#6b7280');
        let x = x0;
        hs.forEach((h, i) => { doc.text(h.toUpperCase(), x + 1.5, y0 + HDR_H - 1.5); x += ws[i]; });
        doc.setDrawColor('#e5e7eb'); doc.setLineWidth(0.3);
        doc.line(x0, y0 + HDR_H, x0 + tw, y0 + HDR_H);
        return y0 + HDR_H; // top of first data row
      };

      // ── Table body row — y0 = top of this row rect ────────────────
      const tblRow = (cells: string[], ws: number[], x0: number, y0: number, rowH: number, even: boolean) => {
        if (even) {
          doc.setFillColor(249, 250, 251);
          doc.rect(x0, y0, ws.reduce((a, b) => a + b, 0), rowH, 'F');
        }
        doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor('#374151');
        let x = x0;
        cells.forEach((cell, i) => { doc.text(clip(cell, ws[i] - 3), x + 1.5, y0 + rowH - 1.5); x += ws[i]; });
      };

      // ── Capture a chart div as PNG ────────────────────────────────
      const captureChart = async (ref: React.RefObject<HTMLDivElement | null>) => {
        if (!ref.current) return null;
        const canvas = await html2canvas(ref.current, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
        return { data: canvas.toDataURL('image/png'), w: canvas.width, h: canvas.height };
      };

      // ── Add image, returns rendered height in mm ──────────────────
      const placeImg = (img: { data: string; w: number; h: number }, x: number, y: number, w: number): number => {
        const h = w * (img.h / img.w);
        doc.addImage(img.data, 'PNG', x, y, w, h);
        return h;
      };

      // ── Stamp "ProLifting Software" + "Page X of Y" on every page ─
      const stampFooters = () => {
        const total = doc.getNumberOfPages();
        for (let p = 1; p <= total; p++) {
          doc.setPage(p);
          doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor('#9ca3af');
          doc.text('ProLifting Software', mg, footerY);
          const pt = `Page ${p} of ${total}`;
          doc.text(pt, PW - mg - doc.getTextWidth(pt), footerY);
        }
      };

      // Computed totals (local so closure is always fresh)
      const coTotal = byCompany.reduce((s, r) => s + r.value, 0);
      const stTotal = byStatus.reduce((s, r) => s + r.value, 0);
      const siteName = effectiveSite || 'All Sites';

      // ══════════════════════════════════════════════════════════════
      // PAGE 1 — COVER BAND + STAT GRID + DAILY BREAKDOWN
      // ══════════════════════════════════════════════════════════════

      // Full-width red header band
      doc.setFillColor(208, 42, 53);
      doc.rect(0, 0, PW, 52, 'F');

      // Title
      doc.setTextColor('#ffffff');
      doc.setFont('helvetica', 'bold'); doc.setFontSize(22);
      doc.text('Crane Log Analytics Report', mg, 21);

      // Site · crane · period
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
      const subParts = [siteName, ...(crane ? [`Crane: ${crane}`] : []), `${fmtDateLong(startDate)} — ${fmtDateLong(endDate)}`];
      doc.text(subParts.join('   ·   '), mg, 32);

      // Top-right: branding
      doc.setFontSize(8); doc.setTextColor('#fca5a5');
      const proTxt = 'ProLifting Software';
      doc.text(proTxt, PW - mg - doc.getTextWidth(proTxt), 10);

      // Bottom-right: generated date
      const genTxt = `Generated ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`;
      doc.text(genTxt, PW - mg - doc.getTextWidth(genTxt), 48);

      let y = 60;

      // ── Stat grid: 4 columns × 2 rows ──────────────────────────────
      const statItems = [
        { label: 'Total Logs',        value: stats.totalLifts.toLocaleString() },
        { label: 'Total Working Time', value: fmtMins(stats.totalMins) },
        { label: 'Total Idle Time',    value: fmtMins(stats.totalIdleMins) },
        { label: 'Avg Log Duration',   value: fmtMins(stats.avgMins) },
        { label: 'Avg Daily Idle %',   value: `${Math.round(stats.avgDailyIdlePct)}%` },
        { label: 'Most Active Crane',  value: stats.topCrane },
        { label: 'Busiest Day',        value: stats.busiestDayFmt },
      ];
      const COLS = 4;
      const scW  = cW / COLS;
      for (let i = 0; i < statItems.length; i++) {
        const col = i % COLS;
        const row = Math.floor(i / COLS);
        const sx = mg + col * scW;
        const sy = y + row * STAT_H;
        doc.setFillColor(249, 250, 251); doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.25);
        doc.roundedRect(sx + 1, sy, scW - 2, STAT_H - 1, 1.5, 1.5, 'FD');
        doc.setFontSize(13); doc.setFont('helvetica', 'bold'); doc.setTextColor('#111827');
        doc.text(clip(statItems[i].value, scW - 6, 2.0), sx + 3.5, sy + 7);
        doc.setFontSize(6); doc.setFont('helvetica', 'normal'); doc.setTextColor('#6b7280');
        doc.text(statItems[i].label.toUpperCase(), sx + 3.5, sy + 11.5);
      }
      y += Math.ceil(statItems.length / COLS) * STAT_H + 3;

      // Thin red accent line
      doc.setFillColor(208, 42, 53);
      doc.rect(mg, y, cW, 0.5, 'F');
      y += 5;

      // ── Daily Breakdown table ────────────────────────────────────────
      y = secHdr('DAILY BREAKDOWN', y);
      const dbHs = ['Date', 'Crane', 'Logs', 'Working', 'Idle', 'Idle %', 'First Log', 'Last Log'];
      const dbWs = [40, 65, 18, 34, 28, 24, 32, 32]; // 273mm total
      y = tblHdr(dbHs, dbWs, mg, y);
      for (let i = 0; i < dailyBreakdown.length; i++) {
        if (y > bottomEdge) { doc.addPage(); y = mg; y = tblHdr(dbHs, dbWs, mg, y); }
        const r = dailyBreakdown[i];
        tblRow([fmtDateLong(r.date), r.crane, String(r.lifts), fmtMins(r.workingMins),
          fmtMins(r.idleMins), `${r.idlePct}%`, fmtTime(r.firstLift), fmtTime(r.lastLift)],
          dbWs, mg, y, ROW_H, i % 2 === 1);
        y += ROW_H;
      }

      // ══════════════════════════════════════════════════════════════
      // PAGE 2 — CHARTS (side by side)
      // ══════════════════════════════════════════════════════════════
      doc.addPage(); y = mg;
      y = secHdr('CHARTS', y);

      // Capture all charts in parallel
      const [imgWbD, imgIbD, imgIbC, imgCo, imgSt] = await Promise.all([
        captureChart(chartWorkingByDay),
        captureChart(chartIdleByDay),
        captureChart(chartIdleByCrane),
        captureChart(chartByCompany),
        captureChart(chartByStatus),
      ]);

      // Row 1: Working by Day (left) | Idle by Day (right)
      let r1H = 0;
      if (imgWbD) r1H = Math.max(r1H, placeImg(imgWbD, mg,          y, hW));
      if (imgIbD) r1H = Math.max(r1H, placeImg(imgIbD, mg + hW + 5, y, hW));
      y += r1H + 5;

      // Row 2: Idle by Crane (left) | blank right
      if (imgIbC) { y += placeImg(imgIbC, mg, y, hW) + 5; }

      // ══════════════════════════════════════════════════════════════
      // PAGE 3 — COMPANY & STATUS BREAKDOWN
      // ══════════════════════════════════════════════════════════════
      doc.addPage(); y = mg;

      const drawAllocationSection = (
        label: string,
        img: { data: string; w: number; h: number } | null,
        items: { name: string; value: number }[],
        total: number,
        yStart: number
      ): number => {
        let ly = secHdr(label, yStart);
        const imgH = img ? placeImg(img, mg, ly, hW) : 0;
        // Right-side table
        const tX = mg + hW + 5;
        const tW = hW;
        doc.setFontSize(6.5); doc.setFont('helvetica', 'bold'); doc.setTextColor('#6b7280');
        doc.text('COMPANY / STATUS', tX + 1.5, ly + 4);
        doc.text('TIME',  tX + tW * 0.62, ly + 4);
        doc.text('SHARE', tX + tW * 0.83, ly + 4);
        doc.setDrawColor('#e5e7eb'); doc.setLineWidth(0.3);
        doc.line(tX, ly + 5.5, tX + tW, ly + 5.5);
        let ty = ly + 10;
        items.forEach((item, i) => {
          if (ty > ly + imgH + 5) return;
          const { r: cr, g: cg, b: cb } = hexRgb(COLORS[i % COLORS.length]);
          doc.setFillColor(cr, cg, cb);
          doc.rect(tX + 1.5, ty - 2.5, 3, 3, 'F');
          doc.setFontSize(7); doc.setFont('helvetica', 'normal'); doc.setTextColor('#374151');
          const pct = total > 0 ? Math.round((item.value / total) * 100) : 0;
          doc.text(clip(item.name, tW * 0.58 - 5, 1.7), tX + 6, ty);
          doc.text(fmtMins(item.value), tX + tW * 0.62, ty);
          doc.text(`${pct}%`, tX + tW * 0.83, ty);
          ty += 5.5;
        });
        return ly + Math.max(imgH, ty - ly) + 6;
      };

      y = drawAllocationSection('TIME ALLOCATION BY COMPANY', imgCo, byCompany, coTotal, y);
      if (y + 40 > bottomEdge) { doc.addPage(); y = mg; }
      y = drawAllocationSection('TIME ALLOCATION BY STATUS',  imgSt, byStatus,  stTotal, y);

      // ══════════════════════════════════════════════════════════════
      // PAGE 4+ — FULL LOG ENTRIES
      // ══════════════════════════════════════════════════════════════
      doc.addPage(); y = mg;
      y = secHdr(`ALL LOG ENTRIES  ·  ${sortedLogs.length.toLocaleString()} records`, y);
      const lgHs = ['Date', 'Crane', 'Supervisor', 'Company', 'Load Description', 'Status', 'Start', 'End', 'Duration'];
      const lgWs = [28, 30, 34, 34, 65, 24, 20, 18, 20]; // 273mm total
      y = tblHdr(lgHs, lgWs, mg, y);
      for (let i = 0; i < sortedLogs.length; i++) {
        if (y > bottomEdge) { doc.addPage(); y = mg; y = tblHdr(lgHs, lgWs, mg, y); }
        const r = sortedLogs[i];
        const dur = r.start_time && r.end_time ? fmtMins(parseMins(r.start_time, r.end_time)) : '—';
        tblRow([fmtDateLong(r.date), r.crane || '—', r.supervisor_name || '—',
          r.company || '—', r.load_description || '—', r.status || '—',
          fmtTime(r.start_time), fmtTime(r.end_time), dur],
          lgWs, mg, y, LOG_ROW_H, i % 2 === 1);
        y += LOG_ROW_H;
      }

      stampFooters();

      const safeSite  = (effectiveSite || 'all-sites').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const safeCrane = crane ? `-${crane.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : '';
      doc.save(`crane-report-${safeSite}${safeCrane}-${startDate}-${endDate}.pdf`);
    } catch (err) {
      console.error('PDF generation failed:', err);
    } finally {
      setPdfLoading(false);
    }
  }, [stats, dailyBreakdown, sortedLogs, byCompany, byStatus, effectiveSite, crane, startDate, endDate]);


  function toggleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  const noData = !loading && filtered.length === 0;
  const companyTotal = byCompany.reduce((s, r) => s + r.value, 0);
  const statusTotal = byStatus.reduce((s, r) => s + r.value, 0);

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#111827', paddingBottom: '3rem' }}>
      <style>{`
        @media (max-width: 767px) {
          .ca-filter-item { flex: 1 1 100% !important; min-width: 0 !important; }
          .ca-stat-grid  { grid-template-columns: repeat(2, 1fr) !important; }
          .ca-pie-grid   { grid-template-columns: 1fr !important; }
          .ca-pie-inner  { flex-direction: column !important; height: auto !important; }
          .ca-pie-chart-half  { flex: none !important; width: 100% !important; height: 200px !important; }
          .ca-pie-legend-half { flex: none !important; width: 100% !important; padding-left: 0 !important; padding-top: 0.75rem; }
        }
      `}</style>

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '0.9rem 1.5rem' }}>
        <div style={{ maxWidth: '1392px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '8px', height: '28px', background: BRAND, borderRadius: '4px', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#111827', lineHeight: 1 }}>Crane Log Analytics</div>
            <div style={{ fontSize: '0.73rem', color: '#9ca3af', marginTop: '0.15rem' }}>ProLifting Software</div>
            {(lockedSiteName || site) && (
              <div style={{ fontSize: '0.92rem', fontWeight: 600, color: '#374151', marginTop: '0.3rem' }}>
                {lockedSiteName || site}
              </div>
            )}
          </div>
          <button
            onClick={downloadPDF}
            disabled={pdfLoading || loading}
            style={{
              background: BRAND,
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              padding: '0.55rem 1rem',
              fontSize: '0.82rem',
              fontWeight: 700,
              cursor: pdfLoading || loading ? 'not-allowed' : 'pointer',
              opacity: pdfLoading || loading ? 0.6 : 1,
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              flexShrink: 0,
              fontFamily: 'system-ui, sans-serif',
            }}
          >
            {pdfLoading ? 'Generating…' : '↓ Download PDF'}
          </button>
        </div>
      </div>

      <div style={{ maxWidth: '1392px', margin: '0 auto', padding: '1.25rem 1rem' }}>

        {/* Filters */}
        <div style={{ background: '#fff', borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
          <div className="ca-filter-item" style={{ flex: '1 1 140px', minWidth: '130px' }}>
            <label style={labelStyle}>Start Date</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} />
          </div>
          <div className="ca-filter-item" style={{ flex: '1 1 140px', minWidth: '130px' }}>
            <label style={labelStyle}>End Date</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputStyle} />
          </div>
          {!lockedSiteName && (
            <div className="ca-filter-item" style={{ flex: '2 1 200px', minWidth: '150px' }}>
              <label style={labelStyle}>Site</label>
              <select value={site} onChange={e => setSite(e.target.value)} style={selectStyle}>
                <option value="">All Sites</option>
                {sites.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
          <div className="ca-filter-item" style={{ flex: '1 1 130px', minWidth: '110px' }}>
            <label style={labelStyle}>Crane</label>
            <select value={crane} onChange={e => setCrane(e.target.value)} style={selectStyle}>
              <option value="">All Cranes</option>
              {cranes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {error && (
          <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1rem', color: '#991b1b', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        {loading && (
          <div style={{ textAlign: 'center', padding: '4rem 1rem', color: '#9ca3af' }}>
            <div style={{ width: '36px', height: '36px', border: '3px solid #e5e7eb', borderTopColor: BRAND, borderRadius: '50%', margin: '0 auto 0.75rem', animation: 'spin 0.8s linear infinite' }} />
            <div style={{ fontSize: '0.875rem' }}>Loading data…</div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {!loading && (
          <>
            {/* 7 Stat Cards */}
            <div className="ca-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <StatCard value={stats.totalLifts.toLocaleString()} label="Total Logs" />
              <StatCard value={fmtMins(stats.totalMins)} label="Total Working Time" />
              <StatCard value={fmtMins(stats.avgMins)} label="Avg Log Duration" />
              <StatCard value={stats.topCrane} label="Most Active Crane" />
              <StatCard value={fmtMins(stats.totalIdleMins)} label="Total Idle Time" />
              <StatCard value={`${Math.round(stats.avgDailyIdlePct)}%`} label="Avg Daily Idle" />
              <StatCard value={stats.busiestDayFmt} label="Busiest Day" />
            </div>

            {noData ? (
              <div style={{ background: '#fff', borderRadius: '12px', padding: '3rem 1rem', textAlign: 'center', color: '#9ca3af', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', fontSize: '0.9rem' }}>
                No data found for the selected period and filters.
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>

                  {/* Working Time by Day */}
                  <div ref={chartWorkingByDay} style={{ gridColumn: '1 / -1' }}>
                    <ChartCard title="Working Time by Day" sub="Total log time per calendar day">
                      <ResponsiveContainer width="100%" height={210}>
                        <BarChart data={workingByDay} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                          <YAxis tickFormatter={v => fmtMins(v)} tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={48} />
                          <RTooltip content={<BarTip />} cursor={{ fill: '#f9fafb' }} />
                          <Bar dataKey="mins" name="Working Time" fill={BRAND} radius={[4, 4, 0, 0]} maxBarSize={36} />
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartCard>
                  </div>

                  {/* Idle Time by Crane */}
                  <div ref={chartIdleByCrane} style={{ gridColumn: '1 / -1' }}>
                    <ChartCard title="Idle Time by Crane" sub={`Avg working vs idle per active day · ${dayEndMins - dayStartMins} min window (${minsToTimeStr(dayStartMins)}–${minsToTimeStr(dayEndMins)})`}>
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={idleByCrane} margin={{ top: 4, right: 8, bottom: 64, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                          <XAxis dataKey="crane" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} angle={-38} textAnchor="end" interval={0} />
                          <YAxis tickFormatter={v => fmtMins(v)} tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={48} domain={[0, 'auto']} />
                          <RTooltip content={<BarTip />} cursor={{ fill: '#f9fafb' }} />
                          <Bar dataKey="working" name="Working" stackId="a" fill={BRAND} />
                          <Bar dataKey="idle" name="Idle" stackId="a" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartCard>
                  </div>

                  {/* Idle Time by Day */}
                  <div ref={chartIdleByDay} style={{ gridColumn: '1 / -1' }}>
                    <ChartCard title="Idle Time by Day" sub="Total idle minutes across all active cranes per day">
                      <ResponsiveContainer width="100%" height={210}>
                        <BarChart data={idleByDay} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                          <YAxis tickFormatter={v => fmtMins(v)} tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={48} />
                          <RTooltip content={<BarTip />} cursor={{ fill: '#f9fafb' }} />
                          <Bar dataKey="idle" name="Idle Time" fill="#3b82f6" radius={[4, 4, 0, 0]} maxBarSize={36} />
                        </BarChart>
                      </ResponsiveContainer>
                    </ChartCard>
                  </div>

                </div>

                {/* Pie charts row — two equal cards, stack on mobile */}
                <div className="ca-pie-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>

                  {/* Time by Company */}
                  <div ref={chartByCompany}>
                    <ChartCard title="Time Allocation by Company" sub="Share of working time per company">
                      <div className="ca-pie-inner" style={{ display: 'flex', alignItems: 'center', height: '210px' }}>
                        <div className="ca-pie-chart-half" style={{ flex: '0 0 50%', height: '210px' }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie data={byCompany} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={82} innerRadius={32}>
                                {byCompany.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                              </Pie>
                              <RTooltip content={<PieTip />} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="ca-pie-legend-half" style={{ flex: '0 0 50%', paddingLeft: '0.75rem', boxSizing: 'border-box', overflow: 'hidden' }}>
                          <PieLegend data={byCompany} total={companyTotal} />
                        </div>
                      </div>
                    </ChartCard>
                  </div>

                  {/* Time by Status */}
                  <div ref={chartByStatus}>
                    <ChartCard title="Time Allocation by Status" sub="Share of working time per log status">
                      <div className="ca-pie-inner" style={{ display: 'flex', alignItems: 'center', height: '210px' }}>
                        <div className="ca-pie-chart-half" style={{ flex: '0 0 50%', height: '210px' }}>
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie data={byStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={82} innerRadius={32}>
                                {byStatus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                              </Pie>
                              <RTooltip content={<PieTip />} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="ca-pie-legend-half" style={{ flex: '0 0 50%', paddingLeft: '0.75rem', boxSizing: 'border-box', overflow: 'hidden' }}>
                          <PieLegend data={byStatus} total={statusTotal} />
                        </div>
                      </div>
                    </ChartCard>
                  </div>

                </div>

                {/* Daily Breakdown Table */}
                <div style={{ background: '#fff', borderRadius: '12px', padding: '1.25rem 1.25rem 0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.73rem', fontWeight: 800, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '1rem' }}>
                    Daily Breakdown
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', minWidth: '650px', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          {['Date', 'Crane', 'Total Logs', 'Working', 'Idle', 'Idle %', 'First Log', 'Last Log'].map(col => (
                            <th key={col} style={thBase}>{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {dailyBreakdown.map((row, i) => (
                          <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
                            <td style={tdBase}>{fmtDateLong(row.date)}</td>
                            <td style={tdBase}>{row.crane}</td>
                            <td style={tdBase}>{row.lifts}</td>
                            <td style={tdBase}>{fmtMins(row.workingMins)}</td>
                            <td style={tdBase}>{fmtMins(row.idleMins)}</td>
                            <td style={{
                              ...tdBase,
                              fontWeight: 700,
                              color: row.idlePct >= 60 ? '#991b1b' : row.idlePct >= 40 ? '#ca8a04' : '#15803d',
                            }}>
                              {row.idlePct}%
                            </td>
                            <td style={tdBase}>{fmtTime(row.firstLift)}</td>
                            <td style={tdBase}>{fmtTime(row.lastLift)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Full Logs Table */}
                <div style={{ background: '#fff', borderRadius: '12px', padding: '1.25rem 1.25rem 0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginBottom: '1rem' }}>
                    <div style={{ fontSize: '0.73rem', fontWeight: 800, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                      All Log Entries
                    </div>
                    <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{sortedLogs.length.toLocaleString()} records</div>
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', minWidth: '900px', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          {LOG_COLS.map(col => (
                            <th
                              key={col.key}
                              style={{ ...thBase, cursor: 'pointer', userSelect: 'none' }}
                              onClick={() => toggleSort(col.key)}
                            >
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem' }}>
                                {col.label}
                                {sortCol === col.key && (
                                  <span style={{ color: BRAND, fontWeight: 900 }}>{sortDir === 'asc' ? ' ↑' : ' ↓'}</span>
                                )}
                              </span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {sortedLogs.map((row, i) => (
                          <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
                            <td style={tdBase}>{fmtDateLong(row.date)}</td>
                            <td style={tdBase}>{row.site || '—'}</td>
                            <td style={tdBase}>{row.crane || '—'}</td>
                            <td style={tdBase}>{row.supervisor_name || '—'}</td>
                            <td style={tdBase}>{row.company || '—'}</td>
                            <td style={{ ...tdBase, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {row.load_description || '—'}
                            </td>
                            <td style={tdBase}>{row.status || '—'}</td>
                            <td style={tdBase}>{fmtTime(row.start_time)}</td>
                            <td style={tdBase}>{fmtTime(row.end_time)}</td>
                            <td style={tdBase}>
                              {row.start_time && row.end_time ? fmtMins(parseMins(row.start_time, row.end_time)) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function CraneAnalytics() {
  return (
    <Suspense>
      <CraneAnalyticsContent />
    </Suspense>
  );
}
