# Rule: Git workflow

- Platform: GitHub (remote to be added; repo slug TBD - update here when created).
  Terminology: PR. CLI: `gh` (authenticate with `gh auth login`).
- Commit identity (MANDATORY): **nguyenhx2** `<nguyenhx1@gmail.com>` - verify
  `git config user.name` / `git config user.email` before every commit (this repo carries a
  local config; the global config uses a different work identity - do not let it leak in).
- Never commit directly to `main` (hook-enforced). One branch per task:
  `feat/<slug>`, `fix/<slug>`, `chore/<slug>`, `docs/<slug>`.
- Open a PR for review (after `/review-pr` has been run); no self-merge; the PR description
  carries what/why + FR/TASK references + test evidence.
- CI: `.github/workflows/ci.yml` runs lint + unit + build on every PR (e2e when
  tauri-driver is wired). Secrets live in GitHub Actions secrets; agents never edit CI to
  skip checks; a red pipeline blocks merge.
- Releases only via the gated release flow after PR approval (devops agent); signing keys
  are CI-only secrets.
