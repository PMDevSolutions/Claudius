# Release Automation + CDN Auto-Update Design

**Date:** 2026-05-26
**Status:** Approved, in implementation

## Problem

The v1.1.0 release surfaced two gaps:

1. **Manual, drift-prone versioning.** Versions are bumped by hand
   (`pnpm release` / `standard-version`). The result drifted: root
   `package.json` sat at `0.5.0` while `widget`/`worker` were `0.1.0` and the
   git tags were `v1.0.0`/`v1.1.0`. The CHANGELOG was also hand-edited.
2. **No update path for embedding sites.** Each site self-hosts a pinned copy
   of `claudius.iife.js`; upgrading means hand-copying files, and there's no
   way to tell which version a site is running.

## Decisions

- **Versioning:** `release-please` (release-PR model). Chosen over a CI bypass
  token so CI never writes to protected `main` directly — a human merges the
  release PR.
- **Auto-update:** version-channel-pinned CDN via jsDelivr, served from
  committed artifacts at git tags (`gh@1`). Chosen over npm (no public package
  / token needed) and over an always-`latest` channel (a `v2` must not land on
  a live site silently).

## Part 1 — Auto-version (release-please)

- `release-please-config.json` + `.release-please-manifest.json` (seeded at
  `1.1.0`, matching the latest tag). `include-component-in-tag: false` keeps the
  tag format `vX.Y.Z`.
- On every push to `main`, release-please maintains a "release vX.Y.Z" PR from
  conventional commits. Merging it creates the tag + GitHub Release.
- `extra-files` syncs `widget/package.json` and `worker/package.json` versions
  to the root version, ending the sprawl.
- The legacy `standard-version` setup (`.versionrc.json`, `release*` scripts) is
  superseded and can be removed in a follow-up once release-please is confirmed.

**Branch-protection note:** release-please only pushes to its own PR branch and
creates tags/releases (allowed). The version-bump commit reaches `main` via the
human-merged PR, so no bypass token is needed. The repo/org setting "Allow
GitHub Actions to create and approve pull requests" must be enabled, or a PAT
supplied as `token:`.

## Part 2 — CDN auto-update

- A tracked `cdn/` directory holds `claudius.iife.js` + `claudius.css`. Sites
  embed `https://cdn.jsdelivr.net/gh/PMDevSolutions/Claudius@1/cdn/claudius.iife.js`
  (+ `.css`). `@1` resolves the latest `v1.x` tag, so patches/minors flow
  automatically; jsDelivr caches range resolution ~12h (a useful buffer).
- **The bridge:** a step in the release workflow rebuilds the embed and commits
  the fresh `cdn/` artifacts onto the release PR branch, so the tagged merge
  commit contains the exact bytes jsDelivr serves. The same artifacts are
  uploaded to the GitHub Release.
- **Version stamp:** the embed build injects the package version as
  `window.ClaudiusWidgetVersion`, so "what's live?" is answerable from the
  browser console.
- Self-hosting remains supported as a fallback. Embedding sites must allow
  `cdn.jsdelivr.net` in their CSP `script-src`/`style-src`.

**Bootstrap caveat:** `v1.1.0` is already tagged without `cdn/`, so `gh@1` only
starts resolving once the first release cut by the new workflow lands.

## PR structure

- **PR 1:** Part 1 (additive: config, manifest, base workflow, this doc).
- **PR 2:** Part 2, stacked on PR 1 (adds `cdn/`, the artifact build/commit
  workflow step, the version stamp, and docs).
