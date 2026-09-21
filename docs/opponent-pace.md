# Opponent pace tuning

Expert is calibrated against the owner's reported 114-second Kairo lap, which included wall hits. The first tuning pass averaged 116.44 seconds and was still too slow. The stronger Expert field averages about 108.2 seconds in the same two-lap benchmark, with clean flying laps around 106.8–110.3 seconds.

A separate six-car run used a quicker reference driver that completed a clean 111.86-second lap. Every Expert rival finished ahead of that driver, with flying laps from 106.83 to 110.67 seconds. All six cars stayed on the road and recorded zero wall strikes. These are deterministic controller benchmarks; a human's results still depend on their driving.

The rivals use the shared vehicle physics, tyre grip and engine performance. The changes affect their driving decisions, with no position-dependent speed boosts or teleports.

## Driving changes

- Rival corner-pace targets: Rookie 0.94, Sport 1.08, Expert 1.65. The coefficient changes planned corner speed, not physical engine power.
- Launch ramp: 1.1 seconds for Rookie, about 0.73 seconds for Sport, 0.3 seconds for Expert, replacing the original shared 1.4-second ramp.
- Braking envelope: 22–28 m/s² across the difficulty range. Expert uses more of the existing car's cornering and aerodynamic capacity.
- Shorter steering preview in fast corners improves tracking. Tight chicanes retain a lower pace target to allow steering reversals.
- Side-by-side cars retain a corner-speed margin. A 0.6-second outward-velocity prediction prompts an earlier, stronger lift before reaching the road edge; this keeps the increased corner pace on the tarmac.
- The fixed Rookie player aids and vehicle physics are unchanged.

## Verification

`CIRCUIT=kairo DIFFICULTIES=easy,normal,hard node scripts/verify-neon-race.mjs` runs two laps for each difficulty. Repeat with `CIRCUIT=neon`. It checks full-field completion, stuck cars, repeated wall strikes, clean Expert laps, Expert average flying-lap budgets (109 seconds Kairo / 67 seconds Neon), and at least two seconds of separation between adjacent difficulty levels. Every Expert rival must also complete its Kairo flying lap below 112 seconds, giving a margin against the reported 1:54. The player benchmark uses a fixed 1.08 pace for every difficulty. The script retains actual browser driving input and screenshots.

The faster reference-driver stress check uses a 1.4 pace. Its source and results are in `artifacts/opponent-pace-v2/fast-reference.mjs` and `artifacts/opponent-pace-v2/fast-reference-kairo/browser-races.json`. Earlier evidence is in `artifacts/opponent-pace/`; revised tuning evidence is in `artifacts/opponent-pace-v2/`. Final regression results are written to `artifacts/kairo/browser-races.json` and `artifacts/neon/browser-races.json`.

Final full-race regressions passed at every difficulty on both circuits, with all rivals staying on the road and recording zero wall strikes. Mean rival second-lap times:

| Circuit | Rookie | Sport | Expert |
| --- | ---: | ---: | ---: |
| Kairo Loop | 131.13 s | 123.71 s | 108.16 s |
| Neon District | 84.32 s | 77.81 s | 64.91 s |

Production build passed with the existing large-bundle warning.
The production Kairo mobile smoke test also passed: driving, difficulty selection, pause/resume, restart, car switching and audio. Desktop race screenshots were captured by the regression harness. Physical mobile hardware and subjective human-versus-Expert racing were not measured.
