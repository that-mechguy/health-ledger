// Health Ledger · Edge Function "claude-proxy"
// Lets invited people use Claude (food estimates, label scans, report reading) with the owner's API key,
// without ever seeing the key. Each non-admin person gets a daily cap (hl_private 'ai_daily_cap', default 5; 0 = friends must use their own key).
// Secrets (Supabase → Edge Functions → Secrets): ANTHROPIC_API_KEY.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase automatically.
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const MODELS = ["claude-sonnet-5-5", "claude-haiku-4-5-20251001", "claude-opus-5-5"];
const db = createClient(SB_URL, SRK, { auth: { persistSession: false } });
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
// app-level problems come back as 200 + { ok:false, code, message } so the website can show them
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "content-type": "application/json" } });
const fail = (code: string, message: string) => json({ ok: false, code, message });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: u, error } = await db.auth.getUser(jwt);
    if (error || !u?.user) return fail("auth", "Sign in again to use AI features.");
    const uid = u.user.id;
    const body = await req.json().catch(() => null);
    if (body?.action === "status") {
      const d = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
      const [{ data: cap }, { data: use }, { data: adm }] = await Promise.all([
        db.from("hl_private").select("value").eq("name", "ai_daily_cap").maybeSingle(),
        db.from("ai_usage").select("calls").eq("user_id", uid).eq("day", d).maybeSingle(),
        db.from("app_admins").select("user_id").eq("user_id", uid).maybeSingle(),
      ]);
      return json({ ok: true, ready: !!KEY, cap: +(cap?.value ?? 5), used: use?.calls ?? 0, admin: !!adm });
    }
    if (!KEY) return fail("no_key", "The shared Claude key isn't set up yet. Ask the account owner to add ANTHROPIC_API_KEY to the claude-proxy function.");
    if (!body || !Array.isArray(body.messages)) return fail("bad_request", "Nothing to send to Claude.");
    const { data: n, error: e1 } = await db.rpc("hl_ai_bump", { p_uid: uid });
    if (e1) return fail("server", "Usage counter error: " + e1.message);
    if (n === -1) {
      const { data: c } = await db.from("hl_private").select("value").eq("name", "ai_daily_cap").maybeSingle();
      if (+(c?.value ?? 5) === 0) return fail("ai_off", "AI features here use your own Claude API key. Add one in Settings → Your own Claude key (console.anthropic.com), or log food from the list or manually.");
      return fail("cap", "You've used today's AI allowance. It resets at midnight; you can still log food from the list or manually.");
    }
    const model = MODELS.includes(body.model) ? body.model : MODELS[0];
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": KEY, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model, max_tokens: Math.min(16000, Math.max(256, +body.max_tokens || 2000)), messages: body.messages }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return json({ ok: false, code: "api_" + r.status, status: r.status, message: j?.error?.message || "Claude API error " + r.status });
    return json({ ok: true, used: n, ...j });
  } catch (e) {
    return fail("server", String((e as Error)?.message ?? e));
  }
});
