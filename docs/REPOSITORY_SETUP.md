# One-time GitHub repository setup

The working tree is prepared for Git but intentionally does not initialise or publish a repository automatically.

## Create the repository

Create an empty public repository on GitHub without adding a README, licence, or `.gitignore`; those files already exist here. A concise description is:

> An explainable, offline-first visual studio for learning and planning IPv4 subnets.

Suggested topics:

`cidr`, `ipv4`, `networking`, `subnet-calculator`, `subnetting`, `typescript`, `visualisation`, `vlsm`

Set the website field to `https://thomaswilcox.com/subnetvisualiser/`.

## Initialise and push

Replace `<owner>` and `<repository>` with the final GitHub names:

```sh
git init
git branch -M main
git add .
git commit -m "Initial open-source release"
git remote add origin https://github.com/<owner>/<repository>.git
git push -u origin main
```

Review `git status` and the staged diff before the first commit. In particular, ensure local test output, editor settings, and credentials are absent.

## Repository settings

After the first push:

- enable private vulnerability reporting under Security settings;
- enable Discussions if community questions should be separated from bug reports;
- protect `main` and require the **Quality / Type-check, unit tests, and build** check;
- optionally require the browser matrix once its first run establishes acceptable duration;
- enable automatic deletion of merged branches;
- disable unused package or wiki features if they will not be maintained;
- confirm Actions has read-only default permissions;
- add a social preview using the committed `social-preview.png`;
- create labels such as `bug`, `cidr-correctness`, `accessibility`, `documentation`, `education`, `good first issue`, and `security`.

The workflow files deliberately use least-privilege permissions. Only the tag-triggered release workflow requests `contents: write`.

## Final README links

The README avoids repository-specific badges and URLs so it is valid before creation. Once the final repository URL exists, optional CI and release badges can be added using that exact owner/repository path.
