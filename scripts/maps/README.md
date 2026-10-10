# USA Swim Wiki geography

The UI is a national → zone → LSC explorer. Public team queries use only approved `knowledge_entries`, fetched by selected LSC in stable 500-record pages. No credentials, collection payloads, or private membership data are included in map assets.

## Sources and regeneration

- Boundaries: https://www.usaswimming.org/docs/default-source/governance/lsc-maps/lsc-zone-map.pdf (retrieved October 10, 2026). National SVG geometry and individual LSC outlines are extracted directly from the published vector PDF; they are illustrative, not navigation-grade GIS polygons.
- City centroids: Census 2025 Places Gazetteer, https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/2025_Gaz_place_national.zip . `city-centers.json` contains only the WA/OR/ID cities used by the Inland Empire directory and the official map's locator cities. These are representative city points, not pool addresses.
- Team-to-city association is derived at render time from the **approved** `geographicCoverage` field, with exact normalized city/state matching. No fuzzy matches and no contact-address geocoding.

Run `python scripts/maps/extract-boundaries.py /path/to/lsc-zone-map.pdf` from the repository root (requires PyMuPDF). Review rendered maps after replacing the source: path order and page codes are source-specific. The generator does not publish changes or access the database.

## Reviewed pool data

The existing collection/review workflow can add `data.locations` to a team:

```json
{"locations":[{"label":"Home pool name","latitude":47.43,"longitude":-120.32,"precision":"pool","sourceUrl":"https://team.example/pools"}]}
```

Each location requires finite WGS84 coordinates, `pool` or `city` precision, a label, and an HTTP(S) source URL. Support multiple training pools in the array. Only approved team rows appear publicly. A valid reviewed location array supersedes inferred city points.

## Pilot coverage and upkeep

All four national zones and all 59 LSC detail outlines are available. Team-marker georeferencing is calibrated for **Inland Empire** in this first release. Other LSCs show their boundaries and approved team list; uncalibrated locations are explicitly counted as unmapped. Extend `projectLocation` with a documented projection adapter when adding another LSC. Do not reuse Inland Empire's transform elsewhere.

The Inland Empire affine display adapter is fitted to the ten numbered city locators on official page 18 using Census representative coordinates (approximate 3.2 PDF-point RMS fit). Pool coordinates stay geographic in the database, independent of this display adapter. Boundary changes require regenerating geometry and checking calibration. Never imply that an approximate marker establishes a home pool or legal jurisdiction.

Shared or nearby locations group into selectable markers; clicking cycles teams, and the searchable list always exposes each individual team. Missing/unreviewed locations remain in the list. There are no paid map tiles or geocoding requests per visit.
