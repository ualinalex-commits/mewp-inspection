'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '../../lib/supabase';

type Crane = { id: string; name: string };

type Booking = {
  id: string;
  crane_id: string;
  date: string;
  start_time: string;
  end_time: string;
  company: string;
  status: string;
};

const BRAND = '#d02a35';
const TL_START = 6 * 60;   // 06:00
const TL_END   = 22 * 60;  // 22:00
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

function timeToMins(t: string): number {
  const [h, m] = (t || '').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function overlaps(aS: string, aE: string, bS: string, bE: string): boolean {
  return timeToMins(aS) < timeToMins(bE) && timeToMins(aE) > timeToMins(bS);
}

function Timeline({
  bookings, pendingStart, pendingEnd,
}: {
  bookings: Booking[]; pendingStart: string; pendingEnd: string;
}) {
  const pos = (t: string) =>
    Math.max(0, Math.min(100, (timeToMins(t) - TL_START) / TL_SPAN * 100));
  const wid = (s: string, e: string) =>
    Math.max(0.5, Math.min(100 - pos(s), (timeToMins(e) - timeToMins(s)) / TL_SPAN * 100));
  const hours = Array.from({ length: 17 }, (_, i) => i + 6);
  const hasPending = pendingStart && pendingEnd && timeToMins(pendingEnd) > timeToMins(pendingStart);

  return (
    <div>
      {/* Hour labels */}
      <div style={{ position: 'relative', height: '18px', marginBottom: '3px' }}>
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

      {/* Track */}
      <div style={{ position: 'relative', height: '40px', background: '#f3f4f6', borderRadius: '8px', overflow: 'hidden' }}>
        {hours.map(h => (
          <div key={h} style={{
            position: 'absolute', left: `${(h * 60 - TL_START) / TL_SPAN * 100}%`,
            top: 0, bottom: 0, width: '1px', background: '#e5e7eb',
          }} />
        ))}

        {/* Approved bookings */}
        {bookings.map(b => (
          <div key={b.id}
            title={`${b.company}: ${b.start_time}–${b.end_time}`}
            style={{
              position: 'absolute',
              left: `${pos(b.start_time)}%`, width: `${wid(b.start_time, b.end_time)}%`,
              top: '5px', bottom: '5px',
              background: '#16a34a', borderRadius: '5px',
              display: 'flex', alignItems: 'center', overflow: 'hidden',
            }}>
            <span style={{ fontSize: '0.6rem', color: '#fff', fontWeight: 700, padding: '0 5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {b.start_time}–{b.end_time}
            </span>
          </div>
        ))}

        {/* User's current selection */}
        {hasPending && (
          <div style={{
            position: 'absolute',
            left: `${pos(pendingStart)}%`, width: `${wid(pendingStart, pendingEnd)}%`,
            top: '5px', bottom: '5px',
            background: '#3b82f6', borderRadius: '5px', opacity: 0.75,
          }} />
        )}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.7rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <span style={{ width: 10, height: 10, background: '#16a34a', borderRadius: 2, display: 'inline-block' }} /> Approved booking
        </span>
        {hasPending && (
          <span style={{ fontSize: '0.7rem', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <span style={{ width: 10, height: 10, background: '#3b82f6', borderRadius: 2, display: 'inline-block' }} /> Your request
          </span>
        )}
      </div>
    </div>
  );
}

function BookingContent() {
  const searchParams = useSearchParams();
  const siteId = searchParams?.get('siteId') || '';

  const [siteName, setSiteName]           = useState('');
  const [cranes, setCranes]               = useState<Crane[]>([]);
  const [approvedBookings, setApprovedBookings] = useState<Booking[]>([]);

  const [date, setDate]           = useState('');
  const [craneId, setCraneId]     = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime]     = useState('');
  const [company, setCompany]     = useState('');
  const [bookedBy, setBookedBy]   = useState('');
  const [email, setEmail]         = useState('');
  const [notes, setNotes]         = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted]   = useState(false);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    if (!siteId) return;
    supabase.from('crane_logs_sites').select('site_name').eq('id', siteId).single()
      .then(({ data }) => { if (data?.site_name) setSiteName(data.site_name); });
  }, [siteId]);

  useEffect(() => {
    if (!siteId) return;
    supabase.from('cranes').select('id, name').eq('site_id', siteId).eq('is_active', true).order('name')
      .then(({ data }) => setCranes((data as Crane[]) ?? []));
  }, [siteId]);

  useEffect(() => {
    if (!craneId || !date) { setApprovedBookings([]); return; }
    supabase.from('crane_bookings')
      .select('id, crane_id, date, start_time, end_time, company, status')
      .eq('crane_id', craneId).eq('date', date).eq('status', 'approved')
      .then(({ data }) => setApprovedBookings((data as Booking[]) ?? []));
  }, [craneId, date]);

  const overlapError =
    startTime && endTime && timeToMins(endTime) > timeToMins(startTime) &&
    approvedBookings.some(b => overlaps(startTime, endTime, b.start_time, b.end_time))
      ? 'This time slot overlaps with an existing approved booking. Please choose a different time.'
      : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (overlapError) return;
    if (!siteId) { setError('Missing site ID.'); return; }
    if (timeToMins(endTime) <= timeToMins(startTime)) { setError('End time must be after start time.'); return; }
    setSubmitting(true); setError(null);
    const { error: err } = await supabase.from('crane_bookings').insert({
      site_id: siteId, crane_id: craneId, date,
      start_time: startTime, end_time: endTime,
      company, booked_by: bookedBy, email,
      notes: notes.trim() || null,
      status: 'pending', created_by: 'subcontractor',
    });
    setSubmitting(false);
    if (err) { setError(err.message); return; }
    setSubmitted(true);
  }

  function resetForm() {
    setSubmitted(false);
    setDate(''); setCraneId(''); setStartTime(''); setEndTime('');
    setCompany(''); setBookedBy(''); setEmail(''); setNotes('');
  }

  if (!siteId) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif', color: '#6b7280' }}>
      No site specified.
    </div>
  );

  if (submitted) return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', fontFamily: 'system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem' }}>
      <div style={{ background: '#fff', borderRadius: '16px', padding: '2.5rem 2rem', textAlign: 'center', maxWidth: '460px', width: '100%', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}>
        <div style={{ width: '64px', height: '64px', background: '#dcfce7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem', fontSize: '2rem', color: '#16a34a' }}>✓</div>
        <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#111827', marginBottom: '0.75rem' }}>Request Submitted!</div>
        <div style={{ color: '#6b7280', lineHeight: 1.6, fontSize: '0.9rem' }}>
          Your booking request has been submitted and is awaiting approval.
        </div>
        <div style={{ color: '#9ca3af', fontSize: '0.83rem', marginTop: '0.5rem' }}>
          We&apos;ll be in touch at <strong style={{ color: '#374151' }}>{email}</strong>.
        </div>
        <button onClick={resetForm} style={{
          marginTop: '1.75rem', background: BRAND, color: '#fff', border: 'none',
          borderRadius: '8px', padding: '0.65rem 1.5rem', fontWeight: 700,
          fontSize: '0.9rem', cursor: 'pointer', fontFamily: 'system-ui, sans-serif',
        }}>
          Submit Another Request
        </button>
      </div>
    </div>
  );

  const selectedCraneName = cranes.find(c => c.id === craneId)?.name;

  return (
    <div style={{ minHeight: '100vh', background: '#f3f4f6', fontFamily: 'system-ui, sans-serif', paddingBottom: '3rem' }}>
      {/* Header */}
      <div style={{ background: '#fff', borderBottom: '1px solid #e5e7eb', padding: '0.9rem 1.5rem' }}>
        <div style={{ maxWidth: '680px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '8px', height: '28px', background: BRAND, borderRadius: '4px', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: '#111827', lineHeight: 1 }}>Crane Booking Request</div>
            <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: '0.15rem' }}>
              ProLifting Software{siteName ? ` · ${siteName}` : ''}
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '680px', margin: '0 auto', padding: '1.5rem 1rem' }}>
        <form onSubmit={handleSubmit}>

          {/* Step 1 — Crane & Date */}
          <div style={card}>
            <div style={cardTitle}>1 · Select Crane & Date</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={labelStyle}>Date *</label>
                <input type="date" required value={date} onChange={e => setDate(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Crane *</label>
                <select required value={craneId} onChange={e => setCraneId(e.target.value)} style={inputStyle}>
                  <option value="">Select crane…</option>
                  {cranes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Timeline — only shown when both crane and date are selected */}
          {craneId && date && (
            <div style={card}>
              <div style={cardTitle}>
                Availability — {selectedCraneName} on {date}
              </div>
              <Timeline bookings={approvedBookings} pendingStart={startTime} pendingEnd={endTime} />
              {approvedBookings.length === 0 && (
                <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: '0.6rem' }}>
                  No approved bookings yet — crane is fully available.
                </div>
              )}
            </div>
          )}

          {/* Step 2 — Time Slot */}
          <div style={card}>
            <div style={cardTitle}>2 · Time Slot</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={labelStyle}>Start Time *</label>
                <input type="time" required value={startTime} onChange={e => setStartTime(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>End Time *</label>
                <input type="time" required value={endTime} onChange={e => setEndTime(e.target.value)} style={inputStyle} />
              </div>
            </div>
            {overlapError && (
              <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: '8px', padding: '0.65rem 0.9rem', marginTop: '0.75rem', fontSize: '0.82rem' }}>
                ⚠️ {overlapError}
              </div>
            )}
          </div>

          {/* Step 3 — Contact Details */}
          <div style={card}>
            <div style={cardTitle}>3 · Your Details</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Company Name *</label>
                <input type="text" required placeholder="Your company name" value={company} onChange={e => setCompany(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Your Name *</label>
                <input type="text" required placeholder="Full name" value={bookedBy} onChange={e => setBookedBy(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={labelStyle}>Email *</label>
                <input type="email" required placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} style={inputStyle} />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Notes (optional)</label>
                <textarea
                  placeholder="Load description, special requirements…"
                  value={notes} onChange={e => setNotes(e.target.value)}
                  style={{ ...inputStyle, height: '82px', resize: 'vertical' }}
                />
              </div>
            </div>
          </div>

          {error && (
            <div style={{ background: '#fee2e2', color: '#991b1b', borderRadius: '8px', padding: '0.75rem 1rem', marginBottom: '1rem', fontSize: '0.85rem' }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !!overlapError}
            style={{
              width: '100%', background: BRAND, color: '#fff', border: 'none',
              borderRadius: '10px', padding: '0.9rem', fontSize: '1rem', fontWeight: 700,
              cursor: submitting || !!overlapError ? 'not-allowed' : 'pointer',
              opacity: submitting || !!overlapError ? 0.65 : 1,
              fontFamily: 'system-ui, sans-serif',
            }}
          >
            {submitting ? 'Submitting…' : 'Submit Booking Request'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function BookingPage() {
  return <Suspense><BookingContent /></Suspense>;
}
