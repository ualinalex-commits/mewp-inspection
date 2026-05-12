import { useEffect, useState } from "react";
import { useRouter } from "next/router";

const S = {
  page: { minHeight: "100vh", background: "#f3f4f6", fontFamily: "system-ui, -apple-system, sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: "1rem" },
  card: { background: "#fff", borderRadius: "16px", padding: "2rem", width: "100%", maxWidth: "360px", textAlign: "center", boxShadow: "0 4px 24px rgba(0,0,0,0.1)" },
};

export default function SiteBypass() {
  const router = useRouter();
  const [status, setStatus] = useState("verifying");

  useEffect(() => {
    if (!router.isReady) return;
    const { token, site } = router.query;
    if (!token || !site) { setStatus("invalid"); return; }
    verify(token, site);
  }, [router.isReady]);

  async function verify(token, siteId) {
    try {
      const res = await fetch("/api/site/verify-bypass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, siteId }),
      });
      const data = await res.json();
      if (data.valid) {
        localStorage.setItem(`site_bypass_${siteId}`, "granted");
        router.replace(`/site/${siteId}`);
      } else {
        setStatus("invalid");
      }
    } catch {
      setStatus("invalid");
    }
  }

  return (
    <div style={S.page}>
      <div style={S.card}>
        <img src="/logo.png" style={{ height: 56, objectFit: "contain", marginBottom: "1.5rem" }} alt="Logo" />
        {status === "verifying" && (
          <div style={{ color: "#6b7280", fontSize: "0.95rem" }}>Verifying access...</div>
        )}
        {status === "invalid" && (
          <>
            <div style={{ fontSize: "1.1rem", fontWeight: 800, color: "#b91c1c", marginBottom: "0.5rem" }}>Invalid Link</div>
            <div style={{ fontSize: "0.85rem", color: "#6b7280" }}>This bypass link is invalid or has expired.</div>
          </>
        )}
      </div>
    </div>
  );
}
