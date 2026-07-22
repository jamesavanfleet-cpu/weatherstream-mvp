import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";

import {
  createGitHubAppJwt,
  createInstallationAccessToken,
  dispatchNHCWorkflow,
  releaseAnchorForScheduledTime,
  runScheduledDispatch,
} from "../src/index.js";

async function makePrivateKeyPem() {
  const keyPair = await webcrypto.subtle.generateKey(
    {
      hash: "SHA-256",
      modulusLength: 2048,
      name: "RSASSA-PKCS1-v1_5",
      publicExponent: new Uint8Array([1, 0, 1]),
    },
    true,
    ["sign", "verify"],
  );
  const pkcs8 = await webcrypto.subtle.exportKey("pkcs8", keyPair.privateKey);
  const body = Buffer.from(pkcs8).toString("base64").match(/.{1,64}/gu).join("\n");
  return `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----\n`;
}

function decodeJwtPayload(jwt) {
  const payload = jwt.split(".")[1]
    .replaceAll("-", "+")
    .replaceAll("_", "/");
  return JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
}

test("maps both narrow post-release checks to the same nominal NHC anchor", () => {
  assert.equal(
    releaseAnchorForScheduledTime(Date.parse("2026-07-22T09:04:00Z")),
    "2026-07-22T09:00:00Z",
  );
  assert.equal(
    releaseAnchorForScheduledTime(Date.parse("2026-07-22T09:12:00Z")),
    "2026-07-22T09:00:00Z",
  );
  assert.equal(
    releaseAnchorForScheduledTime(Date.parse("2026-07-22T03:04:00Z")),
    "2026-07-22T03:00:00Z",
  );
});

test("refuses unexpected hours rather than dispatching a wrong release", () => {
  assert.throws(
    () => releaseAnchorForScheduledTime(Date.parse("2026-07-22T10:04:00Z")),
    /Unexpected NHC dispatcher hour/,
  );
});

test("creates a nine-minute signed GitHub App JWT without persisting an access token", async () => {
  const jwt = await createGitHubAppJwt({
    appId: "4366532",
    cryptoImpl: webcrypto,
    nowMs: Date.parse("2026-07-22T10:00:00Z"),
    privateKeyPem: await makePrivateKeyPem(),
  });

  const parts = jwt.split(".");
  assert.equal(parts.length, 3);
  assert.ok(parts.every(Boolean));
  const payload = decodeJwtPayload(jwt);
  assert.equal(payload.iss, "4366532");
  assert.equal(payload.exp - payload.iat, 540);
  assert.equal(payload.iat, Math.floor(Date.parse("2026-07-22T10:00:00Z") / 1000) - 60);
});

test("refuses to create a GitHub App JWT when the private key is missing", async () => {
  await assert.rejects(
    createGitHubAppJwt({
      appId: "4366532",
      cryptoImpl: webcrypto,
      privateKeyPem: "",
    }),
    /authentication configuration is incomplete/,
  );
});

test("exchanges the signed App JWT for one short-lived installation token", async () => {
  let request;
  const token = await createInstallationAccessToken({
    appJwt: "signed-app-jwt",
    fetchImpl: async (url, init) => {
      request = { init, url };
      return Response.json({ token: "ephemeral-installation-token" }, { status: 201 });
    },
    installationId: "12345678",
  });

  assert.equal(token, "ephemeral-installation-token");
  assert.equal(
    request.url,
    "https://api.github.com/app/installations/12345678/access_tokens",
  );
  assert.equal(request.init.method, "POST");
  assert.equal(request.init.headers.Authorization, "Bearer signed-app-jwt");
});

test("surfaces installation-token failures instead of dispatching without authorization", async () => {
  await assert.rejects(
    createInstallationAccessToken({
      appJwt: "signed-app-jwt",
      fetchImpl: async () => new Response("bad credentials", { status: 401 }),
      installationId: "12345678",
    }),
    /GitHub installation token request failed \(401\): bad credentials/,
  );
});

test("dispatches the existing workflow with only the intended target release", async () => {
  let request;
  await dispatchNHCWorkflow({
    fetchImpl: async (url, init) => {
      request = { init, url };
      return new Response(null, { status: 204 });
    },
    repository: "jamesavanfleet-cpu/weatherstream-mvp",
    workflowFile: "nhc-tracker.yml",
    ref: "main",
    token: "ephemeral-installation-token",
    targetRelease: "2026-07-22T09:00:00Z",
  });

  assert.equal(
    request.url,
    "https://api.github.com/repos/jamesavanfleet-cpu/weatherstream-mvp/actions/workflows/nhc-tracker.yml/dispatches",
  );
  assert.equal(request.init.method, "POST");
  assert.equal(request.init.headers.Authorization, "Bearer ephemeral-installation-token");
  assert.deepEqual(JSON.parse(request.init.body), {
    ref: "main",
    inputs: { target_release: "2026-07-22T09:00:00Z" },
  });
});

test("surfaces a failed GitHub dispatch instead of claiming success", async () => {
  await assert.rejects(
    dispatchNHCWorkflow({
      fetchImpl: async () => new Response("forbidden", { status: 403 }),
      repository: "jamesavanfleet-cpu/weatherstream-mvp",
      workflowFile: "nhc-tracker.yml",
      ref: "main",
      token: "ephemeral-installation-token",
      targetRelease: "2026-07-22T09:00:00Z",
    }),
    /GitHub workflow dispatch failed \(403\): forbidden/,
  );
});

test("runs the exact two-call GitHub App flow before dispatching one target release", async () => {
  const requests = [];
  const privateKeyPem = await makePrivateKeyPem();

  await runScheduledDispatch(
    { scheduledTime: Date.parse("2026-07-22T09:04:00Z") },
    {
      GITHUB_APP_ID: "4366532",
      GITHUB_APP_INSTALLATION_ID: "12345678",
      GITHUB_APP_PRIVATE_KEY: privateKeyPem,
      GITHUB_REF: "main",
      GITHUB_REPOSITORY: "jamesavanfleet-cpu/weatherstream-mvp",
      GITHUB_WORKFLOW_FILE: "nhc-tracker.yml",
    },
    {
      cryptoImpl: webcrypto,
      fetchImpl: async (url, init) => {
        requests.push({ init, url });
        if (url.endsWith("/access_tokens")) {
          return Response.json({ token: "ephemeral-installation-token" }, { status: 201 });
        }
        return new Response(null, { status: 204 });
      },
      nowMs: Date.parse("2026-07-22T09:04:00Z"),
    },
  );

  assert.equal(requests.length, 2);
  assert.equal(
    requests[0].url,
    "https://api.github.com/app/installations/12345678/access_tokens",
  );
  assert.match(requests[0].init.headers.Authorization, /^Bearer eyJ/);
  assert.equal(
    requests[1].url,
    "https://api.github.com/repos/jamesavanfleet-cpu/weatherstream-mvp/actions/workflows/nhc-tracker.yml/dispatches",
  );
  assert.equal(requests[1].init.headers.Authorization, "Bearer ephemeral-installation-token");
  assert.deepEqual(JSON.parse(requests[1].init.body), {
    ref: "main",
    inputs: { target_release: "2026-07-22T09:00:00Z" },
  });
});
