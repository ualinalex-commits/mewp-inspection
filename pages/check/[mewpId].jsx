import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";

const SECTIONS = [
  { id: "documentation", label: "Documentation", items: [
    { id: 1, text: "Statutory examination / periodic inspection in date" },
    { id: 2, text: "Manufacturer's operator manual with the machine" },
    { id: 3, text: "Rescue plan in place and name of nominated ground rescue person identified" },
  ]},
  { id: "wheels_tyres", label: "Wheels / Tyres", items: [
    { id: 4, text: "No missing, loose or damaged nuts and retainers" },
    { id: 5, text: "Tyre pressure (pneumatic, foam filled or solid)" },
    { id: 6, text: "Condition (no cuts, splits, exposed braiding, damaged rims)" },
  ]},
  { id: "engine_power_source", label: "Engine / Power Source", items: [
    { id: 7, text: "Fluid levels (engine oil, coolant, fuel)" },
    { id: 8, text: "No fluid leakage on ground and around engine" },
    { id: 9, text: "Battery (electrolyte, connections, terminals, security and charging plug condition)" },
  ]},
  { id: "hydraulics", label: "Hydraulics", items: [
    { id: 10, text: "Hydraulic fluid level" },
    { id: 11, text: "No leaks (hoses, pipe connections, rams, cylinders)" },
  ]},
  { id: "hoses_cables", label: "Hoses and Cables", items: [
    { id: 12, text: "Security and condition (no cuts, chaffing, bulges)" },
    { id: 13, text: "Power track cable trays (free from damage and debris)" },
  ]},
  { id: "outriggers_stabilisers", label: "Outriggers / Stabilisers", items: [
    { id: 14, text: "General condition, pins/retainers, footplate" },
    { id: 15, text: "Spreader plates (present, condition, secure for travel)" },
    { id: 16, text: "Interlocks (functioning, engaged)" },
  ]},
  { id: "chassis_boom_scissor", label: "Chassis, Boom & Scissor Pack", items: [
    { id: 17, text: "General condition (no damage, misalignment, corrosion)" },
    { id: 18, text: "No cracks in weld" },
    { id: 19, text: "Pins, retainers and chains (good condition, secure)" },
  ]},
  { id: "platform_cage", label: "Platform or Cage", items: [
    { id: 20, text: "Canopies, guards, engine covers (security and condition)" },
    { id: 21, text: "Steps for access/egress secure (undamaged, clear of debris)" },
    { id: 22, text: "Entrance gate, guard rails and retaining pins" },
    { id: 23, text: "Harness / lanyard anchorage points" },
    { id: 24, text: "Clear of rubbish, debris and obstructions" },
    { id: 25, text: "Secondary Guarding" },
  ]},
  { id: "decals_signage", label: "Decals and Signage", items: [
    { id: 26, text: "ID/compliance plate, safety, warning and information decals (all present, legible)" },
    { id: 27, text: "Controls (identification decals, directional arrows clearly marked)" },
    { id: 28, text: "Platform loads (SWL, max. wind speed, max. number of persons clearly marked)" },
  ]},
];

const FUNCTION_CHECKS = [
  { id: 29, text: "Security device (power isolator, keypad, smart card)" },
  { id: 30, text: "Function enable works correctly (ignition key, foot switch, hold to run device)" },
  { id: 31, text: "Emergency stops and emergency / auxiliary lowering system are fully functional" },
  { id: 32, text: "All switches, function controls (move freely, return to neutral, operate as expected)" },
  { id: 33, text: "Elevating functions (raise, lower, slew, tele-out, tele-in)" },
  { id: 34, text: "Travel functions (forward, reverse, steer, brakes)" },
  { id: 35, text: "Elevated drive speed activates when platform is raised (reduced or prevented)" },
  { id: 36, text: "Lights, beacons, warning devices" },
  { id: 37, text: "Audible alarms (tilt, descent and travel)" },
  { id: 38, text: "Interlock, limit switches (e.g. descent, SWL, outreach, rotation)" },
  { id: 39, text: "Pothole protection device (fully deploys and retracts)" },
  { id: 40, text: "Oscillating axle locks and extending axles operate correctly" },
  { id: 41, text: "Accessories, power to platform, extending decks" },
  { id: 42, text: "Jacks-legs, stabilisers, outriggers, levelling devices" },
  { id: 43, text: "Secondary guarding (function, operation, reset)" },
];

function getDayOfWeek(dateStr) {
  const days = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  return days[new Date(dateStr).getDay()];
}

const S = {
  app: { minHeight: "100vh", background: "#060b12", fontFamily: "'IBM Plex Mono', 'Courier New', monospace", color: "#e2e8f0", paddingBottom: "5rem" },
  topbar: { background: "#0a1628", borderBottom: "2px solid #F59E0B", padding: "0.85rem 1.25rem", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100 },
  badge: (color="#F59E0B") => ({ background: color, color: color==="#F59E0B"?"#000":"#fff", fontWeight: 800, fontSize: "0.6rem", letterSpacing: "0.15em", padding: "0.2rem 0.5rem", borderRadius: "2px", textTransform: "uppercase" }),
  title: { fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.08em", color: "#94a3b8", textTransform: "uppercase" },
  container: { maxWidth: "600px", margin: "0 auto", padding: "1.25rem" },
  card: { background: "#0d1b2e", border: "1px solid #1e293b", borderRadius: "6px", overflow: "hidden", marginBottom: "1rem" },
  cardHead: (accent="#F59E0B") => ({ background: "#111f35", padding: "0.65rem 0.85rem", display: "flex", alignItems: "center", gap: "0.6rem", borderBottom: `1px solid ${accent}22` }),
  secLabel: { fontSize: "0.72rem", fontWeight: 700, color: "#94a3b8", letterSpacing: "0.06em", textTransform: "uppercase" },
  input: { width: "100%", background: "#0a1628", border: "1px solid #1e293b", borderRadius: "4px", color: "#e2e8f0", padding: "0.65rem 0.85rem", fontSize: "0.82rem", fontFamily: "'IBM Plex Mono', monospace", outline: "none", boxSizing: "border-box" },
  label: { fontSize: "0.62rem", fontWeight: 700, color: "#64748b", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.35rem", display: "block" },
  primaryBtn: (color="#F59E0B", disabled=false) => ({ width: "100%", background: color, color: color==="#F59E0B"?"#000":"#fff", border: "none", borderRadius: "4px", padding: "0.9rem", fontSize: "0.78rem", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", cursor: disabled?"not-allowed":"pointer", fontFamily: "'IBM Plex Mono', monospace", opacity: disabled?0.4:1 }),
  ghostBtn: { background: "transparent", color: "#64748b", border: "1px solid #1e293b", borderRadius: "4px", padding: "0.65rem 1.2rem", fontSize: "0.72rem", fontWeight: 700, cursor: "pointer", fontFamily: "'IBM Plex Mono', monospace" },
  progressWrap: { height: "3px", background: "#0f172a", borderRadius: "2px", marginBottom: "1.25rem", overflow: "hidden" },
  checkRow: (state) => ({ display: "grid", gridTemplateColumns: "2.2rem 1fr auto", gap: "0.6rem", alignItems: "center", padding: "0.65rem 0.85rem", borderBottom: "1px solid #1e293b", background: state==="pass"?"rgba(34,197,94,0.03)":state==="fail"?"rgba(239,68,68,0.05)":"transparent" }),
  passBtn: (active) => ({ width: "2rem", height: "2rem", border: "none", borderRadius: "3px", cursor: "pointer", background: active?"#22c55e":"#0f172a", color: active?"#fff":"#334155", fontSize: "0.85rem", fontWeight: 700, outline: active?"1px solid #22c55e":"1px solid #1e293b" }),
  failBtn: (active) => ({ width: "2rem", height: "2rem", border: "none", borderRadius: "3px", cursor: "pointer", background: active?"#ef4444":"#0f172a", color: active?"#fff":"#334155", fontSize: "0.85rem", fontWeight: 700, outline: active?"1px solid #ef4444":"1px solid #1e293b" }),
  infoBanner: (color="#F59E0B") => ({ background: `${color}10`, border: `1px solid ${color}30`, borderRadius: "4px", padding: "0.75rem 1rem", fontSize: "0.72rem", color: color==="#F59E0B"?"#fcd34d":color==="#3b82f6"?"#93c5fd":color==="#22c55e"?"#86efac":"#fca5a5", marginBottom: "1rem", lineHeight: 1.6 }),
};

function VisualRow({ item, value, onChange }) {
  return (
    <div style={S.checkRow(value)}>
      <span style={{ color: "#475569", fontFamily: "monospace", fontSize: "0.7rem" }}>{String(item.id).padStart(2,"0")}</span>
      <span style={{ color: "#cbd5e1", fontSize: "0.8rem", lineHeight: 1.45 }}>{item.text}</span>
      <div style={{ display: "flex", gap: "0.3rem" }}>
        <button style={S.passBtn(value==="pass")} onClick={() => onChange(item.id, value==="pass"?null:"pass")}>✓</button>
        <button style={S.failBtn(value==="fail")} onClick={() => onChange(item.id, value==="fail"?null:"fail")}>✗</button>
      </div>
    </div>
  );
}

function FunctionRow({ item, value, onChange }) {
  return (
    <div style={{ padding: "0.65rem 0.85rem", borderBottom: "1px solid #1e293b", display: "grid", gridTemplateColumns: "2.2rem 1fr auto", gap: "0.6rem", alignItems: "center" }}>
      <span style={{ color: "#475569", fontFamily: "monospace", fontSize: "0.7rem" }}>{String(item.id).padStart(2,"0")}</span>
      <span style={{ color: "#cbd5e1", fontSize: "0.8rem", lineHeight: 1.45 }}>{item.text}</span>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        {["ground","platform"].map(key => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <span style={{ fontSize: "0.55rem", color: "#475569", width: "0.9rem", fontWeight: 700, textTransform: "uppercase" }}>{key==="ground"?"G":"P"}</span>
            <button style={S.passBtn(value?.[key]==="pass")} onClick={() => onChange(item.id, key, value?.[key]==="pass"?null:"pass")}>✓</button>
            <button style={S.failBtn(value?.[key]==="fail")} onClick={() => onChange(item.id, key, value?.[key]==="fail"?null:"fail")}>✗</button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CheckPage({ mewpId }) {
  const [pageStatus, setPageStatus] = useState("loading");
  const [mewp, setMewp] = useState(null);
  const [existingEntry, setExistingEntry] = useState(null);
  const [step, setStep] = useState(0);
  const [operator, setOperator] = useState({ name: "", palCard: "" });
  const [visual, setVisual] = useState({});
  const [fnChecks, setFnChecks] = useState({});
  const [defects, setDefects] = useState({});
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    if (!mewpId) return;
    async function load() {
      try {
        const { data: mewpData, error: mewpErr } = await supabase
          .from("mewps").select("*, sites(id, name, location)").eq("id", mewpId).single();
        if (mewpErr || !mewpData) { setPageStatus("not_found"); return; }
        setMewp(mewpData);
        const today = new Date().toISOString().split("T")[0];
        const { data: todayEntry } = await supabase
          .from("daily_inspection_entries")
          .select("id, operator_name, pal_card_number, submitted_at, daily_status")
          .eq("mewp_id", mewpId).eq("inspection_date", today).single();
        if (todayEntry) { setExistingEntry(todayEntry); setPageStatus("already_done"); }
        else setPageStatus("form");
      } catch { setPageStatus("not_found"); }
    }
    load();
  }, [mewpId]);

  async function handleSubmit() {
    setPageStatus("submitting");
    setSubmitError("");
    try {
      const today = new Date().toISOString().split("T")[0];
      const dayOfWeek = getDayOfWeek(today);
      const { data: sheetId, error: sheetErr } = await supabase.rpc("get_or_create_weekly_sheet", {
        p_mewp_id: mewpId, p_site_id: mewp.sites.id, p_machine_ref: mewp.machine_ref, p_date: today,
      });
      if (sheetErr) throw new Error(`Sheet: ${sheetErr.message}`);
      const hasFaults = Object.values(visual).some(v => v==="fail") ||
        Object.values(fnChecks).some(v => v?.ground==="fail" || v?.platform==="fail");
      const { data: entryData, error: entryErr } = await supabase
        .from("daily_inspection_entries")
        .insert({ sheet_id: sheetId, mewp_id: mewpId, site_id: mewp.sites.id, inspection_date: today, day_of_week: dayOfWeek, operator_name: operator.name.trim(), pal_card_number: operator.palCard.trim()||null, initialled: true, daily_status: hasFaults?"fault":"ok" })
        .select("id").single();
      if (entryErr) throw new Error(`Entry: ${entryErr.message}`);
      const entryId = entryData.id;
      const visualRows = SECTIONS.flatMap(section =>
        section.items.map(item => ({ entry_id: entryId, sheet_id: sheetId, mewp_id: mewpId, inspection_date: today, item_number: item.id, category: section.id, result: visual[item.id]||null }))
      );
      const { error: visualErr } = await supabase.from("visual_check_results").insert(visualRows);
      if (visualErr) throw new Error(`Visual: ${visualErr.message}`);
      const functionRows = FUNCTION_CHECKS.map(item => ({ entry_id: entryId, sheet_id: sheetId, mewp_id: mewpId, inspection_date: today, item_number: item.id, ground_result: fnChecks[item.id]?.ground||null, platform_result: fnChecks[item.id]?.platform||null }));
      const { error: fnErr } = await supabase.from("function_check_results").insert(functionRows);
      if (fnErr) throw new Error(`Function: ${fnErr.message}`);
      const defectRows = [];
      SECTIONS.forEach(section => {
        section.items.forEach(item => {
          if (visual[item.id]==="fail") defectRows.push({ entry_id: entryId, sheet_id: sheetId, mewp_id: mewpId, site_id: mewp.sites.id, inspection_date: today, item_number: item.id, check_type: "visual", defect_details: defects[item.id]||"Fault identified during pre-use inspection", date_noted: today, status: "open" });
        });
      });
      FUNCTION_CHECKS.forEach(item => {
        const v = fnChecks[item.id];
        if (v?.ground==="fail" || v?.platform==="fail") {
          const which = v?.ground==="fail"&&v?.platform==="fail"?"Ground and Platform":v?.ground==="fail"?"Ground":"Platform";
          defectRows.push({ entry_id: entryId, sheet_id: sheetId, mewp_id: mewpId, site_id: mewp.sites.id, inspection_date: today, item_number: item.id, check_type: "function", defect_details: defects[item.id]||`Fault on ${which} control`, date_noted: today, status: "open" });
        }
      });
      if (defectRows.length > 0) {
        const { error: defectErr } = await supabase.from("defect_log").insert(defectRows);
        if (defectErr) throw new Error(`Defects: ${defectErr.message}`);
      }
      setPageStatus("done");
    } catch (err) { setSubmitError(err.message); setPageStatus("submit_error"); }
  }

  const totalVisual = SECTIONS.reduce((a,s) => a+s.items.length, 0);
  const doneVisual = Object.values(visual).filter(Boolean).length;
  const doneFn = Object.values(fnChecks).filter(v => v?.ground||v?.platform).length;
  const faultCount = Object.values(visual).filter(v=>v==="fail").length + Object.values(fnChecks).filter(v=>v?.ground==="fail"||v?.platform==="fail").length;
  const progress = step===1?Math.round((doneVisual/totalVisual)*100):step===2?Math.round((doneFn/FUNCTION_CHECKS.length)*100):0;
  const fmtTime = ts => new Date(ts).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"});
  const fmtDate = ts => new Date(ts).toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long"});
  const todayLong = new Date().toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"});

  if (pageStatus==="loading") return <div style={{...S.app,display:"flex",alignItems:"center",justifyContent:"center"}}><span style={{fontSize:"0.72rem",color:"#475569",letterSpacing:"0.15em"}}>LOADING...</span></div>;
  if (pageStatus==="not_found") return <div style={{...S.app,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{textAlign:"center",padding:"2rem"}}><div style={{fontSize:"2.5rem",marginBottom:"1rem"}}>⚠️</div><div style={{fontSize:"0.85rem",color:"#ef4444",fontWeight:700}}>Machine Not Found</div><div style={{fontSize:"0.72rem",color:"#475569",marginTop:"0.5rem"}}>This NFC tag may be invalid. Contact your site manager.</div></div></div>;
  if (pageStatus==="submitting") return <div style={{...S.app,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{textAlign:"center"}}><div style={{fontSize:"0.72rem",color:"#F59E0B",letterSpacing:"0.15em"}}>SAVING...</div></div></div>;
  if (pageStatus==="submit_error") return <div style={{...S.app,display:"flex",alignItems:"center",justifyContent:"center"}}><div style={{textAlign:"center",padding:"2rem"}}><div style={{fontSize:"2.5rem",marginBottom:"1rem"}}>❌</div><div style={{fontSize:"0.85rem",color:"#ef4444",fontWeight:700,marginBottom:"0.5rem"}}>Submission Failed</div><div style={{fontSize:"0.7rem",color:"#475569",marginBottom:"1.5rem",wordBreak:"break-word"}}>{submitError}</div><button style={S.primaryBtn()} onClick={()=>setPageStatus("form")}>Try Again</button></div></div>;

  if (pageStatus==="already_done") return (
    <div style={S.app}>
      <div style={S.topbar}><div style={{display:"flex",alignItems:"center",gap:"0.6rem"}}><span style={S.badge("#22c55e")}>DONE</span><span style={S.title}>{mewp?.machine_ref}</span></div></div>
      <div style={S.container}>
        <div style={{textAlign:"center",padding:"2rem 0 1.5rem"}}><div style={{fontSize:"3.5rem",marginBottom:"0.75rem"}}>✅</div><div style={{fontSize:"1rem",fontWeight:800,color:"#22c55e",marginBottom:"0.3rem"}}>Already Inspected Today</div><div style={{fontSize:"0.72rem",color:"#64748b"}}>{fmtDate(existingEntry.submitted_at)}</div></div>
        <div style={S.card}>
          <div style={S.cardHead()}><span style={S.badge()}>Record</span><span style={S.secLabel}>Today's Inspection</span></div>
          <div style={{padding:"0.85rem"}}>
            {[["Machine",mewp?.machine_ref],["Site",mewp?.sites?.name],["Inspector",existingEntry.operator_name],["PAL Card",existingEntry.pal_card_number||"—"],["Time",fmtTime(existingEntry.submitted_at)],["Result",existingEntry.daily_status==="fault"?"⚠️ Faults found":"✅ All clear"]].map(([k,v])=>(
              <div key={k} style={{display:"flex",justifyContent:"space-between",fontSize:"0.78rem",borderBottom:"1px solid #1e293b",padding:"0.4rem 0"}}>
                <span style={{color:"#64748b"}}>{k}</span><span style={{color:k==="Result"&&existingEntry.daily_status==="fault"?"#fca5a5":"#e2e8f0",fontWeight:600}}>{v}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={S.infoBanner("#22c55e")}>This MEWP has already been inspected today. No further action required. If you believe this is an error, contact your site manager.</div>
      </div>
    </div>
  );

  if (pageStatus==="done") return (
    <div style={S.app}>
      <div style={S.topbar}><div style={{display:"flex",alignItems:"center",gap:"0.6rem"}}><span style={S.badge(faultCount>0?"#ef4444":"#22c55e")}>{faultCount>0?"FAULTS LOGGED":"ALL CLEAR"}</span></div></div>
      <div style={{...S.container,textAlign:"center",paddingTop:"3rem"}}>
        <div style={{fontSize:"3.5rem",marginBottom:"1rem"}}>{faultCount>0?"⚠️":"✅"}</div>
        <div style={{fontSize:"1rem",fontWeight:800,color:faultCount>0?"#ef4444":"#22c55e",marginBottom:"0.5rem"}}>{faultCount>0?"Inspection Submitted — Faults Logged":"Inspection Complete — All Clear"}</div>
        <div style={{fontSize:"0.75rem",color:"#64748b",marginBottom:"0.3rem"}}>{mewp?.machine_ref} · {mewp?.sites?.name}</div>
        <div style={{fontSize:"0.7rem",color:"#475569"}}>{operator.name} · {todayLong}</div>
        {faultCount>0&&<div style={{...S.infoBanner("#ef4444"),marginTop:"1.5rem",textAlign:"left"}}>⚠️ {faultCount} fault(s) logged. Report to your supervisor immediately. Do not operate this machine until defects are cleared.</div>}
      </div>
    </div>
  );

  if (step===0) return (
    <div style={S.app}>
      <div style={S.topbar}><div style={{display:"flex",alignItems:"center",gap:"0.6rem"}}><span style={S.badge()}>MEWP</span><span style={S.title}>{mewp?.machine_ref}</span></div><span style={{fontSize:"0.65rem",color:"#475569"}}>{mewp?.sites?.name}</span></div>
      <div style={S.container}>
        <div style={{padding:"1rem 0 0.5rem"}}><div style={{fontSize:"0.62rem",color:"#F59E0B",fontWeight:700,letterSpacing:"0.15em",textTransform:"uppercase",marginBottom:"0.25rem"}}>Daily Pre-Use Inspection</div><div style={{fontSize:"1rem",fontWeight:800,color:"#f1f5f9",marginBottom:"0.2rem"}}>{mewp?.machine_ref}</div><div style={{fontSize:"0.72rem",color:"#475569"}}>{mewp?.model&&`${mewp.model} · `}{todayLong}</div></div>
        <div style={{...S.card,marginTop:"1rem"}}>
          <div style={S.cardHead()}><span style={S.badge()}>01</span><span style={S.secLabel}>Operator Details</span></div>
          <div style={{padding:"1rem",display:"flex",flexDirection:"column",gap:"0.9rem"}}>
            <div><label style={S.label}>Your Full Name *</label><input type="text" placeholder="e.g. James Smith" value={operator.name} onChange={e=>setOperator(p=>({...p,name:e.target.value}))} style={S.input}/></div>
            <div><label style={S.label}>PAL Card Number</label><input type="text" placeholder="e.g. PAL-123456" value={operator.palCard} onChange={e=>setOperator(p=>({...p,palCard:e.target.value}))} style={S.input}/></div>
          </div>
        </div>
        <div style={S.infoBanner()}>⚡ Only trained and authorised persons should operate this equipment. All faults must be reported to your supervisor immediately.</div>
        <button style={S.primaryBtn("#F59E0B",!operator.name.trim())} onClick={()=>operator.name.trim()&&setStep(1)}>Start Visual Checks →</button>
      </div>
    </div>
  );

  if (step===1) return (
    <div style={S.app}>
      <div style={S.topbar}><div style={{display:"flex",alignItems:"center",gap:"0.6rem"}}><span style={S.badge()}>VISUAL</span><span style={S.title}>{mewp?.machine_ref}</span></div><span style={{fontSize:"0.65rem",color:"#64748b"}}>{doneVisual}/{totalVisual}</span></div>
      <div style={S.container}>
        <div style={S.progressWrap}><div style={{height:"100%",width:`${progress}%`,background:"#F59E0B",transition:"width 0.3s",borderRadius:"2px"}}/></div>
        {SECTIONS.map(section=>(
          <div key={section.id} style={S.card}>
            <div style={S.cardHead()}><span style={S.badge()}>Visual</span><span style={S.secLabel}>{section.label}</span><span style={{marginLeft:"auto",fontSize:"0.62rem",color:"#475569"}}>{section.items.filter(i=>visual[i.id]).length}/{section.items.length}</span></div>
            {section.items.map(item=><VisualRow key={item.id} item={item} value={visual[item.id]} onChange={(id,val)=>setVisual(p=>({...p,[id]:val}))}/>)}
          </div>
        ))}
        <div style={{display:"flex",gap:"0.75rem"}}><button style={S.ghostBtn} onClick={()=>setStep(0)}>← Back</button><button style={{...S.primaryBtn(),flex:1}} onClick={()=>setStep(2)}>Function Checks →</button></div>
      </div>
    </div>
  );

  if (step===2) return (
    <div style={S.app}>
      <div style={S.topbar}><div style={{display:"flex",alignItems:"center",gap:"0.6rem"}}><span style={S.badge("#3b82f6")}>FUNCTION</span><span style={S.title}>{mewp?.machine_ref}</span></div><span style={{fontSize:"0.65rem",color:"#64748b"}}>{doneFn}/{FUNCTION_CHECKS.length}</span></div>
      <div style={S.container}>
        <div style={S.progressWrap}><div style={{height:"100%",width:`${progress}%`,background:"#3b82f6",transition:"width 0.3s",borderRadius:"2px"}}/></div>
        <div style={S.infoBanner("#3b82f6")}>⚡ Test using both Ground (G) and Platform (P) controls for each item.</div>
        <div style={S.card}>
          <div style={S.cardHead("#3b82f6")}><span style={S.badge("#3b82f6")}>Fn</span><span style={S.secLabel}>Function Checks — G & P Controls</span></div>
          {FUNCTION_CHECKS.map(item=><FunctionRow key={item.id} item={item} value={fnChecks[item.id]} onChange={(id,key,val)=>setFnChecks(p=>({...p,[id]:{...(p[id]||{}),[key]:val}}))}/>)}
        </div>
        <div style={{display:"flex",gap:"0.75rem"}}><button style={S.ghostBtn} onClick={()=>setStep(1)}>← Back</button><button style={{...S.primaryBtn(),flex:1}} onClick={()=>setStep(3)}>Review & Submit →</button></div>
      </div>
    </div>
  );

  if (step===3) {
    const allFaultItems = [...SECTIONS.flatMap(s=>s.items).filter(i=>visual[i.id]==="fail"), ...FUNCTION_CHECKS.filter(i=>fnChecks[i.id]?.ground==="fail"||fnChecks[i.id]?.platform==="fail")];
    return (
      <div style={S.app}>
        <div style={S.topbar}><div style={{display:"flex",alignItems:"center",gap:"0.6rem"}}><span style={S.badge(faultCount>0?"#ef4444":"#22c55e")}>{faultCount>0?`${faultCount} FAULTS`:"ALL CLEAR"}</span><span style={S.title}>Review</span></div></div>
        <div style={S.container}>
          {faultCount>0&&<div style={S.infoBanner("#ef4444")}>⚠️ {faultCount} fault(s) found. Add details below then submit. Report to your supervisor immediately.</div>}
          <div style={S.card}>
            <div style={S.cardHead()}><span style={S.badge()}>Summary</span></div>
            <div style={{padding:"0.85rem"}}>
              {[["Machine",mewp?.machine_ref],["Site",mewp?.sites?.name],["Operator",operator.name],["PAL Card",operator.palCard||"—"],["Date",new Date().toLocaleDateString("en-GB")],["Visual",`${doneVisual}/${totalVisual}`],["Function",`${doneFn}/${FUNCTION_CHECKS.length}`],["Faults",faultCount>0?`${faultCount} found`:"None"]].map(([k,v])=>(
                <div key={k} style={{display:"flex",justifyContent:"space-between",fontSize:"0.78rem",borderBottom:"1px solid #1e293b",padding:"0.4rem 0"}}>
                  <span style={{color:"#64748b"}}>{k}</span><span style={{color:k==="Faults"&&faultCount>0?"#ef4444":"#e2e8f0",fontWeight:600}}>{v}</span>
                </div>
              ))}
            </div>
          </div>
          {allFaultItems.length>0&&(
            <div style={S.card}>
              <div style={S.cardHead("#ef4444")}><span style={S.badge("#ef4444")}>Defects</span><span style={S.secLabel}>Describe Each Fault</span></div>
              {allFaultItems.map(item=>(
                <div key={item.id} style={{padding:"0.75rem 0.85rem",borderBottom:"1px solid #1e293b"}}>
                  <div style={{fontSize:"0.7rem",color:"#fca5a5",marginBottom:"0.4rem"}}><span style={{color:"#ef4444",marginRight:"0.5rem",fontFamily:"monospace"}}>#{String(item.id).padStart(2,"0")}</span>{item.text}</div>
                  <input placeholder="Describe the defect in detail..." value={defects[item.id]||""} onChange={e=>setDefects(p=>({...p,[item.id]:e.target.value}))} style={{...S.input,fontSize:"0.75rem",padding:"0.45rem 0.65rem"}}/>
                </div>
              ))}
            </div>
          )}
          <div style={{display:"flex",gap:"0.75rem"}}><button style={S.ghostBtn} onClick={()=>setStep(2)}>← Back</button><button style={{...S.primaryBtn(faultCount>0?"#ef4444":"#22c55e"),flex:1}} onClick={handleSubmit}>{faultCount>0?"Submit — Faults Logged ⚠":"Submit — All Clear ✓"}</button></div>
        </div>
      </div>
    );
  }

  return null;
}

export async function getServerSideProps({ params }) {
  return { props: { mewpId: params?.mewpId || null } };
}
