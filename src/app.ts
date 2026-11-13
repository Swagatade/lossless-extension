// Runtime-agnostic request handler built on the Web-standard Request/Response
// API. It runs unchanged on Cloudflare Workers, Node.js, Vercel and Zoho.
import { loadConfig, type Env } from "./config.js";
import { homePage } from "./home.js";
import { TtlCache } from "./cache.js";
import { AppError, badRequest, notFound } from "./errors.js";
import {
  normalizeTrack,
  streamResponse,
  upstreamIdFromPublicId,
} from "./normalize.js";
import { createProvider, createSourceProvider } from "./providers/index.js";
import type { QobuzProvider, Quality, PublicTrack } from "./types.js";

type Handler = (query: URLSearchParams, params: string[]) => Promise<Response>;
interface Route {
  pattern: RegExp;
  handler: Handler;
}

export interface App {
  fetch(request: Request): Promise<Response>;
}

const manifests = {
  root: { id: "com.echomusic.lossless", name: "Lossless", version: "1.0.0" },
  qobuzdl: {
    id: "com.EchoMusic.qobuz.qobuzdl",
    name: "Qobuz-DL",
    version: "1.0.0",
  },
  lastbabe: {
    id: "com.EchoMusic.qobuz.lastbabe",
    name: "LastBabe",
    version: "1.0.0",
  },
  monochrome: {
    id: "com.EchoMusic.qobuz.monochrome",
    name: "Monochrome Lossless",
    version: "1.0.0",
  },
  deezer: {
    id: "com.EchoMusic.qobuz.deezer",
    name: "Deezer Fallback",
    version: "1.0.0",
  },
  eljohnzc: {
    id: "com.EchoMusic.qobuz.eljohnzc",
    name: "Eljohnzc Lossless",
    version: "1.0.0",
  },
  instable: {
    id: "com.EchoMusic.qobuz.instable",
    name: "Instable Lossless",
    version: "1.0.0",
  },
} as const;

const SEARCH_CACHE = "public, max-age=30, s-maxage=300, stale-while-revalidate=600";

function respond(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  const isText = typeof body === "string";
  return new Response(isText ? body : JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": isText
        ? "text/html; charset=utf-8"
        : "application/json; charset=utf-8",
      ...headers,
    },
  });
}

export function parseQuality(value?: string): Quality {
  const normalized = (value ?? "LOSSLESS").toUpperCase();
  if (
    normalized === "LOSSLESS" ||
    normalized === "HIGH" ||
    normalized === "LOW"
  )
    return normalized;
  throw badRequest("quality must be LOSSLESS, HIGH, or LOW");
}

/**
 * Build an app from an environment. On Workers the env comes from the `fetch`
 * handler (bindings/vars/secrets); on Node it is `process.env`.
 */
export function createApp(env: Env): App {
  const config = loadConfig(env);
  const routes: Route[] = [];
  const get = (pattern: RegExp, handler: Handler): void => {
    routes.push({ pattern, handler });
  };

  function registerAddon(
    prefix: string,
    provider: QobuzProvider,
    manifest: { id: string; name: string; version: string },
  ): void {
    const searchCache = new TtlCache<PublicTrack[]>(config.cacheTtlMs);

    get(new RegExp(`^${prefix}/manifest\\.json$`), async () =>
      respond(
        200,
        {
          ...manifest,
          resources: ["search", "stream"],
          allowDownloads: 0,
          settings: [
            {
              key: "quality",
              type: "select",
              default: "lossless",
              options: [
                { label: "Lossless", value: "lossless" },
                { label: "High", value: "high" },
                { label: "Low", value: "low" },
              ],
            },
          ],
        },
        { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
      ),
    );

    get(new RegExp(`^${prefix}/search$`), async (params) => {
      const query = params.get("q")?.trim();
      if (!query) throw badRequest("q is required");
      const quality = parseQuality(params.get("quality") ?? undefined);
      const atmos = params.get("atmos") ?? "auto";
      const key = `${query}\u0000${quality}\u0000${atmos}`;
      const cached = searchCache.get(key);
      if (cached)
        return respond(200, { tracks: cached }, { "Cache-Control": SEARCH_CACHE });
      try {
        const tracks = (await provider.search(query, quality, atmos)).flatMap(
          (track) => {
            try {
              return [normalizeTrack(track, config.idSecret)];
            } catch {
              return [];
            }
          },
        );
        searchCache.set(key, tracks);
        return respond(200, { tracks }, { "Cache-Control": SEARCH_CACHE });
      } catch (error) {
        const stale = searchCache.getStale(key);
        if (stale)
          return respond(
            200,
            { tracks: stale, stale: true },
            {
              "Cache-Control":
                "public, max-age=10, s-maxage=30, stale-while-revalidate=120",
            },
          );
        throw error;
      }
    });

    get(new RegExp(`^${prefix}/stream/([^/]+)$`), async (params, [rawId]) => {
      const quality = parseQuality(params.get("quality") ?? undefined);
      const atmos = params.get("atmos") ?? "auto";
      let id: string;
      try {
        id = decodeURIComponent(rawId ?? "");
      } catch {
        throw notFound("track not found");
      }
      if (!/^qobuz_[A-Za-z0-9_-]{10,120}$/.test(id))
        throw notFound("track not found");
      const upstreamId = upstreamIdFromPublicId(id, config.idSecret);
      if (!upstreamId) throw notFound("track not available");
      const stream = await provider.getStream(upstreamId, quality, atmos);
      if (!stream) throw notFound("track not available");
      let result;
      try {
        result = streamResponse(stream, quality);
      } catch {
        throw notFound("track has no playable rendition");
      }
      return respond(200, result);
    });
  }

  get(/^\/$/, async () => respond(200, homePage));
  get(/^\/health$/, async () => respond(200, { ok: true }));

  registerAddon("", createProvider(config), manifests.root);
  registerAddon("/a", createSourceProvider(config, "qobuzdl"), manifests.qobuzdl);
  registerAddon("/b", createSourceProvider(config, "lastbabe"), manifests.lastbabe);
  registerAddon("/c", createSourceProvider(config, "monochrome"), manifests.monochrome);
  registerAddon("/d", createSourceProvider(config, "deezer"), manifests.deezer);
  registerAddon("/e", createSourceProvider(config, "eljohnzc"), manifests.eljohnzc);
  registerAddon("/f", createSourceProvider(config, "instable"), manifests.instable);

  return {
    async fetch(request: Request): Promise<Response> {
      try {
        if (request.method !== "GET" && request.method !== "HEAD")
          return respond(405, { error: "method not allowed" });
        const url = new URL(request.url);
        for (const route of routes) {
          const match = route.pattern.exec(url.pathname);
          if (match) return await route.handler(url.searchParams, match.slice(1));
        }
        return respond(404, { error: "not found" });
      } catch (error) {
        if (error instanceof AppError)
          return respond(error.statusCode, { error: error.message });
        const candidate = error as { statusCode?: unknown; status?: unknown };
        const status =
          typeof candidate.statusCode === "number"
            ? candidate.statusCode
            : typeof candidate.status === "number"
              ? candidate.status
              : 500;
        console.error(
          JSON.stringify({
            level: "error",
            msg: error instanceof Error ? error.message : String(error),
          }),
        );
        return respond(status, {
          error:
            status >= 500 ? "upstream service unavailable" : "request failed",
        });
      }
    },
  };
}
