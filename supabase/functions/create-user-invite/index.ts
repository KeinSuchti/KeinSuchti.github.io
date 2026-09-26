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
if (parsedAppOrigin.protocol !== "https:" || parsedAppOrigin.pathname !== "/") {
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

  let body: { email?: unknown; username?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid request." }, 400);
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return jsonResponse({ error: "Please provide a valid email address." }, 400);
  }
  if (!/^[a-z0-9][a-z0-9_.-]{2,23}$/.test(username)) {
    return jsonResponse({ error: "Username must be 3-24 characters using letters, numbers, dot, dash, or underscore." }, 400);
  }

  const { data: existingUsername, error: usernameError } = await adminClient
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (usernameError) {
    console.error("Could not check invitation username.", usernameError);
    return jsonResponse({ error: "Username availability could not be checked." }, 500);
  }
  if (existingUsername) return jsonResponse({ error: "This username is already in use." }, 409);

  const redirectTo = new URL("/?invite=1", parsedAppOrigin.origin).toString();
  const { data, error } = await adminClient.auth.admin.generateLink({
    type: "invite",
    email,
    options: { data: { username }, redirectTo }
  });
  if (error || !data.properties?.action_link) {
    console.error("Supabase could not generate an invitation link.", error);
    return jsonResponse({ error: "Could not create an invitation. The email may already have an account." }, 409);
  }

  return jsonResponse({ action_link: data.properties.action_link });
});
