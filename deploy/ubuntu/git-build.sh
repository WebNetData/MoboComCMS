#!/usr/bin/env bash
# Functions loaded before checkout replaces the updater. Build/dependencies never touch the running site, and the
# running checkout moves to the new commit only after the candidate built (git_build_switch), so a failed npm ci or
# build (ENOSPC, heap) leaves code, build and dependencies exactly as they were.
# Each private directory records its state in `status` (building → adopted → healthy | rolled-back, or failed) for
# deploy/ubuntu/update-space.cjs, which owns disk checks and retention.
git_build_preflight() {
  local artifact
  GIT_BUILD_APP="$(pwd -P)"
  GIT_BUILD_STAGE=''
  [ -s "$GIT_BUILD_APP/.next/BUILD_ID" ] && [ -d "$GIT_BUILD_APP/node_modules" ] || {
    echo '[update] current production build is missing; repair it before updating' >&2; return 1;
  }
  for artifact in .next node_modules; do
    [ ! -L "$GIT_BUILD_APP/$artifact" ] || { echo '[update] linked build directories require operator adoption' >&2; return 1; }
  done
  [ -w "$(dirname "$GIT_BUILD_APP")" ] || { echo '[update] app parent must allow a private sibling build directory' >&2; return 1; }
  if [ -z "${UPDATE_STOP:-}" ] && ! sudo -n -l /usr/bin/systemctl stop mobocom >/dev/null 2>&1; then
    echo '[update] stop permission missing; operator must run the trusted deploy/ubuntu/updater-install.sh' >&2; return 1
  fi
}

# Best effort: a state that cannot be written (full disk) never changes the outcome; retention then protects by contents.
git_build_mark() { [ -z "${GIT_BUILD_STAGE:-}" ] || printf '%s\n' "$1" 2>/dev/null > "$GIT_BUILD_STAGE/status" || true; }

# Exports the target commit (default HEAD) into the private directory without checking it out.
git_build_prepare() {
  GIT_BUILD_TARGET="$(git rev-parse --verify "${1:-HEAD}^{commit}")" || return 1
  GIT_BUILD_STAGE="$(mktemp -d "$(dirname "$GIT_BUILD_APP")/.mobocom-build.XXXXXXXX")" || return 1
  mkdir "$GIT_BUILD_STAGE/source" "$GIT_BUILD_STAGE/before" "$GIT_BUILD_STAGE/failed" || return 1
  printf '%s\n' "$PREV" > "$GIT_BUILD_STAGE/previous-commit"
  printf '%s\n' "$GIT_BUILD_TARGET" > "$GIT_BUILD_STAGE/target-commit"
  git_build_mark building
  echo "[update] isolated build and recovery directory: $GIT_BUILD_STAGE"
  git archive --format=tar "$GIT_BUILD_TARGET" | tar -xf - -C "$GIT_BUILD_STAGE/source"
}

git_build_validate() {
  local artifact
  [ -s "$GIT_BUILD_STAGE/source/.next/BUILD_ID" ] || { echo '[update] candidate BUILD_ID is missing' >&2; return 1; }
  for artifact in .next node_modules; do
    [ -d "$GIT_BUILD_STAGE/source/$artifact" ] && [ ! -L "$GIT_BUILD_STAGE/source/$artifact" ] || return 1
  done
}

# The running checkout moves to the built commit only now. A branch, when given, is fast-forwarded to it.
git_build_switch() {
  [ "$(git rev-parse HEAD)" = "$PREV" ] && [ -z "$(git status --porcelain --untracked-files=normal)" ] || {
    echo '[update] local work appeared during the isolated build; preserved' >&2; return 1;
  }
  GIT_BUILD_SWITCHED=1
  if [ -n "${1:-}" ]; then git checkout --quiet "$1" && git merge --ff-only --quiet "$GIT_BUILD_TARGET"
  else git checkout --quiet --detach "$GIT_BUILD_TARGET"; fi
}

# A candidate that never reached the running site is removed at once: it holds no previous build (update-space.cjs
# refuses otherwise), and on a nearly full disk its partial node_modules is what stops the next attempt.
git_build_discard() {
  [ -n "${GIT_BUILD_STAGE:-}" ] && [ -d "$GIT_BUILD_STAGE" ] || return 0
  git_build_mark failed
  node "$GIT_BUILD_APP/deploy/ubuntu/update-space.cjs" discard "$GIT_BUILD_APP" "$(basename "$GIT_BUILD_STAGE")" --own-lock >/dev/null
}

git_build_adopt() {
  local artifact
  [ "$(git rev-parse HEAD)" = "$GIT_BUILD_TARGET" ] && [ -z "$(git status --porcelain --untracked-files=normal)" ] || {
    echo '[update] local work appeared during the isolated build; preserved' >&2; return 1;
  }
  git_build_validate || return 1
  bash -c "${UPDATE_STOP:-sudo -n systemctl stop mobocom}" || return 1
  git_build_mark adopted
  # Both directories are on the app's filesystem. Keep every previous/failed byte for recovery.
  for artifact in .next node_modules; do
    mv -- "$GIT_BUILD_APP/$artifact" "$GIT_BUILD_STAGE/before/$artifact" || return 1
    mv -- "$GIT_BUILD_STAGE/source/$artifact" "$GIT_BUILD_APP/$artifact" || return 1
  done
}

git_build_restore() {
  local artifact
  [ -n "${GIT_BUILD_STAGE:-}" ] || return 0
  if [ ! -e "$GIT_BUILD_STAGE/before/.next" ] && [ ! -e "$GIT_BUILD_STAGE/before/node_modules" ]; then return 0; fi
  bash -c "${UPDATE_STOP:-sudo -n systemctl stop mobocom}" || return 1
  for artifact in .next node_modules; do
    if [ -e "$GIT_BUILD_STAGE/before/$artifact" ]; then
      if [ -e "$GIT_BUILD_APP/$artifact" ] || [ -L "$GIT_BUILD_APP/$artifact" ]; then
        mv -- "$GIT_BUILD_APP/$artifact" "$GIT_BUILD_STAGE/failed/$artifact" || return 1
      fi
      mv -- "$GIT_BUILD_STAGE/before/$artifact" "$GIT_BUILD_APP/$artifact" || return 1
    fi
  done
  git_build_mark rolled-back
  echo '[update] restored previous compiled build and dependencies; no rebuild needed'
}
