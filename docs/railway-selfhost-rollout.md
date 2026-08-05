# Railway self-host rollout

Pushing the shipping commit to `origin/main` is the production rollout. Railway
builds and deploys that branch, retains the last known good build when a new build
fails, and provides a manual rollback for a deployment that fails after startup.
This low-traffic site does not use a separate canary service or deliberately OOM
the production service.

The repository-owned deployment settings are in `railway.json`. Railway still
requires the following service settings because they are environment-specific or
are not represented by deployment config-as-code:

- check out `lib/SharpTS` recursively at the recorded gitlink before the Docker
  build; `Dockerfile.selfhost` fails closed if the pinned source is absent
- use the Railway-provided `PORT`; the image binds `0.0.0.0:$PORT`
- set `SHARPTS_WWW_PUBLIC_ORIGIN=https://sharpts.dev`
- set `SHARPTS_WWW_TRUST_RAILWAY_PROXY=true` only while Railway public
  networking is the sole ingress path
- set a 1 GiB memory limit and retain one replica for the initial rollout
- do not add application secrets to the container; the worker environment is
  cleared, but the host should remain secret-free

Before pushing `origin/main`:

1. Run the local build, browser checks, and Linux container suite from the exact
   SharpTS gitlink recorded by the shipping commit.
2. Confirm `railway.json` selects `Dockerfile.selfhost`, `/health`, and a
   twelve-second drain window.
3. Confirm the production origin, trusted-proxy policy, one-replica topology,
   memory limit, and rollback target in Railway.

Immediately after Railway deploys the commit:

1. Confirm the GitHub Linux container workflow passed on the shipping commit.
2. Verify `/health`, `/alive`, every localized route, and both playground modes
   through the public HTTPS origin.
3. Verify request logs contain the trusted client address and request ID without
   submitted source.
4. Run a short production-shaped load probe: static requests plus three active
   executions and excess requests receiving bounded HTTP 503 responses.
5. Verify the public HTTP-to-HTTPS redirect and HSTS policy.
6. Observe worker failures, memory, latency, and restarts. Roll back manually if
   runtime behavior is unacceptable.
7. Configure an external continuous check of `/health`; Railway's deployment
   health check is not a continuous uptime monitor.

After a stable observation window, remove the retired Railway web and API
services. Retain the previous successful deployment as the rollback target until
the new host's request logs and failure behavior are acceptable.

Railway does not currently expose a documented deny-all outbound policy in its
ordinary service settings. The initial rollout therefore accepts the worker's
application-level blocked proxy plus module-import rejection as the egress
boundary. If OS-enforced egress isolation becomes mandatory, move execution to
a sandbox that provides it rather than broadening this host.
