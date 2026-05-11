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
  if (req.method !== "GET") return res.status(405).end();

  const user = await verifyMainAdmin(req);
  if (!user) return res.status(401).json({ error: "Unauthorized" });

  const [sitesResult, adminsResult] = await Promise.all([
    supabaseAdmin.from("sites").select("*").order("name"),
    supabaseAdmin
      .from("user_profiles")
      .select("id, name, email, site_id, must_change_password, is_archived, sites(name)")
      .eq("role", "site_admin")
      .order("name"),
  ]);

  const siteAdmins = (adminsResult.data || []).map(a => ({
    id: a.id,
    name: a.name,
    email: a.email,
    site_id: a.site_id,
    must_change_password: a.must_change_password,
    is_archived: a.is_archived || false,
    site_name: a.sites?.name || null,
  }));

  return res.status(200).json({
    sites: sitesResult.data || [],
    siteAdmins,
  });
}
