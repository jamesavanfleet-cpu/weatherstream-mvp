const RELEASE_HOURS_UTC = new Set([3, 9, 15, 21]);
const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_API_VERSION = "2022-11-28";
const USER_AGENT = "MyCruisingWeather-NHC-Release-Window-Dispatcher";

function base64UrlEncode(value) {
  const bytes = typeof value === "string"
    ? new TextEncoder().encode(value)
    : new Uint8Array(value);

  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/u, "");
}

function privateKeyDerFromPem(privateKeyPem) {
  if (typeof privateKeyPem !== "string" || !privateKeyPem.includes("BEGIN PRIVATE KEY")) {
    throw new Error("GitHub App private key is missing or invalid");
  }

  const base64 = privateKeyPem
    .replace(/-----BEGIN PRIVATE KEY-----/gu, "")
    .replace(/-----END PRIVATE KEY-----/gu, "")
    .replace(/\s+/gu, "");

  if (!base64) {
    throw new Error("GitHub App private key is missing key material");
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

/**
 * Create a short-lived GitHub App JSON Web Token. The token is valid for nine
 * minutes, comfortably below GitHub's ten-minute maximum. It is exchanged for
 * an installation token on every scheduled check and is never persisted.
 */
export async function createGitHubAppJwt({
  appId,
  privateKeyPem,
  nowMs = Date.now(),
  cryptoImpl = crypto,
}) {
  if (!appId || !privateKeyPem) {
    throw new Error("GitHub App authentication configuration is incomplete");
  }

  const issuedAt = Math.floor(nowMs / 1000) - 60;
  const expiresAt = issuedAt + 540;
  const encodedHeader = base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const encodedPayload = base64UrlEncode(JSON.stringify({
    exp: expiresAt,
    iat: issuedAt,
    iss: String(appId),
  }));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const privateKey = await cryptoImpl.subtle.importKey(
    "pkcs8",
    privateKeyDerFromPem(privateKeyPem),
    { hash: "SHA-256", name: "RSASSA-PKCS1-v1_5" },
    false,
    ["sign"],
  );
  const signature = await cryptoImpl.subtle.sign(
    { name: "RSASSA-PKCS1-v1_5" },
    privateKey,
    new TextEncoder().encode(signingInput),
  );

  return `${signingInput}.${base64UrlEncode(signature)}`;
}

export async function createInstallationAccessToken({
  fetchImpl = fetch,
  appJwt,
  installationId,
}) {
  if (!appJwt || !installationId) {
    throw new Error("GitHub App installation configuration is incomplete");
  }

  const response = await fetchImpl(
    `${GITHUB_API_BASE}/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${appJwt}`,
        "User-Agent": USER_AGENT,
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
      },
    },
  );

  if (response.status !== 201) {
    const body = await response.text().catch(() => "");
    throw new Error(`GitHub installation token request failed (${response.status}): ${body.slice(0, 500)}`);
  }

  const payload = await response.json();
  if (!payload?.token || typeof payload.token !== "string") {
    throw new Error("GitHub installation token response did not contain a token");
  }

  return payload.token;
}

/**
 * Map the scheduled clock time to the nominal NHC advisory anchor it follows.
 * Cloudflare provides scheduledTime, so a delayed execution retains its intended
 * release cycle instead of accidentally dispatching a later one.
 */
export function releaseAnchorForScheduledTime(scheduledTimeMs) {
  const scheduledAt = new Date(scheduledTimeMs);
  if (Number.isNaN(scheduledAt.getTime())) {
    throw new Error("Cloudflare scheduledTime was not a valid timestamp");
  }

  const hour = scheduledAt.getUTCHours();
  if (!RELEASE_HOURS_UTC.has(hour)) {
    throw new Error(`Unexpected NHC dispatcher hour: ${hour} UTC`);
  }

  return new Date(Date.UTC(
    scheduledAt.getUTCFullYear(),
    scheduledAt.getUTCMonth(),
    scheduledAt.getUTCDate(),
    hour,
    0,
    0,
    0,
  )).toISOString().replace(".000Z", "Z");
}

export async function dispatchNHCWorkflow({
  fetchImpl = fetch,
  repository,
  workflowFile,
  ref,
  token,
  targetRelease,
}) {
  if (!repository || !workflowFile || !ref || !token || !targetRelease) {
    throw new Error("Dispatcher configuration is incomplete");
  }

  const response = await fetchImpl(
    `${GITHUB_API_BASE}/repos/${repository}/actions/workflows/${workflowFile}/dispatches`,
    {
      method: "POST",
      headers: {
        "Accept": "application/vnd.github+json",
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
      },
      body: JSON.stringify({
        ref,
        inputs: { target_release: targetRelease },
      }),
    },
  );

  // GitHub returns 204 No Content for a successful workflow_dispatch request.
  if (response.status !== 204) {
    const body = await response.text().catch(() => "");
    throw new Error(`GitHub workflow dispatch failed (${response.status}): ${body.slice(0, 500)}`);
  }
}

export async function runScheduledDispatch(event, env, {
  fetchImpl = fetch,
  nowMs,
  cryptoImpl = crypto,
} = {}) {
  const targetRelease = releaseAnchorForScheduledTime(event.scheduledTime);
  const appJwt = await createGitHubAppJwt({
    appId: env.GITHUB_APP_ID,
    privateKeyPem: env.GITHUB_APP_PRIVATE_KEY,
    ...(nowMs === undefined ? {} : { nowMs }),
    cryptoImpl,
  });
  const installationToken = await createInstallationAccessToken({
    fetchImpl,
    appJwt,
    installationId: env.GITHUB_APP_INSTALLATION_ID,
  });

  await dispatchNHCWorkflow({
    fetchImpl,
    repository: env.GITHUB_REPOSITORY,
    workflowFile: env.GITHUB_WORKFLOW_FILE,
    ref: env.GITHUB_REF,
    token: installationToken,
    targetRelease,
  });

  console.log(JSON.stringify({
    event: "nhc_workflow_dispatched",
    targetRelease,
    scheduledTime: new Date(event.scheduledTime).toISOString(),
  }));
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduledDispatch(event, env));
  },

  async fetch(_request, env) {
    return Response.json({
      service: "mycruisingweather-nhc-release-window-dispatcher",
      configured: Boolean(
        env.GITHUB_REPOSITORY
          && env.GITHUB_WORKFLOW_FILE
          && env.GITHUB_REF
          && env.GITHUB_APP_ID
          && env.GITHUB_APP_INSTALLATION_ID
          && env.GITHUB_APP_PRIVATE_KEY,
      ),
      schedule: "04,12 minutes after 03Z,09Z,15Z,21Z only",
    });
  },
};
