# Configuration reference

The compiled host validates configuration at startup and fails closed on an
invalid value. Byte and millisecond limits are decimal environment-variable
strings. Relative filesystem paths resolve from the process working directory.

## HTTP host

| Variable | Default | Purpose |
| --- | ---: | --- |
| `PORT` | `8080` | Listener port, from 1 through 65535. |
| `SHARPTS_WWW_HOST` | `0.0.0.0` | Listener address. |
| `SHARPTS_WWW_PUBLIC_ORIGIN` | request host | Exact HTTP(S) origin allowed to call `/api/run`; production deployments should set it explicitly. |
| `SHARPTS_WWW_CONTENT_ROOT` | `./public` | Generated static-site root. |
| `SHARPTS_WWW_MAX_BODY_BYTES` | `65536` | Maximum JSON request body. |
| `SHARPTS_WWW_BODY_TIMEOUT_MS` | `15000` | Maximum time to receive a request body. |
| `SHARPTS_WWW_PROBE_INTERVAL_MS` | `500` | Interval for detecting a disconnected execution client. |
| `SHARPTS_WWW_MAX_RATE_IDENTITIES` | `4096` | LRU bound for tracked rate-limit identities. |
| `SHARPTS_WWW_EXECUTIONS_PER_MINUTE` | `10` | Per-identity sliding-window execution limit. |
| `SHARPTS_WWW_SHUTDOWN_CUTOFF_MS` | `8000` | Forced worker termination deadline during drain. |

## Proxy trust

| Variable | Default | Purpose |
| --- | ---: | --- |
| `SHARPTS_WWW_TRUSTED_PROXY_ADDRESSES` | empty | Comma-separated direct peer IPs allowed to supply `X-Real-IP`. |
| `SHARPTS_WWW_TRUST_RAILWAY_PROXY` | `false` | Trust forwarding headers only when the direct peer is loopback or private-network addressed. |

Forwarded identity headers are ignored unless the direct peer passes one of
these policies. Prefer the explicit address list where proxy addresses are
stable. Never enable forwarding trust merely because clients can reach the host
through an untrusted network.

## Worker supervisor

| Variable | Default | Purpose |
| --- | ---: | --- |
| `SHARPTS_WWW_WORKER_PATH` | platform worker under `./worker` | Isolated worker executable. |
| `SHARPTS_WWW_REQUIRE_RSS_MONITORING` | `true` | Refuse readiness unless Linux `/proc` RSS monitoring works. Local Windows/macOS development sets this to `false`. |
| `SHARPTS_WWW_MAX_SOURCE_BYTES` | `10240` | Maximum UTF-8 source size. |
| `SHARPTS_WWW_MAX_WORKER_RSS_BYTES` | `157286400` | Worker resident-memory ceiling. |
| `SHARPTS_WWW_MAX_WORKER_OUTPUT_BYTES` | `262144` | Combined worker stdout/stderr ceiling. |
| `SHARPTS_WWW_MEMORY_POLL_MS` | `500` | Linux RSS polling interval. |
| `SHARPTS_WWW_WORKER_TIMEOUT_BUFFER_MS` | `1000` | Supervisor grace beyond the requested execution timeout. |
| `SHARPTS_WWW_MAX_CONCURRENT_WORKERS` | `3` | Maximum running worker processes. |
| `SHARPTS_WWW_MAX_QUEUED_EXECUTIONS` | `24` | Maximum waiting executions; excess work is rejected immediately. |
| `SHARPTS_WWW_QUEUE_WAIT_MS` | `2000` | Maximum queue wait before rejection. |

## Build-only variables

The cross-platform build orchestrator sets these internally. They are useful
when invoking one build stage directly.

| Variable | Purpose |
| --- | --- |
| `SHARPTS_WWW_BROWSER_OUTPUT` | Browser asset output/input directory. |
| `SHARPTS_WWW_SITE_REPO_ROOT` | Repository root used by the static generator. |
| `SHARPTS_WWW_SITE_OUTPUT` | Generated site destination. |
| `SHARPTS_WWW_PUBLIC_ROOT` | Generated-site root read by the snapshot updater. |
| `SHARPTS_WWW_E2E_PORT` | Port reserved for Playwright's compiled test host. |

`sharpts-source.env` is not runtime configuration. It is the reviewed, immutable
SharpTS version and commit used by local builds, CI, feature-claim validation,
and Docker build arguments.
