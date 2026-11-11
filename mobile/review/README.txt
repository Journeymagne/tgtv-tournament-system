This directory contains an isolated browser visual-review harness and review artifacts.
review/index.tsx is NOT imported by index.ts or the release App entry.

The browser harness intercepts API traffic and serves fictional data. Every unhandled
API request and every write is rejected. It never connects to a database or sends a
production mutation. These screenshots confirm component rendering only. They do
not establish authenticated backend integration, Android/iOS device behavior, or
signed native build success.

Screen sizes are logical browser viewports from docs/devices.json. Portrait and
landscape, dark and light themes are checked. No product automated tests run locally.
