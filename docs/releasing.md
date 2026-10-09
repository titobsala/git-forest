# Releasing

Releases are built by [`.github/workflows/release.yml`](../.github/workflows/release.yml) when a version tag is pushed. The workflow never publishes on its own: it opens a **draft** GitHub Release for review.

## Version

The version lives in one place: `version` in [`apps/desktop/src-tauri/Cargo.toml`](../apps/desktop/src-tauri/Cargo.toml). Tauri reads it for the bundles, and the app reports it through `get_app_info`. The `package.json` files intentionally have no version.

## Cutting a release

1. Bump `version` in `apps/desktop/src-tauri/Cargo.toml`, for example `0.2.0`.
2. Refresh the lockfile:

   ```bash
   cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
   ```

3. Commit both files and merge to `main` as usual.
4. Tag the merged commit and push the tag:

   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

5. The **Release** workflow then:
   - runs the full CI checks against the tag;
   - fails if the tag does not match the `Cargo.toml` version, or if `Cargo.lock` is stale;
   - builds on Ubuntu 22.04 so the packages run on older glibc systems;
   - creates a draft release with the AppImage, `.deb`, `.rpm`, `SHA256SUMS.txt`, and notes generated from merged pull requests.
6. Open the draft on GitHub, edit the notes if needed, and publish it.

## Rebuilding a tag

To rebuild assets for an existing tag, open **Actions → Release → Run workflow** and select the tag under "Use workflow from". Assets on an existing release are replaced.

## Artifacts

| File                                   | For                                  |
| -------------------------------------- | ------------------------------------ |
| `git-forest_<version>_amd64.AppImage`  | Any x86_64 Linux distribution        |
| `git-forest_<version>_amd64.deb`       | Debian, Ubuntu, and derivatives      |
| `git-forest-<version>-1.x86_64.rpm`    | Fedora, openSUSE, and derivatives    |
| `SHA256SUMS.txt`                       | Checksums for all of the above       |

The `.deb` and `.rpm` declare `git` as a dependency. Warp is optional at install time but required to open worktrees and launch agents.

## Building packages locally

`bun run build` produces the same bundles under `apps/desktop/src-tauri/target/release/bundle/`. On Arch-based distributions the AppImage step can fail with `failed to run linuxdeploy`, because linuxdeploy's bundled `strip` does not understand newer system libraries. Skip stripping for local builds:

```bash
NO_STRIP=true bun run build
```

CI builds on Ubuntu 22.04 and does not need this.
