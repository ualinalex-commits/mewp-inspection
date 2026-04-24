import { useState, useEffect, useRef } from "react";
import { supabase } from "../../lib/supabase";
import QRCode from "qrcode";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://yourapp.com";

const S = {
  app: { minHeight: "100vh", background: "#060b12", fontFamily: "'IBM Plex Mono', 'Courier New', monospace", color: "#e2e8f0", paddingBottom: "4rem" },
  topbar: { background: "#0a1628", borderBottom: "2px solid #F59E0B", padding: "0.85rem 1.25rem", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 },
  badge: (color="#F59E0B") => ({ background: color, color: color==="#F59E0B"?"#000":"#fff", fontWeight: 800, fontSize: "0.6rem", letterSpacing: "0.15em", padding: "0.2rem 0.5rem", borderRadius: "2px", textTransform: "uppercase" }),
  title: { fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.08em", color: "#94a3b8", textTransform: "uppercase" },
  container: { maxWidth: "640px", margin: "0 auto", padding: "1.25rem" },
  card: { background: "#0d1b2e", border: "1px solid #1e293b", borderRadius: "6px", overflow: "hidden", marginBottom: "1rem" },
  cardHead: (accent="#F59E0B") => ({ background: "#111f35", padding: "0.65rem 0.85rem", display: "flex", alignItems: "center", gap: "0.6rem", borderBottom: `1px solid ${accent}22` }),
  secLabel: { fontSize: "0.72rem", fontWeight: 700, color: "#94a3b8", letterSpacing: "0.06em", textTransform: "uppercase" },
  input: { width: "100%", background: "#0a1628", border: "1px solid #1e293b", borderRadius: "4px", color: "#e2e8f0", padding: "0.65rem 0.85rem", fontSize: "0.82rem", fontFamily: "'IBM Plex Mono', monospace", outline: "none", boxSizing: "border-box" },
  label: { fontSize: "0.62rem", fontWeight: 700, color: "#64748b", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.35rem", display: "block" },
  primaryBtn: (color="#F59E0B") => ({ width: "100%", background: color, color: color==="#F59E0B"?"#000":"#fff", border: "none", borderRadius: "4px", padding: "0.85rem", fontSize: "0.75rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", fontFamily: "'IBM Plex Mono', monospace" }),
  ghostBtn: (color="#64748b") => ({ background: "transparent", color, border: `1px solid ${color}44`, borderRadius: "4px", padding: "0.5rem 0.85rem", fontSize: "0.68rem", fontWeight: 700, cursor: "pointer", fontFamily: "'IBM Plex Mono', monospace", letterSpacing: "0.05em", whiteSpace: "nowrap" }),
  statPill: (color) => ({ background: `${color}15`, border: `1px solid ${color}30`, color, fontSize: "0.6rem", fontWeight: 700, padding: "0.2rem 0.5rem", borderRadius: "20px", letterSpacing: "0.08em", textTransform: "uppercase" }),
};

function QRCanvas({ url, size=160 }) {
  const canvasRef = useRef();
  useEffect(() => {
    if (canvasRef.current && url) {
      QRCode.toCanvas(canvasRef.current, url, { width: size, margin: 2, color: { dark: "#000000", light: "#ffffff" } });
    }
  }, [url, size]);
  return <canvas ref={canvasRef} style={{ borderRadius: "4px", display: "block" }} />;
}

function AddMEWPModal({ siteId, onClose, onAdded }) {
  const [form, setForm] = useState({ name: "", model: "", serialNumber: "" });
  const [loading, setLoading] = useState(false);
  async function handleAdd() {
    if (!form.name.trim()) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.from("mewps").insert({ site_id: siteId, machine_ref: form.name.trim(), model: form.model.trim()||null, serial_number: form.serialNumber.trim()||null }).select().single();
      if (error) throw error;
      const nfcUrl = `${BASE_URL}/check/${data.id}`;
      await supabase.from("mewps").update({ nfc_url: nfcUrl }).eq("id", data.id);
      onAdded({ ...data, nfc_url: nfcUrl });
      onClose();
    } catch (e) { alert("Error: " + e.message); }
    finally { setLoading(false); }
  }
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 200, padding: "1rem" }}>
      <div style={{ background: "#0d1b2e", border: "1px solid #1e293b", borderRadius: "8px", width: "100%", maxWidth: "500px", padding: "1.25rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}><span style={S.badge()}>New</span><span style={{ fontSize: "0.82rem", fontWeight: 700, color: "#e2e8f0" }}>Add MEWP</span></div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: "1.2rem" }}>×</button>
        </div>
        {[{ key: "name", label: "MEWP Name / ID *", placeholder: "e.g. MEWP-01, Scissor Lift A" }, { key: "model", label: "Model", placeholder: "e.g. Genie GS-2632" }, { key: "serialNumber", label: "Serial Number", placeholder: "e.g. SN-001234" }].map(f => (
          <div key={f.key}><label style={S.label}>{f.label}</label><input type="text" placeholder={f.placeholder} value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} style={S.input} /></div>
        ))}
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button style={{ ...S.ghostBtn(), flex: 1 }} onClick={onClose}>Cancel</button>
          <button style={{ ...S.primaryBtn(), flex: 2, opacity: form.name.trim()&&!loading?1:0.4 }} onClick={handleAdd} disabled={!form.name.trim()||loading}>{loading?"Adding...":"Add MEWP →"}</button>
        </div>
      </div>
    </div>
  );
}

function MEWPCard({ mewp, todayInspection }) {
  const [showNFC, setShowNFC] = useState(false);
  const nfcUrl = mewp.nfc_url || `${BASE_URL}/check/${mewp.id}`;
  function copyNFC() { navigator.clipboard.writeText(nfcUrl); alert("NFC URL copied!"); }
  return (
    <div style={{ padding: "0.85rem", borderBottom: "1px solid #1e293b", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div><div style={{ fontSize: "0.88rem", fontWeight: 800, color: "#f1f5f9", marginBottom: "0.2rem" }}>{mewp.machine_ref}</div>{mewp.model&&<div style={{ fontSize: "0.68rem", color: "#475569" }}>{mewp.model}</div>}</div>
        <span style={S.statPill(todayInspection?"#22c55e":"#94a3b8")}>{todayInspection?"✓ Done Today":"Pending"}</span>
      </div>
      {todayInspection&&(
        <div style={{ background: todayInspection.daily_status==="fault"?"rgba(239,68,68,0.06)":"rgba(34,197,94,0.06)", border: `1px solid ${todayInspection.daily_status==="fault"?"rgba(239,68,68,0.2)":"rgba(34,197,94,0.2)"}`, borderRadius: "4px", padding: "0.5rem 0.75rem", fontSize: "0.7rem", color: todayInspection.daily_status==="fault"?"#fca5a5":"#86efac" }}>
          {todayInspection.daily_status==="fault"?`⚠️ Faults found — ${todayInspection.operator_name}`:`✅ All clear — ${todayInspection.operator_name}`}
          <span style={{ color: "#475569", marginLeft: "0.5rem" }}>{new Date(todayInspection.submitted_at).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}</span>
        </div>
      )}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button style={S.ghostBtn("#F59E0B")} onClick={()=>setShowNFC(!showNFC)}>{showNFC?"Hide NFC":"📱 NFC Tag"}</button>
        <button style={S.ghostBtn()} onClick={copyNFC}>Copy URL</button>
        <a href={nfcUrl} target="_blank" rel="noreferrer" style={{ ...S.ghostBtn("#3b82f6"), textDecoration: "none" }}>Open Form ↗</a>
      </div>
      {showNFC&&(
        <div style={{ background: "#070d16", border: "1px solid #1e293b", borderRadius: "6px", padding: "1rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
          <div style={{ fontSize: "0.65rem", color: "#64748b", letterSpacing: "0.08em", textAlign: "center" }}>Programme NFC tag with this URL or print QR for manual scan</div>
          <QRCanvas url={nfcUrl} size={140} />
          <div style={{ background: "#0a1628", border: "1px solid #1e293b", borderRadius: "4px", padding: "0.5rem 0.75rem", fontSize: "0.6rem", color: "#64748b", wordBreak: "break-all", textAlign: "center", width: "100%", boxSizing: "border-box" }}>{nfcUrl}</div>
          <div style={{ fontSize: "0.65rem", color: "#475569", textAlign: "center", lineHeight: 1.6 }}>Recommended: NTAG213 or NTAG215 tags<br/>Use NFC Tools app to programme</div>
        </div>
      )}
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
  const siteUrl = `${BASE_URL}/site/${siteId}`;

  useEffect(() => { if (siteId) loadData(); }, [siteId]);

  async function loadData() {
    setLoading(true);
    try {
      const { data: siteData } = await supabase.from("sites").select("*").eq("id", siteId).single();
      setSite(siteData);
      const { data: mewpData } = await supabase.from("mewps").select("*").eq("site_id", siteId).eq("active", true).order("created_at", { ascending: true });
      setMewps(mewpData||[]);
      const today = new Date().toISOString().split("T")[0];
      const { data: todayData } = await supabase.from("daily_inspection_entries").select("id, mewp_id, operator_name, submitted_at, daily_status").eq("site_id", siteId).eq("inspection_date", today);
      const inspMap = {};
      (todayData||[]).forEach(i => { inspMap[i.mewp_id] = i; });
      setTodayInspections(inspMap);
      const done = (todayData||[]).length;
      const faults = (todayData||[]).filter(i=>i.daily_status==="fault").length;
      setStats({ total: (mewpData||[]).length, doneToday: done, faultsToday: faults });
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  }

  function handleMEWPAdded(newMewp) { setMewps(p=>[...p,newMewp]); setStats(p=>({...p,total:p.total+1})); }

  if (loading) return <div style={{...S.app,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{fontSize:"0.72rem",color:"#475569",letterSpacing:"0.15em"}}>LOADING SITE...</div></div>;
  if (!site) return <div style={{...S.app,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{textAlign:"center"}}><div style={{fontSize:"2rem",marginBottom:"0.75rem"}}>⚠️</div><div style={{fontSize:"0.82rem",color:"#ef4444"}}>Site not found</div></div></div>;

  const pendingCount = stats.total - stats.doneToday;

  return (
    <div style={S.app}>
      <div style={S.topbar}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}><span style={S.badge()}>SITE</span><span style={S.title}>{site.name}</span></div>
        <button style={{ ...S.ghostBtn("#F59E0B"), fontSize: "0.62rem" }} onClick={loadData}>↻ Refresh</button>
      </div>
      <div style={S.container}>
        <div style={{ padding: "1rem 0 0.5rem" }}>
          <div style={{ fontSize: "0.6rem", color: "#F59E0B", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "0.2rem" }}>Site Manager Dashboard</div>
          <div style={{ fontSize: "1rem", fontWeight: 800, color: "#f1f5f9", marginBottom: "0.2rem" }}>{site.name}</div>
          {site.location&&<div style={{ fontSize: "0.72rem", color: "#475569" }}>{site.location}{site.postcode?` · ${site.postcode}`:""}</div>}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.6rem", margin: "1rem 0" }}>
          {[["Total MEWPs",stats.total,"#94a3b8"],["Done Today",stats.doneToday,"#22c55e"],["Faults Today",stats.faultsToday,stats.faultsToday>0?"#ef4444":"#475569"]].map(([label,value,color])=>(
            <div key={label} style={{ background: "#0d1b2e", border: "1px solid #1e293b", borderRadius: "6px", padding: "0.75rem", textAlign: "center" }}>
              <div style={{ fontSize: "1.5rem", fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
              <div style={{ fontSize: "0.58rem", color: "#475569", marginTop: "0.3rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</div>
            </div>
          ))}
        </div>

        {stats.total>0&&(
          <div style={{ background: "#0d1b2e", border: "1px solid #1e293b", borderRadius: "6px", padding: "0.75rem 0.85rem", marginBottom: "1rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.65rem", color: "#64748b", marginBottom: "0.5rem" }}>
              <span>Today's Progress</span><span>{Math.round((stats.doneToday/stats.total)*100)}%</span>
            </div>
            <div style={{ height: "6px", background: "#0f172a", borderRadius: "3px", overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(stats.doneToday/stats.total)*100}%`, background: pendingCount===0?"#22c55e":"#F59E0B", transition: "width 0.4s", borderRadius: "3px" }}/>
            </div>
            {pendingCount>0&&<div style={{ fontSize: "0.62rem", color: "#64748b", marginTop: "0.4rem" }}>{pendingCount} MEWP{pendingCount>1?"s":""} still pending</div>}
          </div>
        )}

        <div style={S.card}>
          <div style={{ ...S.cardHead(), cursor: "pointer" }} onClick={()=>setShowSiteQR(!showSiteQR)}>
            <span style={S.badge()}>QR</span><span style={S.secLabel}>Site Dashboard QR Code</span>
            <span style={{ marginLeft: "auto", fontSize: "0.65rem", color: "#475569" }}>{showSiteQR?"▲ Hide":"▼ Show"}</span>
          </div>
          {showSiteQR&&(
            <div style={{ padding: "1.25rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "0.75rem" }}>
              <div style={{ fontSize: "0.65rem", color: "#64748b", textAlign: "center" }}>Print and display at site entrance</div>
              <QRCanvas url={siteUrl} size={180} />
              <div style={{ fontSize: "0.6rem", color: "#475569", wordBreak: "break-all", textAlign: "center" }}>{siteUrl}</div>
            </div>
          )}
        </div>

        <div style={S.card}>
          <div style={S.cardHead()}>
            <span style={S.badge()}>MEWPs</span><span style={S.secLabel}>Equipment on This Site</span>
            <button style={{ ...S.ghostBtn("#F59E0B"), marginLeft: "auto", fontSize: "0.62rem" }} onClick={()=>setShowAddModal(true)}>+ Add MEWP</button>
          </div>
          {mewps.length===0?(
            <div style={{ padding: "2rem", textAlign: "center" }}>
              <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>🏗️</div>
              <div style={{ fontSize: "0.78rem", color: "#475569", marginBottom: "1rem" }}>No MEWPs added yet</div>
              <button style={{ ...S.primaryBtn(), maxWidth: "200px", margin: "0 auto" }} onClick={()=>setShowAddModal(true)}>+ Add First MEWP</button>
            </div>
          ):mewps.map(mewp=><MEWPCard key={mewp.id} mewp={mewp} todayInspection={todayInspections[mewp.id]||null}/>)}
        </div>

        <div style={{ background: "#0d1b2e", border: "1px solid #1e293b", borderRadius: "6px", padding: "1rem" }}>
          <div style={{ fontSize: "0.65rem", color: "#F59E0B", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: "0.75rem" }}>Setup Instructions</div>
          {[["1","Add each MEWP on this site using the button above"],["2","Tap NFC Tag on each MEWP to see its unique QR code"],["3","Use NFC Tools app to write the URL to an NFC sticker"],["4","Attach NFC sticker to the physical MEWP"],["5","Workers scan the tag each morning before use"],["6","Weekly PDF auto-generates every Sunday to Google Drive"]].map(([n,text])=>(
            <div key={n} style={{ display: "flex", gap: "0.75rem", marginBottom: "0.55rem", alignItems: "flex-start" }}>
              <span style={S.badge()}>{n}</span>
              <span style={{ fontSize: "0.72rem", color: "#94a3b8", lineHeight: 1.5 }}>{text}</span>
            </div>
          ))}
        </div>
      </div>
      {showAddModal&&<AddMEWPModal siteId={siteId} onClose={()=>setShowAddModal(false)} onAdded={handleMEWPAdded}/>}
    </div>
  );
}

export async function getServerSideProps({ params }) {
  return { props: { siteId: params?.siteId || null } };
}
