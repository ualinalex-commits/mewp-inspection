'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '../../../lib/supabase';

type Crane = { id: string; name: string; is_active: boolean };

type Booking = {
  id: string;
  site_id: string;
  crane_id: string;
  date: string;
  start_time: string;
  end_time: string;
  company: string;
  booked_by: string;
  email: string;
  notes: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_by: string;
  created_at: string;
};

const BRAND = '#d02a35';

const STATUS_COLOR: Record<string, { bg: string; text: string; dot: string }> = {
  approved: { bg: '#dcfce7', text: '#15803d', dot: '#16a34a' },
  pending:  { bg: '#fef3c7', text: '#92400e', dot: '#d97706' },
  rejected: { bg: '#f3f4f6', text: '#6b7280', dot: '#9ca3af' },
};

const TL_START = 6 * 60;
const TL_END   = 22 * 60;
const TL_SPAN  = TL_END - TL_START;

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  background: '#f9fafb', border: '2px solid #e5e7eb', borderRadius: '8px',
  color: '#111827', padding: '0.6rem 0.75rem', fontSize: '0.9rem',
  fontFamily: 'system-ui, sans-serif', outline: 'none',
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.67rem', fontWeight: 700, color: '#6b7280',
  textTransform: 'uppercase', letterSpacing: '0.06em',
  display: 'block', marginBottom: '0.3rem',
};

const card: React.CSSProperties = {
  background: '#fff', borderRadius: '12px', padding: '1.25rem',
  marginBottom: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
};

const cardTitle: React.CSSProperties = {
  fontSize: '0.73rem', fontWeight: 800, color: '#374151',
  textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '1rem',
};

const thStyle: React.CSSProperties = {
  padding: '0.55rem 0.75rem', textAlign: 'left', fontSize: '0.67rem',
  fontWeight: 700, color: '#6b7280', textTransform: 'uppercase',
  letterSpacing: '0.06em', borderBottom: '2px solid #f3f4f6',
  background: '#fff', whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '0.6rem 0.75rem', fontSize: '0.82rem',
  color: '#374151', borderBottom: '1px solid #f3f4f6',
};

function timeToMins(t: string): number {
  const [h, m] = (t || '').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function overlaps(aS: string, aE: string, bS: string, bE: string): boolean {
  return timeToMins(aS) < timeToMins(bE) && timeToMins(aE) > timeToMins(bS);
}

// ── Timeline (admin variant — multi-crane, colour-coded by status) ────────────
function AdminTimeline({ cranes, bookings }: { cranes: Crane[]; bookings: Booking[] }) {
  const pos = (t: string) =>
    Math.max(0, Math.min(100, (timeToMins(t) - TL_START) / TL_SPAN * 100));
  const wid = (s: string, e: string) =>
    Math.max(0.5, Math.min(100 - pos(s), (timeToMins(e) - timeToMins(s)) / TL_SPAN * 100));
  const hours = Array.from({ length: 17 }, (_, i) => i + 6);
  const activeCranes = cranes.filter(c => c.is_active);

  if (activeCranes.length === 0) return <div style={{ fontSize: '0.82rem', color: '#9ca3af' }}>No active cranes.</div>;

  return (
    <div style={{ overflowX: 'auto' }}>
      {/* Hour labels */}
      <div style={{ display: 'flex', marginBottom: '2px' }}>
        <div style={{ width: '110px', flexShrink: 0 }} />
        <div style={{ flex: 1, position: 'relative', height: '18px', minWidth: '300px' }}>
          {hours.filter(h => h % 2 === 0).map(h => (
            <span key={h} style={{
              position: 'absolute',
              left: `${(h * 60 - TL_START) / TL_SPAN * 100}%`,
              fontSize: '0.6rem', color: '#9ca3af', transform: 'translateX(-50%)',
            }}>
              {h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`}
            </span>
          ))}
        </div>
      </div>

      {/* Crane rows */}
      {activeCranes.map(crane => {
        const cb = bookings.filter(b => b.crane_id === crane.id);
        return (
          <div key={crane.id} style={{ display: 'flex', alignItems: 'center', marginBottom: '5px' }}>
            <div style={{
              width: '110px', flexShrink: 0, fontSize: '0.75rem', fontWeight: 700,
              color: '#374151', paddingRight: '10px', textAlign: 'right',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {crane.name}
            </div>
            <div style={{
              flex: 1, position: 'relative', height: '34px',
              background: '#f3f4f6', borderRadius: '6px', overflow: 'hidden', minWidth: '300px',
            }}>
              {hours.map(h => (
                <div key={h} style={{
                  position: 'absolute', left: `${(h * 60 - TL_START) / TL_SPAN * 100}%`,
                  top: 0, bottom: 0, width: '1px', background: '#e5e7eb',
                }} />
              ))}
              {cb.map(b => (
                <div key={b.id}
                  title={`${b.company} (${b.status}): ${b.start_time}–${b.end_time}`}
                  style={{
                    position: 'absolute',
                    left: `${pos(b.start_time)}%`, width: `${wid(b.start_time, b.end_time)}%`,
                    top: '4px', bottom: '4px',
                    background: STATUS_COLOR[b.status]?.dot ?? '#9ca3af',
                    borderRadius: '4px',
                    opacity: b.status === 'rejected' ? 0.45 : 1,
                    display: 'flex', alignItems: 'center', overflow: 'hidden',
                  }}>
                  <span style={{
                    fontSize: '0.58rem', color: '#fff', fontWeight: 700,
                    padding: '0 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {b.company}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Legend */}
      <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', paddingLeft: '110px', flexWrap: 'wrap' }}>
        {Object.entries(STATUS_COLOR).map(([status, c]) => (
          <span key={status} style={{ fontSize: '0.7rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ width: 10, height: 10, background: c.dot, borderRadius: 2, display: 'inline-block' }} />
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Add-booking form (used in both Add tab and standalone) ────────────────────
function AddBookingForm({
  siteId, cranes, onSuccess, onCancel,
}: {
  siteId: string; cranes: Crane[]; onSuccess: () => void; onCancel: () => void;
}) {
  const [date, setDate]       = useState('');
  const [craneId, setCraneId] = useState('');
  const [start, setStart]     = useState('');
  const [end, setEnd]         = useState('');
  const [company, setCompany] = useState('');
  const [by, setBy]           = useState('');
  const [email, setEmail]     = useState('');
  const [notes, setNotes]     = useState('');
  const [saving, setSaving]   = useState(false);
  const [err, setErr]         = useState<string | null>(null);
  const [existingApproved, setExistingApproved] = useState<Booking[]>([]);

  useEffect(() => {
    if (!craneId || !date) { setExistingApproved([]); return; }
    supabase.from('crane_bookings')
      .select('id, crane_id, date, start_time, end_time, company, status')
      .eq('crane_id', craneId).eq('date', date).eq('status', 'approved')
      .then(({ data }) => setExistingApproved((data as Booking[]) ?? []));
  }, [craneId, date]);

  const overlapErr =
    start && end && timeToMins(end) > timeToMins(start) &&
    existingApproved.some(b => overlaps(start, end, b.start_time, b.end_time))
      ? 'Time overlaps with an existing approved booking.'
      : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (overlapErr) return;
    if (timeToMins(end) <= timeToMins(start)) { setErr('End time must be after start time.'); return; }
    setSaving(true); setErr(null);
    const { error } = await supabase.from('crane_bookings').insert({
      site_id: siteId, crane_id: craneId, date,
      start_time: start, end_time: end,
      company, booked_by: by, email,
      notes: notes.trim() || null,
      status: 'approved', created_by: 'ap',
    });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSuccess();
  }

  // Simple inline timeline for the add form
  const pos = (t: string) =>
    Math.max(0, Math.min(100, (timeToMins(t) - TL_START) / TL_SPAN * 100));
  const wid = (s: string, e: string) =>
    Math.max(0.5, Math.min(100 - pos(s), (timeToMins(e) - timeToMins(s)) / TL_SPAN * 100));

  return (
    <form onSubmit={submit}>
      <div style={card}>
        <div style={cardTitle}>New Booking <span style={{ color: '#16a34a', fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>(auto-approved · AP)</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div>
            <label style={labelStyle}>Date *</label>
            <input type="date" required value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Crane *</label>
            <select required value={craneId} onChange={e => setCraneId(e.target.value)} style={inputStyle}>
              <option value="">Select crane…</option>
              {cranes.filter(c => c.is_active).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Inline availability timeline */}
          {craneId && date && (
            <div style={{ gridColumn: '1 / -1', background: '#f9fafb', borderRadius: '8px', padding: '0.75rem' }}>
              <div style={{ fontSize: '0.67rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px' }}>
                Availability — {cranes.find(c => c.id === craneId)?.name}
              </div>
              <div style={{ position: 'relative', height: '34px', background: '#e5e7eb', borderRadius: '6px', overflow: 'hidden' }}>
                {existingApproved.map(b => (
                  <div key={b.id} style={{
                    position: 'absolute', left: `${pos(b.start_time)}%`, width: `${wid(b.start_time, b.end_time)}%`,
                    top: '4px', bottom: '4px', background: '#16a34a', borderRadius: '4px',
                  }} title={`${b.company}: ${b.start_time}–${b.end_time}`} />
                ))}
                {start && end && timeToMins(end) > timeToMins(start) && (
                  <div style={{
                    position: 'absolute', left: `${pos(start)}%`, width: `${wid(start, end)}%`,
                    top: '4px', bottom: '4px', background: '#3b82f6', borderRadius: '4px', opacity: 0.75,
                  }} />
                )}
              </div>
              {existingApproved.length === 0 && <div style={{ fontSize: '0.72rem', color: '#9ca3af', marginTop: '4px' }}>Fully available.</div>}
            </div>
          )}

          <div>
            <label style={labelStyle}>Start Time *</label>
            <input type="time" required value={start} onChange={e => setStart(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>End Time *</label>
            <input type="time" required value={end} onChange={e => setEnd(e.target.value)} style={inputStyle} />
          </div>

          {overlapErr && (
            <div style={{ gridColumn: '1 / -1', background: '#fee2e2', color: '#991b1b', borderRadius: '8px', padding: '0.6rem 0.9rem', fontSize: '0.82rem' }}>
              ⚠️ {overlapErr}
            </div>
          )}

          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Company Name *</label>
            <input type="text" required value={company} onChange={e => setCompany(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Booked By *</label>
            <input type="text" required value={by} onChange={e => setBy(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Email *</label>
            <input type="email" required value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={labelStyle}>Notes (optional)</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              style={{ ...inputStyle, height: '72px', resize: 'vertical' }} />
          </div>
        </div>

        {err && <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: '8px', padding: '0.6rem 0.9rem', marginTop: '0.75rem', fontSize: '0.82rem' }}>{err}</div>}

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onCancel} style={{ background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '8px', padding: '0.55rem 1rem', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui, sans-serif' }}>
            Cancel
          </button>
          <button type="submit" disabled={saving || !!overlapErr} style={{
            background: BRAND, color: '#fff', border: 'none', borderRadius: '8px',
            padding: '0.55rem 1.25rem', fontSize: '0.85rem', fontWeight: 700,
            cursor: saving || !!overlapErr ? 'not-allowed' : 'pointer',
            opacity: saving || !!overlapErr ? 0.7 : 1,
            fontFamily: 'system-ui, sans-serif',
          }}>
            {saving ? 'Adding…' : 'Add Booking'}
          </button>
        </div>
      </div>
    </form>
  );
}

// ── Confirm modal ─────────────────────────────────────────────────────────────
function ConfirmModal({ title, body, confirmLabel, confirmStyle, onConfirm, onCancel, loading }: {
  title: string; body: string; confirmLabel: string;
  confirmStyle?: React.CSSProperties;
  onConfirm: () => void; onCancel: () => void; loading?: boolean;
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onClick={onCancel}>
      <div style={{ background: '#fff', borderRadius: '16px', padding: '1.5rem', maxWidth: '400px', width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.25)' }}
        onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 800, fontSize: '1rem', color: '#111827', marginBottom: '0.5rem' }}>{title}</div>
        <div style={{ color: '#6b7280', fontSize: '0.875rem', lineHeight: 1.55, marginBottom: '1.5rem' }}>{body}</div>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
          <button onClick={onCancel} style={{ background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '8px', padding: '0.55rem 1rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui, sans-serif', fontSize: '0.85rem' }}>
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading}
            style={{ border: 'none', borderRadius: '8px', padding: '0.55rem 1.1rem', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'system-ui, sans-serif', fontSize: '0.85rem', opacity: loading ? 0.7 : 1, background: '#b91c1c', color: '#fff', ...confirmStyle }}>
            {loading ? 'Please wait…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main admin content ────────────────────────────────────────────────────────
function AdminContent() {
  const searchParams = useSearchParams();
  const siteId = searchParams?.get('siteId') || '';

  const [siteName, setSiteName]   = useState('');
  const [cranes, setCranes]       = useState<Crane[]>([]);
  const [bookings, setBookings]   = useState<Booking[]>([]);
  const [tab, setTab]             = useState<'bookings' | 'add' | 'cranes'>('bookings');
  const [dateFilter, setDateFilter]     = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [actionId, setActionId]         = useState<string | null>(null);
  const [deleteId, setDeleteId]         = useState<string | null>(null);
  const [craneDeleteId, setCraneDeleteId] = useState<string | null>(null);
  const [toast, setToast]               = useState('');

  // Cranes management
  const [newCraneName, setNewCraneName]     = useState('');
  const [craneAddSaving, setCraneAddSaving] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(''), 3000); };

  const fetchCranes = useCallback(() => {
    if (!siteId) return;
    supabase.from('cranes').select('id, name, is_active').eq('site_id', siteId).order('name')
      .then(({ data }) => setCranes((data as Crane[]) ?? []));
  }, [siteId]);

  const fetchBookings = useCallback(() => {
    if (!siteId) return;
    let q = supabase.from('crane_bookings').select('*').eq('site_id', siteId)
      .order('date', { ascending: false }).order('start_time');
    if (dateFilter) q = q.eq('date', dateFilter);
    if (statusFilter !== 'all') q = q.eq('status', statusFilter);
    q.then(({ data }) => setBookings((data as Booking[]) ?? []));
  }, [siteId, dateFilter, statusFilter]);

  useEffect(() => {
    if (!siteId) return;
    supabase.from('crane_logs_sites').select('site_name').eq('id', siteId).single()
      .then(({ data }) => { if (data?.site_name) setSiteName(data.site_name); });
  }, [siteId]);

  useEffect(() => { fetchCranes(); }, [fetchCranes]);
  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  async function setStatus(id: string, status: 'approved' | 'rejected') {
    setActionId(id);
    await supabase.from('crane_bookings').update({ status }).eq('id', id);
    setActionId(null);
    fetchBookings();
    showToast(`Booking ${status}.`);
  }

  async function handleDelete(id: string) {
    setActionId(id);
    await supabase.from('crane_bookings').delete().eq('id', id);
    setActionId(null);
    setDeleteId(null);
    setBookings(prev => prev.filter(b => b.id !== id));
    showToast('Booking deleted.');
  }

  async function handleAddCrane(e: React.FormEvent) {
    e.preventDefault();
    if (!newCraneName.trim()) return;
    setCraneAddSaving(true);
    await supabase.from('cranes').insert({ site_id: siteId, name: newCraneName.trim(), is_active: true });
    setCraneAddSaving(false);
    setNewCraneName('');
    fetchCranes();
    showToast('Crane added.');
  }

  async function handleToggleCrane(id: string, current: boolean) {
    await supabase.from('cranes').update({ is_active: !current }).eq('id', id);
    fetchCranes();
  }

  async function handleDeleteCrane(id: string) {
    await supabase.from('cranes').delete().eq('id', id);
    setCraneDeleteId(null);
    fetchCranes();
    showToast('Crane deleted.');
  }

  const craneName = (id: string) => cranes.find(c => c.id === id)?.name || '—';

  if (!siteId) return (
    <div style={{ padding: '3rem', fontFamily: 'system-ui, sans-serif', color: '#6b7280', textAlign: 'center' }}>
      Missing siteId query parameter.
    </div>
  );

  const tabBtn = (t: typeof tab, label: string) => (
    <button onClick={() => setTab(t)} style={{
      padding: '0.5rem 1rem', borderRadius: '8px', border: 'none',
      fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
      fontFamily: 'system-ui, sans-serif',
      background: tab === t ? BRAND : '#f3f4f6',
      color: tab === t ? '#fff' : '#374151',
    }}>
      {label}
    </button>
  );

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', fontFamily: 'system-ui, sans-serif', paddingBottom: '3rem' }}>

      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '0.9rem 1.5rem' }}>
        <div style={{ maxWidth: '1100px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '8px', height: '28px', background: BRAND, borderRadius: '4px', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#111827', lineHeight: 1 }}>Booking Manager</div>
            <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '0.15rem' }}>
              ProLifting Software{siteName ? ` · ${siteName}` : ''}
            </div>
          </div>
          <button onClick={fetchBookings} style={{ background: '#f3f4f6', border: 'none', borderRadius: '8px', padding: '0.45rem 0.85rem', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', color: '#374151', fontFamily: 'system-ui, sans-serif' }}>
            ↻ Refresh
          </button>
        </div>
      </div>

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '1.25rem 1rem' }}>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          {tabBtn('bookings', 'Bookings')}
          {tabBtn('add', '+ Add Booking')}
          {tabBtn('cranes', 'Cranes')}
        </div>

        {/* Toast */}
        {toast && (
          <div style={{ background: '#dcfce7', color: '#15803d', borderRadius: '8px', padding: '0.65rem 1rem', marginBottom: '1rem', fontSize: '0.85rem', fontWeight: 600 }}>
            ✓ {toast}
          </div>
        )}

        {/* ════ BOOKINGS TAB ════ */}
        {tab === 'bookings' && (
          <>
            {/* Filters */}
            <div style={{ ...card, display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
              <div style={{ flex: '1 1 160px' }}>
                <label style={labelStyle}>Date</label>
                <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ flex: '1 1 140px' }}>
                <label style={labelStyle}>Status</label>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={inputStyle}>
                  <option value="all">All statuses</option>
                  <option value="pending">Pending</option>
                  <option value="approved">Approved</option>
                  <option value="rejected">Rejected</option>
                </select>
              </div>
              {dateFilter && (
                <button type="button" onClick={() => setDateFilter('')} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '0.82rem', alignSelf: 'flex-end', paddingBottom: '0.65rem', fontFamily: 'system-ui, sans-serif' }}>
                  ✕ Clear date
                </button>
              )}
            </div>

            {/* Timeline */}
            {dateFilter && (
              <div style={card}>
                <div style={cardTitle}>Timeline — {dateFilter}</div>
                <AdminTimeline
                  cranes={cranes}
                  bookings={bookings.filter(b => b.date === dateFilter)}
                />
              </div>
            )}

            {/* Booking list */}
            <div style={{ ...card, padding: '1.25rem 1.25rem 0.75rem' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={cardTitle}>All Bookings</div>
                <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{bookings.length} record{bookings.length !== 1 ? 's' : ''}</div>
              </div>
              {bookings.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af', fontSize: '0.875rem' }}>
                  No bookings found.
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '820px' }}>
                    <thead>
                      <tr>
                        {['Date', 'Crane', 'Company', 'Booked By', 'Time', 'Status', 'Notes', ''].map(h => (
                          <th key={h} style={thStyle}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {bookings.map((b, i) => {
                        const sc = STATUS_COLOR[b.status] ?? STATUS_COLOR.rejected;
                        return (
                          <tr key={b.id} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
                            <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{b.date}</td>
                            <td style={{ ...tdStyle, whiteSpace: 'nowrap', fontWeight: 600 }}>{craneName(b.crane_id)}</td>
                            <td style={tdStyle}>{b.company}</td>
                            <td style={tdStyle}>
                              <div style={{ fontWeight: 500 }}>{b.booked_by}</div>
                              <div style={{ fontSize: '0.72rem', color: '#9ca3af' }}>{b.email}</div>
                            </td>
                            <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{b.start_time}–{b.end_time}</td>
                            <td style={tdStyle}>
                              <span style={{
                                display: 'inline-block', padding: '0.2rem 0.6rem',
                                borderRadius: '20px', fontSize: '0.72rem', fontWeight: 700,
                                background: sc.bg, color: sc.text,
                              }}>
                                {b.status}
                              </span>
                            </td>
                            <td style={{ ...tdStyle, maxWidth: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#6b7280', fontSize: '0.78rem' }}>
                              {b.notes || '—'}
                            </td>
                            <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                              {b.status === 'pending' && (
                                <>
                                  <button
                                    disabled={actionId === b.id}
                                    onClick={() => setStatus(b.id, 'approved')}
                                    style={{ background: '#dcfce7', color: '#15803d', border: 'none', borderRadius: '6px', padding: '0.28rem 0.6rem', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', marginRight: '0.3rem', fontFamily: 'system-ui, sans-serif' }}>
                                    ✓ Approve
                                  </button>
                                  <button
                                    disabled={actionId === b.id}
                                    onClick={() => setStatus(b.id, 'rejected')}
                                    style={{ background: '#fee2e2', color: '#b91c1c', border: 'none', borderRadius: '6px', padding: '0.28rem 0.6rem', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', marginRight: '0.3rem', fontFamily: 'system-ui, sans-serif' }}>
                                    ✗ Reject
                                  </button>
                                </>
                              )}
                              <button
                                disabled={actionId === b.id}
                                onClick={() => setDeleteId(b.id)}
                                style={{ background: '#f3f4f6', color: '#6b7280', border: 'none', borderRadius: '6px', padding: '0.28rem 0.5rem', fontSize: '0.82rem', cursor: 'pointer' }}>
                                🗑
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}

        {/* ════ ADD BOOKING TAB ════ */}
        {tab === 'add' && (
          <AddBookingForm
            siteId={siteId}
            cranes={cranes}
            onSuccess={() => { fetchBookings(); setTab('bookings'); showToast('Booking added successfully.'); }}
            onCancel={() => setTab('bookings')}
          />
        )}

        {/* ════ CRANES TAB ════ */}
        {tab === 'cranes' && (
          <>
            {/* Add crane */}
            <div style={card}>
              <div style={cardTitle}>Add Crane</div>
              <form onSubmit={handleAddCrane} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Crane Name *</label>
                  <input type="text" required placeholder="e.g. Crane 1, Tower A…" value={newCraneName}
                    onChange={e => setNewCraneName(e.target.value)} style={inputStyle} />
                </div>
                <button type="submit" disabled={craneAddSaving} style={{
                  background: BRAND, color: '#fff', border: 'none', borderRadius: '8px',
                  padding: '0.6rem 1.1rem', fontSize: '0.85rem', fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'system-ui, sans-serif', flexShrink: 0,
                }}>
                  {craneAddSaving ? 'Adding…' : '+ Add'}
                </button>
              </form>
            </div>

            {/* Crane list */}
            <div style={{ ...card, padding: '1.25rem 1.25rem 0.75rem' }}>
              <div style={cardTitle}>Cranes ({cranes.length})</div>
              {cranes.length === 0 ? (
                <div style={{ padding: '1.5rem', textAlign: 'center', color: '#9ca3af', fontSize: '0.875rem' }}>
                  No cranes yet. Add one above.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {cranes.map(c => (
                    <div key={c.id} style={{
                      display: 'flex', alignItems: 'center', gap: '0.75rem',
                      padding: '0.75rem 1rem', background: '#f9fafb',
                      borderRadius: '8px', border: '1px solid #e5e7eb',
                    }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: '#111827' }}>{c.name}</div>
                        <div style={{ fontSize: '0.72rem', color: c.is_active ? '#16a34a' : '#9ca3af', marginTop: '0.1rem' }}>
                          {c.is_active ? '● Active' : '○ Inactive'}
                        </div>
                      </div>
                      <button onClick={() => handleToggleCrane(c.id, c.is_active)} style={{
                        background: c.is_active ? '#fef3c7' : '#dcfce7',
                        color: c.is_active ? '#92400e' : '#15803d',
                        border: 'none', borderRadius: '6px', padding: '0.3rem 0.75rem',
                        fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                        fontFamily: 'system-ui, sans-serif',
                      }}>
                        {c.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button onClick={() => setCraneDeleteId(c.id)} style={{
                        background: '#fee2e2', color: '#b91c1c', border: 'none',
                        borderRadius: '6px', padding: '0.3rem 0.5rem',
                        fontSize: '0.82rem', cursor: 'pointer',
                      }}>
                        🗑
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Delete booking modal */}
      {deleteId && (
        <ConfirmModal
          title="Delete Booking"
          body="Are you sure you want to delete this booking? This cannot be undone."
          confirmLabel="Delete"
          onConfirm={() => handleDelete(deleteId)}
          onCancel={() => setDeleteId(null)}
          loading={actionId === deleteId}
        />
      )}

      {/* Delete crane modal */}
      {craneDeleteId && (
        <ConfirmModal
          title="Delete Crane"
          body={`Delete "${cranes.find(c => c.id === craneDeleteId)?.name}"? Any bookings linked to this crane will lose their crane reference.`}
          confirmLabel="Delete Crane"
          onConfirm={() => handleDeleteCrane(craneDeleteId)}
          onCancel={() => setCraneDeleteId(null)}
        />
      )}
    </div>
  );
}

export default function AdminPage() {
  return <Suspense><AdminContent /></Suspense>;
}
