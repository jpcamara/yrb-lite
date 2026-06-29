# Changelog — y-ruby-actioncable

All notable changes to the `y-ruby-actioncable` gem are documented here. The
format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
this project aims to follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-06-28

First release under the **`y-ruby-actioncable`** name (previously developed as
`yrb-lite-actioncable`).

### Changed
- **Renamed `yrb-lite-actioncable` → `y-ruby-actioncable`.** Channel concern
  `YrbLite::ActionCable::Sync` → **`Y::ActionCable::Sync`**; require
  `require "yrb_lite/action_cable"` → `require "y/action_cable"`. ActionCable
  stream prefix `yrb_lite:` → `y_ruby:`. Depends on `y-ruby >= 0.2.0`.

### Notes
- Full y-websocket protocol over ActionCable/AnyCable: origin-filtered relay,
  awareness, on_load/on_save persistence hooks, optional record-before-distribute
  audit mode, and AnyCable `sync_backend :store`.
