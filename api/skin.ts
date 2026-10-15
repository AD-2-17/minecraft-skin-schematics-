// Vercel function: resolve a Java username to its current skin, server-side,
// because Mojang's APIs don't allow browser (CORS) requests.
//
// GET /api/skin?name=<username>
//   200 { name, id, model: "classic" | "slim", png: <base64> }
//   400 { error: "bad_name" }   404 { error: "not_found" }   502 { error: "upstream" }

const NAME = /^[A-Za-z0-9_]{1,16}$/;

function json(body: unknown, status = 200, cache = "no-store") {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": cache },
  });
}

async function fetchJson(url: string): Promise<{ status: number; body: any }> {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (res.status === 204 || res.status === 404) return { status: 404, body: null };
  if (!res.ok) return { status: res.status, body: null };
  return { status: 200, body: await res.json() };
}

export async function GET(request: Request): Promise<Response> {
  const name = new URL(request.url).searchParams.get("name") ?? "";
  if (!NAME.test(name)) return json({ error: "bad_name" }, 400);
  try {
    const profile = await fetchJson(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`);
    if (profile.status === 404) return json({ error: "not_found" }, 404, "public, s-maxage=300");
    if (profile.status !== 200 || !profile.body?.id) return json({ error: "upstream" }, 502);
    const id: string = profile.body.id;

    const session = await fetchJson(`https://sessionserver.mojang.com/session/minecraft/profile/${id}`);
    if (session.status !== 200) return json({ error: "upstream" }, 502);
    const prop = (session.body.properties ?? []).find((p: { name: string }) => p.name === "textures");
    if (!prop) return json({ error: "upstream" }, 502);
    const textures = JSON.parse(Buffer.from(prop.value, "base64").toString("utf8")).textures ?? {};
    const skin = textures.SKIN;
    if (!skin?.url) return json({ error: "no_skin" }, 404);

    const url = String(skin.url).replace(/^http:/, "https:");
    if (!/^https:\/\/textures\.minecraft\.net\//.test(url)) return json({ error: "upstream" }, 502);
    const png = await fetch(url);
    if (!png.ok) return json({ error: "upstream" }, 502);
    const bytes = Buffer.from(await png.arrayBuffer());
    if (bytes.length > 64 * 1024) return json({ error: "upstream" }, 502);

    return json(
      { name: profile.body.name ?? name, id, model: skin.metadata?.model === "slim" ? "slim" : "classic", png: bytes.toString("base64") },
      200,
      "public, s-maxage=600, stale-while-revalidate=3600",
    );
  } catch {
    return json({ error: "upstream" }, 502);
  }
}
