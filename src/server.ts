import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { getCameraFeeds, updateCameraFeed } from "./lib/db.server";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const url = new URL(request.url);

      if (url.pathname === "/api/cameras") {
        if (request.method === "GET") {
          const feeds = await getCameraFeeds();
          return new Response(JSON.stringify(feeds), {
            headers: { "content-type": "application/json; charset=utf-8" },
          });
        }
      }

      if (url.pathname.startsWith("/api/cameras/")) {
        const cameraId = decodeURIComponent(url.pathname.split("/api/cameras/")[1] ?? "");
        if (request.method === "PATCH") {
          try {
            const body = await request.json();
            const camera = body?.camera;
            if (!camera || typeof camera !== "object") {
              return new Response(JSON.stringify({ error: "Invalid camera payload" }), {
                status: 400,
                headers: { "content-type": "application/json; charset=utf-8" },
              });
            }

            const saved = await updateCameraFeed(cameraId, camera);
            return new Response(JSON.stringify(saved), {
              headers: { "content-type": "application/json; charset=utf-8" },
            });
          } catch (error) {
            return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Update failed" }), {
              status: 500,
              headers: { "content-type": "application/json; charset=utf-8" },
            });
          }
        }
      }

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
