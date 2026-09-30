# Incline ecosystem

Core repo stays whole (mobile + web monorepo). Satellites split off only
when one has real code and its own deploy rhythm ("split on second
deployable"). Until then they are seed issues, not repos.

## Interlink contracts

- **Export JSON** is the stable portable contract (satellites read it).
- **Supabase** is the live contract (satellites with write ambitions).
- **Catalog IDs** stay stable across all surfaces.

## Satellites (seed issues)

| Direction | Issue | Pattern | Lives here until split |
|---|---|---|---|
| Agentic coaching rules pack | #239 | ioandev/hevy | P1–P2 local coaching stays in-app |
| Insights analytics | #240 | casudo/Hevy-Insights, hevymap, LiftShift | web companion |
| MCP + CLI access | #242 | chrisdoc/hevy-mcp | needs dataset + frozen schema |
| Export bridges (Garmin/Sheets/AI) | #241 | hevy2garmin, HevyConnect, hevy-tracker, AI_Fitness | export JSON |
| Multi-vendor contexts | #243 | Hevy-Insights vendors | data-model note, no refactor |
| Importer parity | #244 | openGym, obsidian-gym | web /import |

## Reference catalog (surveyed Sep 2026)

- chrisdoc/hevy-mcp — MCP+CLI+worker, pnpm workspace monorepo (validates ours)
- ioandev/hevy — markdown coach (CLAUDE.md rules, slash commands, weights.md)
- casudo/Hevy-Insights — plateau/strength detection, vendors, CSV/API login
- longtimec0ming/hevymap — sub-muscle volume granularity
- aree6/LiftShift — log visualizations
- drkostas/hevy2garmin, TonyTromp/HevyConnect — FIT/export bridges
- remuzel/hevy-api, dmzoneill/hevyapp-api — API clients
- SteveG/underthebar — third-party client
- tomtorggler/hevy-mcp-server — second MCP implementation
- hevyapp/hevy-gpt — official AI surface (watch)
- DisplacedForest/ha-hevy-tracker, hudsonbrendon/HA-hevy — Home Assistant/PR sensors
- gelbh/hevy-tracker — Sheets sync
- johnson4601/AI_Fitness — Garmin+Hevy CSV → Gemini pipeline
- DuarteSantos8/openGym — self-hosted tracker + importers
- Ni-zav/obsidian-gym — markdown training vault
- jessedelira/gym-tracker, Cairo-Squad/EvolveFit (KMP), Emanuel5014/Trainable — tracker implementations

## Tracking

- Audit backlog: #224 (groups feed the board).
- Scale staging: #228.
- Board: "Incline" user project — PENDING token scopes
  (`gh auth refresh -s project,read:project`, then create + add
  #224, #228, #239–#244).
- Milestones P0–P4 already exist; satellites filed under P2/P3/P4.
