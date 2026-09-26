# Google Play listing — PUPG Push-up

Copy-paste material for the Play Console. Character limits are Play's: title 30,
short description 80, full description 4000.

Assets in this folder:

| File | Use |
| --- | --- |
| `play-icon-512.png` | App icon (512 × 512, PNG, no alpha) |
| `feature-graphic.png` | Feature graphic (1024 × 500) |
| `screenshots/*.png` | Phone screenshots (1080 × 1920). Regenerate with `npm run screenshots` after UI changes |

Regenerate the icon and feature graphic with `npm run build:brand` (needs Python + Pillow).

---

## English (en-US) — default

**Title** (30)

```
PUPG Push-up: AI Counter
```

**Short description** (80)

```
Hands-free push-up counter. AI camera, 6-week program, goals and streaks.
```

**Full description**

```
Put the phone down and just do push-ups. PUPG counts every rep for you — with the camera, the sensor, or a tap of your nose — and turns them into a habit.

COUNTS HANDS-FREE
• AI camera: prop the phone up, get into position, and the camera counts your reps and coaches your form ("go lower", "keep your body straight").
• Sensor mode: phone on the floor, cover the sensor at the bottom of each rep.
• Tap mode: works on every phone, no camera needed.
• Voice count says each number out loud so you never look at the screen.

REAL WORKOUTS
• Countdown before every set so you can get into position.
• Multiple sets with a rest timer between them.
• Sound, vibration and voice cues at the start and end of every set.

6-WEEK PROGRAM
• Take a one-set max test and get a program sized to you: 18 workouts, 5 sets each, three days a week.
• Targets grow every workout. Sets complete themselves when you hit the number, and the last set is always "as many as you can".
• Redo any day, retake the test for a harder cycle.

STAY MOTIVATED
• Daily goal with a progress bar.
• Streak of consecutive days with reps.
• Weekly chart, personal records, 17 achievements.
• Share your result after every workout.

PRIVATE BY DESIGN
• No account. No ads. No analytics.
• Camera frames are processed on your phone and never uploaded.
• All history stays on your device — delete it any time.

Available in English and Vietnamese.
```

## Vietnamese (vi)

**Title** (30)

```
PUPG Hít đất: Đếm bằng AI
```

**Short description** (80)

```
Đếm hít đất rảnh tay. Camera AI, chương trình 6 tuần, mục tiêu và chuỗi ngày.
```

**Full description**

```
Đặt điện thoại xuống và chỉ việc hít đất. PUPG đếm từng cái cho bạn — bằng camera, cảm biến, hoặc chạm mũi — và biến nó thành thói quen.

ĐẾM RẢNH TAY
• Camera AI: dựng điện thoại lên, vào tư thế, camera đếm số cái và nhắc tư thế ("xuống thấp hơn", "giữ thẳng người").
• Chế độ cảm biến: đặt máy trên sàn, che cảm biến ở điểm thấp nhất mỗi cái.
• Chế độ chạm: chạy trên mọi máy, không cần camera.
• Đọc số bằng giọng nói, không cần nhìn màn hình.

BUỔI TẬP THỰC SỰ
• Đếm ngược trước mỗi set để kịp vào tư thế.
• Nhiều set, có đồng hồ nghỉ giữa các set.
• Âm thanh, rung và giọng nói báo đầu và cuối mỗi set.

CHƯƠNG TRÌNH 6 TUẦN
• Làm bài kiểm tra một set tối đa để nhận chương trình đúng sức: 18 buổi, mỗi buổi 5 set, 3 ngày một tuần.
• Mục tiêu tăng dần qua từng buổi. Set tự kết thúc khi đủ số, set cuối luôn là "cố hết sức".
• Tập lại bất kỳ ngày nào, kiểm tra lại để lên vòng khó hơn.

GIỮ ĐỘNG LỰC
• Mục tiêu mỗi ngày với thanh tiến độ.
• Chuỗi ngày tập liên tiếp.
• Biểu đồ tuần, kỷ lục cá nhân, 17 thành tích.
• Chia sẻ kết quả sau mỗi buổi tập.

RIÊNG TƯ TỪ THIẾT KẾ
• Không tài khoản. Không quảng cáo. Không theo dõi.
• Khung hình camera xử lý ngay trên máy, không bao giờ tải lên.
• Toàn bộ lịch sử nằm trên máy bạn — xoá bất cứ lúc nào.

Có tiếng Việt và tiếng Anh.
```

---

## Console fields

| Field | Value |
| --- | --- |
| App category | Health & Fitness |
| Tags | Fitness, Workout, Exercise |
| Contact email | (your developer email, shown publicly) |
| Privacy policy URL | https://betuanminh22032003.github.io/push-up/privacy.html |
| Ads | No, the app contains no ads |
| App access | All functionality available without special access |
| Target audience | 18 and over (simplest; no children's-policy obligations) |
| Content rating (IARC) | Answer "No" to everything → Everyone |
| News app | No |
| COVID-19 contact tracing / status | No |
| Government app | No |
| Financial features | None |
| Health | "My app is a fitness/wellness app": no medical claims, no Health Connect |

## Data safety form

Play asks whether the app **collects** or **shares** user data, where "collect" means data that leaves the device.

| Question | Answer | Why |
| --- | --- | --- |
| Does your app collect or share any of the required user data types? | **No** | Workouts, settings and program progress are stored only on the device. Nothing is transmitted. |
| Is all user data encrypted in transit? | n/a (nothing collected) | The only network traffic is downloading static files for the pose detector. |
| Do you provide a way for users to request deletion? | n/a | "Delete all data" in Settings wipes local storage. |

Camera: the camera is used only on device for live pose estimation; frames are never stored or transmitted. Declare no "Photos and videos" collection.

## Permissions declaration

The manifest requests only:

- `CAMERA` — AI camera mode (runtime permission, requested on first use)
- `POST_NOTIFICATIONS` — daily reminder (runtime, requested when enabled)
- `RECEIVE_BOOT_COMPLETED` — expo-notifications re-schedules the reminder after a reboot
- `VIBRATE`, `INTERNET`, `MODIFY_AUDIO_SETTINGS` — normal permissions, no prompt

`RECORD_AUDIO`, `ACTIVITY_RECOGNITION` and the foreground-service permissions that the Expo modules add by default are blocked in `app.json`, so no sensitive-permission declaration is needed.
