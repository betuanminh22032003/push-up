# Hít Đất AI

Hands-free push-up counter for Android (Expo / React Native). Dark, minimal, pure
`StyleSheet`, no navigation library.

Counts reps with the camera, the light sensor or a tap of the nose; runs sets with
a countdown and a rest timer; speaks the count; follows a 6-week program; tracks a
daily goal, streaks, records and achievements; and locks the apps you choose until
push-ups earn you time on them. English and Vietnamese. Everything stays on the
device.

Store material lives in [`store/`](store/): listing copy, icon, feature graphic,
screenshots, and the [release checklist](store/RELEASE-CHECKLIST.md) (Vietnamese).

## Run

```bash
npm install
npm start
```

Then press `a` for Android, `w` for web. `npm run android` / `npm run web` do the same
directly. The AI camera mode needs the pose page online (see below); the other two
modes work anywhere, including the web build.

## Build for Google Play

Builds run on EAS, in the cloud — no Android Studio or JDK locally.

```bash
npm i -g eas-cli && eas login && eas init     # once
npm run build:apk        # installable APK for testing on a phone
npm run build:android    # .aab for Play, versionCode auto-incremented
npm run submit:android   # upload with EAS Submit (needs a Play service account key)
```

`eas.json` holds the profiles. `app.json` blocks the permissions the Expo modules add
by default but the app never uses (`RECORD_AUDIO`, `ACTIVITY_RECOGNITION`, foreground
services), so the manifest asks only for camera and notifications at runtime.

## Features

### Counting

A rep is one complete **down → up** cycle, counted on the way up so the number matches
completed reps, not attempts. Three sources feed the same detector
(`src/sensors/sources.js`):

| Source | Platform | How it works |
| --- | --- | --- |
| `ai` | All | Camera + MediaPipe pose detection. Counts from body position and coaches form. Native runs it in a WebView. |
| `light` | Android | Ambient light sensor. It sits in the same earpiece cutout as the proximity sensor, so covering it is a faithful stand-in. Calibrates on every start. |
| `tap` | All | The screen is the sensor — touch with your nose at the bottom of each rep, release on the way up. |

Two guards protect the sensor and tap paths (`src/hooks/useRepDetector.js`): a dip
must last 80 ms to count, and two reps cannot be closer than 500 ms.

### Workout flow

```
idle → [calibrating] → countdown → active ⇄ paused → rest → countdown → … → saved
```

- **Countdown** (off / 3 / 5 / 10 s) before every set, with ticks, so the phone can
  be put down and the body put in position.
- **Sets and rest.** *Done* ends a set and starts the rest timer. In a free workout
  the next set waits for you; in a program day it starts by itself, with the countdown
  as warning. *Finish workout* saves everything.
- **Voice count** speaks each rep number (expo-speech, in the app language), plus
  "go", "rest", "last set" and "workout complete".
- **Summary** after saving: total, sets, time, and a share button.

### Program (`src/program/program.js`)

A one-set max test picks one of five levels. Each level defines 18 workouts (six weeks
of three), five sets each, whose targets grow per day; the last set is always "at
least N, then max". Rest is 60 s in weeks 1–2, 90 s in 3–4, 120 s in 5–6. The program
is a pure function of `(level, day)`, so only progress is stored.

### Progress

Daily goal with a progress bar on the home screen. Streak of consecutive local days
with reps. Weekly chart, records (best set, best day, longest streak), 17
achievements derived from history (never stored, so they stay honest when a session
is deleted), and the full session list.

### Settings

Daily goal, countdown, rest, sound, vibration, voice, daily reminder (local
notification, inexact alarm — no special permission), language (auto / en / vi),
how-it-works, delete all data, privacy policy link.

## App blocker (Android)

Pick the apps and websites that eat your time; they stay locked until you earn time on
them. Every saved workout credits `reps × rate` of fun time (rate: 30 s, **1 min** by
default, 2 or 5 min per rep). Using a blocked app or site spends the balance second by
second, with a small countdown on top; leaving it, turning the screen off or locking the
phone stops the meter. At zero it is covered by a block screen whose buttons lead to a
workout or the home screen — never back into the app.

Reps count only once the blocker is set up (switched on, at least one app or site), so
hours cannot be banked before it bites, and a discarded workout earns nothing, exactly as
it records nothing.

What it covers:

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
- **Its own process.** The service, the block screen and the state run in `:blocker`,
  apart from the React Native process (JS engine, camera, WebView). That big process is
  what the system reclaims for memory and what a JS crash kills; sharing it, the service
  died too, and realme then declined to restart it ("on in settings, not running"). The
  JS module reaches the state through a `ContentProvider` in that process, and every
  entry point of the service is wrapped so no exception can crash it.
- **Being stopped by the phone anyway.** A force-stop makes Android remove the service
  from the enabled list; a kill without restart leaves it on but not running. The tab
  tells both apart from "never switched on", explains the fix, flags battery
  optimisation and opens the maker's auto-launch screen (realme/OPPO, Xiaomi, vivo,
  Huawei, Asus) directly; the home chip turns into a warning.

It is a **local Expo module**, [`modules/app-blocker`](modules/app-blocker/), autolinked
from `modules/`:

| File | Role |
| --- | --- |
| `BlockerEngine.kt` | every decision (meter, block, wait, escalate, close picture-in-picture), plain Kotlin with JUnit tests |
| `BlockerService.kt` | `AccessibilityService`: looks at the screen on window events and on the heartbeat, reads browser address bars, carries out the engine's commands, shows the countdown as an accessibility overlay (no "draw over apps" permission) |
| `BlockActivity.kt` | the block screen, built in code so it appears even when the JS is not loaded; Back goes home |
| `BlockerStore.kt` | the one copy of the state, in the `:blocker` process, persisted in SharedPreferences |
| `BlockerProvider.kt` | `ContentProvider` in `:blocker`: the JS module's only way to the state |
| `Sites.kt` | address-bar text to host, domain matching; JUnit-tested |
| `Packages.kt` | launchable apps and icons for the picker, browsers, the never-blocked set (this app, launcher, Settings, dialer) |
| `AppBlockerModule.kt` | the JS API (async, since it crosses processes), used through `src/state/BlockerContext.js` |

The JUnit tests (`android/src/test`) need no device. Android Studio runs them with the
module's `testDebugUnitTest`; without an Android SDK, compile `BlockerEngine.kt`,
`Sites.kt` and the two test files with `kotlinc` against JUnit 4 and run
`org.junit.runner.JUnitCore`.

Custom native code does not run in **Expo Go**: there the module is absent
(`requireOptionalNativeModule` returns null) and the tab explains why. Use a build —
`npm run build:apk`. On Android 13+, a sideloaded APK must first be given *App info →
⋮ → Allow restricted settings* before the accessibility service can be switched on;
Play installs are exempt. The dev web build uses an in-memory stand-in
(`src/blocker/demoBlocker.js`) so the screen can be laid out and screenshotted.

Google Play allows accessibility services outside accessibility tools only with a
prominent disclosure and consent before the user is sent to settings (the tab shows
one), a privacy-policy section, and the Accessibility API declaration in Play Console —
text in [`store/listing.md`](store/listing.md).

## AI camera detection

Counts push-ups from body position and judges form on every rep.

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
`npm run build:pose` inlines `geometry.js`, `landmarks.js` and `pushupAnalyzer.js`
into `src/pose/web/pose.template.html` and writes `docs/pose.html`, so the phone and
the test suite run byte-identical rules. `npm run verify` fails if the page has
drifted.

The page must be served over **HTTPS** (`getUserMedia` needs a secure context), so it
is published from `docs/` by GitHub Pages: **Settings → Pages → Deploy from a branch →
`master` / `/docs`**. The URL is in `src/config.js`. `docs/privacy.html` is published
the same way.

## Storage

AsyncStorage, three keys, all read defensively (corrupt data → empty, never a crash):

- `pupg:sessions:v1` — `[{ id, timestamp, totalReps, durationSeconds, sourceId, sets?, restSeconds?, program? }]`, newest first. A single-set workout is stored without `sets`, exactly as the first version stored everything.
- `pupg:settings:v1` — goal, countdown, rest, sound, haptics, voice, language, reminder, onboarding flag, source.
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
    BlockerScreen.js          app blocker: balance, permission, blocked apps, rate
    SettingsScreen.js         every setting
    OnboardingModal.js        first-run cards
  program/program.js          level table + day generator (pure)
  achievements/achievements.js  badges derived from history (pure)
  i18n/strings.js             en + vi, checked for key parity
  hooks/
    useRepDetector.js         near/far state machine, debounce + graze guards
    useWorkoutTimer.js        wall-clock elapsed time, pause-aware
    useCountdown.js           wall-clock countdown for get-ready and rest
    useFeedback.js            haptics, cue sounds, spoken count
  blocker/                    blocker rules (pure), native bridge, web stand-in
  pose/                       analyser, landmarks, geometry, camera stages
  sensors/sources.js          detection sources (ai / light / tap)
  storage/sessions.js         AsyncStorage read/write
  notifications/reminders.js  daily local notification
  state/                      settings, sessions/program and blocker contexts
  components/                 Button, StatTile, ProgressBar, WeeklyChart, …
  utils/                      time, stats, confirm, share
modules/app-blocker/          native Android module: accessibility service, block screen
assets/                       icons, splash, cue sounds (generated by scripts/)
docs/                         GitHub Pages: pose.html, privacy.html
store/                        Play listing, graphics, screenshots, checklist
```

## Scripts

| Script | What |
| --- | --- |
| `npm run verify` | 95 assertions in plain Node: time/streaks/storage, pose analyser, program/achievements/strings/blocker rules, and the pose page drift check |
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
