# Xray-core for servers that cannot download GitHub release files

This branch only carries Xray-core's own release archives, unchanged, for MoboCom servers on networks where GitHub release
downloads (release-assets.githubusercontent.com) are blocked but `github.com` is not. MoboCom runs Xray as a local proxy,
listening on 127.0.0.1 only, so the site can reach Telegram and Instagram through an outbound connection the owner sets
in the Server Panel.

`deploy/ubuntu/xray-install.sh` on `main` takes the archive of the server's architecture from the official release when it
can, otherwise from the folder below, checks it against the SHA-256 pinned in `deploy/ubuntu/xray-core.txt` (Xray's own
`.dgst` value, kept here beside each archive), and installs only the `xray` binary.

| Folder | Release | Files |
| --- | --- | --- |
| `v26.10.31` | https://github.com/XTLS/Xray-core/releases/tag/v26.10.31 | `Xray-linux-64.zip`, `Xray-linux-arm64-v8a.zip` and their `.dgst` |

When `deploy/ubuntu/xray-core.txt` moves to another release, add its folder here in the same change.
Xray-core is licensed MPL-2.0 (https://github.com/XTLS/Xray-core).
