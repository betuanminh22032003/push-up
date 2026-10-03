# Hít Đất AI

Hands-free workout counter for Android (Expo / React Native): push-ups, squats,
sit-ups and jumping jacks. Dark, minimal, pure `StyleSheet`, no navigation library.

Counts reps with the camera, the light sensor, the phone's own movement or a tap;
runs sets with a countdown and a rest timer; speaks the count; follows a 6-week
push-up program; tracks a daily goal, streaks, records and achievements; and locks
the apps you choose until your reps earn you time on them. English and Vietnamese.
Everything stays on the device.

Store material lives in [`store/`](store/): listing copy, icon, feature graphic,
screenshots, and the [release checklist](store/RELEASE-CHECKLIST.md) (Vietnamese).

## Run

```bash
npm install
npm start
```

Then press `a` for Android, `w` for web. `npm run android` / `npm run web` do the same
directly. The AI camera mode needs the pose page online (see below); the other
modes work offline, and tap works in the web build too.

## Build for Google Play

Builds run on EAS, in the cloud — no Android Studio or JDK locally.

```bash
npm i -g eas-cli && eas login && eas init     # once
npm run build:apk        # installable APK for testing on a phone
npm run build:android    # .aab for Play, versionCode auto-incremented
npm run submit:android   # upload with EAS Submit (needs a Play service account key)
```

`eas.json` holds the profiles. `app.json` blocks the permissions the Expo modules add
by default but the app never uses (`RECORD_AUDIO`, `ACTIVITY_RECOGNITION`, the
media-playback foreground service), so the manifest asks only for camera and
notifications at runtime. It does declare `HIGH_SAMPLING_RATE_SENSORS`, an install-time
permission with no prompt and no Play declaration: without it expo-sensors reads motion
at about 5 Hz on Android, too slow for a brisk jumping jack.

The `preview` APK is only for trying builds on a phone, so it is lighter to build:
- It targets 64-bit ARM only (`-PreactNativeArchitectures=arm64-v8a`). That covers every
  phone of recent years, but not x86 emulators or old 32-bit phones.
- It skips the release lint pass (`-x lintVitalRelease`).

On a free EAS worker, Gradle took 6 m 46 s for all four ABIs. The native code
(`expo-modules-core` and the app's own C++) was configured and compiled once per ABI, and
the lint analysers ran over every module. The Play build keeps every ABI and the lint pass.

On the free plan the wait in the queue is often longer than the build itself. It grows to
an hour or more in the middle of the North American business day, which is the evening and
night in Vietnam.

## Features

### Exercises (`src/exercises/exercises.js`)

One table says everything that differs between exercises: which sources can count
it, how much fun time a rep earns, the fastest believable cadence and the motion
rule. Screens, stats and the pose page read from it, so a new exercise starts there.

| Exercise | Sources, best first | How a rep counts | Fun time per rep |
| --- | --- | --- | --- |
| 💪 Push-ups | `ai`, `light`, `tap` | Camera: elbow angle, body straight and horizontal. Light: the sensor covered at the bottom. Tap: nose on the screen. | 1 × rate |
| 🦵 Squats | `ai`, `motion`, `tap` | Camera: hips down close to knee height and back up, standing, 2–3 m from the phone. Motion: phone in a front trouser pocket, the thigh tilts 45° from upright and back under 20°. Tap: touch at the bottom. | ½ × rate |
| 🧘 Sit-ups | `ai`, `motion`, `tap` | Camera: up from lying on the back, seen side-on. Motion: phone flat on the chest, the torso tilts 45° and back under 20°. Tap: touch on the way up. | ½ × rate |
| 🤸 Jumping jacks | `ai`, `motion`, `tap` | Camera: both arms all the way up while standing, facing the phone. Motion: phone held in one hand, the arm swings 100° and back under 50°. Tap: thumb on the screen. | ¼ × rate |

The exercise is picked with chips on the workout tab, between workouts only, and each
exercise remembers its own source; the idle hint says where to put the phone for that
pair. The fun-time weights keep the blocker honest: a jumping jack is far less work
than a push-up, and paying the same would make it trivial to cheat. The 6-week program
and its max test stay push-ups (their levels are push-up numbers): while one is loaded
the tab counts push-ups and hides the picker.

### Counting

A rep is one complete **down → up** cycle, counted on the way up so the number matches
completed reps, not attempts. Four sources feed the same detector
(`src/sensors/sources.js`); each exercise offers the ones that make sense for it:

| Source | Platform | How it works |
| --- | --- | --- |
| `ai` | All | Camera + MediaPipe pose detection. Counts from body position and coaches form. Native runs it in a WebView. |
| `light` | Android | Ambient light sensor. It sits in the same earpiece cutout as the proximity sensor, so covering it is a faithful stand-in. Calibrates on every start. Push-ups only. |
| `motion` | Phones with a gyroscope | `DeviceMotion` (gyroscope-fused, no permission): how far the phone, carried by the moving limb, has turned from where it held still when the set started. At `nearDeg` or more it is the bottom of a rep, back at `farDeg` or less the start; between the two the state holds. The angles come from the exercise; the rule is pure, in `src/sensors/tilt.js`. Not on web. |
| `tap` | All | The screen is the sensor — touch at each rep (with your nose for a push-up), release to count. |

Two guards protect the sensor and tap paths (`src/hooks/useRepDetector.js`): a dip
must last 80 ms to count, and two reps cannot be closer than the exercise's
`minRepMs` — 500 ms, but 350 ms for jumping jacks, which a brisk set does in 0.6 s.

### Workout flow

```
idle → [calibrating] → countdown → active ⇄ paused → rest → countdown → … → saved
```

- **Countdown** (off / 3 / 5 / 10 s) before every set, with ticks, so the phone can
  be put down and the body put in position. The motion source measures from where the
  phone sits when counting starts, so with it there is always at least 3 s, before
  resuming a paused set too: Start and Resume are pressed with the phone in hand.
- **Sets and rest.** *Done* ends a set and starts the rest timer. In a free workout
  the next set waits for you; in a program day it starts by itself, with the countdown
  as warning. *Finish workout* saves everything.
- **Voice count** speaks each rep number (expo-speech, in the app language), plus
  "go", "rest", "last set" and "workout complete".
- **Summary** after saving: total, exercise, sets, time, and a share button.

### Program (`src/program/program.js`)

A one-set max test picks one of five levels. Each level defines 18 workouts (six weeks
of three), five sets each, whose targets grow per day; the last set is always "at
least N, then max". Rest is 60 s in weeks 1–2, 90 s in 3–4, 120 s in 5–6. The program
is a pure function of `(level, day)`, so only progress is stored. It is a push-up
program, and the tab says so.

### Progress

Daily goal with a progress bar on the home screen; every exercise counts toward it.
Streak of consecutive local days with reps. Weekly chart, records (best set, best day,
longest streak), 21 achievements derived from history (never stored, so they stay
honest when a session is deleted), and the full session list, each row with its
exercise. The rep and set achievements count push-ups, as their copy says; the
session, streak, time-of-day and program ones count every exercise; four more are for
100 squats, 100 sit-ups, 200 jumping jacks and trying all four.

Once the history holds more than one exercise, a filter (All or one exercise) narrows
the tiles, the chart, the records and the list. The goal bar and line only show under
All, since the goal counts every exercise; achievements are never filtered.

### Settings

Daily goal, countdown, rest, sound, vibration, voice, daily reminder (local
notification, inexact alarm — no special permission), language (auto / en / vi),
how-it-works, delete all data, privacy policy link.

## App blocker (Android)

Pick the apps and websites that eat your time; they stay locked until you earn time on
them. Every saved workout credits `reps × rate × weight` of fun time, in whole seconds
(rate: 30 s, **1 min** by default, 2 or 5 min per push-up; the weight is the exercise's,
½ for squats and sit-ups, ¼ for jumping jacks, and the rate section lists what one rep
of each earns). Using a blocked app or site spends the balance second by
second, with a small countdown on top; leaving it, turning the screen off or locking the
phone stops the meter. At zero it is covered by a block screen whose buttons lead to a
workout or the home screen — never back into the app.

Reps count only once the blocker is set up (switched on, at least one app or site), so
hours cannot be banked before it bites, and a discarded workout earns nothing, exactly as
it records nothing.

Two ways to see what is on screen, whichever permissions the user grants:

- **Usage access + "display over other apps"** (`WatchService`): apps only, and banking
  apps keep working. VCB, BIDV, VietinBank, Agribank and other Vietnamese banks refuse to
  open while *any* app has an accessibility service on, Play Store installs included, so a
  blocker that needs Accessibility is one that gets switched off. A foreground service reads
  Android's usage events twice a second while the screen is on (`ForegroundApps` turns
  resumed/paused/stopped into "on screen", re-reading a 3 s overlap, and a screen-off clears
  it so a lost pause cannot keep an app "open"), then starts the block screen, which that
  permission allows from the background. Where an OEM build still drops the start, the block
  screen goes up as an overlay (`Cover`), and from there the real one opens.
- **Accessibility** (`BlockerService`): also websites and picture-in-picture, as below.

Both hand what they see to the same `Enforcer` (meter, countdown, block screen,
escalation), so the rules are identical. When both run, Accessibility blocks and the watcher
waits; switching Accessibility off for a banking app hands over at once.

Banking apps read the system's list of switched-on accessibility services, not which apps
a service watches, so it cannot stay on for every app but them. Once the watcher's two
permissions are granted, the tab's Accessibility row switches the service off in one tap
(`disableSelf()`: Android lets an app switch its own service off, never on). Since
2026-03-01 (Circular 77/2025/TT-NHNN) many banks also close while Developer options or USB
debugging is on, with or without Accessibility. No permission change helps there, so the
tab points it out and opens Developer options.

What the accessibility way covers:

- **Every app window on screen**, not just the focused one: split screen, floating
  windows and picture-in-picture count as use, and a blocked app in picture-in-picture is
  closed when time runs out (the block screen cannot cover it).
- **Websites in browsers.** The service reads the domain in the address bar of Chrome,
  Cốc Cốc, Edge, Brave, Samsung Internet, Opera, Firefox and other browsers it finds,
  and blocks the blocked apps' own sites (tiktok.com for TikTok, youtube.com for
  YouTube…) plus any the user adds. A blocked site is first left with Back, so reopening
  the browser does not land on it again.
- **A second look every second.** Window events alone missed apps: a look taken while an
  app was still launching found no content, and no later event came. A heartbeat runs
  while the screen is on and blocking is set up, and a block screen that did not appear
  within 1.5 s is escalated (Back for a site, then the home screen).
For both ways:

- **Its own process.** Both watchers, the block screen and the state run in `:blocker`,
  apart from the React Native process (JS engine, camera, WebView). That big process is
  what the system reclaims for memory and what a JS crash kills; sharing it, the service
  died too, and realme then declined to restart it ("on in settings, not running"). The
  JS module reaches the state through a `ContentProvider` in that process, and every
  entry point is wrapped so no exception can crash it. The watcher answers every start
  with `startForeground()` before anything else: missing it crashes the process, the
  accessibility service included.
- **Being stopped by the phone anyway.** A force-stop makes Android remove the
  accessibility service from the enabled list; a kill without restart leaves it on but not
  running. The watcher is sticky, restarts after a reboot or an update, and is started
  again whenever the app talks to the blocker (it is in front then, so Android allows it).
  The tab tells all of these apart from "never switched on", explains the fix, flags
  battery optimisation and opens the maker's auto-launch screen (realme/OPPO, Xiaomi, vivo,
  Huawei, Asus) directly; the home chip turns into a warning.

It is a **local Expo module**, [`modules/app-blocker`](modules/app-blocker/), autolinked
from `modules/`:

| File | Role |
| --- | --- |
| `BlockerEngine.kt` | every decision (meter, block, wait, escalate, close picture-in-picture), plain Kotlin with JUnit tests |
| `Enforcer.kt` | carries out the engine's commands for either watcher: meter, countdown pill, block screen, toasts |
| `WatchService.kt` | foreground service (`specialUse`): reads usage events twice a second, blocks apps without Accessibility, waits while Accessibility runs |
| `ForegroundApps.kt` | usage events to "which apps are on screen", plain Kotlin with JUnit tests |
| `BlockerService.kt` | `AccessibilityService`: looks at the screen on window events and on the heartbeat, reads browser address bars; its countdown is an accessibility overlay |
| `BlockScreen.kt` | the block screen's content, built in code so it appears even when the JS is not loaded |
| `BlockActivity.kt` | the block screen as an activity; Back goes home |
| `Cover.kt` | the block screen as an overlay window, for OEM builds that drop the activity start |
| `Access.kt` | which permissions are granted, and whether Developer options are on |
| `BootReceiver.kt` | restarts the watcher after a reboot or an update |
| `BlockerStore.kt` | the one copy of the state, in the `:blocker` process, persisted in SharedPreferences |
| `BlockerProvider.kt` | `ContentProvider` in `:blocker`: the JS module's only way to the state |
| `Sites.kt` | address-bar text to host, domain matching; JUnit-tested |
| `Packages.kt` | launchable apps and icons for the picker, browsers, the never-blocked set (this app, launcher, Settings, dialer) |
| `AppBlockerModule.kt` | the JS API (async, since it crosses processes), used through `src/state/BlockerContext.js` |

The JUnit tests (`android/src/test`) need no device. Android Studio runs them with the
module's `testDebugUnitTest`; without an Android SDK, compile `BlockerEngine.kt`,
`Sites.kt`, `ForegroundApps.kt` and the three test files with `kotlinc` against JUnit 4
and run `org.junit.runner.JUnitCore`.

Custom native code does not run in **Expo Go**: there the module is absent
(`requireOptionalNativeModule` returns null) and the tab explains why. Use a build —
`npm run build:apk`. On Android 13+, a sideloaded APK must first be given *App info →
⋮ → Allow restricted settings* before the accessibility service can be switched on;
Play installs are exempt. The dev web build uses an in-memory stand-in
(`src/blocker/demoBlocker.js`) so the screen can be laid out and screenshotted.

Google Play allows accessibility services outside accessibility tools only with a
prominent disclosure and consent before the user is sent to settings (the tab shows
one, and a second one before usage access), a privacy-policy section, and the
Accessibility API declaration in Play Console; the special-use foreground service needs
its own declaration — both texts in [`store/listing.md`](store/listing.md).

## AI camera detection

Counts every exercise from body position and judges form on every rep. Push-ups are
described here in full; squats, sit-ups and jumping jacks follow the same pattern, each
with its own signal and gates (`src/pose/analyzers.js` picks the analyser for an
exercise id):

- **Squat** (`squatAnalyzer.js`): how high the hip sits above the ankle, as a share of
  its standing height, turned into a knee-like angle (180° standing, about 90° at
  parallel). Height survives turning about the vertical, so it reads the same front-on
  and side-on, where the plain knee angle is lost in depth; hip and ankle rather than the
  knee, because the knee travels toward a camera in front and perspective then skews it
  with the phone's height. The thighs must get within 30° of level. Too
  high is *Squat lower*; not standing is *Stand up straight*.
- **Sit-up** (`situpAnalyzer.js`): the trunk against the floor at the hip (180° lying,
  90° sitting up), seen side-on; against the floor rather than the thigh, so bending
  the knees more cannot pass a crunch off as a sit-up. Not high enough is *Come up
  higher*; a rep that did not start from lying on the back is *Start lying on your back*.
- **Jumping jack** (`jumpingJackAnalyzer.js`): how far the upper arms are short of
  pointing straight up (about 165° at the sides, 15° overhead), facing the camera; both
  arms must be seen and the lower one counts, so waving one arm does nothing. Short of
  overhead is *Hands all the way up*; not standing is *Stand up straight*.

The shared machinery (adaptive thresholds, hysteresis, minimum phase, partial reps) is
`src/pose/repEngine.js`.

The signal is the **elbow angle** (shoulder-elbow-wrist): roughly 170° at the top of
a push-up, 80° at the bottom. Thresholds adapt to each person's observed range, with
absolute ceilings so a twitch cannot become a rep. Guards: hysteresis between the
down and up thresholds, a 150 ms minimum phase, the same 500 ms rep floor as the
sensor path, and a torso-tilt gate so standing in front of the camera counts nothing.
Rejected reps are named on screen: *Go lower*, *Keep your body straight*, *Get into a
push-up position*, *Step into frame*.

Angles are aspect-corrected (`src/pose/geometry.js`) and the analyser consumes one
named-joint skeleton (`src/pose/landmarks.js`), so MediaPipe could be swapped for
MoveNet without touching the counting rules.

### Where it runs

**Web** uses MediaPipe Pose Landmarker fetched from a CDN at runtime.

**Native runs in a WebView.** `expo-camera` exposes no frame processor, and Expo Go
cannot load a native module that would, so `src/pose/PoseStage.js` loads a page that
owns the camera and reports reps back over `postMessage`. The page is **generated**:
`npm run build:pose` inlines the counting modules of `src/pose/` (geometry, landmarks
and the analysers) into `src/pose/web/pose.template.html` and writes `docs/pose.html`,
so the phone and the test suite run byte-identical rules. `npm run verify` fails if
the page has drifted.

The WebView loads `POSE_PAGE_URL?exercise=<id>`, and the page counts that exercise. Its
`ready` message says what it is counting: `{ type: 'status', phase: 'ready', exercise,
version: 2 }`. A page that answers without `exercise` is an older published version that
can only count push-ups: for push-ups it is accepted (it counts them correctly), for any
other exercise `PoseStage` shows *pose.outdated* (switch to another mode, such as Tap, for now)
instead of silently counting push-ups. So does a page that answers with another exercise.

The page must be served over **HTTPS** (`getUserMedia` needs a secure context), so it
is published from `docs/` by GitHub Pages: **Settings → Pages → Deploy from a branch →
`master` / `/docs`**. The URL is in `src/config.js`. `docs/privacy.html` is published
the same way.

**The published page lags the code**: it only changes when `master` is pushed. After
changing anything under `src/pose/` — the new exercises included — run `npm run
build:pose`, commit `docs/pose.html` and push to `master`. Until GitHub Pages has
redeployed it, phones count push-ups with the camera as before, and the other exercises
only with Motion or Tap.

## Storage

AsyncStorage, three keys, all read defensively (corrupt data → empty, never a crash):

- `pupg:sessions:v1` — `[{ id, timestamp, totalReps, durationSeconds, sourceId, exerciseId?, sets?, restSeconds?, program? }]`, newest first. A single-set workout is stored without `sets`, and a push-up workout without `exerciseId`, exactly as the first version stored everything; a session without one reads as push-ups.
- `pupg:settings:v1` — goal, countdown, rest, sound, haptics, voice, language, reminder, onboarding flag, blocker rate and sites, the exercise (`exerciseId`, default `'pushup'`) and the source chosen for each (`sourceIds: { [exerciseId]: sourceId }`). The older single `sourceId` stays, as the push-up fallback.
- `pupg:program:v1` — `{ level, testReps, startedAt, completedDays: { [day]: timestamp } }` or absent.

The app blocker keeps its state natively, in SharedPreferences, because its service
runs while the app is closed: blocked packages and domains, balance, on/off, countdown on/off, when the service last connected.

## Layout

```
App.js                        providers: safe area, settings, sessions, i18n, blocker
src/
  shell/AppRoot.js            tabs, toasts, onboarding, reminder sync, back button
  screens/
    WorkoutScreen.js          the workout state machine and stage
    ProgramScreen.js          test, level, day list
    ProgressScreen.js         chart, records, achievements, history
    BlockerScreen.js          app blocker: balance, permissions, blocked apps, rate
    SettingsScreen.js         every setting
    OnboardingModal.js        first-run cards
  exercises/exercises.js      the exercise table: sources, fun-time weight, cadence, motion rule (pure)
  program/program.js          level table + day generator (pure)
  achievements/achievements.js  badges derived from history (pure)
  i18n/strings.js             en + vi, checked for key parity
  hooks/
    useRepDetector.js         near/far state machine, debounce + graze guards
    useWorkoutTimer.js        wall-clock elapsed time, pause-aware
    useCountdown.js           wall-clock countdown for get-ready and rest
    useFeedback.js            haptics, cue sounds, spoken count
  blocker/                    blocker rules (pure), native bridge, web stand-in
  pose/                       analysers, landmarks, geometry, camera stages
  sensors/sources.js          detection sources (ai / light / motion / tap)
  sensors/tilt.js             the motion source's tilt rule (pure)
  storage/sessions.js         AsyncStorage read/write
  notifications/reminders.js  daily local notification
  state/                      settings, sessions/program and blocker contexts
  components/                 Button, StatTile, ProgressBar, WeeklyChart, ExercisePicker, …
  utils/                      time, stats, confirm, share
modules/app-blocker/          native Android module: the two watchers, block screen
assets/                       icons, splash, cue sounds (generated by scripts/)
docs/                         GitHub Pages: pose.html, privacy.html
store/                        Play listing, graphics, screenshots, checklist
```

## Scripts

| Script | What |
| --- | --- |
| `npm run verify` | 203 assertions in plain Node: time/streaks/storage, the four pose analysers, the motion source's tilt rule, program/achievements/exercises/strings/blocker rules, and the pose page drift check |
| `npm run build:pose` | regenerate `docs/pose.html` from `src/pose/` |
| `npm run build:sounds` | regenerate the cue WAVs |
| `npm run build:brand` | regenerate icons, splash, notification icon, Play icon and feature graphic (Python + Pillow) |
| `npm run screenshots` | drive a headless Edge/Chrome against `npm run web` and capture 1080×1920 store screenshots in both languages |
| `npm run doctor` | `expo-doctor` |

## Implementation notes

- Timers measure `Date.now()` spans rather than counting ticks: interval callbacks are
  throttled in the background, so a tick-counting timer would silently lose time.
- The tap surface uses raw touch/pointer handlers, not `Pressable`, which was measured
  adding ~69 ms before `onPressIn` — enough to make the detector reject fast reps.
- Every tab stays mounted and is hidden with `display: 'none'`; the tab bar disappears
  during a workout so a stray tap cannot tear the camera down.
- Audio uses `interruptionMode: 'mixWithOthers'` so cues play over the user's music.
- Real body detection needs a person in front of a camera and is not covered by the
  Node suite; the rep logic downstream of the landmarks is.
