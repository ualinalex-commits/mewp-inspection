'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
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
const IDLE_WINDOW = 600;

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
  const [rows, setRows] = useState<CraneLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sortCol, setSortCol] = useState('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const effectiveSite = lockedSiteName ?? site;

  useEffect(() => {
    const siteId = searchParams.get('siteId');
    if (!siteId) { setSiteParamResolved(true); return; }
    supabase
      .from('crane_logs_sites')
      .select('name')
      .eq('id', siteId)
      .single()
      .then(({ data }) => {
        if (data?.name) setLockedSiteName(data.name);
        setSiteParamResolved(true);
      });
  }, [searchParams]);

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
    for (const days of Object.values(craneDay)) {
      for (const working of Object.values(days)) {
        const idle = Math.max(0, IDLE_WINDOW - working);
        totalIdleMins += idle;
        totalIdlePctSum += (idle / IDLE_WINDOW) * 100;
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
  }, [filtered, craneDay]);

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
    for (const days of Object.values(craneDay)) {
      for (const [date, working] of Object.entries(days)) {
        map[date] = (map[date] ?? 0) + Math.max(0, IDLE_WINDOW - working);
      }
    }
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, idle]) => ({ date: shortDate(date), idle: Math.round(idle) }));
  }, [craneDay]);

  const idleByCrane = useMemo(() => {
    return Object.entries(craneDay)
      .map(([craneName, days]) => {
        const vals = Object.values(days);
        const avgWorking = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
        return { crane: craneName, working: avgWorking, idle: Math.max(0, IDLE_WINDOW - avgWorking) };
      })
      .sort((a, b) => b.idle - a.idle)
      .slice(0, 16);
  }, [craneDay]);

  const byCompany = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of filtered) {
      const k = r.company?.trim() || 'Unknown';
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
        const idle = Math.max(0, IDLE_WINDOW - w);
        return { ...row, workingMins: w, idleMins: idle, idlePct: Math.round((idle / IDLE_WINDOW) * 100) };
      });
  }, [filtered]);

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

  function toggleSort(col: string) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  const noData = !loading && filtered.length === 0;
  const companyTotal = byCompany.reduce((s, r) => s + r.value, 0);
  const statusTotal = byStatus.reduce((s, r) => s + r.value, 0);

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#111827', paddingBottom: '3rem' }}>

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '0.9rem 1.5rem' }}>
        <div style={{ maxWidth: '1392px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '8px', height: '28px', background: BRAND, borderRadius: '4px', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#111827', lineHeight: 1 }}>Crane Log Analytics</div>
            <div style={{ fontSize: '0.73rem', color: '#9ca3af', marginTop: '0.15rem' }}>ProLifting Software</div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1392px', margin: '0 auto', padding: '1.25rem 1rem' }}>

        {/* Filters */}
        <div style={{ background: '#fff', borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 140px', minWidth: '130px' }}>
            <label style={labelStyle}>Start Date</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ flex: '1 1 140px', minWidth: '130px' }}>
            <label style={labelStyle}>End Date</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputStyle} />
          </div>
          {!lockedSiteName && (
            <div style={{ flex: '2 1 200px', minWidth: '150px' }}>
              <label style={labelStyle}>Site</label>
              <select value={site} onChange={e => setSite(e.target.value)} style={selectStyle}>
                <option value="">All Sites</option>
                {sites.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
          {lockedSiteName && (
            <div style={{ flex: '2 1 200px', minWidth: '150px' }}>
              <label style={labelStyle}>Site</label>
              <div style={{ ...inputStyle, background: '#f3f4f6', color: '#374151', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: BRAND, flexShrink: 0 }} />
                {lockedSiteName}
              </div>
            </div>
          )}
          <div style={{ flex: '1 1 130px', minWidth: '110px' }}>
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(145px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <StatCard value={stats.totalLifts.toLocaleString()} label="Total Lifts" />
              <StatCard value={fmtMins(stats.totalMins)} label="Total Working Time" />
              <StatCard value={fmtMins(stats.avgMins)} label="Avg Lift Duration" />
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
                  <ChartCard title="Working Time by Day" sub="Total lift time per calendar day" fullWidth>
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

                  {/* Idle Time by Crane */}
                  <ChartCard title="Idle Time by Crane" sub="Avg working vs idle per active day · 600 min window" fullWidth>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={idleByCrane} margin={{ top: 4, right: 8, bottom: 64, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                        <XAxis dataKey="crane" tick={{ fontSize: 10, fill: '#9ca3af' }} tickLine={false} axisLine={false} angle={-38} textAnchor="end" interval={0} />
                        <YAxis tickFormatter={v => fmtMins(v)} tick={{ fontSize: 11, fill: '#9ca3af' }} tickLine={false} axisLine={false} width={48} domain={[0, IDLE_WINDOW]} />
                        <RTooltip content={<BarTip />} cursor={{ fill: '#f9fafb' }} />
                        <Bar dataKey="working" name="Working" stackId="a" fill={BRAND} />
                        <Bar dataKey="idle" name="Idle" stackId="a" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  {/* Idle Time by Day — NEW */}
                  <ChartCard title="Idle Time by Day" sub="Total idle minutes across all active cranes per day" fullWidth>
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

                {/* Pie charts row — two equal cards */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>

                  {/* Time by Company — right-side legend */}
                  <ChartCard title="Time Allocation by Company" sub="Share of working time per company">
                    <div style={{ display: 'flex', alignItems: 'center', height: '210px' }}>
                      <div style={{ flex: '0 0 50%', height: '210px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={byCompany} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={82} innerRadius={32}>
                              {byCompany.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                            </Pie>
                            <RTooltip content={<PieTip />} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div style={{ flex: '0 0 50%', paddingLeft: '0.75rem', boxSizing: 'border-box', overflow: 'hidden' }}>
                        <PieLegend data={byCompany} total={companyTotal} />
                      </div>
                    </div>
                  </ChartCard>

                  {/* Time by Status — right-side legend */}
                  <ChartCard title="Time Allocation by Status" sub="Share of working time per lift status">
                    <div style={{ display: 'flex', alignItems: 'center', height: '210px' }}>
                      <div style={{ flex: '0 0 50%', height: '210px' }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={byStatus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={82} innerRadius={32}>
                              {byStatus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                            </Pie>
                            <RTooltip content={<PieTip />} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div style={{ flex: '0 0 50%', paddingLeft: '0.75rem', boxSizing: 'border-box', overflow: 'hidden' }}>
                        <PieLegend data={byStatus} total={statusTotal} />
                      </div>
                    </div>
                  </ChartCard>

                </div>

                {/* Daily Breakdown Table */}
                <div style={{ background: '#fff', borderRadius: '12px', padding: '1.25rem 1.25rem 0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: '1rem' }}>
                  <div style={{ fontSize: '0.73rem', fontWeight: 800, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '1rem' }}>
                    Daily Breakdown
                  </div>
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr>
                          {['Date', 'Crane', 'Total Lifts', 'Working', 'Idle', 'Idle %', 'First Lift', 'Last Lift'].map(col => (
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
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
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
