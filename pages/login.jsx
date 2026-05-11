import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { supabase } from "../lib/supabase";

const S = {
  page: { minHeight: "100vh", background: "#f3f4f6", fontFamily: "system-ui, -apple-system, sans-serif", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "1rem" },
  card: { background: "#fff", borderRadius: "16px", padding: "2rem", width: "100%", maxWidth: "400px", boxShadow: "0 4px 24px rgba(0,0,0,0.1)" },
  label: { fontSize: "0.75rem", fontWeight: 700, color: "#374151", letterSpacing: "0.05em", textTransform: "uppercase", marginBottom: "0.4rem", display: "block" },
  input: { width: "100%", background: "#f9fafb", border: "2px solid #e5e7eb", borderRadius: "10px", color: "#111827", padding: "0.85rem 1rem", fontSize: "1rem", fontFamily: "system-ui, sans-serif", outline: "none", boxSizing: "border-box" },
  btn: { width: "100%", background: "#d02a35", color: "#fff", border: "none", borderRadius: "12px", padding: "1rem", fontSize: "1rem", fontWeight: 800, cursor: "pointer", fontFamily: "system-ui, sans-serif" },
  error: { background: "#fef2f2", border: "1px solid #fecaca", borderRadius: "8px", padding: "0.75rem", fontSize: "0.85rem", color: "#b91c1c" },
};

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => { checkExistingSession(); }, []);

  async function checkExistingSession() {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      const redirected = await redirectBasedOnRole(session.user.id);
      if (!redirected) setChecking(false);
    } else {
      setChecking(false);
    }
  }

  async function redirectBasedOnRole(userId) {
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("role, site_id, must_change_password, is_archived")
      .eq("id", userId)
      .single();

    if (!profile) return false;

    if (profile.is_archived) {
      await supabase.auth.signOut();
      setError("Your account has been deactivated. Please contact your administrator.");
      return false;
    }

    if (profile.must_change_password) {
      setStep("change-password");
      return false;
    }

    if (profile.role === "main_admin") {
      router.replace("/admin");
      return true;
    }
    if (profile.role === "site_admin" && profile.site_id) {
      router.replace(`/site/${profile.site_id}`);
      return true;
    }
    return false;
  }

  async function handleLogin(e) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      const redirected = await redirectBasedOnRole(data.user.id);
      if (!redirected) setLoading(false);
    } catch (err) {
      setError(err.message || "Login failed. Check your email and password.");
      setLoading(false);
    }
  }

  async function handleChangePassword(e) {
    e.preventDefault();
    if (newPassword !== confirmPassword) { setError("Passwords do not match"); return; }
    if (newPassword.length < 8) { setError("Password must be at least 8 characters"); return; }
    setError("");
    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("user_profiles").update({ must_change_password: false }).eq("id", user.id);
      const redirected = await redirectBasedOnRole(user.id);
      if (!redirected) setLoading(false);
    } catch (err) {
      setError(err.message || "Failed to change password. Please try again.");
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div style={S.page}>
        <div style={{ color: "#6b7280", fontFamily: "system-ui, sans-serif" }}>Loading...</div>
      </div>
    );
  }

  if (step === "change-password") {
    return (
      <div style={S.page}>
        <div style={S.card}>
          <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
            <img src="/logo.png" style={{ height: 56, objectFit: "contain" }} alt="Logo" />
          </div>
          <div style={{ fontSize: "1.25rem", fontWeight: 900, color: "#111827", textAlign: "center", marginBottom: "0.4rem" }}>Set New Password</div>
          <div style={{ fontSize: "0.85rem", color: "#6b7280", textAlign: "center", marginBottom: "1.5rem" }}>You must create a new password before continuing.</div>
          {error && <div style={{ ...S.error, marginBottom: "1rem" }}>{error}</div>}
          <form onSubmit={handleChangePassword} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <label style={S.label}>New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                style={S.input}
                placeholder="Min. 8 characters"
                required
                minLength={8}
                autoComplete="new-password"
              />
            </div>
            <div>
              <label style={S.label}>Confirm Password</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                style={S.input}
                placeholder="Repeat your new password"
                required
                autoComplete="new-password"
              />
            </div>
            <button
              type="submit"
              style={{ ...S.btn, opacity: loading ? 0.6 : 1, marginTop: "0.5rem" }}
              disabled={loading}
            >
              {loading ? "Saving..." : "Set Password & Continue"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <div style={{ textAlign: "center", marginBottom: "1.5rem" }}>
          <img src="/logo.png" style={{ height: 56, objectFit: "contain" }} alt="Logo" />
        </div>
        <div style={{ fontSize: "1.25rem", fontWeight: 900, color: "#111827", textAlign: "center", marginBottom: "0.4rem" }}>Sign In</div>
        <div style={{ fontSize: "0.85rem", color: "#6b7280", textAlign: "center", marginBottom: "1.5rem" }}>MEWP Inspection Management</div>
        {error && <div style={{ ...S.error, marginBottom: "1rem" }}>{error}</div>}
        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div>
            <label style={S.label}>Email Address</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={S.input}
              placeholder="you@company.com"
              required
              autoComplete="email"
            />
          </div>
          <div>
            <label style={S.label}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={S.input}
              placeholder="Your password"
              required
              autoComplete="current-password"
            />
          </div>
          <button
            type="submit"
            style={{ ...S.btn, opacity: loading ? 0.6 : 1, marginTop: "0.5rem" }}
            disabled={loading}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
