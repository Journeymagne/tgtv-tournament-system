# ktcalc feature map

User-facing surface is the web UI. Index of the features this skill knows how to drive:

| Feature | How a user opens it | File |
| --- | --- | --- |
| Shooting calculator | `/` (header Shoot link) | [shooting.md](shooting.md) |
| Fighting calculator | header Fight link, `/fight/` | [fighting.md](fighting.md) |
| Situation comparison | below the two shoot situations on `/` | [comparison-matrix.md](comparison-matrix.md) |
| Share link | "Add Share Params" on a calculator view | [share-link.md](share-link.md) |
| Help and rules | header "How it works", then a doc link | [help-and-rules.md](help-and-rules.md) |

The shipped automated drive covers shooting (`scripts/drive-shoot.mjs`). The other files are the concrete steps for the same browser helper: real labels, routes, and the readout that proves the feature.
