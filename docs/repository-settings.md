# Public repository settings

Code cannot enforce every GitHub control. Before changing repository visibility,
an administrator should review this checklist.

- Enable private vulnerability reporting and display `SECURITY.md`.
- Enable Dependabot alerts, dependency graph, and grouped version updates.
- Enable secret scanning, push protection, and validity checks where available.
- Require pull requests for `main`, at least one approval, conversation
  resolution, and the verification and CodeQL status checks.
- Prevent force pushes and branch deletion on `main`.
- Enable Discussions if `SUPPORT.md` should direct users there.
- Add a repository description, `sharpts.dev` homepage, topics, social preview,
  and the MIT license classification.
- Review Actions permissions. Workflows should receive read-only contents by
  default and add narrowly scoped write permissions per job.

Official GitHub actions use maintained major-version tags and are watched by
Dependabot. New third-party actions must be pinned to a full commit SHA; their
source and permissions must be reviewed before use. Docker base tags are
version-scoped, monitored by Dependabot, and should be rebuilt regularly for
security updates.
