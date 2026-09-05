import crypto from "crypto";
import type { StreamConfig } from "./floodsight/types";

export class CameraUnreachableError extends Error {}
export class CameraAuthError extends Error {}
export class CameraTimeoutError extends Error {}
export class CameraResponseError extends Error {}

function md5(value: string) {
  return crypto.createHash("md5").update(value).digest("hex");
}

function parseWwwAuthenticate(header: string) {
  const scheme = header.split(" ", 1)[0];
  const params: Record<string, string> = {};
  const regex = /([a-zA-Z0-9_-]+)=((?:"[^"]*")|[^,\s]+)/g;
  let match;

  while ((match = regex.exec(header))) {
    const key = match[1];
    let value = match[2];
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }
    params[key] = value;
  }

  return { scheme, params };
}

function buildDigestAuthorization(
  config: StreamConfig,
  url: URL,
  challenge: ReturnType<typeof parseWwwAuthenticate>,
) {
  const { params } = challenge;
  const username = config.username ?? "";
  const password = config.password ?? "";
  const realm = params.realm ?? "";
  const nonce = params.nonce ?? "";
  const qop = params.qop?.split(",").map((item) => item.trim())[0] ?? "";
  const uri = url.pathname + url.search;
  const nc = "00000001";
  const cnonce = crypto.randomBytes(16).toString("hex");

  const ha1 = md5(`${username}:${realm}:${password}`);
  const ha2 = md5(`GET:${uri}`);
  const response = md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`);

  const pieces = [
    `username="${username}"`,
    `realm="${realm}"`,
    `nonce="${nonce}"`,
    `uri="${uri}"`,
    `response="${response}"`,
  ];

  if (params.algorithm) {
    pieces.push(`algorithm=${params.algorithm}`);
  }

  if (qop) {
    pieces.push(`qop=${qop}`, `nc=${nc}`, `cnonce="${cnonce}"`);
  }

  return `Digest ${pieces.join(", ")}`;
}

function buildUrl(config: StreamConfig) {
  const ipAddress = (config.ipAddress ?? "").trim();
  if (!ipAddress) {
    throw new CameraResponseError("Camera IP address is required.");
  }

  const port = config.port ?? 80;
  const snapshotPath = config.snapshotPath?.trim() || "/cgi-bin/snapshot.cgi?channel=1&subtype=0";
  const normalizedIp = ipAddress.replace(/\/+$/, "");
  const base = `http://${normalizedIp}:${port}`;

  try {
    return new URL(snapshotPath, base);
  } catch (error) {
    throw new CameraResponseError("Invalid snapshot path or IP address.");
  }
}

async function fetchWithTimeout(url: string, signal: AbortSignal) {
  try {
    return await fetch(url, { method: "GET", signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new CameraTimeoutError("Camera request timed out.");
    }
    throw new CameraUnreachableError("Camera is unreachable.");
  }
}

export async function fetchCameraSnapshot(config: StreamConfig): Promise<{ buffer: Buffer; contentType: string }> {
  const url = buildUrl(config);
  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), 8000);

  try {
    const response = await fetchWithTimeout(url.toString(), timeoutController.signal);
    clearTimeout(timeout);

    if (response.status === 401) {
      const wwwHeader = response.headers.get("www-authenticate") ?? "";
      if (!wwwHeader) {
        throw new CameraAuthError("Camera requires authentication.");
      }

      const challenge = parseWwwAuthenticate(wwwHeader);
      let authHeader: string;

      if (challenge.scheme.toLowerCase() === "digest") {
        authHeader = buildDigestAuthorization(config, url, challenge);
      } else if (challenge.scheme.toLowerCase() === "basic") {
        if (!config.username || !config.password) {
          throw new CameraAuthError("Camera requires username and password.");
        }
        authHeader = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`;
      } else {
        throw new CameraAuthError("Unsupported camera authentication scheme.");
      }

      const retryController = new AbortController();
      const retryTimeout = setTimeout(() => retryController.abort(), 8000);
      try {
        const authorized = await fetch(url.toString(), {
          method: "GET",
          headers: { Authorization: authHeader },
          signal: retryController.signal,
        });

        if (authorized.status === 401) {
          throw new CameraAuthError("Authentication failed for camera snapshot.");
        }

        const contentType = authorized.headers.get("content-type") ?? "";
        if (!contentType.startsWith("image/")) {
          const bodyText = await authorized.text();
          throw new CameraResponseError(
            `Camera snapshot response is not an image: ${bodyText.slice(0, 200)}`,
          );
        }

        const arrayBuffer = await authorized.arrayBuffer();
        return { buffer: Buffer.from(arrayBuffer), contentType };
      } finally {
        clearTimeout(retryTimeout);
      }
    }

    if (!response.ok) {
      throw new CameraUnreachableError(`Camera request failed with status ${response.status}.`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
      const bodyText = await response.text();
      throw new CameraResponseError(`Camera snapshot response is not an image: ${bodyText.slice(0, 200)}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return { buffer: Buffer.from(arrayBuffer), contentType };
  } finally {
    clearTimeout(timeout);
  }
}
