export default function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { token } = req.body;
  const bypassToken = process.env.ADMIN_BYPASS_TOKEN;

  if (!bypassToken || !token || token !== bypassToken) {
    return res.status(401).json({ valid: false });
  }

  return res.status(200).json({ valid: true });
}
