# Railway self-host rollout

The repository-owned deployment settings are in `railway.json`. Railway still
requires the following service settings because they are environment-specific or
are not represented by deployment config-as-code:

- deploy one canary service from the intended shipping commit
- check out `lib/SharpTS` recursively at the recorded gitlink before the Docker
  build; `Dockerfile.selfhost` fails closed if the pinned source is absent
- use the Railway-provided `PORT`; the image binds `0.0.0.0:$PORT`
- set `SHARPTS_WWW_PUBLIC_ORIGIN=https://sharpts.dev`
- set `SHARPTS_WWW_TRUST_RAILWAY_PROXY=true` only while Railway public
  networking is the sole ingress path
- set a 1 GiB memory limit and retain one replica for the initial rollout
- do not add application secrets to the container; the worker environment is
  cleared, but the host should remain secret-free

Before cutover:

1. Confirm the GitHub Linux container workflow passed on the shipping commit.
2. Verify `/health`, `/alive`, every localized route, and both playground modes
   through the canary's public HTTPS origin.
3. Verify request logs contain the trusted client address and request ID without
   submitted source.
4. Run a short production-shaped load probe: static requests plus three active
   executions and excess requests receiving bounded HTTP 503 responses.
5. Deliberately exceed the canary's hard memory limit once. Confirm Railway
   restarts it and `/health` recovers; do not run this destructive probe against
   the active production service or in recurring CI.
6. Send SIGTERM during active work and confirm the deployment exits within the
   configured twelve-second drain window.
7. Verify the public HTTP-to-HTTPS redirect, HSTS policy, and rollback action.
8. Configure an external continuous check of `/health`; Railway's deployment
   health check is not a continuous uptime monitor.

After a stable observation window, move the custom domain to the self-host
service. Retain the previous deployment for rollback until request logs, worker
failure behavior, memory, and latency are acceptable, then remove the retired
Railway web and API services.

Railway does not currently expose a documented deny-all outbound policy in its
ordinary service settings. The initial rollout therefore accepts the worker's
application-level blocked proxy plus module-import rejection as the egress
boundary. If OS-enforced egress isolation becomes mandatory, move execution to
a sandbox that provides it rather than broadening this host.
