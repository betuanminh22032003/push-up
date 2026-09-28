/**
 * Every user-facing string, in English and Vietnamese.
 *
 * Keys are flat and namespaced by screen. `{name}` placeholders are filled by
 * `t(key, params)`. The Node suite checks that both languages define exactly
 * the same keys, so a string added to one cannot silently fall back in the
 * other.
 */

export const LANGUAGES = ['en', 'vi'];

/** BCP 47 tag handed to text-to-speech for each language. */
export const SPEECH_TAGS = { en: 'en-US', vi: 'vi-VN' };

const en = {
  // --- tabs ---------------------------------------------------------------
  'tab.workout': 'Workout',
  'tab.program': 'Program',
  'tab.progress': 'Progress',
  'tab.blocker': 'Blocker',
  'tab.settings': 'Settings',

  // --- common -------------------------------------------------------------
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.done': 'Done',
  'common.day': 'day',
  'common.days': 'days',
  'common.reps': 'reps',
  'common.sets': 'sets',
  'common.seconds': '{n}s',
  'common.off': 'Off',

  // --- amounts of time (earned, on offer) ---------------------------------
  'time.sec': '{n} sec',
  'time.min': '{n} min',
  'time.minSec': '{m} min {s} sec',

  // --- home stats ---------------------------------------------------------
  'stat.total': 'Total',
  'stat.today': 'Today',
  'stat.streak': 'Streak',
  'stat.goal': 'Goal {goal}',

  // --- workout status -----------------------------------------------------
  'status.idle': 'READY',
  'status.calibrating': 'CALIBRATING',
  'status.countdown': 'GET READY',
  'status.active': 'ACTIVE',
  'status.paused': 'PAUSED',
  'status.rest': 'REST',

  // --- workout copy -------------------------------------------------------
  'workout.free': 'Free workout',
  'workout.test': 'Max test',
  'workout.testHint': 'One set. As many push-ups as you can with good form, then press Done.',
  'workout.day': 'Day {day} · Week {week}',
  'workout.set': 'Set {n}/{total}',
  'workout.target': 'Target {n}',
  'workout.maxSet': 'At least {n}, then as many as you can',
  'workout.setDone': 'Set {n} done · {reps} reps',
  'workout.restOver': 'Rest over',
  'workout.nextIn': 'Next set starts in',
  'workout.restHint': 'Take a breath. Next set when the timer ends or when you are ready.',
  'workout.tapHold': 'HOLD, THEN RELEASE',
  'workout.tapTouch': 'TOUCH TO COUNT',
  'workout.summaryTitle': 'Workout saved',
  'workout.summaryTest': 'Test complete',
  'workout.summaryDay': 'Day {day} complete',
  'workout.earned': '+{time} fun time',

  // --- buttons ------------------------------------------------------------
  'btn.start': 'Start',
  'btn.startDay': 'Start day {day}',
  'btn.startTest': 'Start test',
  'btn.calibrating': 'Calibrating...',
  'btn.pause': 'Pause',
  'btn.resume': 'Resume',
  'btn.done': 'Done',
  'btn.nextSet': 'Next set',
  'btn.finishWorkout': 'Finish workout',
  'btn.discard': 'Discard workout',
  'btn.skip': 'Skip',
  'btn.share': 'Share',
  'btn.cancelPlan': 'Back to free workout',
  'btn.ok': 'OK',

  // --- coaching (from the pose analyser) ----------------------------------
  'coach.lostTracking': 'Step into frame',
  'coach.notHorizontal': 'Get into a push-up position',
  'coach.bodySag': 'Keep your body straight',
  'coach.shallow': 'Go lower',

  // --- detection sources --------------------------------------------------
  'source.ai': 'AI camera',
  'source.ai.hint':
    'Prop the phone up so your whole body is in frame from the side, then push up. Form is checked on every rep.',
  'source.light': 'Sensor',
  'source.light.hint':
    'Phone on the floor, screen up. Cover the sensor at the top of the phone at the bottom of each rep.',
  'source.tap': 'Tap',
  'source.tap.hint':
    'Phone on the floor, screen up. Touch the screen with your nose at the bottom of each rep, then release.',

  // --- pose stage (camera) ------------------------------------------------
  'pose.starting': 'Starting camera',
  'pose.checkingPermission': 'Checking camera permission…',
  'pose.asking': 'Asking for the camera…',
  'pose.needCamera': 'Camera access needed',
  'pose.allowCamera': 'Allow camera access to count push-ups with the camera.',
  'pose.denied':
    'Camera access was denied. Enable it for this app in your device settings, or switch to Sensor or Tap mode.',
  'pose.loadingModel': 'Loading the model… you can frame yourself now',
  'pose.problem': 'Detector problem',
  'pose.loadFailed': 'Could not load the detector ({reason}). AI camera needs an internet connection the first time.',
  'pose.httpFailed': 'Detector page returned HTTP {code}. Try again in a moment.',
  'pose.viewCrashed': 'The camera view stopped unexpectedly. End the set and start again.',

  // --- notices ------------------------------------------------------------
  'notice.nothingSaved': 'No reps counted, nothing saved.',
  'notice.saved': 'Saved {reps} reps in {time}.',
  'notice.goalReached': 'Daily goal reached! 🎯',
  'notice.levelAssigned': 'Level {level} · your 6-week program is ready.',
  'notice.achievement': 'Achievement unlocked: {name}',
  'notice.calibrated': 'Calibrated at {lux} lx.',
  'notice.tooDark': 'Room is too dark to detect cover ({lux} lx). Turn on a light or switch to Tap mode.',
  'notice.noLight': 'No readings from the light sensor.',
  'notice.earned': '+{time} of fun time.',

  // --- confirmations ------------------------------------------------------
  'confirm.discardTitle': 'Discard this workout?',
  'confirm.discardBody': '{reps} reps will not be saved.',
  'confirm.keep': 'Keep going',
  'confirm.discard': 'Discard',
  'confirm.deleteTitle': 'Delete workout?',
  'confirm.deleteBody': '{reps} reps will be removed from your history.',
  'confirm.delete': 'Delete',
  'confirm.clearTitle': 'Delete all data?',
  'confirm.clearBody':
    'Every workout, your program progress, your settings and your fun time will be permanently deleted.',
  'confirm.deleteAll': 'Delete all',
  'confirm.restartTitle': 'Restart the program?',
  'confirm.restartBody': 'Day progress is reset. Your workout history is kept.',
  'confirm.restart': 'Restart',

  // --- share --------------------------------------------------------------
  'share.text': 'I just did {reps} push-ups in {time} with Hít Đất AI 💪',
  'share.sets': ' ({sets} sets)',

  // --- program ------------------------------------------------------------
  'program.title': '6-Week Program',
  'program.intro':
    '18 workouts, three a week. Five sets each, sized to your level, with the last set taken to your max.',
  'program.testTitle': 'Find your level',
  'program.testBody':
    'Do one set of as many push-ups as you can. That sets the targets for every day of the program.',
  'program.takeTest': 'Take the test',
  'program.level': 'Level {level}',
  'program.testResult': 'Test: {reps} reps',
  'program.progress': '{done} of {total} days',
  'program.week': 'Week {week}',
  'program.day': 'Day {day}',
  'program.rest': 'rest {seconds}s',
  'program.max': 'max',
  'program.next': 'Next',
  'program.done': 'Done',
  'program.complete': 'Program complete! 🎓',
  'program.completeBody': 'Retake the test to start a harder cycle.',
  'program.retest': 'Retake test',
  'program.restart': 'Restart program',
  'program.nextUp': 'Next up',
  'program.sets': '{sets} sets · {reps} reps',

  // --- progress -----------------------------------------------------------
  'progress.title': 'Progress',
  'progress.lastDays': 'Last 7 days',
  'progress.records': 'Records',
  'progress.bestSet': 'Best set',
  'progress.bestDay': 'Best day',
  'progress.longestStreak': 'Longest streak',
  'progress.workouts': 'Workouts',
  'progress.totalTime': 'Total time',
  'progress.achievements': 'Achievements',
  'progress.unlocked': '{n} of {total}',
  'progress.history': 'History',
  'progress.empty': 'No workouts yet',
  'progress.emptyBody': 'Finish a workout and it will show up here.',
  'progress.weekTotal': '{reps} reps this week',

  // --- session rows -------------------------------------------------------
  'session.today': 'Today',
  'session.yesterday': 'Yesterday',
  'session.repsPerMin': 'reps/min',
  'session.sets': '{n} sets',
  'session.programDay': 'Day {day}',
  'session.test': 'Test',
  'session.delete': 'Delete workout of {reps} reps',

  // --- weekdays (Sunday first, as Date#getDay) ----------------------------
  'weekday.0': 'Sun',
  'weekday.1': 'Mon',
  'weekday.2': 'Tue',
  'weekday.3': 'Wed',
  'weekday.4': 'Thu',
  'weekday.5': 'Fri',
  'weekday.6': 'Sat',

  // --- achievements -------------------------------------------------------
  'ach.first_workout.title': 'First workout',
  'ach.first_workout.body': 'Finish your first workout',
  'ach.reps_100.title': 'Century',
  'ach.reps_100.body': '100 push-ups in total',
  'ach.reps_500.title': 'On fire',
  'ach.reps_500.body': '500 push-ups in total',
  'ach.reps_1000.title': 'Thousand',
  'ach.reps_1000.body': '1,000 push-ups in total',
  'ach.reps_5000.title': 'Machine',
  'ach.reps_5000.body': '5,000 push-ups in total',
  'ach.set_25.title': 'Solid set',
  'ach.set_25.body': '25 push-ups in one set',
  'ach.set_50.title': 'Half century',
  'ach.set_50.body': '50 push-ups in one set',
  'ach.set_100.title': 'The hundred',
  'ach.set_100.body': '100 push-ups in one set',
  'ach.streak_3.title': 'Habit forming',
  'ach.streak_3.body': '3 days in a row',
  'ach.streak_7.title': 'Full week',
  'ach.streak_7.body': '7 days in a row',
  'ach.streak_30.title': 'Iron month',
  'ach.streak_30.body': '30 days in a row',
  'ach.workouts_10.title': 'Regular',
  'ach.workouts_10.body': '10 workouts',
  'ach.workouts_50.title': 'Veteran',
  'ach.workouts_50.body': '50 workouts',
  'ach.early_bird.title': 'Early bird',
  'ach.early_bird.body': 'A workout before 7 am',
  'ach.night_owl.title': 'Night owl',
  'ach.night_owl.body': 'A workout after 10 pm',
  'ach.program_day.title': 'Day one',
  'ach.program_day.body': 'Complete a program day',
  'ach.program_done.title': 'Graduate',
  'ach.program_done.body': 'Complete the 6-week program',

  // --- app blocker --------------------------------------------------------
  'blocker.title': 'App blocker',
  'blocker.subtitle':
    'Lock the apps and sites that eat your time. They open again once you earn time: every push-up buys {rate}.',
  'blocker.balance': 'Fun time left',
  'blocker.earn': 'Do push-ups to earn more',
  'blocker.statusOn': 'Blocking {apps}',
  'blocker.statusOnApps': 'Blocking {apps}, without Accessibility',
  'blocker.appOne': '1 app',
  'blocker.appMany': '{n} apps',
  'blocker.siteOne': '1 site',
  'blocker.siteMany': '{n} sites',
  'blocker.and': 'and',
  'blocker.statusOff': 'Blocking is off',
  'blocker.statusNoApps': 'Choose at least one app or site to block',
  'blocker.statusSwitchedOff': 'Blocking stopped: Accessibility was switched off',
  'blocker.statusStalled': 'Blocking stopped: the phone stopped the blocker',
  'blocker.statusNeedsPermission': 'Allow the two permissions below to start blocking',
  'blocker.statusSitesNeedA11y': 'Websites can only be blocked with Accessibility on',
  'blocker.statusStarting': 'Starting the blocker…',
  'blocker.alertTitle': 'Blocking is not running',
  'blocker.alertSwitchedOff':
    'Accessibility is off: you switched it off, or the phone closed Hít Đất AI in the background (realme, OPPO and Xiaomi phones do this). Turn it back on, then follow "Keep blocking running" below so it stays on.',
  'blocker.alertOrUsage':
    'Or block without Accessibility, so banking apps keep working: allow "See which app is open" and "Display over other apps" below.',
  'blocker.alertStalled':
    'The permission is on, but the phone stopped the service and did not let it restart. In Accessibility, open Hít Đất AI, switch it off and on again.',
  'blocker.alertWatcher':
    'Both permissions are on, but the phone stopped the blocker. Allow Hít Đất AI to auto-launch and turn battery optimisation off for it, then open the app again.',
  'blocker.alertPrevent':
    'So it does not happen again, allow Hít Đất AI to auto-launch and lock it in Recents (steps below).',
  'blocker.alertTurnOn': 'Turn it back on',
  'blocker.alertUseUsage': 'Block without Accessibility',
  'blocker.alertOpen': 'Open Accessibility',
  'blocker.sectionBlocking': 'Blocking',
  'blocker.toggle': 'Block apps',
  'blocker.waysNote':
    'The first two are enough to block apps, and banking apps keep working. Accessibility is only needed to block websites too.',
  'blocker.usage': 'See which app is open',
  'blocker.usageOn': 'On (usage access).',
  'blocker.usageOff':
    'Usage access, to notice when a blocked app opens. Only the app is checked, and banking apps are not affected.',
  'blocker.overlay': 'Display over other apps',
  'blocker.overlayOn': 'On.',
  'blocker.overlayOff': 'To put the block screen and the countdown over a blocked app.',
  'blocker.permission': 'Accessibility (optional)',
  'blocker.permissionOn':
    'On: websites are blocked too. If a banking app refuses to open, switch it off; apps stay blocked.',
  'blocker.permissionOnOnly':
    'On. If a banking app refuses to open, allow the two permissions above first, then switch this off.',
  'blocker.permissionOff':
    'Also blocks websites in browsers. Many banking apps will not open while any app has Accessibility on.',
  'blocker.permissionButton': 'Turn on',
  'blocker.permissionManage': 'Settings',
  'blocker.restrictedHint':
    'Greyed out, or Android says "Restricted setting"? Open app info, tap ⋮ in the top corner, choose "Allow restricted settings", then try again.',
  'blocker.openAppInfo': 'Open app info',
  'blocker.battery': 'Battery optimisation',
  'blocker.batteryOn':
    'On for this app, so the phone may stop blocking in the background. Turn it off for Hít Đất AI.',
  'blocker.batteryButton': 'Fix',
  'blocker.sectionApps': 'Blocked apps ({n})',
  'blocker.noApps': 'No apps chosen yet.',
  'blocker.addApps': 'Choose apps',
  'blocker.editApps': 'Edit the list',
  'blocker.remove': 'Unblock {app}',
  'blocker.sectionSites': 'Blocked websites ({n})',
  'blocker.sitesBody':
    "In a browser (Chrome, Cốc Cốc, Edge, Samsung Internet…) these are blocked too. The chosen apps' own sites are included automatically.",
  'blocker.sitesNeedA11y': 'Websites are only blocked while Accessibility is on.',
  'blocker.siteAuto': 'with the app',
  'blocker.sitePlaceholder': 'e.g. vnexpress.net',
  'blocker.siteAdd': 'Add',
  'blocker.siteInvalid': 'That is not a website address. Try something like vnexpress.net.',
  'blocker.removeSite': 'Unblock {site}',
  'blocker.sectionRate': 'Earning',
  'blocker.rate': 'Each push-up earns',
  'blocker.timer': 'Countdown on screen',
  'blocker.timerBody': 'A small timer over a blocked app while your time runs.',
  'blocker.keepTitle': 'Keep blocking running',
  'blocker.keepBody':
    'Some phones (realme, OPPO, Xiaomi, vivo…) close apps in the background, which stops blocking and can switch Accessibility off, so it works one moment and not the next. To stop that:',
  'blocker.keep1':
    'Lock Hít Đất AI in Recents: open the recent apps, then pull its card down or open its menu and choose Lock.',
  'blocker.keep2':
    'Allow auto-launch (button below). Without it the phone will not restart the blocker after closing it.',
  'blocker.keep3': 'App info → Battery: allow background activity and turn optimisation off.',
  'blocker.keep4': 'Do not force-stop the app or clear it with a cleaner.',
  'blocker.keepAutostart': 'Auto-launch',
  'blocker.keepAppInfo': 'App info',
  'blocker.keepBattery': 'Battery optimisation',
  'blocker.howTitle': 'How it works',
  'blocker.howBody':
    'Finish a workout and its reps turn into fun time. Open a blocked app or site and the time counts down while it is on screen, split screen and floating windows included; it pauses when you leave it or lock the phone. At zero it is covered until you do more push-ups. You can switch blocking off here at any time.',
  'blocker.privacy':
    'The blocker only checks which app is open and, with Accessibility on, the domain of the page in a browser. It never reads anything else on screen or what you type, and nothing leaves your phone.',
  'blocker.androidOnly': 'The app blocker is only available on Android.',
  'blocker.expoGo':
    'Expo Go cannot run the app blocker, because it needs native code. Install a build of the app instead (npm run build:apk).',
  'blocker.needsUpdate': 'This installation was built without the app blocker. Install the latest version.',
  'blocker.chipA11y': '{time} of fun time left. Open the app blocker.',
  'blocker.chipOff': 'Blocking off',
  'blocker.disclosureTitle': 'Allow accessibility access?',
  'blocker.disclosureBody':
    "To block websites too, Hít Đất AI uses Android's Accessibility Service to see which app is open on your screen. Note that many banking apps refuse to open while any app has it on.",
  'blocker.disclosure1':
    'It only checks the name of the app in front and, in a browser, the domain of the page. It does not read anything else on the screen, your messages or what you type.',
  'blocker.disclosure2': 'Nothing is recorded as history, and nothing leaves your phone.',
  'blocker.disclosure3':
    'You can turn the permission off at any time in Settings › Accessibility, and switch blocking off right here.',
  'blocker.disclosureSteps':
    'On the next screen, find the entry with "Hít Đất AI" in its name (often under "Downloaded apps" or "Installed apps") and switch it on.',
  'blocker.disclosureAgree': 'Agree and open Settings',
  'blocker.disclosureLater': 'Not now',
  'blocker.usageDisclosureTitle': 'Block without Accessibility?',
  'blocker.usageDisclosureBody':
    'Instead of Accessibility, Hít Đất AI can use two other Android permissions, which banking apps generally do not object to.',
  'blocker.usageDisclosure1':
    '"Usage access" tells it which app is in front. Only the app is checked, and no history is kept.',
  'blocker.usageDisclosure2':
    '"Display over other apps" lets it put the block screen and the countdown over a blocked app.',
  'blocker.usageDisclosure3':
    'A notification stays while blocking is on. Websites are not blocked this way, and nothing leaves your phone.',
  'blocker.usageDisclosureSteps':
    'On the next screen, find "Hít Đất AI" and switch it on, then come back here for the other permission.',

  // --- app picker ---------------------------------------------------------
  'picker.title': 'Choose apps to block',
  'picker.search': 'Search apps',
  'picker.loading': 'Loading your apps…',
  'picker.suggested': 'Suggested',
  'picker.all': 'All apps',
  'picker.empty': 'No app matches "{query}".',
  'picker.none': 'No apps found.',
  'picker.save': 'Save ({n})',

  // --- block screen and countdown (native; {app} is filled in on the phone)
  'native.blockTitle': '{app} is blocked',
  'native.timeUpTitle': "Time's up for {app}",
  'native.blockBody': "You're out of fun time. Every push-up earns {rate}: do a few, then come back.",
  'native.earnButton': 'Do push-ups now',
  'native.homeButton': 'Go to the home screen',
  'native.lowTime': 'Less than a minute of fun time left',
  'native.blockedToast': '{app} is blocked. Earn time with push-ups.',
  'native.watchTitle': 'Blocking apps',
  'native.watchBody': 'Every push-up earns more fun time.',
  'native.watchChannel': 'App blocker',

  // --- settings -----------------------------------------------------------
  'settings.title': 'Settings',
  'settings.workout': 'Workout',
  'settings.feedback': 'Feedback',
  'settings.reminder': 'Reminder',
  'settings.general': 'General',
  'settings.data': 'Data',
  'settings.about': 'About',
  'settings.dailyGoal': 'Daily goal',
  'settings.dailyGoalBody': 'Reps per day. Today counts toward it in every mode.',
  'settings.countdown': 'Countdown before a set',
  'settings.countdownBody': 'Time to get into position after pressing Start.',
  'settings.rest': 'Rest between sets',
  'settings.restBody': 'Free workouts only. The program sets its own rest.',
  'settings.sound': 'Sound',
  'settings.haptics': 'Vibration',
  'settings.voice': 'Voice count',
  'settings.voiceBody': 'Says each rep number out loud, so you never have to look at the screen.',
  'settings.reminderToggle': 'Daily reminder',
  'settings.reminderBody': 'A notification at the same time every day.',
  'settings.reminderTime': 'Time',
  'settings.reminderDenied': 'Notifications are blocked for this app. Enable them in system settings.',
  'settings.reminderWeb': 'Reminders are only available in the mobile app.',
  'settings.reminderExpoGo': 'Reminders are not available in Expo Go on Android. Use a development build or the store version.',
  'settings.language': 'Language',
  'settings.langAuto': 'Auto',
  'settings.langEn': 'English',
  'settings.langVi': 'Tiếng Việt',
  'settings.howItWorks': 'How it works',
  'settings.clearAll': 'Delete all data',
  'settings.clearAllBody': 'Workouts, program progress, settings and fun time.',
  'settings.privacy': 'Privacy policy',
  'settings.privacyNote': 'Everything stays on your phone. No account, no ads, no tracking.',
  'settings.version': 'Version {version}',
  'settings.sourceCode': 'Source code',

  // --- reminder notification ----------------------------------------------
  'reminder.title': 'Time for push-ups 💪',
  'reminder.body': 'Keep your streak alive. One set is enough.',

  // --- onboarding ---------------------------------------------------------
  'onboarding.title': 'Welcome to Hít Đất AI',
  'onboarding.s1.title': 'Hands-free counting',
  'onboarding.s1.body':
    'Prop the phone up to your side so your whole body is in frame: the AI camera counts every rep and coaches your form. No camera? Put the phone on the floor and use the sensor, or tap the screen with your nose.',
  'onboarding.s2.title': 'Sets, rest and voice',
  'onboarding.s2.body':
    'Every set starts with a countdown so you can get into position, and ends with a rest timer. Turn on voice count and hear the number instead of looking.',
  'onboarding.s3.title': 'Program, goal, streak',
  'onboarding.s3.body':
    'Take the max test and follow the 6-week program, or just hit your daily goal. Every day with reps extends your streak.',
  'onboarding.cta': "Let's go",

  // --- voice --------------------------------------------------------------
  'voice.go': 'Go',
  'voice.rest': 'Rest',
  'voice.lastSet': 'Last set',
  'voice.setDone': 'Set complete',
  'voice.done': 'Workout complete',
};

const vi = {
  'tab.workout': 'Tập',
  'tab.program': 'Chương trình',
  'tab.progress': 'Tiến độ',
  'tab.blocker': 'Chặn app',
  'tab.settings': 'Cài đặt',

  'common.cancel': 'Huỷ',
  'common.close': 'Đóng',
  'common.done': 'Xong',
  'common.day': 'ngày',
  'common.days': 'ngày',
  'common.reps': 'cái',
  'common.sets': 'set',
  'common.seconds': '{n} giây',
  'common.off': 'Tắt',

  'time.sec': '{n} giây',
  'time.min': '{n} phút',
  'time.minSec': '{m} phút {s} giây',

  'stat.total': 'Tổng',
  'stat.today': 'Hôm nay',
  'stat.streak': 'Chuỗi ngày',
  'stat.goal': 'Mục tiêu {goal}',

  'status.idle': 'SẴN SÀNG',
  'status.calibrating': 'HIỆU CHỈNH',
  'status.countdown': 'CHUẨN BỊ',
  'status.active': 'ĐANG TẬP',
  'status.paused': 'TẠM DỪNG',
  'status.rest': 'NGHỈ',

  'workout.free': 'Tập tự do',
  'workout.test': 'Kiểm tra sức',
  'workout.testHint': 'Một set. Hít đất nhiều nhất có thể với tư thế đúng, rồi bấm Xong.',
  'workout.day': 'Ngày {day} · Tuần {week}',
  'workout.set': 'Set {n}/{total}',
  'workout.target': 'Mục tiêu {n}',
  'workout.maxSet': 'Ít nhất {n}, rồi cố hết sức',
  'workout.setDone': 'Xong set {n} · {reps} cái',
  'workout.restOver': 'Hết giờ nghỉ',
  'workout.nextIn': 'Set tiếp theo bắt đầu sau',
  'workout.restHint': 'Thở đều. Set tiếp theo khi hết giờ hoặc khi bạn sẵn sàng.',
  'workout.tapHold': 'GIỮ, RỒI THẢ',
  'workout.tapTouch': 'CHẠM ĐỂ ĐẾM',
  'workout.summaryTitle': 'Đã lưu buổi tập',
  'workout.summaryTest': 'Kiểm tra xong',
  'workout.summaryDay': 'Hoàn thành ngày {day}',
  'workout.earned': '+{time} giải trí',

  'btn.start': 'Bắt đầu',
  'btn.startDay': 'Bắt đầu ngày {day}',
  'btn.startTest': 'Bắt đầu kiểm tra',
  'btn.calibrating': 'Đang hiệu chỉnh...',
  'btn.pause': 'Tạm dừng',
  'btn.resume': 'Tiếp tục',
  'btn.done': 'Xong',
  'btn.nextSet': 'Set tiếp',
  'btn.finishWorkout': 'Kết thúc buổi tập',
  'btn.discard': 'Bỏ buổi tập',
  'btn.skip': 'Bỏ qua',
  'btn.share': 'Chia sẻ',
  'btn.cancelPlan': 'Về tập tự do',
  'btn.ok': 'OK',

  'coach.lostTracking': 'Bước vào khung hình',
  'coach.notHorizontal': 'Vào tư thế hít đất',
  'coach.bodySag': 'Giữ thẳng người',
  'coach.shallow': 'Xuống thấp hơn',

  'source.ai': 'Camera AI',
  'source.ai.hint':
    'Dựng điện thoại để thấy toàn thân bạn từ bên hông, rồi hít đất. Tư thế được kiểm tra ở mỗi cái.',
  'source.light': 'Cảm biến',
  'source.light.hint':
    'Đặt điện thoại trên sàn, màn hình hướng lên. Che cảm biến ở đỉnh máy khi xuống thấp nhất mỗi cái.',
  'source.tap': 'Chạm',
  'source.tap.hint':
    'Đặt điện thoại trên sàn, màn hình hướng lên. Chạm mũi vào màn hình khi xuống thấp nhất, rồi nhấc lên.',

  'pose.starting': 'Đang bật camera',
  'pose.checkingPermission': 'Đang kiểm tra quyền camera…',
  'pose.asking': 'Đang xin quyền camera…',
  'pose.needCamera': 'Cần quyền camera',
  'pose.allowCamera': 'Cho phép dùng camera để đếm hít đất bằng camera.',
  'pose.denied':
    'Quyền camera đã bị từ chối. Bật lại trong cài đặt của máy, hoặc chuyển sang chế độ Cảm biến hoặc Chạm.',
  'pose.loadingModel': 'Đang tải mô hình… bạn có thể vào khung hình',
  'pose.problem': 'Lỗi nhận diện',
  'pose.loadFailed': 'Không tải được bộ nhận diện ({reason}). Camera AI cần internet ở lần đầu.',
  'pose.httpFailed': 'Trang nhận diện trả về HTTP {code}. Thử lại sau ít phút.',
  'pose.viewCrashed': 'Khung camera bị dừng đột ngột. Hãy kết thúc hiệp và bắt đầu lại.',

  'notice.nothingSaved': 'Không đếm được cái nào, không lưu.',
  'notice.saved': 'Đã lưu {reps} cái trong {time}.',
  'notice.goalReached': 'Đạt mục tiêu hôm nay! 🎯',
  'notice.levelAssigned': 'Cấp {level} · chương trình 6 tuần đã sẵn sàng.',
  'notice.achievement': 'Mở khoá thành tích: {name}',
  'notice.calibrated': 'Đã hiệu chỉnh ở {lux} lx.',
  'notice.tooDark': 'Phòng quá tối để nhận diện ({lux} lx). Bật đèn hoặc chuyển sang chế độ Chạm.',
  'notice.noLight': 'Không đọc được cảm biến ánh sáng.',
  'notice.earned': '+{time} giải trí.',

  'confirm.discardTitle': 'Bỏ buổi tập này?',
  'confirm.discardBody': '{reps} cái sẽ không được lưu.',
  'confirm.keep': 'Tập tiếp',
  'confirm.discard': 'Bỏ',
  'confirm.deleteTitle': 'Xoá buổi tập?',
  'confirm.deleteBody': '{reps} cái sẽ bị xoá khỏi lịch sử.',
  'confirm.delete': 'Xoá',
  'confirm.clearTitle': 'Xoá toàn bộ dữ liệu?',
  'confirm.clearBody':
    'Toàn bộ lịch sử, tiến độ chương trình, cài đặt và thời gian giải trí sẽ bị xoá vĩnh viễn.',
  'confirm.deleteAll': 'Xoá tất cả',
  'confirm.restartTitle': 'Bắt đầu lại chương trình?',
  'confirm.restartBody': 'Tiến độ ngày sẽ được đặt lại. Lịch sử tập vẫn giữ nguyên.',
  'confirm.restart': 'Bắt đầu lại',

  'share.text': 'Tôi vừa hít đất {reps} cái trong {time} với Hít Đất AI 💪',
  'share.sets': ' ({sets} set)',

  'program.title': 'Chương trình 6 tuần',
  'program.intro':
    '18 buổi tập, 3 buổi mỗi tuần. Mỗi buổi 5 set theo đúng sức bạn, set cuối cố hết mức.',
  'program.testTitle': 'Xác định cấp độ',
  'program.testBody':
    'Làm một set hít đất nhiều nhất có thể. Kết quả quyết định mục tiêu cho từng ngày trong chương trình.',
  'program.takeTest': 'Làm bài kiểm tra',
  'program.level': 'Cấp {level}',
  'program.testResult': 'Kiểm tra: {reps} cái',
  'program.progress': '{done}/{total} ngày',
  'program.week': 'Tuần {week}',
  'program.day': 'Ngày {day}',
  'program.rest': 'nghỉ {seconds}s',
  'program.max': 'tối đa',
  'program.next': 'Tiếp theo',
  'program.done': 'Xong',
  'program.complete': 'Hoàn thành chương trình! 🎓',
  'program.completeBody': 'Làm lại bài kiểm tra để bắt đầu vòng khó hơn.',
  'program.retest': 'Kiểm tra lại',
  'program.restart': 'Bắt đầu lại',
  'program.nextUp': 'Buổi tiếp theo',
  'program.sets': '{sets} set · {reps} cái',

  'progress.title': 'Tiến độ',
  'progress.lastDays': '7 ngày qua',
  'progress.records': 'Kỷ lục',
  'progress.bestSet': 'Set tốt nhất',
  'progress.bestDay': 'Ngày tốt nhất',
  'progress.longestStreak': 'Chuỗi dài nhất',
  'progress.workouts': 'Buổi tập',
  'progress.totalTime': 'Tổng thời gian',
  'progress.achievements': 'Thành tích',
  'progress.unlocked': '{n}/{total}',
  'progress.history': 'Lịch sử',
  'progress.empty': 'Chưa có buổi tập nào',
  'progress.emptyBody': 'Tập xong một buổi, nó sẽ hiện ở đây.',
  'progress.weekTotal': '{reps} cái tuần này',

  'session.today': 'Hôm nay',
  'session.yesterday': 'Hôm qua',
  'session.repsPerMin': 'cái/phút',
  'session.sets': '{n} set',
  'session.programDay': 'Ngày {day}',
  'session.test': 'Kiểm tra',
  'session.delete': 'Xoá buổi tập {reps} cái',

  'weekday.0': 'CN',
  'weekday.1': 'T2',
  'weekday.2': 'T3',
  'weekday.3': 'T4',
  'weekday.4': 'T5',
  'weekday.5': 'T6',
  'weekday.6': 'T7',

  'ach.first_workout.title': 'Buổi đầu tiên',
  'ach.first_workout.body': 'Hoàn thành buổi tập đầu tiên',
  'ach.reps_100.title': 'Một trăm',
  'ach.reps_100.body': 'Tổng 100 cái',
  'ach.reps_500.title': 'Bốc lửa',
  'ach.reps_500.body': 'Tổng 500 cái',
  'ach.reps_1000.title': 'Một nghìn',
  'ach.reps_1000.body': 'Tổng 1.000 cái',
  'ach.reps_5000.title': 'Cỗ máy',
  'ach.reps_5000.body': 'Tổng 5.000 cái',
  'ach.set_25.title': 'Set chắc tay',
  'ach.set_25.body': '25 cái trong một set',
  'ach.set_50.title': 'Năm mươi',
  'ach.set_50.body': '50 cái trong một set',
  'ach.set_100.title': 'Trăm cái',
  'ach.set_100.body': '100 cái trong một set',
  'ach.streak_3.title': 'Thành thói quen',
  'ach.streak_3.body': '3 ngày liên tiếp',
  'ach.streak_7.title': 'Trọn tuần',
  'ach.streak_7.body': '7 ngày liên tiếp',
  'ach.streak_30.title': 'Tháng thép',
  'ach.streak_30.body': '30 ngày liên tiếp',
  'ach.workouts_10.title': 'Đều đặn',
  'ach.workouts_10.body': '10 buổi tập',
  'ach.workouts_50.title': 'Lão làng',
  'ach.workouts_50.body': '50 buổi tập',
  'ach.early_bird.title': 'Dậy sớm',
  'ach.early_bird.body': 'Tập trước 7 giờ sáng',
  'ach.night_owl.title': 'Cú đêm',
  'ach.night_owl.body': 'Tập sau 10 giờ tối',
  'ach.program_day.title': 'Ngày đầu',
  'ach.program_day.body': 'Hoàn thành một ngày trong chương trình',
  'ach.program_done.title': 'Tốt nghiệp',
  'ach.program_done.body': 'Hoàn thành chương trình 6 tuần',

  'blocker.title': 'Chặn ứng dụng',
  'blocker.subtitle':
    'Khoá những ứng dụng và trang web hay ngốn thời gian của bạn. Chúng chỉ mở lại khi bạn kiếm được thời gian: mỗi cái hít đất đổi được {rate}.',
  'blocker.balance': 'Thời gian giải trí còn lại',
  'blocker.earn': 'Hít đất để kiếm thêm',
  'blocker.statusOn': 'Đang chặn {apps}',
  'blocker.statusOnApps': 'Đang chặn {apps}, không cần Trợ năng',
  'blocker.appOne': '1 ứng dụng',
  'blocker.appMany': '{n} ứng dụng',
  'blocker.siteOne': '1 trang web',
  'blocker.siteMany': '{n} trang web',
  'blocker.and': 'và',
  'blocker.statusOff': 'Đang tắt chặn',
  'blocker.statusNoApps': 'Chọn ít nhất một ứng dụng hoặc trang web để chặn',
  'blocker.statusSwitchedOff': 'Chặn đã dừng: Trợ năng đã bị tắt',
  'blocker.statusStalled': 'Chặn đã dừng: máy đã dừng dịch vụ chặn',
  'blocker.statusNeedsPermission': 'Cấp 2 quyền bên dưới để bắt đầu chặn',
  'blocker.statusSitesNeedA11y': 'Chỉ chặn được trang web khi bật Trợ năng',
  'blocker.statusStarting': 'Đang khởi động…',
  'blocker.alertTitle': 'Chặn đang không chạy',
  'blocker.alertSwitchedOff':
    'Trợ năng đang tắt: do bạn tắt, hoặc do máy tự đóng Hít Đất AI khi chạy nền (máy realme, OPPO, Xiaomi hay làm vậy). Bật lại, rồi làm theo mục "Giữ chặn luôn chạy" bên dưới để nó không bị tắt nữa.',
  'blocker.alertOrUsage':
    'Hoặc chặn không cần Trợ năng để app ngân hàng vẫn dùng được: cấp quyền "Xem ứng dụng đang mở" và "Hiển thị trên ứng dụng khác" bên dưới.',
  'blocker.alertStalled':
    'Quyền vẫn bật nhưng máy đã dừng dịch vụ và không cho chạy lại. Vào Trợ năng, mở Hít Đất AI, tắt rồi bật lại.',
  'blocker.alertWatcher':
    'Đã cấp đủ 2 quyền nhưng máy đã dừng dịch vụ chặn. Cho phép Hít Đất AI tự khởi chạy và tắt tối ưu pin cho nó, rồi mở lại app.',
  'blocker.alertPrevent':
    'Để không bị lại: cho phép Hít Đất AI tự khởi chạy và khoá app trong đa nhiệm (các bước bên dưới).',
  'blocker.alertTurnOn': 'Bật lại',
  'blocker.alertUseUsage': 'Chặn không cần Trợ năng',
  'blocker.alertOpen': 'Mở Trợ năng',
  'blocker.sectionBlocking': 'Chặn',
  'blocker.toggle': 'Chặn ứng dụng',
  'blocker.waysNote':
    'Hai quyền đầu là đủ để chặn ứng dụng, và app ngân hàng vẫn dùng bình thường. Trợ năng chỉ cần nếu muốn chặn cả trang web.',
  'blocker.usage': 'Xem ứng dụng đang mở',
  'blocker.usageOn': 'Đã bật (quyền truy cập dữ liệu sử dụng).',
  'blocker.usageOff':
    'Quyền "Truy cập dữ liệu sử dụng", để biết khi nào ứng dụng bị chặn được mở. Chỉ kiểm tra tên ứng dụng, không ảnh hưởng app ngân hàng.',
  'blocker.overlay': 'Hiển thị trên ứng dụng khác',
  'blocker.overlayOn': 'Đã bật.',
  'blocker.overlayOff': 'Để hiện màn hình chặn và đồng hồ đếm ngược lên trên ứng dụng bị chặn.',
  'blocker.permission': 'Trợ năng (không bắt buộc)',
  'blocker.permissionOn':
    'Đang bật: chặn cả trang web. App ngân hàng không cho mở thì tắt nó đi, ứng dụng vẫn bị chặn.',
  'blocker.permissionOnOnly':
    'Đang bật. Nếu app ngân hàng không cho mở, cấp 2 quyền ở trên trước rồi hãy tắt Trợ năng.',
  'blocker.permissionOff':
    'Chặn thêm cả trang web trong trình duyệt. Nhiều app ngân hàng không cho mở khi có app đang bật Trợ năng.',
  'blocker.permissionButton': 'Bật',
  'blocker.permissionManage': 'Cài đặt',
  'blocker.restrictedHint':
    'Không bật được, hoặc Android báo "Cài đặt bị hạn chế"? Mở Thông tin ứng dụng, bấm ⋮ ở góc trên, chọn "Cho phép cài đặt bị hạn chế", rồi thử lại.',
  'blocker.openAppInfo': 'Mở thông tin ứng dụng',
  'blocker.battery': 'Tối ưu pin',
  'blocker.batteryOn':
    'Đang bật cho app này nên máy có thể dừng chặn khi chạy nền. Hãy tắt cho Hít Đất AI.',
  'blocker.batteryButton': 'Sửa',
  'blocker.sectionApps': 'Ứng dụng bị chặn ({n})',
  'blocker.noApps': 'Chưa chọn ứng dụng nào.',
  'blocker.addApps': 'Chọn ứng dụng',
  'blocker.editApps': 'Sửa danh sách',
  'blocker.remove': 'Bỏ chặn {app}',
  'blocker.sectionSites': 'Trang web bị chặn ({n})',
  'blocker.sitesBody':
    'Mở bằng trình duyệt (Chrome, Cốc Cốc, Edge, Samsung Internet…) cũng bị chặn. Trang web của các ứng dụng đã chọn được chặn kèm tự động.',
  'blocker.sitesNeedA11y': 'Trang web chỉ bị chặn khi Trợ năng đang bật.',
  'blocker.siteAuto': 'kèm ứng dụng',
  'blocker.sitePlaceholder': 'vd. vnexpress.net',
  'blocker.siteAdd': 'Thêm',
  'blocker.siteInvalid': 'Đây không phải địa chỉ trang web. Thử kiểu vnexpress.net.',
  'blocker.removeSite': 'Bỏ chặn {site}',
  'blocker.sectionRate': 'Quy đổi',
  'blocker.rate': 'Mỗi cái hít đất đổi được',
  'blocker.timer': 'Đồng hồ đếm ngược',
  'blocker.timerBody': 'Một đồng hồ nhỏ hiện trên ứng dụng bị chặn khi thời gian đang chạy.',
  'blocker.keepTitle': 'Giữ chặn luôn chạy',
  'blocker.keepBody':
    'Một số máy (realme, OPPO, Xiaomi, vivo…) tự đóng ứng dụng chạy nền, làm chặn dừng lại và có thể tắt luôn Trợ năng, nên chặn lúc được lúc không. Để tránh:',
  'blocker.keep1':
    'Khoá Hít Đất AI trong đa nhiệm: mở màn hình ứng dụng gần đây, kéo thẻ của app xuống hoặc mở menu của thẻ và chọn Khoá.',
  'blocker.keep2':
    'Cho phép Tự khởi chạy (nút bên dưới). Không có quyền này, máy đóng app xong sẽ không cho chặn chạy lại.',
  'blocker.keep3': 'Thông tin ứng dụng → Pin: cho phép hoạt động nền và tắt tối ưu hoá.',
  'blocker.keep4': 'Không bấm Buộc dừng, không dọn app bằng trình tối ưu.',
  'blocker.keepAutostart': 'Tự khởi chạy',
  'blocker.keepAppInfo': 'Thông tin ứng dụng',
  'blocker.keepBattery': 'Tối ưu pin',
  'blocker.howTitle': 'Cách hoạt động',
  'blocker.howBody':
    'Tập xong một buổi, số cái được đổi thành thời gian giải trí. Mở ứng dụng hoặc trang web bị chặn thì thời gian đếm ngược khi nó đang trên màn hình, kể cả chia đôi màn hình hay cửa sổ nổi, và dừng khi bạn thoát ra hoặc khoá máy. Về 0 thì nó bị che lại cho tới khi bạn hít đất tiếp. Bạn có thể tắt chặn ở đây bất cứ lúc nào.',
  'blocker.privacy':
    'Tính năng chặn chỉ kiểm tra ứng dụng nào đang mở và, khi bật Trợ năng, tên miền của trang trong trình duyệt. Nó không đọc gì khác trên màn hình hay những gì bạn gõ, và không gửi gì ra khỏi máy.',
  'blocker.androidOnly': 'Tính năng chặn ứng dụng chỉ có trên Android.',
  'blocker.expoGo':
    'Expo Go không chạy được tính năng chặn ứng dụng vì cần mã native. Hãy cài bản build của app (npm run build:apk).',
  'blocker.needsUpdate': 'Bản cài đặt này chưa có tính năng chặn ứng dụng. Hãy cài bản mới nhất.',
  'blocker.chipA11y': 'Còn {time} giải trí. Mở phần chặn ứng dụng.',
  'blocker.chipOff': 'Chặn đã tắt',
  'blocker.disclosureTitle': 'Cho phép quyền Trợ năng?',
  'blocker.disclosureBody':
    'Để chặn cả trang web, Hít Đất AI dùng dịch vụ Trợ năng (Accessibility) của Android để biết ứng dụng nào đang mở trên màn hình. Lưu ý: nhiều app ngân hàng không cho mở khi có app đang bật Trợ năng.',
  'blocker.disclosure1':
    'Chỉ kiểm tra tên ứng dụng đang mở và, trong trình duyệt, tên miền của trang. Không đọc gì khác trên màn hình, tin nhắn hay những gì bạn gõ.',
  'blocker.disclosure2': 'Không lưu lịch sử sử dụng, không gửi gì ra khỏi máy.',
  'blocker.disclosure3':
    'Bạn có thể tắt quyền bất cứ lúc nào trong Cài đặt › Trợ năng, và tắt chặn ngay tại đây.',
  'blocker.disclosureSteps':
    'Ở màn hình tiếp theo, tìm mục có chữ "Hít Đất AI" (thường nằm trong "Ứng dụng đã tải xuống" hoặc "Ứng dụng đã cài đặt") rồi bật lên.',
  'blocker.disclosureAgree': 'Đồng ý và mở Cài đặt',
  'blocker.disclosureLater': 'Để sau',
  'blocker.usageDisclosureTitle': 'Chặn không cần Trợ năng?',
  'blocker.usageDisclosureBody':
    'Thay cho Trợ năng, Hít Đất AI có thể dùng hai quyền khác của Android, thường không bị app ngân hàng phản đối.',
  'blocker.usageDisclosure1':
    '"Truy cập dữ liệu sử dụng" cho biết ứng dụng nào đang mở. Chỉ kiểm tra tên ứng dụng, không lưu lịch sử.',
  'blocker.usageDisclosure2':
    '"Hiển thị trên ứng dụng khác" để hiện màn hình chặn và đồng hồ đếm ngược lên trên ứng dụng bị chặn.',
  'blocker.usageDisclosure3':
    'Khi đang chặn sẽ có một thông báo thường trực. Cách này không chặn được trang web, và không gửi gì ra khỏi máy.',
  'blocker.usageDisclosureSteps':
    'Ở màn hình tiếp theo, tìm "Hít Đất AI" và bật lên, rồi quay lại đây để cấp quyền còn lại.',

  'picker.title': 'Chọn ứng dụng cần chặn',
  'picker.search': 'Tìm ứng dụng',
  'picker.loading': 'Đang tải danh sách ứng dụng…',
  'picker.suggested': 'Gợi ý',
  'picker.all': 'Tất cả ứng dụng',
  'picker.empty': 'Không có ứng dụng nào khớp "{query}".',
  'picker.none': 'Không tìm thấy ứng dụng nào.',
  'picker.save': 'Lưu ({n})',

  'native.blockTitle': '{app} đang bị chặn',
  'native.timeUpTitle': 'Hết giờ dùng {app}',
  'native.blockBody':
    'Bạn đã hết thời gian giải trí. Mỗi cái hít đất đổi được {rate}: tập vài cái rồi quay lại nhé.',
  'native.earnButton': 'Hít đất ngay',
  'native.homeButton': 'Về màn hình chính',
  'native.lowTime': 'Còn chưa đầy 1 phút giải trí',
  'native.blockedToast': '{app} đang bị chặn. Hít đất để có thêm thời gian.',
  'native.watchTitle': 'Đang chặn ứng dụng',
  'native.watchBody': 'Mỗi cái hít đất đổi thêm thời gian giải trí.',
  'native.watchChannel': 'Chặn ứng dụng',

  'settings.title': 'Cài đặt',
  'settings.workout': 'Buổi tập',
  'settings.feedback': 'Phản hồi',
  'settings.reminder': 'Nhắc tập',
  'settings.general': 'Chung',
  'settings.data': 'Dữ liệu',
  'settings.about': 'Giới thiệu',
  'settings.dailyGoal': 'Mục tiêu mỗi ngày',
  'settings.dailyGoalBody': 'Số cái mỗi ngày. Mọi chế độ tập đều tính vào.',
  'settings.countdown': 'Đếm ngược trước set',
  'settings.countdownBody': 'Thời gian để vào tư thế sau khi bấm Bắt đầu.',
  'settings.rest': 'Nghỉ giữa các set',
  'settings.restBody': 'Chỉ cho tập tự do. Chương trình có thời gian nghỉ riêng.',
  'settings.sound': 'Âm thanh',
  'settings.haptics': 'Rung',
  'settings.voice': 'Đọc số',
  'settings.voiceBody': 'Đọc to số lần mỗi cái, không cần nhìn màn hình.',
  'settings.reminderToggle': 'Nhắc mỗi ngày',
  'settings.reminderBody': 'Một thông báo vào cùng giờ mỗi ngày.',
  'settings.reminderTime': 'Giờ nhắc',
  'settings.reminderDenied': 'Thông báo đang bị chặn cho ứng dụng này. Bật lại trong cài đặt hệ thống.',
  'settings.reminderWeb': 'Nhắc tập chỉ có trên ứng dụng di động.',
  'settings.reminderExpoGo': 'Nhắc tập không chạy trong Expo Go trên Android. Hãy dùng bản development build hoặc bản trên cửa hàng.',
  'settings.language': 'Ngôn ngữ',
  'settings.langAuto': 'Tự động',
  'settings.langEn': 'English',
  'settings.langVi': 'Tiếng Việt',
  'settings.howItWorks': 'Hướng dẫn sử dụng',
  'settings.clearAll': 'Xoá toàn bộ dữ liệu',
  'settings.clearAllBody': 'Lịch sử, tiến độ chương trình, cài đặt và thời gian giải trí.',
  'settings.privacy': 'Chính sách quyền riêng tư',
  'settings.privacyNote': 'Mọi dữ liệu ở trên máy bạn. Không tài khoản, không quảng cáo, không theo dõi.',
  'settings.version': 'Phiên bản {version}',
  'settings.sourceCode': 'Mã nguồn',

  'reminder.title': 'Đến giờ hít đất 💪',
  'reminder.body': 'Giữ chuỗi ngày của bạn. Một set là đủ.',

  'onboarding.title': 'Chào mừng đến Hít Đất AI',
  'onboarding.s1.title': 'Đếm không cần chạm',
  'onboarding.s1.body':
    'Dựng điện thoại bên hông để thấy toàn thân: camera AI đếm từng cái và nhắc tư thế. Không dùng camera? Đặt máy trên sàn, dùng cảm biến hoặc chạm mũi vào màn hình.',
  'onboarding.s2.title': 'Set, nghỉ và giọng đọc',
  'onboarding.s2.body':
    'Mỗi set bắt đầu bằng đếm ngược để bạn kịp vào tư thế, và kết thúc bằng đồng hồ nghỉ. Bật đọc số để nghe số lần thay vì nhìn.',
  'onboarding.s3.title': 'Chương trình, mục tiêu, chuỗi ngày',
  'onboarding.s3.body':
    'Làm bài kiểm tra rồi theo chương trình 6 tuần, hoặc đơn giản là đạt mục tiêu mỗi ngày. Ngày nào có tập là chuỗi ngày dài thêm.',
  'onboarding.cta': 'Bắt đầu thôi',

  'voice.go': 'Bắt đầu',
  'voice.rest': 'Nghỉ',
  'voice.lastSet': 'Set cuối',
  'voice.setDone': 'Xong set',
  'voice.done': 'Hoàn thành',
};

export const STRINGS = { en, vi };

/**
 * Pick the language: an explicit setting wins, otherwise the device's first
 * locale if we have it, otherwise English.
 * @param {'auto'|'en'|'vi'} setting
 * @param {string[]} deviceLanguageCodes  e.g. ['vi', 'en']
 */
export function resolveLanguage(setting, deviceLanguageCodes = []) {
  if (LANGUAGES.includes(setting)) return setting;
  for (const code of deviceLanguageCodes) {
    const base = String(code || '').toLowerCase().split('-')[0];
    if (LANGUAGES.includes(base)) return base;
  }
  return 'en';
}

/** Fill `{name}` placeholders. Missing keys return the key, loudly. */
export function translate(language, key, params) {
  const table = STRINGS[language] || STRINGS.en;
  let text = table[key] ?? STRINGS.en[key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}
