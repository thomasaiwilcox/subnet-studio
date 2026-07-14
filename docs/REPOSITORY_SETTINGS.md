# Repository settings

The public repository is [thomasaiwilcox/subnet-studio](https://github.com/thomasaiwilcox/subnet-studio). This document records recommended maintainer settings that are not stored in the working tree.

## GitHub configuration

- Keep `main` as the default branch.
- Protect `main` and require the **Type-check, unit tests, and build** status check.
- Optionally require the browser matrix once its first complete run establishes acceptable duration.
- Enable private vulnerability reporting under Security settings.
- Enable automatic deletion of merged branches.
- Keep Actions' default token permissions read-only.
- Add `social-preview.png` as the repository social preview.
- Enable Discussions if community questions should be separated from bug reports.
- Disable the package or wiki features if they will not be maintained.

Suggested labels include `bug`, `cidr-correctness`, `accessibility`, `documentation`, `education`, `good first issue`, and `security`.

The repository workflows use least-privilege permissions. Only the tag-triggered release workflow requests `contents: write` so that it can attach the standalone application to a GitHub release.

## Repository profile

Description:

> An explainable, offline-first visual studio for learning and planning IPv4 subnets.

Website:

`https://thomaswilcox.com/subnetvisualiser/`

Topics:

`cidr`, `ipv4`, `networking`, `subnet-calculator`, `subnetting`, `typescript`, `visualisation`, `vlsm`
