// wa-onboard: alta de clientes via Embedded Signup (Tech Provider).
// Recibe el `code` del popup de Meta + datos del WABA, intercambia el token del
// cliente, registra el numero, suscribe el WABA al router, y guarda en
// wa_clientes + wa_rutas. Auth propia via header x-onboard-secret (por eso verify_jwt=false).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const GRAPH = "https://graph.facebook.com/v21.0";
const APP_ID = "1391319849718291"; // publico
const APP_SECRET = Deno.env.get("META_APP_SECRET"); // ya configurado (lo usa el router)
const ONBOARD_SECRET = Deno.env.get("ONBOARD_SECRET"); // gate de acceso a esta funcion

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-onboard-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}

function pin6(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  // ── Gate de acceso ──
  if (!APP_SECRET) return json({ error: "META_APP_SECRET no configurado" }, 500);
  if (!ONBOARD_SECRET) return json({ error: "ONBOARD_SECRET no configurado" }, 500);
  // .trim() en ambos lados: evita 401 por un espacio/salto de linea colado al
  // guardar el secret en Supabase o en el header del frontend.
  const recibido = (req.headers.get("x-onboard-secret") ?? "").trim();
  const esperado = ONBOARD_SECRET.trim();
  if (recibido !== esperado) {
    return json({ error: "no autorizado" }, 401);
  }

  let body: Record<string, string | undefined>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "body no es JSON" }, 400);
  }

  const { code, waba_id, phone_number_id, nombre_cliente, url_destino } = body;
  if (!code || !waba_id || !phone_number_id || !nombre_cliente || !url_destino) {
    return json({ error: "faltan campos: code, waba_id, phone_number_id, nombre_cliente, url_destino" }, 400);
  }

  // ── 1) Intercambiar code -> token del cliente (token de larga duracion) ──
  const tokenRes = await fetch(
    `${GRAPH}/oauth/access_token?client_id=${APP_ID}&client_secret=${APP_SECRET}&code=${encodeURIComponent(code)}`,
  );
  const tokenData = await tokenRes.json();
  if (!tokenRes.ok || !tokenData.access_token) {
    return json({ error: "fallo intercambio de token", detalle: tokenData }, 400);
  }
  const accessToken: string = tokenData.access_token;

  // ── 2) Registrar el numero en Cloud API (con PIN). Si ya estaba, seguimos. ──
  const pin = pin6();
  const regRes = await fetch(`${GRAPH}/${phone_number_id}/register`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", pin }),
  });
  const regData = await regRes.json();
  const registroOk = regRes.ok;

  // ── 3) Suscribir el WABA a la app -> que los mensajes lleguen al router ──
  const subRes = await fetch(`${GRAPH}/${waba_id}/subscribed_apps`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
  });
  const subData = await subRes.json();
  if (!subRes.ok || !subData.success) {
    return json({ error: "fallo al suscribir el WABA", detalle: subData }, 400);
  }

  // ── 4) Guardar credenciales + ruta (upsert por si reconecta) ──
  const { error: eCli } = await admin.from("wa_clientes").upsert({
    nombre_cliente,
    waba_id,
    phone_number_id,
    numero_display: body.numero_display ?? null,
    access_token: accessToken,
    pin,
    business_id: body.business_id ?? null,
    status: "activo",
    updated_at: new Date().toISOString(),
  }, { onConflict: "phone_number_id" });
  if (eCli) return json({ error: `wa_clientes: ${eCli.message}` }, 500);

  const { error: eRuta } = await admin.from("wa_rutas").upsert({
    phone_number_id,
    nombre: nombre_cliente,
    url_destino,
    activo: true,
  }, { onConflict: "phone_number_id" });
  if (eRuta) return json({ error: `wa_rutas: ${eRuta.message}` }, 500);

  return json({
    ok: true,
    cliente: nombre_cliente,
    phone_number_id,
    waba_id,
    registro: registroOk ? "registrado" : "ya_registrado_o_pendiente",
    mensaje: "Cliente conectado. Sus mensajes ya se enrutan a su agente.",
  });
});
