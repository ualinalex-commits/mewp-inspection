import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabase";
import QRCode from "qrcode";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://yourapp.com";
const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function toLocalDateStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function getWeekDates() {
  const today = new Date();
  const dow = today.getDay();
  const fromMon = (dow + 6) % 7;
  const mon = new Date(today);
  mon.setDate(today.getDate() - fromMon);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return toLocalDateStr(d);
  });
}

function fmtTs(ts) {
  if (!ts) return null;
  return new Date(ts).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function fmtWeekDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-");
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${parseInt(d)} ${months[parseInt(m)-1]} ${y}`;
}

function isExamExpired(expiry) {
  if (!expiry) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(expiry + "T00:00:00") < today;
}

const S = {
  app: { minHeight: "100vh", background: "#f3f4f6", fontFamily: "system-ui, -apple-system, sans-serif", color: "#111827", paddingBottom: "4rem" },
  logoBar: { background: "#fff", padding: "0.25rem 1rem", display: "flex", alignItems: "center", justifyContent: "center" },
  infoBar: { background: "#d02a35", padding: "0.75rem 1.25rem", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 2px 8px rgba(0,0,0,0.15)" },
  container: { maxWidth: "640px", margin: "0 auto", padding: "1rem" },
  card: { background: "#fff", borderRadius: "12px", overflow: "hidden", marginBottom: "1rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" },
  cardHead: (color = "#d02a35") => ({ background: color, padding: "0.75rem 1rem", display: "flex", alignItems: "center", gap: "0.6rem" }),
  cardHeadText: { fontSize: "0.8rem", fontWeight: 800, color: "#fff", letterSpacing: "0.04em", textTransform: "uppercase" },
  input: { width: "100%", background: "#f9fafb", border: "2px solid #e5e7eb", borderRadius: "10px", color: "#111827", padding: "0.85rem 1rem", fontSize: "1rem", fontFamily: "system-ui, sans-serif", outline: "none", boxSizing: "border-box" },
  label: { fontSize: "0.75rem", fontWeight: 700, color: "#374151", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "0.4rem", display: "block" },
  primaryBtn: (color = "#d02a35") => ({ width: "100%", background: color, color: "#fff", border: "none", borderRadius: "12px", padding: "1rem", fontSize: "1rem", fontWeight: 800, cursor: "pointer", fontFamily: "system-ui, sans-serif", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }),
  ghostBtn: (color = "#374151") => ({ background: "#fff", color, border: `2px solid ${color}33`, borderRadius: "10px", padding: "0.65rem 1rem", fontSize: "0.82rem", fontWeight: 700, cursor: "pointer", fontFamily: "system-ui, sans-serif", whiteSpace: "nowrap" }),
  statPill: (color) => ({ background: `${color}15`, border: `2px solid ${color}30`, color, fontSize: "0.72rem", fontWeight: 800, padding: "0.3rem 0.75rem", borderRadius: "20px", textTransform: "uppercase" }),
  detailsBtn: { background: "#fff", color: "#d02a35", border: "2px solid #d02a35", borderRadius: "8px", padding: "0.35rem 0.85rem", fontSize: "0.78rem", fontWeight: 700, cursor: "pointer", fontFamily: "system-ui, sans-serif", whiteSpace: "nowrap", flexShrink: 0 },
};

function QRCanvas({ url, size = 160 }) {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (canvasRef.current && url) {
      QRCode.toCanvas(canvasRef.current, url, { width: size, margin: 2, color: { dark: "#000", light: "#fff" } });
    }
  }, [url, size]);
  return <canvas ref={canvasRef} style={{ borderRadius: "8px", display: "block" }} />;
}

function AddMEWPModal({ siteId, onClose, onAdded }) {
  const [form, setForm] = useState({ name: "", model: "", serialNumber: "" });
  const [loading, setLoading] = useState(false);
  async function handleAdd() {
    if (!form.name.trim()) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.from("mewps").insert({ site_id: siteId, machine_ref: form.name.trim(), model: form.model.trim() || null, serial_number: form.serialNumber.trim() || null }).select().single();
      if (error) throw error;
      const nfcUrl = `${BASE_URL}/check/${data.id}`;
      await supabase.from("mewps").update({ nfc_url: nfcUrl }).eq("id", data.id);
      onAdded({ ...data, nfc_url: nfcUrl });
      onClose();
    } catch (e) { alert("Error: " + e.message); }
    finally { setLoading(false); }
  }
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "1rem" }}>
      <div style={{ background: "#fff", borderRadius: "16px", width: "100%", maxWidth: "500px", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem", boxShadow: "0 4px 24px rgba(0,0,0,0.2)", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: "1.1rem", fontWeight: 900, color: "#111827" }}>+ Add MEWP</div>
          <button onClick={onClose} style={{ background: "#f3f4f6", border: "none", borderRadius: "50%", width: "2rem", height: "2rem", cursor: "pointer", fontSize: "1rem", color: "#374151" }}>×</button>
        </div>
        {[{ key: "name", label: "MEWP Name / ID *", placeholder: "e.g. MEWP-01, Scissor Lift A" }, { key: "model", label: "Model", placeholder: "e.g. Genie GS-2632" }, { key: "serialNumber", label: "Serial Number", placeholder: "e.g. SN-001234" }].map(f => (
          <div key={f.key}><label style={S.label}>{f.label}</label><input type="text" placeholder={f.placeholder} value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} style={S.input} /></div>
        ))}
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button style={{ ...S.ghostBtn(), flex: 1, padding: "0.85rem" }} onClick={onClose}>Cancel</button>
          <button style={{ ...S.primaryBtn(), flex: 2, opacity: form.name.trim() && !loading ? 1 : 0.4 }} onClick={handleAdd} disabled={!form.name.trim() || loading}>{loading ? "Adding..." : "Add MEWP"}</button>
        </div>
      </div>
    </div>
  );
}

function WeeklyTracker({ mewpId, refreshKey }) {
  const [doneSet, setDoneSet] = useState(null);
  const weekDates = getWeekDates();
  const todayStr = toLocalDateStr(new Date());

  useEffect(() => { load(); }, [mewpId, refreshKey]);

  async function load() {
    const { data } = await supabase
      .from("daily_inspection_entries")
      .select("inspection_date")
      .eq("mewp_id", mewpId)
      .in("inspection_date", weekDates);
    setDoneSet(new Set((data || []).map(d => d.inspection_date)));
  }

  return (
    <div style={{ padding: "0.75rem 0 0.25rem 0" }}>
      <div style={{ fontSize: "0.65rem", fontWeight: 800, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.5rem" }}>This week</div>
      <div style={{ display: "flex", gap: "0.35rem" }}>
        {weekDates.map((date, i) => {
          const isFuture = date > todayStr;
          const done = doneSet ? doneSet.has(date) : null;
          const isToday = date === todayStr;
          let bg, border;
          if (doneSet === null) { bg = "#e5e7eb"; border = "2px solid transparent"; }
          else if (done) { bg = "#15803d"; border = isToday ? "2px solid #14532d" : "2px solid transparent"; }
          else if (isFuture) { bg = "#e5e7eb"; border = "2px solid transparent"; }
          else { bg = "#dc2626"; border = isToday ? "2px solid #7f1d1d" : "2px solid transparent"; }
          return (
            <div key={date} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.2rem", flex: 1 }}>
              <div style={{ width: "100%", aspectRatio: "1", maxWidth: "40px", borderRadius: "6px", background: bg, border, boxSizing: "border-box" }} />
              <div style={{ fontSize: "0.58rem", color: isToday ? "#d02a35" : "#9ca3af", fontWeight: isToday ? 900 : 700, textTransform: "uppercase" }}>{WEEK_DAYS[i]}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ReportsPanel({ mewpId }) {
  const [show, setShow] = useState(false);
  const [reports, setReports] = useState(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("weekly_inspection_sheets")
      .select("id, week_commencing, pdf_url, pdf_generated_at")
      .eq("mewp_id", mewpId)
      .not("pdf_url", "is", null)
      .order("week_commencing", { ascending: false });
    setReports(data || []);
    setLoading(false);
  }

  function toggle() {
    if (!show && reports === null) load();
    setShow(v => !v);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <button style={S.ghostBtn("#15803d")} onClick={toggle}>
        {show ? "Hide Reports" : "View Reports"}
      </button>
      {show && (
        <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "10px", padding: "0.85rem" }}>
          <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "#15803d", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.6rem" }}>Weekly PDF Reports</div>
          {loading && <div style={{ fontSize: "0.82rem", color: "#6b7280" }}>Loading reports...</div>}
          {!loading && reports?.length === 0 && (
            <div style={{ fontSize: "0.82rem", color: "#9ca3af" }}>No PDF reports generated yet.</div>
          )}
          {!loading && reports && reports.map((r, i) => (
            <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 0", borderBottom: i < reports.length - 1 ? "1px solid #bbf7d0" : "none", gap: "0.5rem" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#15803d" }}>Week of {fmtWeekDate(r.week_commencing)}</div>
                {r.pdf_generated_at && (
                  <div style={{ fontSize: "0.68rem", color: "#9ca3af" }}>Generated {fmtTs(r.pdf_generated_at)}</div>
                )}
              </div>
              <a
                href={r.pdf_url ? `${r.pdf_url}${r.pdf_url.includes('?') ? '&' : '?'}t=${Date.now()}` : r.pdf_url}
                target="_blank"
                rel="noreferrer"
                style={{ background: "#15803d", color: "#fff", borderRadius: "8px", padding: "0.4rem 0.85rem", fontSize: "0.78rem", fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap", flexShrink: 0 }}
              >
                Open PDF
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ThoroughExamModal({ mewpId, currentExpiry, onClose, onSaved }) {
  const [file, setFile] = useState(null);
  const [expiry, setExpiry] = useState(currentExpiry || "");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function handleUpload() {
    if (!file || !expiry) return;
    setUploading(true);
    setError("");
    try {
      const ext = file.name.split(".").pop().toLowerCase();
      const path = `${mewpId}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from("thorough-exams").upload(path, file, { upsert: true });
      if (uploadErr) throw uploadErr;
      const { data: { publicUrl } } = supabase.storage.from("thorough-exams").getPublicUrl(path);
      const { error: updateErr } = await supabase.from("mewps").update({ thorough_exam_url: publicUrl, thorough_exam_expiry: expiry, thorough_exam_filename: file.name, thorough_exam_uploaded_at: new Date().toISOString() }).eq("id", mewpId);
      if (updateErr) throw updateErr;
      onSaved(publicUrl, expiry, file.name);
    } catch (e) {
      setError(e.message);
      setUploading(false);
    }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "1rem" }}>
      <div style={{ background: "#fff", borderRadius: "16px", width: "100%", maxWidth: "500px", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem", boxShadow: "0 4px 24px rgba(0,0,0,0.2)", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: "1.1rem", fontWeight: 900, color: "#111827" }}>📄 Thorough Examination</div>
          <button onClick={onClose} style={{ background: "#f3f4f6", border: "none", borderRadius: "50%", width: "2rem", height: "2rem", cursor: "pointer", fontSize: "1rem", color: "#374151" }}>×</button>
        </div>
        <div>
          <label style={S.label}>Document / Image *</label>
          <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={e => setFile(e.target.files?.[0] || null)} style={{ ...S.input, padding: "0.6rem 1rem", cursor: "pointer" }} />
          {file && <div style={{ fontSize: "0.75rem", color: "#6b7280", marginTop: "0.3rem" }}>{file.name} ({(file.size / 1024).toFixed(1)} KB)</div>}
        </div>
        <div>
          <label style={S.label}>Expiry Date *</label>
          <input type="date" value={expiry} onChange={e => setExpiry(e.target.value)} style={S.input} />
        </div>
        {error && <div style={{ fontSize: "0.85rem", color: "#dc2626", background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "0.65rem" }}>{error}</div>}
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button style={{ ...S.ghostBtn(), flex: 1, padding: "0.85rem" }} onClick={onClose}>Cancel</button>
          <button style={{ ...S.primaryBtn("#7c3aed"), flex: 2, opacity: (file && expiry && !uploading) ? 1 : 0.4 }} onClick={handleUpload} disabled={!file || !expiry || uploading}>{uploading ? "Uploading..." : "Upload"}</button>
        </div>
      </div>
    </div>
  );
}

function MEWPCard({ mewp, todayInspection, initialPdfUrl, initialPdfGeneratedAt, isExpanded, onToggle, refreshKey, onArchive, isAdmin }) {
  const [showNFC, setShowNFC] = useState(false);
  const [faults, setFaults] = useState(null);
  const [loadingFaults, setLoadingFaults] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const nfcUrl = mewp.nfc_url || `${BASE_URL}/check/${mewp.id}`;
  const hasFault = todayInspection?.daily_status === "fault";
  const [examData, setExamData] = useState({ url: mewp.thorough_exam_url || null, expiry: mewp.thorough_exam_expiry || null, filename: mewp.thorough_exam_filename || null });
  const [showExamModal, setShowExamModal] = useState(false);

  useEffect(() => {
    if (isExpanded && hasFault && todayInspection?.id && faults === null) loadFaultsData();
  }, [isExpanded]);

  async function loadFaultsData() {
    setLoadingFaults(true);
    try {
      const { data: defectData } = await supabase.from("defect_log").select("item_number, defect_details, status").eq("entry_id", todayInspection.id);
      if (defectData && defectData.length > 0) {
        const itemNums = defectData.map(d => d.item_number);
        const { data: itemsData } = await supabase.from("check_items").select("item_number, description").in("item_number", itemNums);
        const itemMap = {};
        (itemsData || []).forEach(i => { itemMap[i.item_number] = i.description; });
        setFaults(defectData.map(d => ({ ...d, description: itemMap[d.item_number] || `Item #${d.item_number}` })));
      } else {
        setFaults([]);
      }
    } catch (e) { console.error(e); setFaults([]); }
    finally { setLoadingFaults(false); }
  }

  async function handleArchive() {
    setArchiving(true);
    await onArchive(mewp.id, true);
    setArchiving(false);
  }

  const statusColor = todayInspection ? (hasFault ? "#dc2626" : "#15803d") : "#6b7280";
  const inspTime = todayInspection?.submitted_at
    ? new Date(todayInspection.submitted_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : null;

  function copyNFC() { navigator.clipboard.writeText(nfcUrl); alert("NFC URL copied!"); }

  return (
    <div>
      {/* Collapsed header */}
      <div style={{ minHeight: "64px", padding: "0 1rem", display: "flex", alignItems: "center", gap: "0.75rem", background: isExpanded ? "#f8faff" : "#fff", transition: "background 0.2s" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "1.05rem", fontWeight: 900, color: "#111827" }}>{mewp.machine_ref}{mewp.serial_number ? ` - ${mewp.serial_number}` : ""}</div>
          {mewp.model && (
            <div style={{ fontSize: "0.78rem", color: "#9ca3af", marginTop: "0.1rem" }}>{mewp.model}</div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.2rem", flexShrink: 0 }}>
          <span style={S.statPill(statusColor)}>
            {todayInspection ? (hasFault ? "Faults" : `Done${inspTime ? ` ${inspTime}` : ""}`) : "Pending"}
          </span>
          {todayInspection?.operator_name && (
            <span style={{ fontSize: "0.72rem", color: "#6b7280" }}>{todayInspection.operator_name}</span>
          )}
        </div>
        <button style={S.detailsBtn} onClick={onToggle}>{isExpanded ? "Close" : "Details"}</button>
      </div>

      {/* Expandable body */}
      <div style={{ overflow: "hidden", maxHeight: isExpanded ? "2400px" : "0", transition: "max-height 0.35s ease" }}>
        <div style={{ padding: "0 1rem 1rem 1rem", display: "flex", flexDirection: "column", gap: "0.75rem", borderTop: "1px solid #f0f0f0" }}>

          <WeeklyTracker mewpId={mewp.id} refreshKey={refreshKey} />

          {/* Today's status */}
          {todayInspection ? (
            <div style={{ background: hasFault ? "#fef2f2" : "#f0fdf4", border: `1px solid ${hasFault ? "#fecaca" : "#bbf7d0"}`, borderRadius: "8px", padding: "0.65rem 0.85rem" }}>
              <div style={{ fontSize: "0.85rem", color: hasFault ? "#b91c1c" : "#15803d", fontWeight: 600 }}>
                {hasFault ? "Faults found" : "All clear"} — {todayInspection.operator_name}
                {inspTime && <span style={{ color: "#9ca3af", fontWeight: 400, marginLeft: "0.5rem" }}>{inspTime}</span>}
              </div>
              {todayInspection.pal_card_number && (
                <div style={{ fontSize: "0.78rem", color: "#6b7280", marginTop: "0.25rem" }}>PAL Card: {todayInspection.pal_card_number}</div>
              )}
            </div>
          ) : (
            <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "0.65rem 0.85rem", fontSize: "0.85rem", color: "#6b7280", fontWeight: 600 }}>
              Not yet inspected today
            </div>
          )}

          {hasFault && loadingFaults && <div style={{ fontSize: "0.82rem", color: "#b91c1c", padding: "0.5rem 0" }}>Loading fault details...</div>}
          {hasFault && faults?.length > 0 && (
            <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "0.85rem" }}>
              <div style={{ fontSize: "0.8rem", fontWeight: 800, color: "#b91c1c", marginBottom: "0.65rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>Faults Logged Today</div>
              {faults.map((fault, i) => (
                <div key={fault.item_number} style={{ marginBottom: i < faults.length - 1 ? "0.65rem" : 0, paddingBottom: i < faults.length - 1 ? "0.65rem" : 0, borderBottom: i < faults.length - 1 ? "1px solid #fecaca" : "none" }}>
                  <div style={{ fontSize: "0.78rem", fontWeight: 800, color: "#b91c1c" }}>Item #{String(fault.item_number).padStart(2, "0")} — {fault.description}</div>
                  <div style={{ fontSize: "0.82rem", color: "#7f1d1d", marginTop: "0.25rem", lineHeight: 1.5 }}>{fault.defect_details}</div>
                  <span style={{ display: "inline-block", marginTop: "0.3rem", fontSize: "0.65rem", fontWeight: 800, textTransform: "uppercase", padding: "0.15rem 0.5rem", borderRadius: "20px", background: fault.status === "repaired" ? "#bbf7d0" : fault.status === "open" ? "#fecaca" : "#fde68a", color: fault.status === "repaired" ? "#15803d" : fault.status === "open" ? "#991b1b" : "#92400e" }}>{fault.status}</span>
                </div>
              ))}
            </div>
          )}

          {/* Thorough Examination */}
          <div style={{ background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: "10px", padding: "0.85rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "#7c3aed", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.4rem" }}>Thorough Examination</div>
                {examData.url ? (
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                      {examData.expiry && (
                        <>
                          <span style={{ fontSize: "0.82rem", color: "#374151", fontWeight: 600 }}>Valid until {formatDate(examData.expiry)}</span>
                          {isExamExpired(examData.expiry) ? (
                            <span style={{ background: "#fecaca", color: "#991b1b", fontSize: "0.65rem", fontWeight: 800, padding: "0.15rem 0.5rem", borderRadius: "20px", textTransform: "uppercase" }}>Expired</span>
                          ) : (
                            <span style={{ background: "#bbf7d0", color: "#15803d", fontSize: "0.65rem", fontWeight: 800, padding: "0.15rem 0.5rem", borderRadius: "20px", textTransform: "uppercase" }}>Valid</span>
                          )}
                        </>
                      )}
                    </div>
                    {examData.filename && <div style={{ fontSize: "0.7rem", color: "#9ca3af", marginTop: "0.2rem" }}>{examData.filename}</div>}
                  </div>
                ) : (
                  <div style={{ fontSize: "0.82rem", color: "#9ca3af" }}>No examination on file</div>
                )}
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem", flexShrink: 0 }}>
                {examData.url && (
                  <a href={examData.url} target="_blank" rel="noreferrer" style={{ background: "#7c3aed", color: "#fff", borderRadius: "8px", padding: "0.4rem 0.85rem", fontSize: "0.78rem", fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap", textAlign: "center" }}>Open File</a>
                )}
                {isAdmin && <button style={{ background: "#fff", color: "#7c3aed", border: "2px solid #7c3aed55", borderRadius: "8px", padding: "0.4rem 0.85rem", fontSize: "0.78rem", fontWeight: 700, cursor: "pointer", fontFamily: "system-ui, sans-serif", whiteSpace: "nowrap" }} onClick={() => setShowExamModal(true)}>{examData.url ? "Update" : "Upload"}</button>}
              </div>
            </div>
          </div>

          {showExamModal && (
            <ThoroughExamModal
              mewpId={mewp.id}
              currentExpiry={examData.expiry}
              onClose={() => setShowExamModal(false)}
              onSaved={(url, expiry, filename) => { setExamData({ url, expiry, filename }); setShowExamModal(false); }}
            />
          )}

          {/* Current week PDF */}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
            {initialPdfUrl ? (
              <a href={`${initialPdfUrl}${initialPdfUrl.includes('?') ? '&' : '?'}t=${Date.now()}`} target="_blank" rel="noreferrer" style={{ background: "#fff", color: "#15803d", border: "2px solid #15803d55", borderRadius: "10px", padding: "0.65rem 1rem", fontSize: "0.82rem", fontWeight: 700, cursor: "pointer", fontFamily: "system-ui, sans-serif", whiteSpace: "nowrap", textDecoration: "none" }}>View PDF</a>
            ) : (
              <span style={{ background: "#f9fafb", color: "#9ca3af", border: "2px solid #e5e7eb", borderRadius: "10px", padding: "0.65rem 1rem", fontSize: "0.82rem", fontWeight: 700, fontFamily: "system-ui, sans-serif", whiteSpace: "nowrap" }}>No PDF yet</span>
            )}
            {initialPdfGeneratedAt && <span style={{ fontSize: "0.72rem", color: "#9ca3af" }}>Last updated: {fmtTs(initialPdfGeneratedAt)}</span>}
          </div>

          {/* All historical reports */}
          <ReportsPanel mewpId={mewp.id} />

          {/* QR Code action buttons */}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button style={S.ghostBtn("#d02a35")} onClick={() => setShowNFC(!showNFC)}>{showNFC ? "Hide QR Code" : "QR Code"}</button>
            <button style={S.ghostBtn()} onClick={copyNFC}>Copy URL</button>
            <a href={nfcUrl} target="_blank" rel="noreferrer" style={{ ...S.ghostBtn("#d02a35"), textDecoration: "none" }}>Open Form</a>
          </div>

          {/* QR Code panel */}
          {showNFC && (
            <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "1.25rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.85rem" }}>
              <div style={{ fontSize: "0.75rem", color: "#6b7280", textAlign: "center", fontWeight: 600 }}>Print this QR code and attach it to the physical MEWP</div>
              <QRCanvas url={nfcUrl} size={160} />
              <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "0.6rem 0.85rem", fontSize: "0.65rem", color: "#6b7280", wordBreak: "break-all", textAlign: "center", width: "100%", boxSizing: "border-box" }}>{nfcUrl}</div>
            </div>
          )}

          {/* Archive toggle — admin only */}
          {isAdmin && (
            <div style={{ paddingTop: "0.75rem", borderTop: "1px solid #f3f4f6" }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>Machine Status</div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#15803d" }}>Active</span>
                <div
                  onClick={archiving ? undefined : handleArchive}
                  role="switch"
                  aria-checked="true"
                  style={{ width: "44px", height: "24px", background: "#d02a35", borderRadius: "12px", cursor: archiving ? "not-allowed" : "pointer", position: "relative", flexShrink: 0, opacity: archiving ? 0.5 : 1, transition: "opacity 0.2s" }}
                >
                  <span style={{ position: "absolute", top: "3px", left: "3px", width: "18px", height: "18px", background: "#fff", borderRadius: "50%", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", display: "block" }} />
                </div>
                <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#9ca3af" }}>Archived</span>
                {archiving && <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>Archiving...</span>}
              </div>
              <div style={{ fontSize: "0.72rem", color: "#9ca3af", marginTop: "0.35rem" }}>Switch to Archived to remove from daily inspection list</div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

function ArchivedMEWPCard({ mewp, onRestore, isAdmin }) {
  const [expanded, setExpanded] = useState(false);
  const [restoring, setRestoring] = useState(false);

  async function handleRestore() {
    setRestoring(true);
    await onRestore(mewp.id);
    setRestoring(false);
  }

  return (
    <div style={{ background: "#fff", borderRadius: "12px", overflow: "hidden", marginBottom: "0.5rem", border: "1px solid #f3f4f6", boxShadow: "0 1px 3px rgba(0,0,0,0.06)" }}>
      {/* Header */}
      <div style={{ minHeight: "60px", padding: "0 1rem", display: "flex", alignItems: "center", gap: "0.75rem", background: expanded ? "#fafafa" : "#fff" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "1rem", fontWeight: 900, color: "#6b7280" }}>{mewp.machine_ref}{mewp.serial_number ? ` - ${mewp.serial_number}` : ""}</div>
          {mewp.model && (
            <div style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: "0.1rem" }}>{mewp.model}</div>
          )}
        </div>
        <span style={{ ...S.statPill("#6b7280"), fontSize: "0.68rem" }}>Archived</span>
        <button style={S.detailsBtn} onClick={() => setExpanded(v => !v)}>{expanded ? "Close" : "Details"}</button>
      </div>

      {/* Expandable body */}
      <div style={{ overflow: "hidden", maxHeight: expanded ? "800px" : "0", transition: "max-height 0.3s ease" }}>
        <div style={{ padding: "0 1rem 1rem 1rem", display: "flex", flexDirection: "column", gap: "0.75rem", borderTop: "1px solid #f0f0f0" }}>

          <ReportsPanel mewpId={mewp.id} />

          {/* Restore toggle — admin only */}
          {isAdmin && (
            <div style={{ paddingTop: "0.75rem", borderTop: "1px solid #f3f4f6" }}>
              <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.5rem" }}>Machine Status</div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#9ca3af" }}>Active</span>
                <div
                  onClick={restoring ? undefined : handleRestore}
                  role="switch"
                  aria-checked="false"
                  style={{ width: "44px", height: "24px", background: "#e5e7eb", borderRadius: "12px", cursor: restoring ? "not-allowed" : "pointer", position: "relative", flexShrink: 0, opacity: restoring ? 0.5 : 1, transition: "opacity 0.2s" }}
                >
                  <span style={{ position: "absolute", top: "3px", left: "23px", width: "18px", height: "18px", background: "#fff", borderRadius: "50%", boxShadow: "0 1px 3px rgba(0,0,0,0.2)", display: "block" }} />
                </div>
                <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#6b7280" }}>Archived</span>
                {restoring && <span style={{ fontSize: "0.75rem", color: "#6b7280" }}>Restoring...</span>}
              </div>
              <div style={{ fontSize: "0.72rem", color: "#9ca3af", marginTop: "0.35rem" }}>Switch to Active to restore to daily inspection list</div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

export default function SiteDashboard({ siteId }) {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [isMainAdmin, setIsMainAdmin] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [site, setSite] = useState(null);
  const [mewps, setMewps] = useState([]);
  const [todayInspections, setTodayInspections] = useState({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSiteQR, setShowSiteQR] = useState(false);
  const [stats, setStats] = useState({ total: 0, doneToday: 0, faultsToday: 0 });
  const [sheetPdfUrls, setSheetPdfUrls] = useState({});
  const [sheetPdfTimestamps, setSheetPdfTimestamps] = useState({});
  const [expandedMewpId, setExpandedMewpId] = useState(null);
  const [rtRefreshKey, setRtRefreshKey] = useState(0);
  const [showArchived, setShowArchived] = useState(false);
  const [archivedMewps, setArchivedMewps] = useState([]);
  const [loadingArchived, setLoadingArchived] = useState(false);
  const showArchivedRef = useRef(false);
  const mewpsRef = useRef([]);
  const siteUrl = `${BASE_URL}/site/${siteId}`;

  useEffect(() => { checkAdminStatus(); }, [siteId]);
  useEffect(() => { showArchivedRef.current = showArchived; }, [showArchived]);
  useEffect(() => { mewpsRef.current = mewps; }, [mewps]);

  useEffect(() => { if (siteId) loadData(); }, [siteId]);

  async function checkAdminStatus() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      const bypass = localStorage.getItem(`site_bypass_${siteId}`);
      if (bypass === "granted") setIsAdmin(true);
      setAuthChecked(true);
      return;
    }
    const { data: profile } = await supabase.from("user_profiles").select("role, site_id").eq("id", session.user.id).single();
    if (profile && profile.role === "main_admin") {
      setIsMainAdmin(true);
    }
    if (profile && (profile.role === "main_admin" || (profile.role === "site_admin" && profile.site_id === siteId))) {
      setIsAdmin(true);
    }
    setAuthChecked(true);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    setIsAdmin(false);
    router.push("/login");
  }

  useEffect(() => {
    if (!siteId) return;
    // Only listen for UPDATE events — INSERT is handled via local state in onAdded,
    // and real-time INSERT events don't fire when written via the service role key.
    const channel = supabase
      .channel(`site-${siteId}-mewps`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "mewps" }, async (payload) => {
        const record = payload.new || payload.old;
        if (record && record.site_id !== siteId) return;
        const { data: mewpData } = await supabase
          .from("mewps")
          .select("*")
          .eq("site_id", siteId)
          .eq("active", true)
          .or("is_archived.eq.false,is_archived.is.null")
          .order("created_at", { ascending: true });
        setMewps(mewpData || []);
        setStats(prev => ({ ...prev, total: (mewpData || []).length }));
        if (showArchivedRef.current) {
          const { data: archivedData } = await supabase
            .from("mewps")
            .select("*")
            .eq("site_id", siteId)
            .eq("is_archived", true)
            .order("created_at", { ascending: true });
          setArchivedMewps(archivedData || []);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [siteId]);

  useEffect(() => {
    if (!siteId) return;
    const channel = supabase
      .channel(`site-${siteId}-inspections`)
      .on("postgres_changes", { event: "*", schema: "public", table: "daily_inspection_entries", filter: `site_id=eq.${siteId}` }, () => {
        refreshTodayData(siteId);
        setRtRefreshKey(k => k + 1);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [siteId]);

  useEffect(() => {
    if (!siteId) return;
    const channel = supabase
      .channel(`site-${siteId}-sheets`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "weekly_inspection_sheets", filter: `site_id=eq.${siteId}` }, () => refreshPdfData())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [siteId]);

  useEffect(() => {
    if (!siteId) return;
    const interval = setInterval(() => {
      refreshMewps();
      refreshTodayData(siteId);
      refreshPdfData();
      setRtRefreshKey(k => k + 1);
    }, 10000);
    return () => clearInterval(interval);
  }, [siteId]);

  function handleToggle(mewpId) {
    setExpandedMewpId(prev => prev === mewpId ? null : mewpId);
  }

  async function refreshMewps() {
    const { data: mewpData, error } = await supabase
      .from("mewps")
      .select("*")
      .eq("site_id", siteId)
      .eq("active", true)
      .or("is_archived.eq.false,is_archived.is.null")
      .order("created_at", { ascending: true });
    if (error || !mewpData) return;
    setMewps(mewpData);
    setStats(prev => ({ ...prev, total: mewpData.length }));
  }

  async function refreshPdfData() {
    const { data: sheetData, error } = await supabase
      .from("weekly_inspection_sheets")
      .select("mewp_id, pdf_url, pdf_generated_at")
      .eq("site_id", siteId)
      .not("pdf_url", "is", null)
      .order("week_commencing", { ascending: false });
    if (error || !sheetData) return;
    const pdfMap = {};
    const tsMap = {};
    sheetData.forEach(s => { if (!pdfMap[s.mewp_id]) { pdfMap[s.mewp_id] = s.pdf_url; tsMap[s.mewp_id] = s.pdf_generated_at; } });
    setSheetPdfUrls(pdfMap);
    setSheetPdfTimestamps(tsMap);
  }

  async function refreshTodayData(id) {
    const today = toLocalDateStr(new Date());
    const { data: todayData, error } = await supabase
      .from("daily_inspection_entries")
      .select("id, mewp_id, operator_name, pal_card_number, submitted_at, daily_status")
      .eq("site_id", id || siteId)
      .eq("inspection_date", today);
    if (error || !todayData) return;
    const inspMap = {};
    todayData.forEach(i => { inspMap[i.mewp_id] = i; });
    setTodayInspections(inspMap);
    const activeMewpIds = new Set(mewpsRef.current.map(m => m.id));
    const activeToday = todayData.filter(i => activeMewpIds.has(i.mewp_id));
    setStats(prev => ({
      ...prev,
      doneToday: activeToday.length,
      faultsToday: activeToday.filter(i => i.daily_status === "fault").length,
    }));
  }

  async function loadData() {
    setLoading(true);
    try {
      const { data: siteData } = await supabase.from("sites").select("*").eq("id", siteId).single();
      setSite(siteData);
      const { data: mewpData } = await supabase
        .from("mewps")
        .select("*")
        .eq("site_id", siteId)
        .eq("active", true)
        .or("is_archived.eq.false,is_archived.is.null")
        .order("created_at", { ascending: true });
      setMewps(mewpData || []);
      const today = toLocalDateStr(new Date());
      const { data: todayData } = await supabase
        .from("daily_inspection_entries")
        .select("id, mewp_id, operator_name, pal_card_number, submitted_at, daily_status")
        .eq("site_id", siteId)
        .eq("inspection_date", today);
      const inspMap = {};
      (todayData || []).forEach(i => { inspMap[i.mewp_id] = i; });
      setTodayInspections(inspMap);
      const activeMewpIds = new Set((mewpData || []).map(m => m.id));
      const activeToday = (todayData || []).filter(i => activeMewpIds.has(i.mewp_id));
      setStats({ total: (mewpData || []).length, doneToday: activeToday.length, faultsToday: activeToday.filter(i => i.daily_status === "fault").length });
      const { data: sheetData } = await supabase
        .from("weekly_inspection_sheets")
        .select("mewp_id, pdf_url, pdf_generated_at")
        .eq("site_id", siteId)
        .not("pdf_url", "is", null)
        .order("week_commencing", { ascending: false });
      const pdfMap = {};
      const tsMap = {};
      (sheetData || []).forEach(s => { if (!pdfMap[s.mewp_id]) { pdfMap[s.mewp_id] = s.pdf_url; tsMap[s.mewp_id] = s.pdf_generated_at; } });
      setSheetPdfUrls(pdfMap);
      setSheetPdfTimestamps(tsMap);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function loadArchivedMewps() {
    setLoadingArchived(true);
    const { data } = await supabase
      .from("mewps")
      .select("*")
      .eq("site_id", siteId)
      .eq("is_archived", true)
      .order("created_at", { ascending: true });
    setArchivedMewps(data || []);
    setLoadingArchived(false);
  }

  function handleToggleArchived() {
    if (!showArchived && archivedMewps.length === 0) loadArchivedMewps();
    setShowArchived(v => !v);
  }

  async function handleArchiveMewp(mewpId, archive) {
    const { error } = await supabase.from("mewps").update({ is_archived: archive }).eq("id", mewpId);
    if (error) { alert("Error: " + error.message); return; }
    if (archive) {
      const archived = mewps.find(m => m.id === mewpId);
      setMewps(p => p.filter(m => m.id !== mewpId));
      setStats(p => ({ ...p, total: p.total - 1 }));
      setExpandedMewpId(null);
      if (showArchived && archived) setArchivedMewps(p => [...p, archived]);
    } else {
      const restored = archivedMewps.find(m => m.id === mewpId);
      setArchivedMewps(p => p.filter(m => m.id !== mewpId));
      if (restored) {
        setMewps(p => [...p, { ...restored, is_archived: false }].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)));
        setStats(p => ({ ...p, total: p.total + 1 }));
      }
    }
  }

  if (loading) return <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ textAlign: "center" }}><div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>⏳</div><div style={{ color: "#6b7280" }}>Loading site...</div></div></div>;
  if (!site) return <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ textAlign: "center" }}><div style={{ fontSize: "3rem", marginBottom: "0.75rem" }}>⚠️</div><div style={{ fontSize: "1rem", fontWeight: 800, color: "#dc2626" }}>Site not found</div></div></div>;

  const pendingCount = stats.total - stats.doneToday;
  const allDone = stats.total > 0 && pendingCount === 0;

  return (
    <div style={S.app}>
      <div style={S.logoBar}>
        <img src="/logo.png" style={{ height: 64, width: "auto", maxWidth: "300px", objectFit: "contain" }} />
      </div>
      <div style={S.infoBar}>
        <div>
          <div style={{ fontSize: "1rem", fontWeight: 800, color: "#fff" }}>{site.name}</div>
          {(site.location || site.postcode) && (
            <div style={{ fontSize: "0.8rem", color: "#93c5fd" }}>{[site.location, site.postcode].filter(Boolean).join(", ")}</div>
          )}
          <div style={{ fontSize: "0.72rem", color: "#fecdd3" }}>Site Manager Dashboard</div>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "8px", color: "#fff", padding: "0.5rem 0.75rem", cursor: "pointer", fontSize: "0.8rem", fontWeight: 700 }} onClick={loadData}>↻</button>
          {authChecked && !isAdmin && (
            <button style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "8px", color: "#fff", padding: "0.5rem 0.75rem", cursor: "pointer", fontSize: "0.8rem", fontWeight: 700 }} onClick={() => router.push("/login")}>Login</button>
          )}
          {isAdmin && (
            <button style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "8px", color: "#fff", padding: "0.5rem 0.75rem", cursor: "pointer", fontSize: "0.8rem", fontWeight: 700 }} onClick={handleLogout}>Logout</button>
          )}
        </div>
      </div>

      {isMainAdmin && (
        <div style={{ background: "#fff", borderBottom: "1px solid #f3f4f6" }}>
          <div style={{ maxWidth: "640px", margin: "0 auto", padding: "0.5rem 1rem" }}>
            <button
              onClick={() => router.push("/admin")}
              style={{ background: "none", border: "none", color: "#d02a35", fontSize: "0.85rem", fontWeight: 700, cursor: "pointer", padding: 0, fontFamily: "system-ui, sans-serif" }}
            >
              ← Back to Sites
            </button>
          </div>
        </div>
      )}

      <div style={S.container}>
        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem", margin: "1rem 0" }}>
          {[["Total", stats.total, "#d02a35"], ["Done", stats.doneToday, "#15803d"], ["Faults", stats.faultsToday, stats.faultsToday > 0 ? "#b91c1c" : "#9ca3af"]].map(([label, value, color]) => (
            <div key={label} style={{ background: "#fff", borderRadius: "12px", padding: "1rem", textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
              <div style={{ fontSize: "2rem", fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: "0.7rem", color: "#6b7280", marginTop: "0.3rem", fontWeight: 700, textTransform: "uppercase" }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Progress bar */}
        {stats.total > 0 && (
          <div style={{ background: "#fff", borderRadius: "12px", padding: "1rem", marginBottom: "1rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", fontWeight: 700, color: "#374151", marginBottom: "0.6rem" }}>
              <span>Today's Inspection Progress</span>
              <span style={{ color: allDone ? "#15803d" : "#d02a35" }}>{Math.round((stats.doneToday / stats.total) * 100)}%</span>
            </div>
            <div style={{ height: "10px", background: "#e5e7eb", borderRadius: "5px", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(stats.doneToday / stats.total) * 100}%`, background: allDone ? "#15803d" : "#d02a35", transition: "width 0.4s", borderRadius: "5px" }} />
            </div>
            {pendingCount > 0 && <div style={{ fontSize: "0.8rem", color: "#6b7280", marginTop: "0.5rem" }}>{pendingCount} MEWP{pendingCount > 1 ? "s" : ""} still pending today</div>}
            {allDone && <div style={{ fontSize: "0.8rem", color: "#15803d", marginTop: "0.5rem", fontWeight: 700 }}>All MEWPs inspected today!</div>}
          </div>
        )}

        {/* Site QR */}
        <div style={S.card}>
          <div style={{ ...S.cardHead(), cursor: "pointer" }} onClick={() => setShowSiteQR(!showSiteQR)}>
            <span style={{ fontSize: "1.1rem" }}>📍</span>
            <span style={S.cardHeadText}>Site QR Code</span>
            <span style={{ marginLeft: "auto", fontSize: "0.8rem", color: "#93c5fd" }}>{showSiteQR ? "▲ Hide" : "▼ Show"}</span>
          </div>
          {showSiteQR && (
            <div style={{ padding: "1.5rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "1rem" }}>
              <div style={{ fontSize: "0.82rem", color: "#6b7280", textAlign: "center" }}>Print and display at site entrance. Scan to open this dashboard.</div>
              <QRCanvas url={siteUrl} size={200} />
              <div style={{ fontSize: "0.7rem", color: "#9ca3af", wordBreak: "break-all", textAlign: "center" }}>{siteUrl}</div>
            </div>
          )}
        </div>

        {/* Active MEWPs header card */}
        <div style={S.card}>
          <div style={S.cardHead()}>
            <span style={{ fontSize: "1.1rem" }}>🏗️</span>
            <span style={S.cardHeadText}>MEWPs on Site</span>
            {isAdmin && <button style={{ marginLeft: "auto", background: "#fff", color: "#d02a35", border: "none", borderRadius: "8px", padding: "0.4rem 0.85rem", fontSize: "0.8rem", fontWeight: 800, cursor: "pointer" }} onClick={() => setShowAddModal(true)}>+ Add</button>}
          </div>
          {mewps.length === 0 && (
            <div style={{ padding: "2.5rem", textAlign: "center" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>🏗️</div>
              <div style={{ fontSize: "1rem", color: "#6b7280", marginBottom: isAdmin ? "1.5rem" : 0, fontWeight: 600 }}>No MEWPs added yet</div>
              {isAdmin && <button style={{ ...S.primaryBtn(), maxWidth: "220px", margin: "0 auto" }} onClick={() => setShowAddModal(true)}>+ Add First MEWP</button>}
            </div>
          )}
        </div>

        {/* Active MEWP cards */}
        {mewps.map(mewp => {
          const expanded = expandedMewpId === mewp.id;
          return (
            <div key={mewp.id} style={{ background: "#fff", borderRadius: "12px", overflow: "hidden", marginBottom: "0.5rem", border: expanded ? "3px solid #d02a35" : "1px solid #f3f4f6", boxShadow: expanded ? "0 0 0 3px rgba(208,42,53,0.15), 0 2px 8px rgba(0,0,0,0.1)" : "0 1px 3px rgba(0,0,0,0.08)", transition: "border 0.2s, box-shadow 0.2s" }}>
              <MEWPCard
                mewp={mewp}
                todayInspection={todayInspections[mewp.id] || null}
                initialPdfUrl={sheetPdfUrls[mewp.id] || null}
                initialPdfGeneratedAt={sheetPdfTimestamps[mewp.id] || null}
                isExpanded={expanded}
                onToggle={() => handleToggle(mewp.id)}
                refreshKey={rtRefreshKey}
                onArchive={handleArchiveMewp}
                isAdmin={isAdmin}
              />
            </div>
          );
        })}

        {/* Archived MEWPs section */}
        <div style={S.card}>
          <div style={{ ...S.cardHead("#4b5563"), cursor: "pointer" }} onClick={handleToggleArchived}>
            <span style={{ fontSize: "1.1rem" }}>📦</span>
            <span style={S.cardHeadText}>Archived MEWPs</span>
            <span style={{ marginLeft: "auto", fontSize: "0.8rem", color: "#d1d5db" }}>{showArchived ? "▲ Hide" : "▼ Show"}</span>
          </div>
          {showArchived && (
            <div style={{ padding: "0.75rem" }}>
              {loadingArchived && (
                <div style={{ padding: "1.5rem", textAlign: "center", color: "#6b7280", fontSize: "0.85rem" }}>Loading archived MEWPs...</div>
              )}
              {!loadingArchived && archivedMewps.length === 0 && (
                <div style={{ padding: "1.5rem", textAlign: "center" }}>
                  <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>📦</div>
                  <div style={{ fontSize: "0.9rem", color: "#9ca3af", fontWeight: 600 }}>No archived MEWPs</div>
                </div>
              )}
              {!loadingArchived && archivedMewps.map(mewp => (
                <ArchivedMEWPCard
                  key={mewp.id}
                  mewp={mewp}
                  onRestore={id => handleArchiveMewp(id, false)}
                  isAdmin={isAdmin}
                />
              ))}
            </div>
          )}
        </div>

        {/* Setup instructions */}
        <div style={{ background: "#fff", borderRadius: "12px", padding: "1.25rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <div style={{ fontSize: "0.8rem", fontWeight: 800, color: "#d02a35", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "1rem" }}>Setup Instructions</div>
          {[["1️⃣", "Add each MEWP using the \"+ Add\" button above"], ["2️⃣", "Open the MEWP detail and tap \"QR Code\" to generate a unique QR code"], ["3️⃣", "Print the QR code and attach it to the physical MEWP"], ["4️⃣", "Workers scan the QR code each morning before operating"], ["5️⃣", "Complete the daily pre-use inspection on their device"], ["6️⃣", "Weekly PDF auto-generates every Sunday at 8PM and is saved in View Reports"]].map(([n, text]) => (
            <div key={n} style={{ display: "flex", gap: "0.75rem", marginBottom: "0.65rem", alignItems: "flex-start" }}>
              <span style={{ fontSize: "1.1rem", minWidth: "1.5rem" }}>{n}</span>
              <span style={{ fontSize: "0.85rem", color: "#374151", lineHeight: 1.5 }}>{text}</span>
            </div>
          ))}
        </div>
      </div>

      {showAddModal && (
        <AddMEWPModal
          siteId={siteId}
          onClose={() => setShowAddModal(false)}
          onAdded={mewp => { setMewps(p => [...p, mewp]); setStats(p => ({ ...p, total: p.total + 1 })); }}
        />
      )}
    </div>
  );
}

export async function getServerSideProps({ params }) {
  return { props: { siteId: params?.siteId || null } };
}
