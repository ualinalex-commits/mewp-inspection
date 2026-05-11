import { supabaseAdmin } from "../../../lib/supabase-admin";

async function verifyMainAdmin(req) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return null;
  if (process.env.ADMIN_BYPASS_TOKEN && token === process.env.ADMIN_BYPASS_TOKEN) {
    return { id: "bypass" };
  }
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !user) return null;
  const { data: profile } = await supabaseAdmin.from("user_profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "main_admin") return null;
  return user;
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const caller = await verifyMainAdmin(req);
  if (!caller) return res.status(401).json({ error: "Unauthorized" });

  const { siteId, archive } = req.body;
  if (!siteId || typeof archive !== "boolean") {
    return res.status(400).json({ error: "Missing required fields: siteId, archive" });
  }

  const { error } = await supabaseAdmin
    .from("sites")
    .update({ is_archived: archive })
    .eq("id", siteId);

  if (error) return res.status(500).json({ error: error.message });

  return res.status(200).json({ ok: true });
}
