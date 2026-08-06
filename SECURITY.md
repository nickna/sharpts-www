# Security policy

## Report a vulnerability privately

Please do not open a public issue for a suspected vulnerability. Use
[GitHub private vulnerability reporting](https://github.com/nickna/sharpts-www/security/advisories/new)
and include the affected revision, reproduction steps, impact, and any suggested
mitigation. If private reporting is temporarily unavailable, contact the
repository owner through the contact method on their GitHub profile and ask for
a private security channel without disclosing the details.

You should receive an acknowledgement within seven days. Confirmed issues will
be coordinated privately until a fix and disclosure plan are ready. No bounty or
specific resolution timeline is promised.

## Supported versions

The deployed website and the default branch are supported. Older commits,
forks, and locally modified deployments are not maintained security releases.

## Playground threat model

The playground accepts hostile TypeScript by design. The public HTTP process
never evaluates it directly. Accepted work enters a bounded queue and runs in a
fresh worker process with time, output, concurrency, and Linux RSS limits. The
container blocks outbound worker networking and runs as a non-root user.

These controls are defense in depth, not a general-purpose sandbox guarantee.
Operators should deploy the supplied Linux container behind TLS, keep its
runtime patched, avoid mounting secrets or privileged sockets, and preserve the
worker process and network boundaries. A change that weakens isolation,
origin/proxy validation, request limits, or fail-closed behavior is
security-sensitive and must pass the container isolation suite.

The repository must never contain production credentials. Rotate any credential
immediately if it is committed, even if the commit is later removed.
