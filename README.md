# Prisma engines for servers that cannot reach binaries.prisma.sh

This branch only carries Prisma's own engine files, unchanged, for MoboCom servers on networks where
`binaries.prisma.sh` is blocked but `github.com` is not. `deploy/ubuntu/prisma-engines.sh` on `main` fetches the folder
named after the engine version in `package-lock.json` (`@prisma/engines-version`), checks every file against the SHA-256
values pinned in `deploy/ubuntu/prisma-engines.txt`, and places them in the service user's Prisma cache, where Prisma takes
them without a download.

| Folder | Prisma | Files |
| --- | --- | --- |
| `605197351a3c8bdd595af2d2a9bc3025bca48ea2` | 5.22.0 | `libquery-engine.gz`, `schema-engine.gz`: the `debian-openssl-3.0.x` downloads of `binaries.prisma.sh/all_commits/<folder>/`. Prisma's published SHA-256 of the unpacked files is the same for `debian-openssl-3.0.x` and `rhel-openssl-3.0.x`, so these serve Ubuntu, Debian and AlmaLinux. |

When `package.json` moves to another Prisma version, add its folder here and its hashes to `deploy/ubuntu/prisma-engines.txt`
in the same release. Prisma's engines are licensed Apache-2.0 (https://github.com/prisma/prisma-engines).
