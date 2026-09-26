import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
  "Content-Type": "application/json"
};

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  throw new Error("Required registration function environment is missing.");
}

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const authClient = createClient(supabaseUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
});

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  let body: { invitation_token?: unknown; email?: unknown; username?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid request." }, 400);
  }

  const token = typeof body.invitation_token === "string" ? body.invitation_token : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const username = typeof body.username === "string" ? body.username.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!/^[a-f0-9]{64}$/.test(token)) {
    return jsonResponse({ error: "Registration link is invalid, expired, or already used." }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return jsonResponse({ error: "Please provide a valid email address." }, 400);
  }
  if (!/^[a-z0-9][a-z0-9_.-]{2,23}$/.test(username)) {
    return jsonResponse({ error: "Username must be 3-24 characters using letters, numbers, dot, dash, or underscore." }, 400);
  }
  if (password.length < 8 || password.length > 256) {
    return jsonResponse({ error: "Password must be 8-256 characters." }, 400);
  }

  const [emailProfile, usernameProfile] = await Promise.all([
    adminClient.from("profiles").select("id").eq("email", email).maybeSingle(),
    adminClient.from("profiles").select("id").eq("username", username).maybeSingle()
  ]);
  if (emailProfile.error || usernameProfile.error) {
    console.error("Could not validate registration details.", emailProfile.error || usernameProfile.error);
    return jsonResponse({ error: "Could not validate registration details." }, 500);
  }
  if (emailProfile.data || usernameProfile.data) {
    return jsonResponse({ error: "Email address or username is already in use." }, 409);
  }

  const tokenHash = await sha256Hex(token);
  const { data: consumed, error: consumeError } = await adminClient.rpc("consume_registration_invite", {
    invitation_token_hash: tokenHash
  });
  if (consumeError) {
    console.error("Could not validate registration link.", consumeError);
    return jsonResponse({ error: "Could not validate registration link." }, 500);
  }
  if (!consumed) {
    return jsonResponse({ error: "Registration link is invalid, expired, or already used." }, 400);
  }

  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username }
  });
  if (createError || !created.user) {
    console.error("Could not create invited account.", createError);
    return jsonResponse({
      error: "Could not create account. The link has been used; ask an administrator for a new one and check that the email and username are available."
    }, 409);
  }

  const { data: signInData, error: signInError } = await authClient.auth.signInWithPassword({ email, password });
  if (signInError || !signInData.session) {
    console.error("Account created but automatic sign-in failed.", signInError);
    return jsonResponse({ registered: true }, 200);
  }

  return jsonResponse({ registered: true, session: signInData.session });
});
