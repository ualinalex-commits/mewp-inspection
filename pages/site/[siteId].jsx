import { useState, useEffect, useRef } from "react";
import { supabase } from "../../lib/supabase";
import QRCode from "qrcode";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://yourapp.com";

const S = {
  app: { minHeight: "100vh", background: "#f3f4f6", fontFamily: "system-ui, -apple-system, sans-serif", color: "#111827", paddingBottom: "4rem" },
  topbar: { background: "#1d4ed8", padding: "1rem 1.25rem", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 2px 8px rgba(0,0,0,0.15)" },
  topbarTitle: { fontSize: "0.85rem", fontWeight: 800, color: "#fff" },
  topbarSub: { fontSize: "0.7rem", color: "#93c5fd" },
  container: { maxWidth: "640px", margin: "0 auto", padding: "1rem" },
  card: { background: "#fff", borderRadius: "12px", overflow: "hidden", marginBottom: "1rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" },
  cardHead: (color="#1d4ed8") => ({ background: color, padding: "0.75rem 1rem", display: "flex", alignItems: "center", gap: "0.6rem" }),
  cardHeadText: { fontSize: "0.8rem", fontWeight: 800, color: "#fff", letterSpacing: "0.04em", textTransform: "uppercase" },
  input: { width: "100%", background: "#f9fafb", border: "2px solid #e5e7eb", borderRadius: "10px", color: "#111827", padding: "0.85rem 1rem", fontSize: "1rem", fontFamily: "system-ui, sans-serif", outline: "none", boxSizing: "border-box" },
  label: { fontSize: "0.75rem", fontWeight: 700, color: "#374151", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "0.4rem", display: "block" },
  primaryBtn: (color="#1d4ed8") => ({ width: "100%", background: color, color: "#fff", border: "none", borderRadius: "12px", padding: "1rem", fontSize: "1rem", fontWeight: 800, cursor: "pointer", fontFamily: "system-ui, sans-serif", boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }),
  ghostBtn: (color="#374151") => ({ background: "#fff", color, border: `2px solid ${color}33`, borderRadius: "10px", padding: "0.65rem 1rem", fontSize: "0.82rem", fontWeight: 700, cursor: "pointer", fontFamily: "system-ui, sans-serif", whiteSpace: "nowrap" }),
  statPill: (color) => ({ background: `${color}15`, border: `2px solid ${color}30`, color, fontSize: "0.72rem", fontWeight: 800, padding: "0.3rem 0.75rem", borderRadius: "20px", textTransform: "uppercase" }),
};

function QRCanvas({ url, size=160 }) {
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
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 200, padding: "1rem" }}>
      <div style={{ background: "#fff", borderRadius: "16px", width: "100%", maxWidth: "500px", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem", boxShadow: "0 -4px 24px rgba(0,0,0,0.15)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: "1.1rem", fontWeight: 900, color: "#111827" }}>➕ Add MEWP</div>
          <button onClick={onClose} style={{ background: "#f3f4f6", border: "none", borderRadius: "50%", width: "2rem", height: "2rem", cursor: "pointer", fontSize: "1rem", color: "#374151" }}>×</button>
        </div>
        {[{ key: "name", label: "MEWP Name / ID *", placeholder: "e.g. MEWP-01, Scissor Lift A" }, { key: "model", label: "Model", placeholder: "e.g. Genie GS-2632" }, { key: "serialNumber", label: "Serial Number", placeholder: "e.g. SN-001234" }].map(f => (
          <div key={f.key}><label style={S.label}>{f.label}</label><input type="text" placeholder={f.placeholder} value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} style={S.input} /></div>
        ))}
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button style={{ ...S.ghostBtn(), flex: 1, padding: "0.85rem" }} onClick={onClose}>Cancel</button>
          <button style={{ ...S.primaryBtn(), flex: 2, opacity: form.name.trim() && !loading ? 1 : 0.4 }} onClick={handleAdd} disabled={!form.name.trim() || loading}>{loading ? "Adding..." : "Add MEWP →"}</button>
        </div>
      </div>
    </div>
  );
}

function MEWPCard({ mewp, todayInspection, initialPdfUrl, isExpanded, onToggle }) {
  const [showNFC, setShowNFC] = useState(false);
  const [pdfUrl, setPdfUrl] = useState(initialPdfUrl || null);
  const [generating, setGenerating] = useState(false);
  const nfcUrl = mewp.nfc_url || `${BASE_URL}/check/${mewp.id}`;
  const hasFault = todayInspection?.daily_status === "fault";
  const statusColor = todayInspection ? (hasFault ? "#dc2626" : "#15803d") : "#6b7280";
  const inspTime = todayInspection?.submitted_at
    ? new Date(todayInspection.submitted_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : null;

  function copyNFC() { navigator.clipboard.writeText(nfcUrl); alert("NFC URL copied!"); }

  async function handleGenerateReport() {
    setGenerating(true);
    try {
      const res = await fetch("/api/generate-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mewp_id: mewp.id }),
      });
      const data = await res.json();
      if (data.success) {
        setPdfUrl(data.pdf_url);
      } else {
        alert("Report failed: " + (data.error || "Unknown error"));
      }
    } catch (e) {
      alert("Error: " + e.message);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div style={{ borderBottom: "1px solid #f3f4f6" }}>
      {/* Collapsed header — always visible, tappable */}
      <div
        onClick={onToggle}
        style={{
          minHeight: "64px",
          padding: "0 1rem",
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          cursor: "pointer",
          userSelect: "none",
          background: isExpanded ? "#f8faff" : "#fff",
          transition: "background 0.2s",
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "1.05rem", fontWeight: 900, color: "#111827" }}>{mewp.machine_ref}</div>
          {(mewp.model || mewp.serial_number) && (
            <div style={{ fontSize: "0.78rem", color: "#9ca3af", marginTop: "0.1rem" }}>
              {[mewp.model, mewp.serial_number].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.2rem", flexShrink: 0 }}>
          <span style={S.statPill(statusColor)}>
            {todayInspection ? (hasFault ? "⚠️ Faults" : `✅ Done${inspTime ? ` ${inspTime}` : ""}`) : "⏳ Pending"}
          </span>
          {todayInspection?.operator_name && (
            <span style={{ fontSize: "0.72rem", color: "#6b7280" }}>{todayInspection.operator_name}</span>
          )}
        </div>
        <div style={{
          color: "#9ca3af",
          fontSize: "0.8rem",
          fontWeight: 700,
          flexShrink: 0,
          transition: "transform 0.25s ease",
          transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
        }}>▼</div>
      </div>

      {/* Expandable body */}
      <div style={{
        overflow: "hidden",
        maxHeight: isExpanded ? "700px" : "0",
        transition: "max-height 0.35s ease",
      }}>
        <div style={{ padding: "0 1rem 1rem 1rem", display: "flex", flexDirection: "column", gap: "0.75rem", borderTop: "1px solid #f0f0f0" }}>
          {/* Inspection status detail */}
          {todayInspection ? (
            <div style={{ background: hasFault ? "#fef2f2" : "#f0fdf4", border: `1px solid ${hasFault ? "#fecaca" : "#bbf7d0"}`, borderRadius: "8px", padding: "0.65rem 0.85rem", fontSize: "0.85rem", color: hasFault ? "#b91c1c" : "#15803d", fontWeight: 600, marginTop: "0.75rem" }}>
              {hasFault ? "⚠️ Faults found" : "✅ All clear"} — {todayInspection.operator_name}
              {inspTime && <span style={{ color: "#9ca3af", fontWeight: 400, marginLeft: "0.5rem" }}>{inspTime}</span>}
            </div>
          ) : (
            <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "0.65rem 0.85rem", fontSize: "0.85rem", color: "#6b7280", fontWeight: 600, marginTop: "0.75rem" }}>
              ⏳ Not yet inspected today
            </div>
          )}

          {/* Report buttons */}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
            <button
              style={{ ...S.ghostBtn("#7c3aed"), opacity: generating ? 0.5 : 1 }}
              onClick={handleGenerateReport}
              disabled={generating}
            >
              {generating ? "Generating..." : pdfUrl ? "↻ Regenerate" : "📊 Generate Report"}
            </button>
            {pdfUrl && (
              <a href={pdfUrl} target="_blank" rel="noreferrer" style={{ ...S.ghostBtn("#15803d"), textDecoration: "none" }}>📄 View PDF</a>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button style={S.ghostBtn("#1d4ed8")} onClick={() => setShowNFC(!showNFC)}>{showNFC ? "Hide NFC" : "📱 NFC Tag"}</button>
            <button style={S.ghostBtn()} onClick={copyNFC}>📋 Copy URL</button>
            <a href={nfcUrl} target="_blank" rel="noreferrer" style={{ ...S.ghostBtn("#1d4ed8"), textDecoration: "none" }}>Open Form ↗</a>
          </div>

          {/* NFC QR panel */}
          {showNFC && (
            <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "10px", padding: "1.25rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.85rem" }}>
              <div style={{ fontSize: "0.75rem", color: "#6b7280", textAlign: "center", fontWeight: 600 }}>Programme NFC tag with this URL · Print QR for manual scan</div>
              <QRCanvas url={nfcUrl} size={160} />
              <div style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "0.6rem 0.85rem", fontSize: "0.65rem", color: "#6b7280", wordBreak: "break-all", textAlign: "center", width: "100%", boxSizing: "border-box" }}>{nfcUrl}</div>
              <div style={{ fontSize: "0.75rem", color: "#9ca3af", textAlign: "center", lineHeight: 1.6 }}>Recommended: NTAG213 or NTAG215 · Use NFC Tools app</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function SiteDashboard({ siteId }) {
  const [loading, setLoading] = useState(true);
  const [site, setSite] = useState(null);
  const [mewps, setMewps] = useState([]);
  const [todayInspections, setTodayInspections] = useState({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [showSiteQR, setShowSiteQR] = useState(false);
  const [stats, setStats] = useState({ total: 0, doneToday: 0, faultsToday: 0 });
  const [sheetPdfUrls, setSheetPdfUrls] = useState({});
  const siteUrl = `${BASE_URL}/site/${siteId}`;

  useEffect(() => { if (siteId) loadData(); }, [siteId]);

  async function loadData() {
    setLoading(true);
    try {
      const { data: siteData } = await supabase.from("sites").select("*").eq("id", siteId).single();
      setSite(siteData);
      const { data: mewpData } = await supabase.from("mewps").select("*").eq("site_id", siteId).eq("active", true).order("created_at", { ascending: true });
      setMewps(mewpData || []);
      const today = new Date().toISOString().split("T")[0];
      const { data: todayData } = await supabase.from("daily_inspection_entries").select("id, mewp_id, operator_name, submitted_at, daily_status").eq("site_id", siteId).eq("inspection_date", today);
      const inspMap = {};
      (todayData || []).forEach(i => { inspMap[i.mewp_id] = i; });
      setTodayInspections(inspMap);
      setStats({ total: (mewpData || []).length, doneToday: (todayData || []).length, faultsToday: (todayData || []).filter(i => i.daily_status === "fault").length });
      const { data: sheetData } = await supabase.from("weekly_inspection_sheets").select("mewp_id, pdf_url").eq("site_id", siteId).not("pdf_url", "is", null).order("week_commencing", { ascending: false });
      const pdfMap = {};
      (sheetData || []).forEach(s => { if (!pdfMap[s.mewp_id]) pdfMap[s.mewp_id] = s.pdf_url; });
      setSheetPdfUrls(pdfMap);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  if (loading) return <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ textAlign: "center" }}><div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>⏳</div><div style={{ color: "#6b7280" }}>Loading site...</div></div></div>;
  if (!site) return <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ textAlign: "center" }}><div style={{ fontSize: "3rem", marginBottom: "0.75rem" }}>⚠️</div><div style={{ fontSize: "1rem", fontWeight: 800, color: "#dc2626" }}>Site not found</div></div></div>;

  const pendingCount = stats.total - stats.doneToday;
  const allDone = stats.total > 0 && pendingCount === 0;

  return (
    <div style={S.app}>
      <div style={S.topbar}>
        <div><div style={S.topbarTitle}>🏗️ {site.name}</div><div style={S.topbarSub}>Site Manager Dashboard{site.location ? ` · ${site.location}` : ""}</div></div>
        <button style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "8px", color: "#fff", padding: "0.5rem 0.75rem", cursor: "pointer", fontSize: "0.8rem", fontWeight: 700 }} onClick={loadData}>↻</button>
      </div>
      <div style={S.container}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem", margin: "1rem 0" }}>
          {[["Total", stats.total, "#1d4ed8"], ["Done", stats.doneToday, "#15803d"], ["Faults", stats.faultsToday, stats.faultsToday > 0 ? "#b91c1c" : "#9ca3af"]].map(([label, value, color]) => (
            <div key={label} style={{ background: "#fff", borderRadius: "12px", padding: "1rem", textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
              <div style={{ fontSize: "2rem", fontWeight: 900, color, lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: "0.7rem", color: "#6b7280", marginTop: "0.3rem", fontWeight: 700, textTransform: "uppercase" }}>{label}</div>
            </div>
          ))}
        </div>
        {stats.total > 0 && (
          <div style={{ background: "#fff", borderRadius: "12px", padding: "1rem", marginBottom: "1rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.82rem", fontWeight: 700, color: "#374151", marginBottom: "0.6rem" }}>
              <span>Today's Inspection Progress</span>
              <span style={{ color: allDone ? "#15803d" : "#1d4ed8" }}>{Math.round((stats.doneToday / stats.total) * 100)}%</span>
            </div>
            <div style={{ height: "10px", background: "#e5e7eb", borderRadius: "5px", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(stats.doneToday / stats.total) * 100}%`, background: allDone ? "#15803d" : "#1d4ed8", transition: "width 0.4s", borderRadius: "5px" }} />
            </div>
            {pendingCount > 0 && <div style={{ fontSize: "0.8rem", color: "#6b7280", marginTop: "0.5rem" }}>{pendingCount} MEWP{pendingCount > 1 ? "s" : ""} still pending today</div>}
            {allDone && <div style={{ fontSize: "0.8rem", color: "#15803d", marginTop: "0.5rem", fontWeight: 700 }}>✅ All MEWPs inspected today!</div>}
          </div>
        )}
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
        <div style={S.card}>
          <div style={S.cardHead()}>
            <span style={{ fontSize: "1.1rem" }}>🏗️</span>
            <span style={S.cardHeadText}>MEWPs on Site</span>
            <button style={{ marginLeft: "auto", background: "#fff", color: "#1d4ed8", border: "none", borderRadius: "8px", padding: "0.4rem 0.85rem", fontSize: "0.8rem", fontWeight: 800, cursor: "pointer" }} onClick={() => setShowAddModal(true)}>+ Add</button>
          </div>
          {mewps.length === 0 ? (
            <div style={{ padding: "2.5rem", textAlign: "center" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>🏗️</div>
              <div style={{ fontSize: "1rem", color: "#6b7280", marginBottom: "1.5rem", fontWeight: 600 }}>No MEWPs added yet</div>
              <button style={{ ...S.primaryBtn(), maxWidth: "220px", margin: "0 auto" }} onClick={() => setShowAddModal(true)}>+ Add First MEWP</button>
            </div>
          ) : mewps.map(mewp => <MEWPCard key={mewp.id} mewp={mewp} todayInspection={todayInspections[mewp.id] || null} initialPdfUrl={sheetPdfUrls[mewp.id] || null} />)}
        </div>
        <div style={{ background: "#fff", borderRadius: "12px", padding: "1.25rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
          <div style={{ fontSize: "0.8rem", fontWeight: 800, color: "#1d4ed8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "1rem" }}>Setup Instructions</div>
          {[["1️⃣","Add each MEWP using the button above"],["2️⃣","Tap NFC Tag on each MEWP to get its unique QR code"],["3️⃣","Use NFC Tools app to write the URL to an NFC sticker"],["4️⃣","Attach the NFC sticker to the physical MEWP"],["5️⃣","Workers scan the tag each morning before operating"],["6️⃣","Weekly PDF auto-generates every Sunday to Google Drive"]].map(([n, text]) => (
            <div key={n} style={{ display: "flex", gap: "0.75rem", marginBottom: "0.65rem", alignItems: "flex-start" }}>
              <span style={{ fontSize: "1.1rem", minWidth: "1.5rem" }}>{n}</span>
              <span style={{ fontSize: "0.85rem", color: "#374151", lineHeight: 1.5 }}>{text}</span>
            </div>
          ))}
        </div>
      </div>
      {showAddModal && <AddMEWPModal siteId={siteId} onClose={() => setShowAddModal(false)} onAdded={mewp => { setMewps(p => [...p, mewp]); setStats(p => ({ ...p, total: p.total + 1 })); }} />}
    </div>
  );
}

export async function getServerSideProps({ params }) {
  return { props: { siteId: params?.siteId || null } };
}
