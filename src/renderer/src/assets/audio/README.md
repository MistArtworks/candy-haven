# Cue audio

Three samples, kept here rather than in `resources/` because the **renderer**
plays them: Vite fingerprints and bundles anything imported from `src`, which is
what lets `media-src 'self'` in the console's CSP allow them. `resources/` is for
files the *main* process reaches for on disk.

| File                  | Was                                                   | Plays                          |
| --------------------- | ----------------------------------------------------- | ------------------------------ |
| `tick.mp3`            | `u_mx4xkr2bzy-slow-cinematic-clock-ticking-tension-3` | Under both timers while running |
| `interval-spent.wav`  | `N-Bass Pattern 07 D`                                  | INTERVAL reaching zero          |
| `convene-spent.wav`   | `N-Granular Impact 06 DMin`                           | CONVENING reaching zero         |

Renamed on the way in: these are imported by identifier, and the original names
carry spaces and a generator hash that say nothing about where they are used.
