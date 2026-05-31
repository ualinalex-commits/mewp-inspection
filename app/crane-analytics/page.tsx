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
      .select('site_name')
      .eq('id', siteId)
      .single()
      .then(({ data, error: err }) => {
        console.log('[crane-analytics] crane_logs_sites lookup result:', { data, err });
        if (data?.site_name) setLockedSiteName(data.site_name);
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

  const downloadPDF = useCallback(async () => {
    setPdfLoading(true);
    try {
      const { jsPDF } = await import('jspdf');
      const html2canvas = (await import('html2canvas')).default;

      // Entire PDF in A4 landscape (297mm × 210mm)
      const doc = new jsPDF('l', 'mm', 'a4');
      const margin = 14;
      const footerH = 10; // reserved at bottom for page numbers
      const getW = () => doc.internal.pageSize.getWidth();
      const getH = () => doc.internal.pageSize.getHeight();
      const maxY = () => getH() - margin - footerH;
      let y = margin;

      const drawSep = () => {
        doc.setDrawColor('#e5e7eb');
        doc.setLineWidth(0.4);
        doc.line(margin, y, getW() - margin, y);
      };

      const drawTblHeader = (headers: string[], colWidths: number[], startX: number, startY: number) => {
        doc.setFontSize(7);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor('#6b7280');
        let x = startX;
        headers.forEach((h, i) => { doc.text(h.toUpperCase(), x, startY); x += colWidths[i]; });
        const lineY = startY + 2.5;
        doc.setDrawColor('#e5e7eb');
        doc.setLineWidth(0.3);
        doc.line(startX, lineY, startX + colWidths.reduce((a, b) => a + b, 0), lineY);
        return lineY + 3.5;
      };

      const siteName = effectiveSite || 'All Sites';
      const contentW = getW() - margin * 2; // 269mm in A4 landscape

      // Title
      doc.setFontSize(22);
      doc.setTextColor('#d02a35');
      doc.setFont('helvetica', 'bold');
      doc.text('Crane Log Analytics Report', margin, y);
      y += 8;

      // Header line: Site Name | Crane: X (if selected) | Period: …
      doc.setFontSize(10);
      doc.setTextColor('#374151');
      doc.setFont('helvetica', 'normal');
      const headerParts = [
        siteName,
        ...(crane ? [`Crane: ${crane}`] : []),
        `Period: ${fmtDateLong(startDate)} — ${fmtDateLong(endDate)}`,
      ];
      doc.text(headerParts.join('  |  '), margin, y);
      y += 8;

      drawSep(); y += 6;

      // Stats — 7 cards across the full landscape width
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor('#6b7280');
      doc.text('STATISTICS', margin, y);
      y += 5;

      const statItems = [
        { label: 'Total Lifts', value: stats.totalLifts.toLocaleString() },
        { label: 'Total Working Time', value: fmtMins(stats.totalMins) },
        { label: 'Avg Lift Duration', value: fmtMins(stats.avgMins) },
        { label: 'Most Active Crane', value: stats.topCrane },
        { label: 'Total Idle Time', value: fmtMins(stats.totalIdleMins) },
        { label: 'Avg Daily Idle', value: `${Math.round(stats.avgDailyIdlePct)}%` },
        { label: 'Busiest Day', value: stats.busiestDayFmt },
      ];

      // All 7 in one row — 269 / 7 ≈ 38.4mm each
      const statColW = contentW / statItems.length;
      for (let i = 0; i < statItems.length; i++) {
        const sx = margin + i * statColW;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor('#111827');
        const val = statItems[i].value;
        doc.text(val.length > 10 ? val.substring(0, 9) + '…' : val, sx, y);
        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor('#6b7280');
        doc.text(statItems[i].label.toUpperCase(), sx, y + 4.5);
      }

      y += 14;
      drawSep(); y += 8;

      // Charts
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor('#6b7280');
      doc.text('CHARTS', margin, y);
      y += 5;

      const chartRefs = [chartWorkingByDay, chartIdleByCrane, chartIdleByDay, chartByCompany, chartByStatus];

      for (const ref of chartRefs) {
        if (!ref.current) continue;
        const canvas = await html2canvas(ref.current, { scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false });
        const imgData = canvas.toDataURL('image/png');
        const imgH = contentW * (canvas.height / canvas.width);
        if (y + imgH > maxY()) { doc.addPage(); y = margin; }
        doc.addImage(imgData, 'PNG', margin, y, contentW, imgH);
        y += imgH + 6;
      }

      // Daily breakdown table
      doc.addPage();
      y = margin;
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor('#d02a35');
      doc.text('Daily Breakdown', margin, y);
      y += 9;

      // Wider columns now that we're in landscape — sum = 269mm
      const dbHeaders = ['Date',  'Crane', 'Lifts', 'Working', 'Idle', 'Idle %', 'First Lift', 'Last Lift'];
      const dbColW    = [40,      62,      20,       33,        28,     27,       30,            29];

      y = drawTblHeader(dbHeaders, dbColW, margin, y);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor('#374151');

      for (const row of dailyBreakdown) {
        if (y > maxY()) {
          doc.addPage(); y = margin;
          y = drawTblHeader(dbHeaders, dbColW, margin, y);
          doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor('#374151');
        }
        let x = margin;
        [fmtDateLong(row.date), row.crane, String(row.lifts), fmtMins(row.workingMins),
          fmtMins(row.idleMins), `${row.idlePct}%`, fmtTime(row.firstLift), fmtTime(row.lastLift)]
          .forEach((cell, i) => {
            const max = Math.floor(dbColW[i] / 1.9);
            doc.text(cell.length > max ? cell.substring(0, max - 1) + '…' : cell, x, y);
            x += dbColW[i];
          });
        y += 6;
      }

      // Full logs table — same landscape orientation, no orientation switch needed
      doc.addPage();
      y = margin;
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor('#d02a35');
      doc.text('All Log Entries', margin, y);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor('#6b7280');
      doc.text(`${sortedLogs.length.toLocaleString()} records`, margin + 52, y + 0.5);
      y += 9;

      // 10 columns across 269mm — sum = 269mm
      const logHeaders = ['Date', 'Site', 'Crane', 'Supervisor', 'Company', 'Load Description', 'Status', 'Start', 'End', 'Duration'];
      const logColW    = [26,     32,     25,       27,           27,        55,                  21,       19,     18,    19];

      y = drawTblHeader(logHeaders, logColW, margin, y);
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor('#374151');

      for (const row of sortedLogs) {
        if (y > maxY()) {
          doc.addPage(); y = margin;
          y = drawTblHeader(logHeaders, logColW, margin, y);
          doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor('#374151');
        }
        let x = margin;
        const dur = row.start_time && row.end_time ? fmtMins(parseMins(row.start_time, row.end_time)) : '—';
        [fmtDateLong(row.date), row.site || '—', row.crane || '—', row.supervisor_name || '—',
          row.company || '—', row.load_description || '—', row.status || '—',
          fmtTime(row.start_time), fmtTime(row.end_time), dur]
          .forEach((cell, i) => {
            const max = Math.floor(logColW[i] / 1.55);
            doc.text(cell.length > max ? cell.substring(0, max - 1) + '…' : cell, x, y);
            x += logColW[i];
          });
        y += 5;
      }

      // Page numbers — stamp every page after all content is written
      const totalPages = doc.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        doc.setPage(p);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor('#9ca3af');
        const pageText = `Page ${p} of ${totalPages}`;
        const textW = doc.getTextWidth(pageText);
        doc.text(pageText, (getW() - textW) / 2, getH() - 5);
      }

      const safeSite = (effectiveSite || 'all-sites').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const safeCrane = crane ? `-${crane.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : '';
      doc.save(`crane-report-${safeSite}${safeCrane}-${startDate}-${endDate}.pdf`);
    } catch (err) {
      console.error('PDF generation failed:', err);
    } finally {
      setPdfLoading(false);
    }
  }, [stats, dailyBreakdown, sortedLogs, effectiveSite, crane, startDate, endDate]);

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
                  <div ref={chartWorkingByDay} style={{ gridColumn: '1 / -1' }}>
                    <ChartCard title="Working Time by Day" sub="Total lift time per calendar day">
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
                    <ChartCard title="Idle Time by Crane" sub="Avg working vs idle per active day · 600 min window">
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

                {/* Pie charts row — two equal cards */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>

                  {/* Time by Company — right-side legend */}
                  <div ref={chartByCompany}>
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
                  </div>

                  {/* Time by Status — right-side legend */}
                  <div ref={chartByStatus}>
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
