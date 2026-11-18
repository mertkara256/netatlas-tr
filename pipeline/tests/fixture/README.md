# Sample for the pipeline tests

A small input for `pipeline/build.py`. `../conftest.py` runs the build on it once per test session, so assigning squares to provinces and districts, pooling quarters into periods, and the province, district and national values are tested on every pull request, without the downloaded data. Each square has one job, and the tests compare the result with numbers worked out by hand (`../test_sample_build.py`, and the hand calculations in `../test_build.py` and the cell checks in `../test_tiles.py`).

## Files

- `ilceler.geojson`: district shapes clipped to three windows of whole zoom-16 squares by `clip_boundaries.py`, so each square in a window has the same land share as in the full data. Only `ilce_kodu` and `il_kodu` are kept; `build.py` takes the names from `data/processed/ilceler.csv`.
- `ookla.csv`: one row per square and quarter, with Ookla's columns. `x` and `y` place the square on the zoom-16 tile grid; `conftest.py` turns them into quadkeys and writes one file per quarter, as `pipeline.ookla` does.
- `nufus.csv`: residents per square, written as the table `pipeline.population` makes.
- `clip_boundaries.py`: remakes `ilceler.geojson` from the full shapes.

## Windows

| Window | Squares (x, y at zoom 16) | Districts |
|---|---|---|
| Moda, Kadıköy: coast | 38050–38053, 24572–24576 | Kadıköy and a sliver of Üsküdar (İstanbul); the rest is sea |
| Nusaybin and Qamishli: the Syrian border | 40268–40273, 25492–25499 | Nusaybin (Mardin); the rest is Syria |
| Serdivan junction: a province border | 38271–38275, 24604–24608 | Serdivan and Adapazarı (Sakarya), İzmit (Kocaeli) |

## Squares

| Square | Land in Türkiye | Tests | Residents | What it checks |
|---|---|---|---|---|
| `moda_coast_49` | 48.3% Kadıköy, 0.3% Üsküdar; centre at sea | 2 | | A coastal square stays in although its centre is at sea |
| `moda_coast_65` | 65.5% Kadıköy; centre at sea | 3 | | The same |
| `moda_coast_19` | 18.6% Kadıköy | 50 | 30 | Under a fifth: left out, with its tests and residents |
| `kadikoy_two_quarters` | all | 30, then 10 | 100 | A square pools its quarters by tests: 30.0 Mbps (50.0 by devices) |
| `kadikoy_largest` | all | 4 in each of three quarters, 2 devices each | | The largest square over the period: 6 of Kadıköy's 20 devices |
| `kadikoy_burst` | all | 5 in one quarter, 5 devices | | Largest in a single quarter, not over the period |
| `kadikoy_next` | all | | 50 | Next to a measured square: measured |
| `kadikoy_two_away` | all | | 50 | Two squares from any measured square in Türkiye (it touches `moda_coast_19`, which is left out): not measured |
| `nusaybin_border_23` | 23.3% Nusaybin; centre in Syria | 3 in each of 2025 Q2–Q4, 1 in 2026 Q1 | | Just over a fifth: stays in. Nusaybin and Mardin have 9 tests in 2025 ("dusuk") and 10 in the current period ("orta") |
| `nusaybin_border_10` | 9.7% | 50 | 10 | Left out |
| `border_sliver_3` | 3.0% | 50 | | Left out |
| `qamishli_edge`, `qamishli` | none | 50 each | 500 in `qamishli` | Left out |
| `nusaybin_next` | all | | 80 | Next to `nusaybin_border_23`: measured |
| `nusaybin_by_syria` | 51.4% | | 20 | Next only to squares that are left out: not measured |
| `serdivan_junction` | 40.3% İzmit, 34.4% Serdivan, 25.3% Adapazarı | 5 in each of three quarters | 50 | Sakarya holds 59.7%, so the square goes to Sakarya and within it to Serdivan, although İzmit is the largest single district |
| `serdivan_west` | 54.4% Serdivan, 45.6% İzmit | | 40 | Measured only through `izmit`, in another province |
| `serdivan_south` | all | | 10 | Not measured |
| `izmit` | all | 66 in each of three quarters | 60 | With the next two: İzmit and Kocaeli have 199 tests in 2025 ("orta") and 200 in the current period ("yuksek") |
| `izmit_2025q1` | all | 1 in 2025 Q1 | | In 2025, not in a current period that ends in 2026 Q1 |
| `izmit_2026q1` | all | 2 in 2026 Q1 | | Only in the current period |
| `adapazari_a` | all | 100 from 1 device, 10 Mbps | 30 | Adapazarı averages 91.0 Mbps by devices (18.2 by tests) |
| `adapazari_b` | all | 10 from 9 devices, 100 Mbps | 70 | The same |

The squares that must be left out carry 50 tests at 999 Mbps, so a leak shows in every total.

The quarters run from 2025 Q1 to 2026 Q1. The build runs twice: on all five quarters (periods "2025" and "guncel", 2025 Q2 – 2026 Q1) and without 2026 Q1 (only "guncel", 2025 Q1–Q4, because the year would repeat it).

## Sources and licences

- District shapes: OCHA, Türkiye subnational administrative boundaries (COD-AB), from the General Command of Mapping (Harita Genel Müdürlüğü), <https://data.humdata.org/dataset/cod-ab-tur>, licensed under [CC BY 3.0 IGO](https://creativecommons.org/licenses/by/3.0/igo/). Changes: clipped to the three windows above, and every property dropped except the district and province codes. This use does not imply endorsement by OCHA or the General Command of Mapping.
- Tests, devices, speeds and residents are invented for these tests. None of them comes from Speedtest by Ookla Open Data or from WorldPop; they are only laid out in the same columns.

## Remaking the shapes

```
uv run python -m pipeline.boundaries
uv run python -m pipeline.tests.fixture.clip_boundaries
```
