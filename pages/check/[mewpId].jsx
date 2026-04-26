import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";

const SECTIONS = [
  { id: "documentation", label: "Documentation", emoji: "📋", items: [
    { id: 1, text: "Statutory examination / periodic inspection in date" },
    { id: 2, text: "Manufacturer's operator manual with the machine" },
    { id: 3, text: "Rescue plan in place and name of nominated ground rescue person identified" },
  ]},
  { id: "wheels_tyres", label: "Wheels / Tyres", emoji: "🔧", items: [
    { id: 4, text: "No missing, loose or damaged nuts and retainers" },
    { id: 5, text: "Tyre pressure (pneumatic, foam filled or solid)" },
    { id: 6, text: "Condition (no cuts, splits, exposed braiding, damaged rims)" },
  ]},
  { id: "engine_power_source", label: "Engine / Power Source", emoji: "⚙️", items: [
    { id: 7, text: "Fluid levels (engine oil, coolant, fuel)" },
    { id: 8, text: "No fluid leakage on ground and around engine" },
    { id: 9, text: "Battery (electrolyte, connections, terminals, security and charging plug condition)" },
  ]},
  { id: "hydraulics", label: "Hydraulics", emoji: "💧", items: [
    { id: 10, text: "Hydraulic fluid level" },
    { id: 11, text: "No leaks (hoses, pipe connections, rams, cylinders)" },
  ]},
  { id: "hoses_cables", label: "Hoses and Cables", emoji: "🔌", items: [
    { id: 12, text: "Security and condition (no cuts, chaffing, bulges)" },
    { id: 13, text: "Power track cable trays (free from damage and debris)" },
  ]},
  { id: "outriggers_stabilisers", label: "Outriggers / Stabilisers", emoji: "⚖️", items: [
    { id: 14, text: "General condition, pins/retainers, footplate" },
    { id: 15, text: "Spreader plates (present, condition, secure for travel)" },
    { id: 16, text: "Interlocks (functioning, engaged)" },
  ]},
  { id: "chassis_boom_scissor", label: "Chassis, Boom & Scissor Pack", emoji: "🏗️", items: [
    { id: 17, text: "General condition (no damage, misalignment, corrosion)" },
    { id: 18, text: "No cracks in weld" },
    { id: 19, text: "Pins, retainers and chains (good condition, secure)" },
  ]},
  { id: "platform_cage", label: "Platform or Cage", emoji: "🛗", items: [
    { id: 20, text: "Canopies, guards, engine covers (security and condition)" },
    { id: 21, text: "Steps for access/egress secure (undamaged, clear of debris)" },
    { id: 22, text: "Entrance gate, guard rails and retaining pins" },
    { id: 23, text: "Harness / lanyard anchorage points" },
    { id: 24, text: "Clear of rubbish, debris and obstructions" },
    { id: 25, text: "Secondary Guarding" },
  ]},
  { id: "decals_signage", label: "Decals and Signage", emoji: "🔖", items: [
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

function Toggle({ value, onChange }) {
  return (
    <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.6rem" }}>
      <button onClick={() => onChange(value === "pass" ? null : "pass")} style={{ flex: 1, padding: "0.9rem 0", fontSize: "1.05rem", fontWeight: 800, border: "2px solid", borderRadius: "10px", cursor: "pointer", borderColor: value === "pass" ? "#16a34a" : "#d1d5db", background: value === "pass" ? "#16a34a" : "#f9fafb", color: value === "pass" ? "#fff" : "#9ca3af", transition: "all 0.15s", fontFamily: "system-ui, sans-serif" }}>✓ PASS</button>
      <button onClick={() => onChange(value === "fail" ? null : "fail")} style={{ flex: 1, padding: "0.9rem 0", fontSize: "1.05rem", fontWeight: 800, border: "2px solid", borderRadius: "10px", cursor: "pointer", borderColor: value === "fail" ? "#dc2626" : "#d1d5db", background: value === "fail" ? "#dc2626" : "#f9fafb", color: value === "fail" ? "#fff" : "#9ca3af", transition: "all 0.15s", fontFamily: "system-ui, sans-serif" }}>✗ FAIL</button>
    </div>
  );
}

function GPToggle({ value, onChange }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginTop: "0.6rem" }}>
      {["ground", "platform"].map(key => (
        <div key={key}>
          <div style={{ fontSize: "0.65rem", fontWeight: 800, color: "#6b7280", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.25rem" }}>{key === "ground" ? "G — Ground Control" : "P — Platform Control"}</div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button onClick={() => onChange(key, value?.[key] === "pass" ? null : "pass")} style={{ flex: 1, padding: "0.8rem 0", fontSize: "0.95rem", fontWeight: 800, border: "2px solid", borderRadius: "10px", cursor: "pointer", borderColor: value?.[key] === "pass" ? "#16a34a" : "#d1d5db", background: value?.[key] === "pass" ? "#16a34a" : "#f9fafb", color: value?.[key] === "pass" ? "#fff" : "#9ca3af", transition: "all 0.15s", fontFamily: "system-ui, sans-serif" }}>✓ PASS</button>
            <button onClick={() => onChange(key, value?.[key] === "fail" ? null : "fail")} style={{ flex: 1, padding: "0.8rem 0", fontSize: "0.95rem", fontWeight: 800, border: "2px solid", borderRadius: "10px", cursor: "pointer", borderColor: value?.[key] === "fail" ? "#dc2626" : "#d1d5db", background: value?.[key] === "fail" ? "#dc2626" : "#f9fafb", color: value?.[key] === "fail" ? "#fff" : "#9ca3af", transition: "all 0.15s", fontFamily: "system-ui, sans-serif" }}>✗ FAIL</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function VisualRow({ item, value, onChange }) {
  return (
    <div style={{ padding: "1rem", borderBottom: "1px solid #f3f4f6", background: value === "pass" ? "#f0fdf4" : value === "fail" ? "#fef2f2" : "#fff", transition: "background 0.2s" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.6rem" }}>
        <span style={{ minWidth: "1.8rem", height: "1.8rem", background: "#f3f4f6", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 800, color: "#6b7280", fontFamily: "monospace" }}>{String(item.id).padStart(2,"0")}</span>
        <span style={{ fontSize: "0.95rem", color: "#111827", lineHeight: 1.5, fontWeight: 500 }}>{item.text}</span>
      </div>
      <Toggle value={value} onChange={(val) => onChange(item.id, val)} />
    </div>
  );
}

function FunctionRow({ item, value, onChange }) {
  return (
    <div style={{ padding: "1rem", borderBottom: "1px solid #f3f4f6", background: value?.ground === "fail" || value?.platform === "fail" ? "#fef2f2" : value?.ground === "pass" && value?.platform === "pass" ? "#f0fdf4" : "#fff" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "0.6rem" }}>
        <span style={{ minWidth: "1.8rem", height: "1.8rem", background: "#f3f4f6", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.7rem", fontWeight: 800, color: "#6b7280", fontFamily: "monospace" }}>{String(item.id).padStart(2,"0")}</span>
        <span style={{ fontSize: "0.95rem", color: "#111827", lineHeight: 1.5, fontWeight: 500 }}>{item.text}</span>
      </div>
      <GPToggle value={value} onChange={(key, val) => onChange(item.id, key, val)} />
    </div>
  );
}

const S = {
  app: { minHeight: "100vh", background: "#f3f4f6", fontFamily: "system-ui, -apple-system, sans-serif", color: "#111827", paddingBottom: "5rem" },
  topbar: { background: "#1d4ed8", padding: "1rem 1.25rem", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 100, boxShadow: "0 2px 8px rgba(0,0,0,0.15)" },
  topbarTitle: { fontSize: "0.85rem", fontWeight: 800, color: "#fff" },
  topbarSub: { fontSize: "0.7rem", color: "#93c5fd" },
  container: { maxWidth: "600px", margin: "0 auto", padding: "1rem" },
  card: { background: "#fff", borderRadius: "12px", overflow: "hidden", marginBottom: "1rem", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" },
  cardHead: (color="#1d4ed8") => ({ background: color, padding: "0.75rem 1rem", display: "flex", alignItems: "center", gap: "0.6rem" }),
  cardHeadText: { fontSize: "0.8rem", fontWeight: 800, color: "#fff", letterSpacing: "0.04em", textTransform: "uppercase" },
  input: { width: "100%", background: "#f9fafb", border: "2px solid #e5e7eb", borderRadius: "10px", color: "#111827", padding: "0.85rem 1rem", fontSize: "1rem", fontFamily: "system-ui, sans-serif", outline: "none", boxSizing: "border-box" },
  label: { fontSize: "0.75rem", fontWeight: 700, color: "#374151", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "0.4rem", display: "block" },
  primaryBtn: (color="#1d4ed8", disabled=false) => ({ width: "100%", background: disabled?"#9ca3af":color, color: "#fff", border: "none", borderRadius: "12px", padding: "1rem", fontSize: "1rem", fontWeight: 800, cursor: disabled?"not-allowed":"pointer", fontFamily: "system-ui, sans-serif", boxShadow: disabled?"none":"0 4px 12px rgba(0,0,0,0.15)" }),
  ghostBtn: { background: "#fff", color: "#374151", border: "2px solid #e5e7eb", borderRadius: "12px", padding: "0.85rem 1.5rem", fontSize: "0.9rem", fontWeight: 700, cursor: "pointer", fontFamily: "system-ui, sans-serif" },
  progressWrap: { height: "8px", background: "#e5e7eb", borderRadius: "4px", marginBottom: "1.25rem", overflow: "hidden" },
  warningBox: (bg="#fef2f2", border="#fecaca", text="#991b1b") => ({ background: bg, border: `1px solid ${border}`, borderRadius: "10px", padding: "0.85rem 1rem", fontSize: "0.88rem", color: text, marginBottom: "1rem", lineHeight: 1.6 }),
};

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
  const [alreadyDoneFaults, setAlreadyDoneFaults] = useState([]);

  useEffect(() => {
    if (!mewpId) return;
    async function load() {
      try {
        const { data: mewpData, error: mewpErr } = await supabase.from("mewps").select("*, sites(id, name, location)").eq("id", mewpId).single();
        if (mewpErr || !mewpData) { setPageStatus("not_found"); return; }
        setMewp(mewpData);
        const today = new Date().toISOString().split("T")[0];
        const { data: todayEntry } = await supabase.from("daily_inspection_entries").select("id, operator_name, pal_card_number, submitted_at, daily_status").eq("mewp_id", mewpId).eq("inspection_date", today).single();
        if (todayEntry) { setExistingEntry(todayEntry); setPageStatus("already_done"); }
        else setPageStatus("form");
      } catch { setPageStatus("not_found"); }
    }
    load();
  }, [mewpId]);

  useEffect(() => {
    if (pageStatus === "already_done" && existingEntry?.daily_status === "fault" && existingEntry?.id) {
      async function loadFaults() {
        const { data } = await supabase.from("defect_log").select("item_number, defect_details, status").eq("entry_id", existingEntry.id);
        if (data && data.length > 0) {
          const faultsWithDesc = data.map(d => {
            let description = `Item #${d.item_number}`;
            for (const s of SECTIONS) { for (const i of s.items) { if (i.id === d.item_number) { description = i.text; break; } } }
            for (const i of FUNCTION_CHECKS) { if (i.id === d.item_number) { description = i.text; break; } }
            return { ...d, description };
          });
          setAlreadyDoneFaults(faultsWithDesc);
        }
      }
      loadFaults();
    }
  }, [pageStatus]);

  async function handleSubmit() {
    setPageStatus("submitting");
    try {
      const today = new Date().toISOString().split("T")[0];
      const dayOfWeek = getDayOfWeek(today);
      const { data: sheetId, error: sheetErr } = await supabase.rpc("get_or_create_weekly_sheet", { p_mewp_id: mewpId, p_site_id: mewp.sites.id, p_machine_ref: mewp.machine_ref, p_date: today });
      if (sheetErr) throw new Error(`Sheet: ${sheetErr.message}`);
      const hasFaults = Object.values(visual).some(v => v === "fail") || Object.values(fnChecks).some(v => v?.ground === "fail" || v?.platform === "fail");
      const { data: entryData, error: entryErr } = await supabase.from("daily_inspection_entries").insert({ sheet_id: sheetId, mewp_id: mewpId, site_id: mewp.sites.id, inspection_date: today, day_of_week: dayOfWeek, operator_name: operator.name.trim(), pal_card_number: operator.palCard.trim() || null, initialled: true, daily_status: hasFaults ? "fault" : "ok" }).select("id").single();
      if (entryErr) throw new Error(`Entry: ${entryErr.message}`);
      const entryId = entryData.id;
      const visualRows = SECTIONS.flatMap(section => section.items.map(item => ({ entry_id: entryId, sheet_id: sheetId, mewp_id: mewpId, inspection_date: today, item_number: item.id, category: section.id, result: visual[item.id] || null })));
      const { error: visualErr } = await supabase.from("visual_check_results").insert(visualRows);
      if (visualErr) throw new Error(`Visual: ${visualErr.message}`);
      const functionRows = FUNCTION_CHECKS.map(item => ({ entry_id: entryId, sheet_id: sheetId, mewp_id: mewpId, inspection_date: today, item_number: item.id, ground_result: fnChecks[item.id]?.ground || null, platform_result: fnChecks[item.id]?.platform || null }));
      const { error: fnErr } = await supabase.from("function_check_results").insert(functionRows);
      if (fnErr) throw new Error(`Function: ${fnErr.message}`);
      const defectRows = [];
      SECTIONS.forEach(section => { section.items.forEach(item => { if (visual[item.id] === "fail") defectRows.push({ entry_id: entryId, sheet_id: sheetId, mewp_id: mewpId, site_id: mewp.sites.id, inspection_date: today, item_number: item.id, check_type: "visual", defect_details: defects[item.id] || "Fault identified during pre-use inspection", date_noted: today, status: "open" }); }); });
      FUNCTION_CHECKS.forEach(item => { const v = fnChecks[item.id]; if (v?.ground === "fail" || v?.platform === "fail") { const which = v?.ground === "fail" && v?.platform === "fail" ? "Ground and Platform" : v?.ground === "fail" ? "Ground" : "Platform"; defectRows.push({ entry_id: entryId, sheet_id: sheetId, mewp_id: mewpId, site_id: mewp.sites.id, inspection_date: today, item_number: item.id, check_type: "function", defect_details: defects[item.id] || `Fault on ${which} control`, date_noted: today, status: "open" }); }});
      if (defectRows.length > 0) { const { error: defectErr } = await supabase.from("defect_log").insert(defectRows); if (defectErr) throw new Error(`Defects: ${defectErr.message}`); }
      fetch("/api/generate-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mewp_id: mewpId, sheet_id: sheetId }),
      }).catch(() => {});
      setPageStatus("done");
    } catch (err) { setSubmitError(err.message); setPageStatus("submit_error"); }
  }

  const totalVisual = SECTIONS.reduce((a, s) => a + s.items.length, 0);
  const doneVisual = Object.values(visual).filter(Boolean).length;
  const doneFn = Object.values(fnChecks).filter(v => v?.ground || v?.platform).length;
  const faultCount = Object.values(visual).filter(v => v === "fail").length + Object.values(fnChecks).filter(v => v?.ground === "fail" || v?.platform === "fail").length;
  const progress = step === 1 ? Math.round((doneVisual / totalVisual) * 100) : step === 2 ? Math.round((doneFn / FUNCTION_CHECKS.length) * 100) : 0;
  const fmtTime = ts => new Date(ts).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const todayLong = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  if (pageStatus === "loading") return <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ textAlign: "center" }}><div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>⏳</div><div style={{ color: "#6b7280" }}>Loading...</div></div></div>;
  if (pageStatus === "not_found") return <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ textAlign: "center", padding: "2rem" }}><div style={{ fontSize: "3rem", marginBottom: "1rem" }}>⚠️</div><div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#dc2626", marginBottom: "0.5rem" }}>Machine Not Found</div><div style={{ color: "#6b7280" }}>Contact your site manager.</div></div></div>;
  if (pageStatus === "submitting") return <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ textAlign: "center" }}><div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>💾</div><div style={{ color: "#6b7280", fontWeight: 700 }}>Saving inspection...</div></div></div>;
  if (pageStatus === "submit_error") return <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ textAlign: "center", padding: "2rem" }}><div style={{ fontSize: "3rem", marginBottom: "1rem" }}>❌</div><div style={{ fontSize: "1rem", fontWeight: 800, color: "#dc2626", marginBottom: "0.5rem" }}>Submission Failed</div><div style={{ color: "#6b7280", marginBottom: "1.5rem" }}>{submitError}</div><button style={S.primaryBtn()} onClick={() => setPageStatus("form")}>Try Again</button></div></div>;

  if (pageStatus === "already_done") return (
    <div style={S.app}>
      <div style={{ ...S.topbar, background: "#15803d" }}><div><div style={S.topbarTitle}>✅ Already Inspected Today</div><div style={S.topbarSub}>{mewp?.machine_ref} · {mewp?.sites?.name}</div></div></div>
      <div style={S.container}>
        <div style={{ textAlign: "center", padding: "2rem 0 1rem" }}><div style={{ fontSize: "4rem", marginBottom: "0.5rem" }}>✅</div><div style={{ fontSize: "1.3rem", fontWeight: 900, color: "#15803d", marginBottom: "0.3rem" }}>Inspection Complete</div><div style={{ color: "#6b7280" }}>This machine has already been checked today</div></div>
        <div style={S.card}>
          <div style={S.cardHead("#15803d")}><span style={{ fontSize: "1.1rem" }}>📋</span><span style={S.cardHeadText}>Today's Record</span></div>
          <div style={{ padding: "1rem" }}>
            {[["Machine", mewp?.machine_ref], ["Site", mewp?.sites?.name], ["Inspector", existingEntry.operator_name], ["PAL Card", existingEntry.pal_card_number || "—"], ["Time", fmtTime(existingEntry.submitted_at)], ["Result", existingEntry.daily_status === "fault" ? "⚠️ Faults found" : "✅ All clear"]].map(([k, v]) => (
              <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "0.65rem 0", borderBottom: "1px solid #f3f4f6", fontSize: "0.95rem" }}>
                <span style={{ color: "#6b7280", fontWeight: 600 }}>{k}</span><span style={{ color: k === "Result" && existingEntry.daily_status === "fault" ? "#dc2626" : "#111827", fontWeight: 700 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={S.warningBox("#f0fdf4", "#bbf7d0", "#15803d")}>✅ No action needed. If you believe this is an error, contact your site manager.</div>
        {existingEntry.daily_status === "fault" && alreadyDoneFaults.length > 0 && (
          <div style={{ marginTop: "0.5rem" }}>
            <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "#b91c1c", marginBottom: "0.75rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>⚠️ Faults Logged Today</div>
            {alreadyDoneFaults.map(fault => (
              <div key={fault.item_number} style={{ background: "#fef2f2", border: "2px solid #fecaca", borderRadius: "10px", padding: "0.85rem 1rem", marginBottom: "0.6rem" }}>
                <div style={{ fontSize: "0.78rem", fontWeight: 800, color: "#b91c1c", marginBottom: "0.3rem" }}>Item #{String(fault.item_number).padStart(2, "0")} — {fault.description}</div>
                <div style={{ fontSize: "0.9rem", color: "#7f1d1d", lineHeight: 1.5 }}>{fault.defect_details}</div>
                <span style={{ display: "inline-block", marginTop: "0.4rem", fontSize: "0.65rem", fontWeight: 800, textTransform: "uppercase", padding: "0.15rem 0.5rem", borderRadius: "20px", background: fault.status === "repaired" ? "#bbf7d0" : fault.status === "open" ? "#fecaca" : "#fde68a", color: fault.status === "repaired" ? "#15803d" : fault.status === "open" ? "#991b1b" : "#92400e" }}>{fault.status}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  if (pageStatus === "done") {
    const doneFaults = [
      ...SECTIONS.flatMap(s => s.items).filter(i => visual[i.id] === "fail").map(item => ({
        id: item.id, text: item.text, detail: defects[item.id] || "Fault identified during pre-use inspection",
      })),
      ...FUNCTION_CHECKS.filter(i => fnChecks[i.id]?.ground === "fail" || fnChecks[i.id]?.platform === "fail").map(item => ({
        id: item.id, text: item.text,
        detail: defects[item.id] || `Fault on ${fnChecks[item.id]?.ground === "fail" && fnChecks[item.id]?.platform === "fail" ? "Ground and Platform" : fnChecks[item.id]?.ground === "fail" ? "Ground" : "Platform"} control`,
      })),
    ];
    return (
      <div style={S.app}>
        <div style={{ ...S.topbar, background: faultCount > 0 ? "#b91c1c" : "#15803d" }}><div><div style={S.topbarTitle}>{faultCount > 0 ? "⚠️ Faults Logged" : "✅ Inspection Complete"}</div><div style={S.topbarSub}>{mewp?.machine_ref}</div></div></div>
        <div style={{ ...S.container, paddingTop: "2rem" }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>{faultCount > 0 ? "⚠️" : "✅"}</div>
            <div style={{ fontSize: "1.3rem", fontWeight: 900, color: faultCount > 0 ? "#b91c1c" : "#15803d", marginBottom: "0.5rem" }}>{faultCount > 0 ? "Faults Logged" : "All Clear"}</div>
            <div style={{ color: "#6b7280", marginBottom: "0.3rem" }}>{mewp?.machine_ref} · {mewp?.sites?.name}</div>
            <div style={{ color: "#9ca3af", fontSize: "0.85rem" }}>{operator.name} · {todayLong}</div>
            {faultCount > 0 && <div style={{ ...S.warningBox(), marginTop: "1.5rem", textAlign: "left" }}>⚠️ <strong>{faultCount} fault(s) logged.</strong> Report to your supervisor immediately. Do not operate until cleared.</div>}
          </div>
          {faultCount > 0 && doneFaults.length > 0 && (
            <div style={{ marginTop: "1rem" }}>
              <div style={{ fontSize: "0.85rem", fontWeight: 800, color: "#b91c1c", marginBottom: "0.75rem", textTransform: "uppercase", letterSpacing: "0.04em", textAlign: "left" }}>Faults Logged — Report to Supervisor</div>
              {doneFaults.map(fault => (
                <div key={fault.id} style={{ background: "#fef2f2", border: "2px solid #fecaca", borderRadius: "10px", padding: "0.85rem 1rem", marginBottom: "0.6rem" }}>
                  <div style={{ fontSize: "0.78rem", fontWeight: 800, color: "#b91c1c", marginBottom: "0.3rem" }}>Item #{String(fault.id).padStart(2, "0")} — {fault.text}</div>
                  <div style={{ fontSize: "0.9rem", color: "#7f1d1d", lineHeight: 1.5 }}>{fault.detail}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (step === 0) return (
    <div style={S.app}>
      <div style={S.topbar}><div><div style={S.topbarTitle}>{mewp?.machine_ref}</div><div style={S.topbarSub}>{mewp?.sites?.name}{mewp?.model ? ` · ${mewp.model}` : ""}</div></div></div>
      <div style={S.container}>
        <div style={{ padding: "1rem 0 0.5rem" }}><div style={{ fontSize: "0.7rem", color: "#1d4ed8", fontWeight: 800, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "0.3rem" }}>Daily Pre-Use Inspection</div><div style={{ fontSize: "1.2rem", fontWeight: 900, color: "#111827" }}>{todayLong}</div></div>
        <div style={S.card}>
          <div style={S.cardHead()}><span style={{ fontSize: "1.1rem" }}>👷</span><span style={S.cardHeadText}>Operator Details</span></div>
          <div style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div><label style={S.label}>Your Full Name *</label><input type="text" placeholder="e.g. James Smith" value={operator.name} onChange={e => setOperator(p => ({ ...p, name: e.target.value }))} style={S.input} /></div>
            <div><label style={S.label}>PAL Card Number</label><input type="text" placeholder="e.g. PAL-123456" value={operator.palCard} onChange={e => setOperator(p => ({ ...p, palCard: e.target.value }))} style={S.input} /></div>
          </div>
        </div>
        <div style={S.warningBox("#fffbeb", "#fde68a", "#92400e")}>⚡ Only trained and authorised persons should operate this equipment. All faults must be reported to your supervisor immediately.</div>
        <button style={S.primaryBtn("#1d4ed8", !operator.name.trim())} onClick={() => operator.name.trim() && setStep(1)}>Start Visual Checks →</button>
      </div>
    </div>
  );

  if (step === 1) return (
    <div style={S.app}>
      <div style={S.topbar}><div><div style={S.topbarTitle}>Visual Checks</div><div style={S.topbarSub}>{doneVisual}/{totalVisual} completed · {mewp?.machine_ref}</div></div><span style={{ background: "#fff", color: "#1d4ed8", fontSize: "0.75rem", fontWeight: 800, padding: "0.25rem 0.6rem", borderRadius: "20px" }}>{progress}%</span></div>
      <div style={S.container}>
        <div style={S.progressWrap}><div style={{ height: "100%", width: `${progress}%`, background: "#1d4ed8", transition: "width 0.3s", borderRadius: "4px" }} /></div>
        {SECTIONS.map(section => (
          <div key={section.id} style={S.card}>
            <div style={S.cardHead()}><span style={{ fontSize: "1.1rem" }}>{section.emoji}</span><span style={S.cardHeadText}>{section.label}</span><span style={{ marginLeft: "auto", fontSize: "0.75rem", color: "#93c5fd", fontWeight: 700 }}>{section.items.filter(i => visual[i.id]).length}/{section.items.length}</span></div>
            {section.items.map(item => <VisualRow key={item.id} item={item} value={visual[item.id]} onChange={(id, val) => setVisual(p => ({ ...p, [id]: val }))} />)}
          </div>
        ))}
        <div style={{ display: "flex", gap: "0.75rem" }}><button style={S.ghostBtn} onClick={() => setStep(0)}>← Back</button><button style={{ ...S.primaryBtn(), flex: 1 }} onClick={() => setStep(2)}>Function Checks →</button></div>
      </div>
    </div>
  );

  if (step === 2) return (
    <div style={S.app}>
      <div style={{ ...S.topbar, background: "#1e40af" }}><div><div style={S.topbarTitle}>Function Checks</div><div style={S.topbarSub}>{doneFn}/{FUNCTION_CHECKS.length} completed · G & P controls</div></div><span style={{ background: "#fff", color: "#1e40af", fontSize: "0.75rem", fontWeight: 800, padding: "0.25rem 0.6rem", borderRadius: "20px" }}>{progress}%</span></div>
      <div style={S.container}>
        <div style={S.progressWrap}><div style={{ height: "100%", width: `${progress}%`, background: "#1e40af", transition: "width 0.3s", borderRadius: "4px" }} /></div>
        <div style={S.warningBox("#eff6ff", "#bfdbfe", "#1e40af")}>⚡ Test each item using both <strong>Ground (G)</strong> and <strong>Platform (P)</strong> controls.</div>
        <div style={S.card}>
          <div style={S.cardHead("#1e40af")}><span style={{ fontSize: "1.1rem" }}>🎮</span><span style={S.cardHeadText}>Function Checks — G & P</span></div>
          {FUNCTION_CHECKS.map(item => <FunctionRow key={item.id} item={item} value={fnChecks[item.id]} onChange={(id, key, val) => setFnChecks(p => ({ ...p, [id]: { ...(p[id] || {}), [key]: val } }))} />)}
        </div>
        <div style={{ display: "flex", gap: "0.75rem" }}><button style={S.ghostBtn} onClick={() => setStep(1)}>← Back</button><button style={{ ...S.primaryBtn(), flex: 1 }} onClick={() => setStep(3)}>Review & Submit →</button></div>
      </div>
    </div>
  );

  if (step === 3) {
    const allFaultItems = [...SECTIONS.flatMap(s => s.items).filter(i => visual[i.id] === "fail"), ...FUNCTION_CHECKS.filter(i => fnChecks[i.id]?.ground === "fail" || fnChecks[i.id]?.platform === "fail")];
    return (
      <div style={S.app}>
        <div style={{ ...S.topbar, background: faultCount > 0 ? "#b91c1c" : "#15803d" }}><div><div style={S.topbarTitle}>{faultCount > 0 ? `⚠️ ${faultCount} Fault(s) Found` : "✅ All Clear"}</div><div style={S.topbarSub}>Review before submitting</div></div></div>
        <div style={S.container}>
          {faultCount > 0 && <div style={S.warningBox()}>⚠️ <strong>{faultCount} fault(s) detected.</strong> Describe each defect below and report to your supervisor immediately.</div>}
          <div style={S.card}>
            <div style={S.cardHead()}><span style={{ fontSize: "1.1rem" }}>📋</span><span style={S.cardHeadText}>Summary</span></div>
            <div style={{ padding: "1rem" }}>
              {[["Machine", mewp?.machine_ref], ["Site", mewp?.sites?.name], ["Operator", operator.name], ["PAL Card", operator.palCard || "—"], ["Date", new Date().toLocaleDateString("en-GB")], ["Visual", `${doneVisual}/${totalVisual}`], ["Function", `${doneFn}/${FUNCTION_CHECKS.length}`], ["Faults", faultCount > 0 ? `${faultCount} found` : "None"]].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "0.65rem 0", borderBottom: "1px solid #f3f4f6", fontSize: "0.95rem" }}>
                  <span style={{ color: "#6b7280", fontWeight: 600 }}>{k}</span><span style={{ color: k === "Faults" && faultCount > 0 ? "#dc2626" : "#111827", fontWeight: 700 }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
          {allFaultItems.length > 0 && (
            <div style={S.card}>
              <div style={S.cardHead("#b91c1c")}><span style={{ fontSize: "1.1rem" }}>⚠️</span><span style={S.cardHeadText}>Describe Each Fault</span></div>
              {allFaultItems.map(item => (
                <div key={item.id} style={{ padding: "1rem", borderBottom: "1px solid #f3f4f6", background: "#fef2f2" }}>
                  <div style={{ fontSize: "0.82rem", color: "#b91c1c", fontWeight: 700, marginBottom: "0.5rem" }}>Item #{String(item.id).padStart(2,"0")} — {item.text}</div>
                  <textarea placeholder="Describe the defect in detail..." value={defects[item.id] || ""} onChange={e => setDefects(p => ({ ...p, [item.id]: e.target.value }))} rows={2} style={{ ...S.input, resize: "vertical", fontSize: "0.9rem" }} />
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button style={S.ghostBtn} onClick={() => setStep(2)}>← Back</button>
            <button style={{ ...S.primaryBtn(faultCount > 0 ? "#b91c1c" : "#15803d"), flex: 1 }} onClick={handleSubmit}>{faultCount > 0 ? "⚠️ Submit with Faults" : "✅ Submit — All Clear"}</button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export async function getServerSideProps({ params }) {
  return { props: { mewpId: params?.mewpId || null } };
}
