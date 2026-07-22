# My Cruising Weather NHC Release-Window Dispatcher

This Worker runs **only eight scheduled checks per day**: at minutes `04` and `12` after the 03Z, 09Z, 15Z, and 21Z NHC advisory cycles. It does not poll continuously, download model files, or generate guidance. Each check creates a short-lived GitHub App installation token, starts the existing `nhc-tracker.yml` workflow for the intended NHC cycle, and discards the token.

## Required GitHub App scope

The installed GitHub App must be restricted to `jamesavanfleet-cpu/weatherstream-mvp` only. It needs exactly these repository permissions:

| Permission | Access | Reason |
|---|---:|---|
| Actions | Read and write | Dispatches the existing NHC workflow and permits workflow-run verification. |
| Contents | Read and write | Allows the App to publish the already verified workflow and code change. |
| Workflows | Read and write | Allows the App to update the `nhc-tracker.yml` safety gate. |
| Metadata | Read-only | Required automatically by GitHub. |

No personal access token is used or accepted by the Worker.

## Required Worker secrets

Before deploying the Worker, add these values as Worker secrets. Do not place any of them in `wrangler.jsonc`, source code, Git, screenshots, or chat.

| Secret | Source | Sensitivity |
|---|---|---|
| `GITHUB_APP_ID` | GitHub App settings page | Low, stored as a secret to keep all App configuration together. |
| `GITHUB_APP_INSTALLATION_ID` | The repository-specific App installation URL after the App is installed | Low, stored as a secret to keep all App configuration together. |
| `GITHUB_APP_PRIVATE_KEY` | The `.pem` file generated once from GitHub App settings | High, must remain a Worker secret. |

Use the following commands only from this directory after the App has been installed and the private key has been generated locally:

```sh
npx wrangler secret put GITHUB_APP_ID
npx wrangler secret put GITHUB_APP_INSTALLATION_ID
npx wrangler secret put GITHUB_APP_PRIVATE_KEY
```

The private key is used only to mint a GitHub App JSON Web Token valid for nine minutes. GitHub then exchanges it for an installation access token that is valid for at most one hour. The Worker requests a fresh installation token for each of the eight scheduled checks and never stores one.

## Validation and deployment sequence

1. Run `node --test test/index.test.mjs`.
2. Run `npx wrangler deploy --dry-run`.
3. Install the App on `weatherstream-mvp` only and collect the installation ID.
4. Add the three secrets with `wrangler secret put`.
5. Deploy the Worker through the reviewed release path.
6. Invoke one controlled workflow dispatch, verify the source gate and artifact result, then confirm the live site behavior.

Do not enable or deploy this Worker until the corresponding repository workflow and client changes have passed their local and remote verification steps.
