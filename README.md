# PUPG Push-up

Push-up counter for Expo / React Native. Dark, minimal, pure `StyleSheet`.

Counts reps hands-free, times the set, saves it locally, and tracks a daily streak.

## Run

```bash
npm start
```

Then press `a` for Android, `i` for iOS, or `w` for web. `npm run android` / `npm run ios` / `npm run web` do the same directly.

## How rep detection works

A rep is one complete **near → far** cycle: sensor covered at the bottom of the
push-up, uncovered on the way back up. Counting on the *up* edge means the
number matches completed reps, not attempts.

Two guards protect the count (`src/hooks/useRepDetector.js`):

| Guard | Value | Rejects |
| --- | --- | --- |
| `MIN_NEAR_MS` | 80 ms | a graze that never really covered the sensor |
| `REP_DEBOUNCE_MS` | 500 ms | a second rep arriving impossibly soon after one |

### A note on the proximity sensor

**`expo-sensors` has no proximity sensor.** It ships `Accelerometer`,
`Barometer`, `DeviceMotion`, `Gyroscope`, `LightSensor`, `Magnetometer`,
`MagnetometerUncalibrated` and `Pedometer` — that is the complete list. Expo Go
cannot load a native proximity module either.

So detection sits behind a swappable source interface (`src/sensors/sources.js`).
Every source emits the same near/far stream; nothing downstream knows which one
is feeding it.

| Source | Platform | How it works |
| --- | --- | --- |
| `light` | Android | Ambient light sensor. It sits in the same earpiece cutout as the proximity sensor, so covering it is a faithful stand-in. |
| `tap` | All | The screen is the sensor — touch with your nose at the bottom of each rep, release on the way up. |

The light source **calibrates on every Start**: it samples the room for 1.2 s,
takes the median, and derives two thresholds with a gap between them. That gap
is hysteresis — it stops a reading hovering on the boundary from rattling
between near and far and inflating the count. Below 10 lx it refuses to start
and tells you to turn a light on or switch to Tap, rather than counting noise.

To use **real proximity hardware** (and get it on iOS), make a development build
and register a native module as a third source — see the `NATIVE_PROXIMITY`
block at the bottom of `src/sensors/sources.js`. It is a change to that one
file; the detector, counter, and persistence are untouched.

## Stats

- **Total** — every rep ever recorded
- **Today** — reps in the current local calendar day
- **Streak** — consecutive local days with at least one rep

Streak counts back from today; if today is still empty it starts from yesterday,
so an unfinished day doesn't read as a broken streak. Days are keyed on the
*local* calendar so they line up with the user's midnight, and day arithmetic is
anchored at midday to survive DST. A session with 0 reps never keeps a streak
alive.

## Storage

AsyncStorage, two keys:

- `pupg:sessions:v1` — `[{ id, timestamp, totalReps, durationSeconds, sourceId }]`, newest first
- `pupg:settings:v1` — `{ sourceId, soundEnabled, hapticsEnabled }`

Reads are defensive: corrupt JSON or malformed records resolve to an empty list
rather than throwing, so a bad write can't brick the app on launch. Finishing a
set with 0 reps saves nothing.

## Layout

```
App.js                      renders WorkoutScreen
src/
  screens/
    WorkoutScreen.js        counter, timer, status, controls
    HistoryModal.js         FlatList of past sessions + totals
  hooks/
    useRepDetector.js       near/far state machine, debounce + graze guards
    useWorkoutTimer.js      wall-clock elapsed time, pause-aware
    useSessions.js          session list + derived stats
    useFeedback.js          haptics + click on each rep
  sensors/sources.js        proximity sources (light / tap) + extension point
  storage/sessions.js       AsyncStorage read/write
  utils/
    time.js                 MM:SS, local day keys
    stats.js                totals, today, streak
  theme/theme.js            colour + type tokens
assets/rep.wav              70 ms click played on each rep
```

## Implementation notes

- The timer measures `Date.now()` spans rather than counting ticks. Interval
  callbacks are throttled while the app is backgrounded, so a tick-counting
  timer would silently lose time mid-set.
- The tap surface uses raw touch/pointer handlers on a `View`, not
  `Pressable`. `Pressable` routes through Pressability, which was measured
  adding ~69 ms before `onPressIn` fires — the detector would bill that to the
  rep's hold time and reject fast reps.
- The screen is kept awake for the duration of a set.
- Audio uses `interruptionMode: 'mixWithOthers'` so the clicks play over the
  user's music instead of pausing it.

## Verified

```bash
npm run verify
```

24 assertions over duration formatting, local day keys, DST and year
boundaries, streak edge cases, the storage round-trip, and corrupt-data
handling. Plain Node, no test framework.

Behaviour was driven live in the browser: rep counting, the 80 ms and 500 ms
guards measured across repeated trials, pause freezing both count and clock,
resume, finish, persistence shape, and multi-day streak arithmetic.
