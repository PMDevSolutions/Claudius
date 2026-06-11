---
title: Versioning policy
description: How Claudius versions releases, the CDN channels, and how these
  docs are archived.
sidebar:
  order: 1
slug: 1.x/migration
---

Claudius follows [Semantic Versioning](https://semver.org):

* **Patch / minor** (`1.2.x` → `1.3.0`) — backward compatible. The CDN `@1`
  channel picks these up automatically; self-hosted embeds can update
  whenever convenient.
* **Major** (`1.x` → `2.0`) — may contain breaking changes, always with a
  [migration guide](/1.x/migration/v1-2-to-v1-3/). The `@1` CDN channel never
  serves a `2.x` build; you opt in by switching to `@2`.

Releases are automated with release-please from conventional commits; every
release has a [GitHub Release](https://github.com/PMDevSolutions/Claudius/releases)
and a `CHANGELOG.md` entry.

## Docs versions

These docs track the latest release. When a new **major** ships, the previous
major's docs are archived and stay browsable via the version switcher, so you
can keep referencing the docs that match what you run.

## Checking your version

* CDN/self-hosted embeds: `window.ClaudiusWidgetVersion` in the console
* Repo checkouts: the root `package.json` version, or `git tag`
