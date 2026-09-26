import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "Content-Type": "application/json"
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const appOrigin = Deno.env.get("APP_ORIGIN");

if (!supabaseUrl || !serviceRoleKey || !appOrigin) {
  throw new Error("Required invitation function environment is missing.");
}

const parsedAppOrigin = new URL(appOrigin);
if (
  parsedAppOrigin.protocol !== "https:" ||
  parsedAppOrigin.pathname !== "/" ||
  parsedAppOrigin.search ||
  parsedAppOrigin.hash ||
  parsedAppOrigin.username ||
  parsedAppOrigin.password
) {
  throw new Error("APP_ORIGIN must be an HTTPS origin without a path.");
}

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const authorization = request.headers.get("Authorization") || "";
  const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return jsonResponse({ error: "Administrator login required." }, 401);

  const { data: authData, error: authError } = await adminClient.auth.getUser(accessToken);
  if (authError || !authData.user) return jsonResponse({ error: "Administrator login required." }, 401);

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (profileError) {
    console.error("Could not verify invitation administrator role.", profileError);
    return jsonResponse({ error: "Administrator role could not be verified." }, 500);
  }
  if (profile?.role !== "admin") return jsonResponse({ error: "Administrator role required." }, 403);

  const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
  const token = Array.from(tokenBytes, byte => byte.toString(16).padStart(2, "0")).join("");
  const tokenHashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const tokenHash = Array.from(new Uint8Array(tokenHashBuffer), byte => byte.toString(16).padStart(2, "0")).join("");
  const { error: insertError } = await adminClient.from("registration_invites").insert({
    token_hash: tokenHash,
    created_by: authData.user.id
  });
  if (insertError) {
    console.error("Could not store registration invitation.", insertError);
    return jsonResponse({ error: "Could not create a registration link." }, 500);
  }

  const registrationUrl = new URL("/", parsedAppOrigin.origin);
  registrationUrl.searchParams.set("invite", token);
  return jsonResponse({ registration_url: registrationUrl.toString() });
});
