# Official ATCF eligibility findings

Collected July 21, 2026, for the approved all-system model-guidance implementation.

| Source | Finding | Implementation consequence |
|---|---|---|
| [NHC Current Storms](https://www.nhc.noaa.gov/CurrentStorms.json) | At retrieval, active advisory systems were `al022026` Bertha (TS) and `ep062026` Fausto (HU). | Continue to include every current advisory system from `activeStorms`. |
| [NHC public ATCF A-deck directory](https://ftp.nhc.noaa.gov/atcf/aid_public/) | Directory retained historical files and listed both advisory and invest identifiers, including `aal902026.dat.gz`, `aal912026.dat.gz`, `aep972026.dat.gz`, and several older basin records. | Never treat directory presence alone as current eligibility. Discover eligible invest numbers from the official directory, then require a recent complete A-deck model cycle. |
| [NHC Track and Intensity Models](https://www.nhc.noaa.gov/modelsummary.shtml) | NHC describes model output as objective guidance used in preparation of official forecasts and identifies some aids as restricted. | Retain the curated public-aid allowlist and the existing disclaimer. Do not show restricted aids or present guidance as an official forecast. |

## Eligibility rule

Publish a system only when all conditions hold:

1. Its ID is a valid Atlantic, Eastern Pacific, or Central Pacific `al`, `ep`, or `cp` basin identifier.
2. It appears in the official active-storm feed, or it is an invest-numbered public A-deck record in the current season.
3. Its latest complete public A-deck cycle is less than 18 hours old when the artifact is generated.
4. That cycle contains at least two permitted public model aids, each with at least two valid position points.

A current official A-deck invest is labeled `Invest <number><basin suffix>` (for example, `Invest 90L`). An unnumbered Tropical Weather Outlook area is not plotted because it has no official ATCF storm identifier or public A-deck model track to validate.

## References

[1]: https://www.nhc.noaa.gov/CurrentStorms.json "NHC Current Storms"
[2]: https://ftp.nhc.noaa.gov/atcf/aid_public/ "NHC public ATCF A-deck directory"
[3]: https://www.nhc.noaa.gov/modelsummary.shtml "NHC Track and Intensity Models"

## Current directory-timestamp validation

Source: <https://ftp.nhc.noaa.gov/atcf/aid_public/> retrieved July 21, 2026.

The official public index exposes a modification timestamp beside each A-deck. On retrieval, it listed, among others, `aal902026.dat.gz` modified `2026-06-16 13:44`, `aal912026.dat.gz` modified `2026-07-19 13:00`, `acp902026.dat.gz` modified `2026-07-17 13:02`, and `aep972026.dat.gz` modified `2026-07-19 01:30`. The implementation therefore filters invest candidates by a recent directory timestamp before downloading their A-decks, then independently requires a complete allowed-model cycle no more than 18 hours old. This avoids historical directory entries and bounds network work.

Source URL: https://ftp.nhc.noaa.gov/atcf/aid_public/
