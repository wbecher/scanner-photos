# Agent Guidelines & Workflow Rules

## Git Branching Strategy for Specs & Features
- **Always Use Dedicated Branches**: Whenever proposing or implementing a new OpenSpec change (`openspec-propose`, `openspec-apply-change`, `/opsx-propose`, `/opsx-apply`), always work on a dedicated branch named `feat/<change-name>` (or `fix/<change-name>` for fixes).
- **No Direct Changes on `main` / `master`**: Never write code or create spec changes directly on `main` or `master`.
- **Pre-execution Check**:
  1. Check current branch: `git branch --show-current`.
  2. If on `main` or `master`, check if `feat/<change-name>` exists; switch to it or create it (`git checkout -b feat/<change-name>`).
  3. Proceed with the spec and implementation tasks only on the feature branch.
