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
const appOrigin = Deno.env.get("APP_ORIGIN");

if (!supabaseUrl || !anonKey || !serviceRoleKey || !appOrigin) {
  throw new Error("Required account management function environment is missing.");
}

const redirectTo = new URL("/", appOrigin).toString();
const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});
const authClient = createClient(supabaseUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
});

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed." }, 405);

  const accessToken = request.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return jsonResponse({ error: "Administrator login required." }, 401);

  const { data: authData, error: authError } = await adminClient.auth.getUser(accessToken);
  if (authError || !authData.user) return jsonResponse({ error: "Administrator login required." }, 401);

  const { data: actor, error: actorError } = await adminClient.from("profiles")
    .select("role,is_banned")
    .eq("id", authData.user.id)
    .maybeSingle();
  if (actorError) {
    console.error("Could not verify administrator role.", actorError);
    return jsonResponse({ error: "Administrator role could not be verified." }, 500);
  }
  if (actor?.role !== "admin" || actor.is_banned) {
    return jsonResponse({ error: "Administrator role required." }, 403);
  }

  let body: { action?: unknown; target_user_id?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid request." }, 400);
  }

  const action = body.action;
  const targetUserId = typeof body.target_user_id === "string" ? body.target_user_id : "";
  if (!["password_reset", "ban", "unban", "delete"].includes(String(action))) {
    return jsonResponse({ error: "Unsupported account action." }, 400);
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetUserId)) {
    return jsonResponse({ error: "Invalid account identifier." }, 400);
  }

  const { data: target, error: targetError } = await adminClient.from("profiles")
    .select("email,role,is_banned,is_protected")
    .eq("id", targetUserId)
    .maybeSingle();
  if (targetError) {
    console.error("Could not load target account.", targetError);
    return jsonResponse({ error: "Could not load target account." }, 500);
  }
  if (!target) return jsonResponse({ error: "Account not found." }, 404);
  if (target.is_protected) {
    return jsonResponse({ error: "Dieses geschützte Administratorkonto kann nicht durch andere Konten verändert werden." }, 403);
  }

  if (action === "password_reset") {
    const { error } = await authClient.auth.resetPasswordForEmail(target.email, { redirectTo });
    if (error) {
      console.error("Could not send administrator-triggered password reset.", error);
      return jsonResponse({ error: "Password reset email could not be sent." }, 502);
    }
    return jsonResponse({ success: true });
  }

  if (action === "delete") {
    const { error } = await adminClient.rpc("admin_delete_user_account", {
      target_user_id: targetUserId,
      acting_admin_id: authData.user.id
    });
    if (error) {
      console.error("Could not delete account.", error);
      return jsonResponse({ error: error.message }, error.code === "23514" ? 409 : 400);
    }
    return jsonResponse({ success: true });
  }

  const shouldBan = action === "ban";
  if (targetUserId === authData.user.id && shouldBan) {
    return jsonResponse({ error: "You cannot ban your own account." }, 400);
  }
  if (target.is_banned === shouldBan) return jsonResponse({ success: true, is_banned: shouldBan });

  const { error: authUpdateError } = await adminClient.auth.admin.updateUserById(targetUserId, {
    ban_duration: shouldBan ? "876000h" : "none"
  });
  if (authUpdateError) {
    console.error("Could not update authentication ban.", authUpdateError);
    return jsonResponse({ error: "Account access could not be updated." }, 502);
  }

  const { error: profileUpdateError } = await adminClient.rpc("admin_set_profile_banned", {
    target_user_id: targetUserId,
    new_is_banned: shouldBan,
    acting_admin_id: authData.user.id
  });
  if (profileUpdateError) {
    console.error("Could not update account ban status.", profileUpdateError);
    const { error: rollbackError } = await adminClient.auth.admin.updateUserById(targetUserId, {
      ban_duration: shouldBan ? "none" : "876000h"
    });
    if (rollbackError) {
      console.error("Could not roll back authentication ban after database error.", rollbackError);
      return jsonResponse({
        error: "Database status could not be saved and authentication rollback failed. Please check this account manually."
      }, 500);
    }
    return jsonResponse({ error: profileUpdateError.message }, profileUpdateError.code === "23514" ? 409 : 500);
  }

  return jsonResponse({ success: true, is_banned: shouldBan });
});
