'use client';

import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';

type CraneLog = {
  site: string;
  crane: string;
  company: string;
  status: string;
  date: string;
  start_time: string;
  end_time: string;
};

const BRAND = '#d02a35';
const COLORS = [
  BRAND, '#2563eb', '#16a34a', '#ea580c',
  '#7c3aed', '#0891b2', '#be185d', '#ca8a04', '#0f766e', '#9333ea',
];
const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];
const IDLE_WINDOW = 600; // 10-hour crane day in minutes

function parseMins(start: string, end: string): number {
  const s = new Date(start.replace(' ', 'T'));
  const e = new Date(end.replace(' ', 'T'));
  return Math.max(0, (e.getTime() - s.getTime()) / 60000);
}

function fmtMins(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function shortDate(d: string): string {
  const parts = d.split('-');
  const mNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${parseInt(parts[2])} ${mNames[parseInt(parts[1]) - 1]}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function BarTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '0.5rem 0.75rem', boxShadow: '0 4px 12px rgba(0,0,0,0.12)', fontSize: '0.8rem', minWidth: '120px' }}>
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
      <div style={{ fontSize: '1.55rem', fontWeight: 800, color: '#111827', lineHeight: 1, wordBreak: 'break-word' }}>{value}</div>
      <div style={{ fontSize: '0.67rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: '0.45rem' }}>{label}</div>
    </div>
  );
}

function ChartCard({ title, sub, children, fullWidth }: { title: string; sub?: string; children: React.ReactNode; fullWidth?: boolean }) {
  return (
    <div style={{ background: '#fff', borderRadius: '12px', padding: '1.25rem 1.25rem 1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', gridColumn: fullWidth ? '1 / -1' : undefined }}>
      <div style={{ fontSize: '0.73rem', fontWeight: 800, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{title}</div>
      {sub && <div style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: '0.1rem', marginBottom: '1.1rem' }}>{sub}</div>}
      {!sub && <div style={{ marginBottom: '1.1rem' }} />}
      {children}
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

const labelStyle: React.CSSProperties = {
  fontSize: '0.67rem',
  fontWeight: 700,
  color: '#6b7280',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  display: 'block',
  marginBottom: '0.3rem',
};

export default function CraneAnalytics() {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [site, setSite] = useState('');
  const [crane, setCrane] = useState('');
  const [rows, setRows] = useState<CraneLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const YEARS = useMemo(() => {
    const cy = new Date().getFullYear();
    return [cy - 1, cy, cy + 1];
  }, []);

  // Fetch when month/year changes
  useEffect(() => {
    setSite('');
    setCrane('');
    setLoading(true);
    setError(null);
    const pad = (n: number) => String(n).padStart(2, '0');
    const startDate = `${year}-${pad(month)}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${pad(month)}-${pad(lastDay)}`;

    supabase
      .from('crane_logs')
      .select('site, crane, company, status, date, start_time, end_time')
      .gte('date', startDate)
      .lte('date', endDate)
      .then(({ data, error: err }) => {
        setLoading(false);
        if (err) { setError(err.message); return; }
        setRows((data as CraneLog[]) ?? []);
      });
  }, [month, year]);

  const sites = useMemo(
    () => Array.from(new Set(rows.map(r => r.site).filter(Boolean))).sort(),
    [rows]
  );

  const cranes = useMemo(() => {
    const base = site ? rows.filter(r => r.site === site) : rows;
    return Array.from(new Set(base.map(r => r.crane).filter(Boolean))).sort();
  }, [rows, site]);

  // Reset crane selection if it disappears after site change
  useEffect(() => {
    if (crane && !cranes.includes(crane)) setCrane('');
  }, [cranes, crane]);

  const filtered = useMemo(() => {
    let d = rows;
    if (site) d = d.filter(r => r.site === site);
    if (crane) d = d.filter(r => r.crane === crane);
    return d;
  }, [rows, site, crane]);

  // Summary stats
  const stats = useMemo(() => {
    let totalMins = 0;
    const craneCounts: Record<string, number> = {};
    for (const r of filtered) {
      totalMins += parseMins(r.start_time, r.end_time);
      craneCounts[r.crane] = (craneCounts[r.crane] ?? 0) + 1;
    }
    const totalLifts = filtered.length;
    const avgMins = totalLifts > 0 ? totalMins / totalLifts : 0;
    const topCrane = Object.entries(craneCounts).sort(([, a], [, b]) => b - a)[0]?.[0] ?? '—';
    return { totalLifts, totalMins, avgMins, topCrane };
  }, [filtered]);

  // Working Time by Day
  const workingByDay = useMemo(() => {
    const map: Record<string, number> = {};
    for (const r of filtered) {
      map[r.date] = (map[r.date] ?? 0) + parseMins(r.start_time, r.end_time);
    }
    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, mins]) => ({ date: shortDate(date), mins: Math.round(mins) }));
  }, [filtered]);

  // Idle Time by Crane — average working vs idle per active day (600 min window)
  const idleByCrane = useMemo(() => {
    const craneDay: Record<string, Record<string, number>> = {};
    for (const r of filtered) {
      if (!craneDay[r.crane]) craneDay[r.crane] = {};
      craneDay[r.crane][r.date] = (craneDay[r.crane][r.date] ?? 0) + parseMins(r.start_time, r.end_time);
    }
    return Object.entries(craneDay)
      .map(([craneName, days]) => {
        const dayVals = Object.values(days);
        const totalWorking = dayVals.reduce((a, b) => a + b, 0);
        const avgWorking = Math.round(totalWorking / dayVals.length);
        const avgIdle = Math.max(0, IDLE_WINDOW - avgWorking);
        return { crane: craneName, working: avgWorking, idle: avgIdle, days: dayVals.length };
      })
      .sort((a, b) => b.idle - a.idle)
      .slice(0, 16);
  }, [filtered]);

  // Time Allocation by Company
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

  // Time Allocation by Status
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

  const noData = !loading && filtered.length === 0;

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', fontFamily: 'system-ui, -apple-system, sans-serif', color: '#111827', paddingBottom: '3rem' }}>

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '0.9rem 1.5rem' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '8px', height: '28px', background: BRAND, borderRadius: '4px', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#111827', lineHeight: 1 }}>Crane Log Analytics</div>
            <div style={{ fontSize: '0.73rem', color: '#9ca3af', marginTop: '0.15rem' }}>ProLifting Software</div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '1.25rem 1rem' }}>

        {/* Filters */}
        <div style={{ background: '#fff', borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
          <div style={{ flex: '1 1 130px', minWidth: '110px' }}>
            <label style={labelStyle}>Month</label>
            <select value={month} onChange={e => setMonth(Number(e.target.value))} style={selectStyle}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div style={{ flex: '0 1 90px', minWidth: '80px' }}>
            <label style={labelStyle}>Year</label>
            <select value={year} onChange={e => setYear(Number(e.target.value))} style={selectStyle}>
              {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div style={{ flex: '2 1 200px', minWidth: '150px' }}>
            <label style={labelStyle}>Site</label>
            <select value={site} onChange={e => setSite(e.target.value)} style={selectStyle}>
              <option value="">All Sites</option>
              {sites.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ flex: '1 1 130px', minWidth: '110px' }}>
            <label style={labelStyle}>Crane</label>
            <select value={crane} onChange={e => setCrane(e.target.value)} style={selectStyle}>
              <option value="">All Cranes</option>
              {cranes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1rem', color: '#991b1b', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div style={{ textAlign: 'center', padding: '4rem 1rem', color: '#9ca3af' }}>
            <div style={{ width: '36px', height: '36px', border: `3px solid #e5e7eb`, borderTopColor: BRAND, borderRadius: '50%', margin: '0 auto 0.75rem', animation: 'spin 0.8s linear infinite' }} />
            <div style={{ fontSize: '0.875rem' }}>Loading data…</div>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {!loading && (
          <>
            {/* Stat Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.75rem', marginBottom: '1.25rem' }}>
              <StatCard value={stats.totalLifts.toLocaleString()} label="Total Lifts" />
              <StatCard value={fmtMins(stats.totalMins)} label="Total Working Time" />
              <StatCard value={fmtMins(stats.avgMins)} label="Avg Lift Duration" />
              <StatCard value={stats.topCrane || '—'} label="Most Active Crane" />
            </div>

            {noData ? (
              <div style={{ background: '#fff', borderRadius: '12px', padding: '3rem 1rem', textAlign: 'center', color: '#9ca3af', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', fontSize: '0.9rem' }}>
                No data found for the selected period and filters.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '1rem' }}>

                {/* Working Time by Day */}
                <ChartCard title="Working Time by Day" sub="Total lift time per calendar day" fullWidth>
                  <ResponsiveContainer width="100%" height={210}>
                    <BarChart data={workingByDay} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11, fill: '#9ca3af' }}
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tickFormatter={v => fmtMins(v)}
                        tick={{ fontSize: 11, fill: '#9ca3af' }}
                        tickLine={false}
                        axisLine={false}
                        width={48}
                      />
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
                      <XAxis
                        dataKey="crane"
                        tick={{ fontSize: 10, fill: '#9ca3af' }}
                        tickLine={false}
                        axisLine={false}
                        angle={-38}
                        textAnchor="end"
                        interval={0}
                      />
                      <YAxis
                        tickFormatter={v => fmtMins(v)}
                        tick={{ fontSize: 11, fill: '#9ca3af' }}
                        tickLine={false}
                        axisLine={false}
                        width={48}
                        domain={[0, IDLE_WINDOW]}
                      />
                      <RTooltip content={<BarTip />} cursor={{ fill: '#f9fafb' }} />
                      <Bar dataKey="working" name="Working" stackId="a" fill={BRAND} />
                      <Bar dataKey="idle" name="Idle" stackId="a" fill="#e5e7eb" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                {/* Time by Company */}
                <ChartCard title="Time Allocation by Company" sub="Share of working time per company">
                  <ResponsiveContainer width="100%" height={270}>
                    <PieChart>
                      <Pie
                        data={byCompany}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="42%"
                        outerRadius={82}
                        label={({ percent }) => (percent ?? 0) > 0.04 ? `${Math.round((percent ?? 0) * 100)}%` : ''}
                        labelLine
                      >
                        {byCompany.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <RTooltip content={<PieTip />} />
                      <Legend
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: '0.71rem', paddingTop: '0.5rem' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>

                {/* Time by Status */}
                <ChartCard title="Time Allocation by Status" sub="Share of working time per lift status">
                  <ResponsiveContainer width="100%" height={270}>
                    <PieChart>
                      <Pie
                        data={byStatus}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="42%"
                        outerRadius={82}
                        label={({ percent }) => (percent ?? 0) > 0.04 ? `${Math.round((percent ?? 0) * 100)}%` : ''}
                        labelLine
                      >
                        {byStatus.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <RTooltip content={<PieTip />} />
                      <Legend
                        iconType="circle"
                        iconSize={8}
                        wrapperStyle={{ fontSize: '0.71rem', paddingTop: '0.5rem' }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartCard>

              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
