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
| `ai` | All | Camera + MediaPipe pose detection. Counts from body position and checks form. Native runs it in a WebView so it works in Expo Go. See below. |
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

## AI camera detection

Counts push-ups from body position, the way Push & Post does, and judges form
on every rep.

The signal is the **elbow angle** (shoulder-elbow-wrist): roughly 170 degrees at
the top of a push-up, 80 at the bottom. A rep is one down-then-up cycle counted
on the way up. Four guards keep the count honest:

| Guard | Rejects |
| --- | --- |
| Hysteresis | separate down (100°) and up (150°) thresholds, so an angle sitting on one boundary cannot oscillate and inflate the count |
| `minPhaseMs` 150 ms | a single bad inference flipping the phase |
| `minRepMs` 500 ms | the same rep floor the sensor path uses |
| Form gates | torso must be within 45° of horizontal and the body straighter than 150°, so waving an arm at the camera counts nothing |

Rejected reps are not silent — the screen says *Go lower*, *Keep your body
straight*, *Get into a push-up position*, or *Step into frame*.

Angles are **aspect-corrected**. Landmarks arrive normalised per axis (x and y
both 0..1), which silently distorts every angle on a non-square frame: at 16:9
one unit of x is 1.78× wider than one unit of y, so a true 90° elbow measures as
something else. `src/pose/geometry.js` restores real proportions first.

### Model independence

Pose models disagree on keypoint count and order — MediaPipe BlazePose emits 33,
MoveNet 17, and the indices do not line up. `src/pose/landmarks.js` normalises
both into one named-joint skeleton, so the analyser never learns which model
produced a frame and swapping models touches nothing else.

### Where it runs

**Web** uses MediaPipe Pose Landmarker. The library is fetched from a CDN at
runtime rather than bundled: every build it ships contains `import(t.toString())`
for its WASM loader, which Metro's static analysis rejects outright. Building
the import through `new Function` hides it from that analysis. The WASM and the
model already come from the network, so this adds no new runtime dependency.

**Native runs in Expo Go, via a WebView.** `expo-camera` exposes no frame
processor — `CameraView` does photo capture, recording and barcode scanning, but
gives no access to live pixels — and Expo Go cannot load a native module that
would. A WebView is the one route to live ML that works in Expo Go, so
`src/pose/PoseStage.js` loads a page that owns the camera and reports finished
reps back over `postMessage`.

That page is **generated, not hand-written**: `npm run build:pose` inlines
`geometry.js`, `landmarks.js` and `pushupAnalyzer.js` into
`src/pose/web/pose.template.html` and writes `docs/pose.html`. The phone and the
test suite therefore run byte-identical counting rules. `npm run verify` fails
if the published page has drifted from the modules.

The page must be served over **HTTPS** — `getUserMedia` only runs in a secure
context, which rules out both `source={{ html }}` (opaque origin; getUserMedia
hangs) and Metro's dev server (reached from the phone as `http://192.168.x.x`,
not a secure origin). See `src/config.js` for the URL and the GitHub Pages
setup.

### Setting it up for Expo Go

1. `npm install`
2. `npm run build:pose`
3. Commit and push `docs/pose.html`
4. On GitHub: **Settings → Pages → Source: Deploy from a branch → Branch:
   `master`, Folder: `/docs`**
5. Confirm `https://<user>.github.io/push-up/pose.html` opens and asks for camera
6. Point `POSE_PAGE_URL` in `src/config.js` at it if your URL differs
7. `npx expo start`, scan the QR in Expo Go, pick **AI camera**, press Start

### Going faster later

For full native speed, a development build with VisionCamera avoids the WebView
entirely. **EAS Build compiles in the cloud, so no Android Studio or JDK is
needed locally** — only a free Expo account:

```bash
npm i -g eas-cli && eas login
npx expo install expo-dev-client react-native-vision-camera \
  react-native-fast-tflite vision-camera-resize-plugin
eas build --profile development --platform android
```

Then swap `PoseStage.js` for a VisionCamera frame processor that resizes each
frame to the model input, runs MoveNet through fast-tflite, and feeds the
keypoints through `fromMoveNet()` into the same analyser. The analyser, counter,
storage and stats need no changes — that is what the normalised schema buys.

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
  pose/
    pushupAnalyzer.js       elbow-angle state machine, form gates (pure)
    landmarks.js            BlazePose/MoveNet -> one named-joint skeleton
    geometry.js             aspect-corrected angles
    PoseStage.web.js        camera + MediaPipe + skeleton overlay
    PoseStage.js            native: explains the dev-build requirement
  sensors/sources.js        detection sources (ai / light / tap) + extension point
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

48 assertions, plain Node, no test framework.

`verify.mjs` (24) — duration formatting, local day keys, DST and year
boundaries, streak edge cases, the storage round-trip, corrupt-data handling.

`verify-pose.mjs` (24) — synthesises skeletons at exact known angles, checked
against the geometry first, then replays push-ups frame by frame: counting,
variable frame rate, shallow reps, body sag, upright arm curls, single-frame
glitches, hysteresis oscillation, rep debounce, and tracking dropout.

Driven live in the browser: rep counting via the tap path, the 80 ms and 500 ms
guards measured across repeated trials, pause freezing both count and clock,
resume, finish, persistence shape, and multi-day streak arithmetic.

For the camera path, the whole pipeline was exercised against a synthetic video
stream — CDN library load under Metro, WASM init, model download, the 30fps
inference loop, landmark normalisation, coaching output, pause keeping the
camera alive, and finish. **Real body detection is not verified**: that needs a
person doing push-ups in front of a webcam. The rep logic downstream of the
landmarks is what the 24 pose assertions cover.
