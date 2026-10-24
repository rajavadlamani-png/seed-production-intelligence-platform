import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const jsonHeaders = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const identifier = /^[A-Za-z0-9_-]{1,100}$/;

function response(body: unknown, status: number, origin: string | null, allowed: string[]) {
  const headers: Record<string, string> = { ...jsonHeaders, "Vary": "Origin" };
  if (origin && allowed.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
    headers["Access-Control-Allow-Headers"] = "authorization, apikey, content-type";
    headers["Access-Control-Allow-Methods"] = "GET, OPTIONS";
  }
  return new Response(JSON.stringify(body), { status, headers });
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
  if (!allowed.length) return response({ error: "server_configuration_incomplete", message: "ALLOWED_ORIGINS must be configured." }, 503, origin, allowed);
  if (origin && !allowed.includes(origin)) return response({ error: "origin_not_allowed" }, 403, origin, allowed);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: {
    "Vary": "Origin",
    ...(origin && allowed.includes(origin) ? {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Headers": "authorization, apikey, content-type",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    } : {}),
  }});
  if (req.method !== "GET") return response({ error: "method_not_allowed" }, 405, origin, allowed);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return response({ error: "server_configuration_incomplete", message: "Supabase server environment is incomplete." }, 503, origin, allowed);
  }

  const authorization = req.headers.get("authorization") ?? "";
  const tokenMatch = authorization.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch) return response({ error: "unauthorized" }, 401, origin, allowed);
  const token = tokenMatch[1];

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: authData, error: authError } = await userClient.auth.getUser(token);
  const user = authData?.user;
  if (authError || !user) return response({ error: "unauthorized" }, 401, origin, allowed);

  const url = new URL(req.url);
  const companyId = (url.searchParams.get("company_id") ?? "").trim();
  const fieldFilter = (url.searchParams.get("field_id") ?? "").trim();
  if (!companyId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(companyId)) {
    return response({ error: "company_id_required", message: "Supply a valid company_id for the signed-in user's membership." }, 400, origin, allowed);
  }
  if (fieldFilter && !identifier.test(fieldFilter)) {
    return response({ error: "invalid_field_id" }, 400, origin, allowed);
  }

  const { data: membership, error: membershipError } = await admin
    .from("company_memberships")
    .select("id, company_id, role, is_active")
    .eq("company_id", companyId)
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (membershipError) return response({ error: "membership_lookup_failed" }, 500, origin, allowed);
  if (!membership) return response({ error: "forbidden", message: "No active membership for this company." }, 403, origin, allowed);

  const { data: company, error: companyError } = await admin
    .from("companies")
    .select("id, status")
    .eq("id", companyId)
    .maybeSingle();
  if (companyError) return response({ error: "company_status_lookup_failed" }, 500, origin, allowed);
  if (!company || company.status !== "active") {
    return response({ error: "company_inactive" }, 403, origin, allowed);
  }

  let query = admin
    .from("seed_satellite_observations")
    .select("id, location_id, company_id, crop_season_id, farmer_id, field_id, field_code, village, district, state, crop, hybrid, planting_date, crop_stage, collection, interval_start, interval_end, acquisition_dates, field_area_coverage_pct, cloud_coverage_pct, valid_pixel_pct, metrics, indices, plain_language_interpretation, interpretation_version, provider, provider_product_ids, source_sha256, retrieved_at, created_at")
    .eq("company_id", companyId)
    .order("interval_start", { ascending: false })
    .limit(500);

  // Enforce field-level scope for field officers. The satellite ledger uses
  // text field identifiers; resolve them through the authoritative fields table.
  if (membership.role === "field_officer") {
    const today = new Date().toISOString().slice(0, 10);
    const { data: assignments, error: assignmentError } = await admin
      .from("field_assignments")
      .select("field_id")
      .eq("company_id", companyId)
      .eq("field_officer_membership_id", membership.id)
      .eq("is_active", true)
      .lte("starts_on", today)
      .or(`ends_on.is.null,ends_on.gte.${today}`);
    if (assignmentError) return response({ error: "field_scope_lookup_failed" }, 500, origin, allowed);
    const ids = [...new Set((assignments ?? []).map((x: { field_id: string }) => x.field_id).filter(Boolean))];
    if (!ids.length) return response({ observations: [], count: 0, scope: "assigned_fields" }, 200, origin, allowed);
    const { data: fields, error: fieldsError } = await admin
      .from("fields")
      .select("id, field_code")
      .eq("company_id", companyId)
      .in("id", ids);
    if (fieldsError) return response({ error: "field_scope_lookup_failed" }, 500, origin, allowed);
    const codes = [...new Set((fields ?? []).map((x: { field_code: string | null }) => x.field_code).filter((x): x is string => !!x && identifier.test(x)))];
    if (!codes.length) return response({ error: "field_scope_mapping_unavailable", message: "Assigned production fields cannot yet be matched to satellite field identifiers. No observations were returned." }, 409, origin, allowed);
    const allowedFieldIdentifiers = new Set([...ids, ...codes]);
    if (fieldFilter && !allowedFieldIdentifiers.has(fieldFilter)) {
      return response({ error: "forbidden_field", message: "The requested field is not assigned to this user." }, 403, origin, allowed);
    }
    if (!fieldFilter) {
      const alternatives = [...allowedFieldIdentifiers];
      query = query.or(`field_id.in.(${alternatives.join(",")}),field_code.in.(${codes.join(",")})`);
    }
  } else if (membership.role === "territory_manager") {
    // The satellite ledger does not yet store a verified territory key, so do
    // not infer territory scope from a client-side role selector.
    return response({ error: "territory_scope_unconfigured", message: "Territory-to-field mapping must be configured and verified before this role can read satellite observations." }, 409, origin, allowed);
  } else if (!["platform_admin", "customer_admin", "production_manager", "viewer"].includes(membership.role)) {
    return response({ error: "forbidden_role" }, 403, origin, allowed);
  }

  if (fieldFilter) {
    query = query.or(`field_id.eq.${fieldFilter},field_code.eq.${fieldFilter}`);
  }
  const { data: observations, error: readError } = await query;
  if (readError) return response({ error: "observations_read_failed" }, 500, origin, allowed);

  const rows = observations ?? [];
  const ids = rows.map((x: { id: string }) => x.id);
  let reviewsById: Record<string, string> = {};
  if (ids.length) {
    const { data: reviews, error: reviewError } = await admin
      .from("seed_satellite_interpretation_reviews")
      .select("observation_id, review_status, created_at")
      .in("observation_id", ids)
      .order("created_at", { ascending: false });
    if (reviewError) return response({ error: "review_status_read_failed" }, 500, origin, allowed);
    for (const review of reviews ?? []) {
      if (!(review.observation_id in reviewsById)) reviewsById[review.observation_id] = review.review_status;
    }
  }

  return response({
    observations: rows.map((row: Record<string, unknown>) => ({
      ...row,
      review_status: reviewsById[String(row.id)] ?? "pending",
    })),
    count: rows.length,
    scope: membership.role === "field_officer" ? "assigned_fields" : "company",
    retrieved_at: new Date().toISOString(),
  }, 200, origin, allowed);
});
