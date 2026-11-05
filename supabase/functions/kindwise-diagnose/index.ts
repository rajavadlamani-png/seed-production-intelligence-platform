const allowedOrigins = new Set([
  "https://rajavadlamani-png.github.io",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
]);
const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Vary": "Origin",
};
const json = (body: unknown, status = 200, origin = "") => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Access-Control-Allow-Origin": origin || "https://rajavadlamani-png.github.io" },
});
const toText = (value: unknown): string => {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(toText).filter(Boolean).join("; ");
  if (value && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => {
        const text = toText(item);
        return text ? `${key.replace(/_/g, " ")}: ${text}` : "";
      })
      .filter(Boolean)
      .join(" · ");
  }
  return "";
};
Deno.serve(async (request: Request) => {
  const origin = request.headers.get("origin") || "";
  if (origin && !allowedOrigins.has(origin)) return json({ error: "This app origin is not allowed." }, 403, origin);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...corsHeaders, "Access-Control-Allow-Origin": origin || "https://rajavadlamani-png.github.io" } });
  if (request.method !== "POST") return json({ error: "Use POST to assess a crop photo." }, 405, origin);

  const authorization = request.headers.get("authorization") || "";
  const publishableKey = request.headers.get("apikey") || "";
  if (!authorization.startsWith("Bearer ") || !publishableKey) return json({ error: "Sign in to assess a crop photo." }, 401, origin);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const kindwiseKey = Deno.env.get("KINDWISE_API_KEY");
  if (!supabaseUrl) return json({ error: "The assessment service is not configured." }, 503, origin);
  if (!kindwiseKey) return json({ error: "Kindwise is not connected yet. Add the KINDWISE_API_KEY secret in Supabase Edge Function settings." }, 503, origin);

  try {
    const body = await request.json();
    const companyId = String(body?.companyId || "");
    const imageBase64 = String(body?.imageBase64 || "").replace(/^data:image\/[^;]+;base64,/, "");
    const mimeType = String(body?.mimeType || "");
    if (!/^[0-9a-f-]{36}$/i.test(companyId)) return json({ error: "Choose a valid company workspace." }, 400, origin);
    if (mimeType !== "image/jpeg" || !/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64) || imageBase64.length > 7_500_000) {
      return json({ error: "The photo is not a supported JPEG or is too large. Choose another image." }, 400, origin);
    }

    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: publishableKey, Authorization: authorization },
    });
    if (!userResponse.ok) return json({ error: "Your sign-in session is not valid. Sign in again and retry." }, 401, origin);
    const user = await userResponse.json();
    if (!user?.id) return json({ error: "Your sign-in session is not valid. Sign in again and retry." }, 401, origin);

    const membershipUrl = new URL(`${supabaseUrl}/rest/v1/company_memberships`);
    membershipUrl.searchParams.set("select", "company_id");
    membershipUrl.searchParams.set("company_id", `eq.${companyId}`);
    membershipUrl.searchParams.set("user_id", `eq.${user.id}`);
    membershipUrl.searchParams.set("status", "eq.active");
    membershipUrl.searchParams.set("limit", "1");
    const membershipResponse = await fetch(membershipUrl, {
      headers: { apikey: publishableKey, Authorization: authorization },
    });
    if (!membershipResponse.ok) return json({ error: "Could not verify your company access." }, 403, origin);
    const memberships = await membershipResponse.json();
    if (!Array.isArray(memberships) || memberships.length === 0) return json({ error: "Your account does not have active access to this company workspace." }, 403, origin);

    const kindwiseResponse = await fetch("https://crop.kindwise.com/api/v1/identification", {
      method: "POST",
      headers: { "Api-Key": kindwiseKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        images: [imageBase64],
        crop: "rice",
        language: "en",
        details: ["common_names", "description", "treatment", "symptoms", "severity", "taxonomy"],
      }),
    });
    if (!kindwiseResponse.ok) {
      if (kindwiseResponse.status === 429) return json({ error: "Kindwise has reached its current request or credit limit. Try again later." }, 429, origin);
      if (kindwiseResponse.status === 401 || kindwiseResponse.status === 403) return json({ error: "Kindwise did not accept its API key. Check the KINDWISE_API_KEY secret." }, 502, origin);
      return json({ error: `Kindwise could not assess the photo (service status ${kindwiseResponse.status}). Try again shortly.` }, 502, origin);
    }

    const payload = await kindwiseResponse.json();
    const result = payload?.result || {};
    const categories = [
      ["disease", "Disease"],
      ["pest", "Pest"],
      ["nutrient_deficiency", "Nutrient deficiency"],
      ["abiotic_stress", "Other crop stress"],
    ];
    const findings = categories.flatMap(([key, label]) => {
      const suggestions = result?.[key]?.suggestions;
      if (!Array.isArray(suggestions)) return [];
      return suggestions.map((item: Record<string, unknown>) => {
        const details = (item?.details || {}) as Record<string, unknown>;
        const probability = Number(item?.probability);
        const percentage = Number.isFinite(probability) ? (probability <= 1 ? probability * 100 : probability) : NaN;
        return {
          name: String(item?.name || item?.common_name || label),
          type: label,
          confidence: Number.isFinite(percentage) ? Math.max(0, Math.min(100, percentage)) : null,
          confidenceLabel: Number.isFinite(percentage) ? `${Math.round(percentage)}%` : "Not provided",
          symptoms: toText(details.symptoms),
          description: toText(details.description),
          treatment: toText(details.treatment),
        };
      });
    }).sort((a, b) => (b.confidence ?? -1) - (a.confidence ?? -1)).slice(0, 5);

    const status = findings.length ? "possible_problem" : result?.is_healthy === true ? "no_issue_detected" : "uncertain";
    return json({
      assessment: {
        provider: "Kindwise Crop.health",
        crop: "rice",
        assessedAt: new Date().toISOString(),
        status,
        findings,
      },
    }, 200, origin);
  } catch {
    return json({ error: "The photo assessment failed. Check your connection and try again." }, 500, origin);
  }
});
