import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../lib/supabase";

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
  primaryBtn: (color = "#d02a35") => ({ width: "100%", background: color, color: "#fff", border: "none", borderRadius: "12px", padding: "1rem", fontSize: "1rem", fontWeight: 800, cursor: "pointer", fontFamily: "system-ui, sans-serif" }),
  ghostBtn: (color = "#374151") => ({ background: "#fff", color, border: `2px solid ${color}33`, borderRadius: "10px", padding: "0.65rem 1rem", fontSize: "0.82rem", fontWeight: 700, cursor: "pointer", fontFamily: "system-ui, sans-serif", whiteSpace: "nowrap" }),
  error: { background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "0.75rem", fontSize: "0.85rem", color: "#b91c1c" },
  pill: (color) => ({ background: `${color}15`, border: `2px solid ${color}30`, color, fontSize: "0.68rem", fontWeight: 800, padding: "0.2rem 0.6rem", borderRadius: "20px", textTransform: "uppercase", whiteSpace: "nowrap" }),
};

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: "1rem" }}>
      <div style={{ background: "#fff", borderRadius: "16px", width: "100%", maxWidth: "500px", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem", boxShadow: "0 -4px 24px rgba(0,0,0,0.15)", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: "1.1rem", fontWeight: 900, color: "#111827" }}>{title}</div>
          <button onClick={onClose} style={{ background: "#f3f4f6", border: "none", borderRadius: "50%", width: "2rem", height: "2rem", cursor: "pointer", fontSize: "1rem", color: "#374151" }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function AddSiteModal({ onClose, onAdded, token }) {
  const [form, setForm] = useState({ name: "", location: "", postcode: "", managerName: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleAdd() {
    if (!form.name.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/add-site", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: form.name.trim(), location: form.location.trim(), postcode: form.postcode.trim(), managerName: form.managerName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to add site");
      onAdded(data.site);
      onClose();
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  }

  const fields = [
    { key: "name", label: "Site Name *", placeholder: "e.g. Manchester City Centre", type: "text" },
    { key: "location", label: "Location", placeholder: "e.g. Manchester", type: "text" },
    { key: "postcode", label: "Postcode", placeholder: "e.g. M1 1AE", type: "text" },
    { key: "managerName", label: "Manager Name", placeholder: "e.g. John Smith", type: "text" },
  ];

  return (
    <Modal title="+ Add New Site" onClose={onClose}>
      {fields.map(f => (
        <div key={f.key}>
          <label style={S.label}>{f.label}</label>
          <input
            type={f.type}
            placeholder={f.placeholder}
            value={form[f.key]}
            onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
            style={S.input}
          />
        </div>
      ))}
      {error && <div style={S.error}>{error}</div>}
      <div style={{ display: "flex", gap: "0.75rem" }}>
        <button style={{ ...S.ghostBtn(), flex: 1, padding: "0.85rem" }} onClick={onClose}>Cancel</button>
        <button
          style={{ ...S.primaryBtn(), flex: 2, opacity: form.name.trim() && !loading ? 1 : 0.4 }}
          onClick={handleAdd}
          disabled={!form.name.trim() || loading}
        >
          {loading ? "Adding..." : "Add Site"}
        </button>
      </div>
    </Modal>
  );
}

function CreateAdminModal({ activeSites, onClose, onCreated, token }) {
  const [form, setForm] = useState({ name: "", email: "", password: "", siteId: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isValid = form.name.trim() && form.email.trim() && form.password.length >= 8 && form.siteId;

  async function handleCreate() {
    if (!isValid) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/create-site-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: form.name.trim(), email: form.email.trim(), password: form.password, siteId: form.siteId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create admin");
      onCreated(data.siteAdmin);
      onClose();
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  }

  return (
    <Modal title="Create Site Admin" onClose={onClose}>
      <div>
        <label style={S.label}>Full Name *</label>
        <input type="text" placeholder="e.g. Sarah Jones" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} style={S.input} />
      </div>
      <div>
        <label style={S.label}>Email Address *</label>
        <input type="email" placeholder="sarah@company.com" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} style={S.input} />
      </div>
      <div>
        <label style={S.label}>Temporary Password * (min. 8 chars)</label>
        <input
          type="text"
          placeholder="e.g. Temp@1234"
          value={form.password}
          onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
          style={S.input}
          autoComplete="new-password"
        />
      </div>
      <div>
        <label style={S.label}>Assigned Site *</label>
        <select
          value={form.siteId}
          onChange={e => setForm(p => ({ ...p, siteId: e.target.value }))}
          style={{ ...S.input, cursor: "pointer" }}
        >
          <option value="">— Select a site —</option>
          {activeSites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      {error && <div style={S.error}>{error}</div>}
      <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: "8px", padding: "0.65rem", fontSize: "0.78rem", color: "#92400e" }}>
        The user will be asked to set a new password on first login.
      </div>
      <div style={{ display: "flex", gap: "0.75rem" }}>
        <button style={{ ...S.ghostBtn(), flex: 1, padding: "0.85rem" }} onClick={onClose}>Cancel</button>
        <button
          style={{ ...S.primaryBtn(), flex: 2, opacity: isValid && !loading ? 1 : 0.4 }}
          onClick={handleCreate}
          disabled={!isValid || loading}
        >
          {loading ? "Creating..." : "Create Admin"}
        </button>
      </div>
    </Modal>
  );
}

export default function AdminDashboard() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sites, setSites] = useState([]);
  const [siteAdmins, setSiteAdmins] = useState([]);
  const [showAddSite, setShowAddSite] = useState(false);
  const [showCreateAdmin, setShowCreateAdmin] = useState(false);
  const [showArchivedSites, setShowArchivedSites] = useState(false);
  const [showArchivedAdmins, setShowArchivedAdmins] = useState(false);

  useEffect(() => { checkAuth(); }, []);

  async function checkAuth() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("role, site_id")
        .eq("id", session.user.id)
        .single();

      if (!profile) { await supabase.auth.signOut(); router.replace("/login"); return; }

      if (profile.role === "site_admin") {
        router.replace(`/site/${profile.site_id}`);
        return;
      }

      if (profile.role !== "main_admin") {
        router.replace("/login");
        return;
      }

      setToken(session.access_token);
      setAuthLoading(false);
      loadData(session.access_token);
      return;
    }

    const bypassToken = typeof window !== "undefined" && localStorage.getItem("admin_bypass_token");
    if (bypassToken) {
      const res = await fetch("/api/admin/data", { headers: { Authorization: `Bearer ${bypassToken}` } });
      if (res.ok) {
        const data = await res.json();
        setToken(bypassToken);
        setSites(data.sites || []);
        setSiteAdmins(data.siteAdmins || []);
        setLoading(false);
        setAuthLoading(false);
        return;
      }
      localStorage.removeItem("admin_bypass_token");
    }

    router.replace("/login");
  }

  async function loadData(tok) {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/data", {
        headers: { Authorization: `Bearer ${tok || token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setSites(data.sites || []);
        setSiteAdmins(data.siteAdmins || []);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function handleLogout() {
    localStorage.removeItem("admin_bypass_token");
    await supabase.auth.signOut();
    router.push("/login");
  }

  async function handleArchiveSite(siteId, archive) {
    const res = await fetch("/api/admin/archive-site", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ siteId, archive }),
    });
    if (res.ok) {
      setSites(p => p.map(s => s.id === siteId ? { ...s, is_archived: archive } : s));
    }
  }

  async function handleArchiveSiteAdmin(adminId, archive) {
    const res = await fetch("/api/admin/archive-site-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ adminId, archive }),
    });
    if (res.ok) {
      setSiteAdmins(p => p.map(a => a.id === adminId ? { ...a, is_archived: archive } : a));
    }
  }

  const activeSites = sites.filter(s => !s.is_archived);
  const archivedSites = sites.filter(s => s.is_archived);
  const activeSiteAdmins = siteAdmins.filter(a => !a.is_archived);
  const archivedSiteAdmins = siteAdmins.filter(a => a.is_archived);

  if (authLoading) {
    return (
      <div style={{ ...S.app, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ color: "#6b7280" }}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={S.app}>
      <div style={S.logoBar}>
        <img src="/logo.png" style={{ height: 64, width: "auto", maxWidth: "300px", objectFit: "contain" }} alt="Logo" />
      </div>

      <div style={S.infoBar}>
        <div>
          <div style={{ fontSize: "1rem", fontWeight: 800, color: "#fff" }}>Admin Dashboard</div>
          <div style={{ fontSize: "0.72rem", color: "#fecdd3" }}>Main Administrator</div>
        </div>
        <button
          style={{ background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "8px", color: "#fff", padding: "0.5rem 0.75rem", cursor: "pointer", fontSize: "0.8rem", fontWeight: 700 }}
          onClick={handleLogout}
        >
          Logout
        </button>
      </div>

      <div style={S.container}>
        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem", margin: "1rem 0" }}>
          {[["Active Sites", activeSites.length, "#d02a35"], ["Active Admins", activeSiteAdmins.length, "#15803d"]].map(([label, value, color]) => (
            <div key={label} style={{ background: "#fff", borderRadius: "12px", padding: "1rem", textAlign: "center", boxShadow: "0 1px 3px rgba(0,0,0,0.08)" }}>
              <div style={{ fontSize: "2rem", fontWeight: 900, color, lineHeight: 1 }}>{loading ? "—" : value}</div>
              <div style={{ fontSize: "0.7rem", color: "#6b7280", marginTop: "0.3rem", fontWeight: 700, textTransform: "uppercase" }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Sites */}
        <div style={S.card}>
          <div style={S.cardHead()}>
            <span style={{ fontSize: "1.1rem" }}>📍</span>
            <span style={S.cardHeadText}>Sites</span>
            <button
              style={{ marginLeft: "auto", background: "#fff", color: "#d02a35", border: "none", borderRadius: "8px", padding: "0.4rem 0.85rem", fontSize: "0.8rem", fontWeight: 800, cursor: "pointer" }}
              onClick={() => setShowAddSite(true)}
            >
              + Add Site
            </button>
          </div>

          {loading && <div style={{ padding: "1.5rem", textAlign: "center", color: "#6b7280", fontSize: "0.85rem" }}>Loading...</div>}

          {!loading && activeSites.length === 0 && archivedSites.length === 0 && (
            <div style={{ padding: "2rem", textAlign: "center" }}>
              <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>📍</div>
              <div style={{ fontSize: "0.9rem", color: "#9ca3af", marginBottom: "1rem", fontWeight: 600 }}>No sites yet</div>
              <button style={{ ...S.primaryBtn(), maxWidth: "180px", margin: "0 auto" }} onClick={() => setShowAddSite(true)}>+ Add First Site</button>
            </div>
          )}

          {!loading && activeSites.length === 0 && archivedSites.length > 0 && (
            <div style={{ padding: "1rem", textAlign: "center", color: "#9ca3af", fontSize: "0.85rem" }}>No active sites</div>
          )}

          {!loading && activeSites.map((site, i) => (
            <div
              key={site.id}
              style={{ padding: "0.85rem 1rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", borderTop: i === 0 ? "none" : "1px solid #f3f4f6" }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#111827" }}>{site.name}</div>
                {(site.location || site.postcode) && (
                  <div style={{ fontSize: "0.78rem", color: "#6b7280", marginTop: "0.1rem" }}>{[site.location, site.postcode].filter(Boolean).join(", ")}</div>
                )}
                {site.manager_name && <div style={{ fontSize: "0.72rem", color: "#9ca3af" }}>Manager: {site.manager_name}</div>}
              </div>
              <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                <button
                  onClick={() => router.push(`/site/${site.id}`)}
                  style={{ background: "#d02a35", color: "#fff", border: "none", borderRadius: "8px", padding: "0.4rem 0.85rem", fontSize: "0.78rem", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                >
                  View Dashboard
                </button>
                <button
                  onClick={() => handleArchiveSite(site.id, true)}
                  style={{ background: "#f3f4f6", color: "#6b7280", border: "none", borderRadius: "8px", padding: "0.4rem 0.7rem", fontSize: "0.72rem", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                >
                  Archive
                </button>
              </div>
            </div>
          ))}

          {!loading && archivedSites.length > 0 && (
            <div>
              <div
                onClick={() => setShowArchivedSites(p => !p)}
                style={{ padding: "0.6rem 1rem", background: "#f9fafb", borderTop: activeSites.length > 0 ? "1px solid #e5e7eb" : "none", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }}
              >
                <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Archived Sites ({archivedSites.length})
                </span>
                <span style={{ fontSize: "0.75rem", color: "#9ca3af" }}>{showArchivedSites ? "▲" : "▼"}</span>
              </div>
              {showArchivedSites && archivedSites.map((site, i) => (
                <div
                  key={site.id}
                  style={{ padding: "0.85rem 1rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", borderTop: "1px solid #f3f4f6", opacity: 0.65 }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#111827" }}>{site.name}</div>
                    {(site.location || site.postcode) && (
                      <div style={{ fontSize: "0.78rem", color: "#6b7280", marginTop: "0.1rem" }}>{[site.location, site.postcode].filter(Boolean).join(", ")}</div>
                    )}
                    {site.manager_name && <div style={{ fontSize: "0.72rem", color: "#9ca3af" }}>Manager: {site.manager_name}</div>}
                  </div>
                  <button
                    onClick={() => handleArchiveSite(site.id, false)}
                    style={{ background: "#fffbeb", color: "#b45309", border: "none", borderRadius: "8px", padding: "0.4rem 0.7rem", fontSize: "0.72rem", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, opacity: 1 }}
                  >
                    Unarchive
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Site Admins */}
        <div style={S.card}>
          <div style={S.cardHead("#15803d")}>
            <span style={{ fontSize: "1.1rem" }}>👤</span>
            <span style={S.cardHeadText}>Site Admins</span>
            <button
              style={{ marginLeft: "auto", background: "#fff", color: "#15803d", border: "none", borderRadius: "8px", padding: "0.4rem 0.85rem", fontSize: "0.8rem", fontWeight: 800, cursor: "pointer" }}
              onClick={() => setShowCreateAdmin(true)}
            >
              + Create Admin
            </button>
          </div>

          {loading && <div style={{ padding: "1.5rem", textAlign: "center", color: "#6b7280", fontSize: "0.85rem" }}>Loading...</div>}

          {!loading && activeSiteAdmins.length === 0 && archivedSiteAdmins.length === 0 && (
            <div style={{ padding: "2rem", textAlign: "center" }}>
              <div style={{ fontSize: "2rem", marginBottom: "0.5rem" }}>👤</div>
              <div style={{ fontSize: "0.9rem", color: "#9ca3af", marginBottom: "1rem", fontWeight: 600 }}>No site admins yet</div>
              <button style={{ ...S.primaryBtn("#15803d"), maxWidth: "200px", margin: "0 auto" }} onClick={() => setShowCreateAdmin(true)}>+ Create First Admin</button>
            </div>
          )}

          {!loading && activeSiteAdmins.length === 0 && archivedSiteAdmins.length > 0 && (
            <div style={{ padding: "1rem", textAlign: "center", color: "#9ca3af", fontSize: "0.85rem" }}>No active site admins</div>
          )}

          {!loading && activeSiteAdmins.map((admin, i) => (
            <div
              key={admin.id}
              style={{ padding: "0.85rem 1rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", borderTop: i === 0 ? "none" : "1px solid #f3f4f6" }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#111827" }}>{admin.name}</div>
                <div style={{ fontSize: "0.78rem", color: "#6b7280" }}>{admin.email}</div>
                {admin.site_name && (
                  <div style={{ fontSize: "0.72rem", color: "#9ca3af", marginTop: "0.1rem" }}>Site: {admin.site_name}</div>
                )}
              </div>
              <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexShrink: 0 }}>
                {admin.must_change_password && (
                  <span style={S.pill("#f59e0b")}>Must change PW</span>
                )}
                <button
                  onClick={() => handleArchiveSiteAdmin(admin.id, true)}
                  style={{ background: "#f3f4f6", color: "#6b7280", border: "none", borderRadius: "8px", padding: "0.4rem 0.7rem", fontSize: "0.72rem", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                >
                  Archive
                </button>
              </div>
            </div>
          ))}

          {!loading && archivedSiteAdmins.length > 0 && (
            <div>
              <div
                onClick={() => setShowArchivedAdmins(p => !p)}
                style={{ padding: "0.6rem 1rem", background: "#f9fafb", borderTop: activeSiteAdmins.length > 0 ? "1px solid #e5e7eb" : "none", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none" }}
              >
                <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Archived Admins ({archivedSiteAdmins.length})
                </span>
                <span style={{ fontSize: "0.75rem", color: "#9ca3af" }}>{showArchivedAdmins ? "▲" : "▼"}</span>
              </div>
              {showArchivedAdmins && archivedSiteAdmins.map((admin, i) => (
                <div
                  key={admin.id}
                  style={{ padding: "0.85rem 1rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", borderTop: "1px solid #f3f4f6", opacity: 0.65 }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "#111827" }}>{admin.name}</div>
                    <div style={{ fontSize: "0.78rem", color: "#6b7280" }}>{admin.email}</div>
                    {admin.site_name && (
                      <div style={{ fontSize: "0.72rem", color: "#9ca3af", marginTop: "0.1rem" }}>Site: {admin.site_name}</div>
                    )}
                  </div>
                  <button
                    onClick={() => handleArchiveSiteAdmin(admin.id, false)}
                    style={{ background: "#fffbeb", color: "#b45309", border: "none", borderRadius: "8px", padding: "0.4rem 0.7rem", fontSize: "0.72rem", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, opacity: 1 }}
                  >
                    Unarchive
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showAddSite && (
        <AddSiteModal
          token={token}
          onClose={() => setShowAddSite(false)}
          onAdded={site => setSites(p => [...p, site])}
        />
      )}

      {showCreateAdmin && (
        <CreateAdminModal
          activeSites={activeSites}
          token={token}
          onClose={() => setShowCreateAdmin(false)}
          onCreated={admin => setSiteAdmins(p => [...p, admin])}
        />
      )}
    </div>
  );
}
