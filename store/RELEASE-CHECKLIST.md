# Đưa Hít Đất AI lên Google Play — checklist

Mọi bước build đều chạy trên cloud của EAS, **không cần Android Studio hay JDK** trên máy.
Chỉ cần Node, tài khoản Expo (miễn phí) và tài khoản Google Play Developer (25 USD, một lần).

## 0. Trước khi build

- [ ] `npm run verify` xanh (95 assertion).
- [ ] `npm run build:pose` rồi commit `docs/pose.html` nếu có sửa `src/pose/`.
- [ ] GitHub Pages đang bật cho nhánh `master`, thư mục `/docs`. Mở thử:
      - https://betuanminh22032003.github.io/push-up/pose.html (xin quyền camera là đúng)
      - https://betuanminh22032003.github.io/push-up/privacy.html
- [ ] `npx expo-doctor` không báo lỗi.

## 1. EAS một lần duy nhất

```bash
npm i -g eas-cli
eas login
eas init            # tạo project trên expo.dev, tự ghi extra.eas.projectId vào app.json
```

Commit `app.json` sau khi `eas init`.

## 2. Build thử (APK cài trực tiếp lên máy)

```bash
npm run build:apk
```

Tải APK từ link EAS in ra, cài lên điện thoại Android thật và kiểm tra:

- [ ] Splash tối, icon đúng, không có viền trắng.
- [ ] Nội dung không bị thanh trạng thái / thanh điều hướng che (edge-to-edge).
- [ ] Camera AI: bấm Bắt đầu → hộp thoại quyền camera → camera lên → tải mô hình → đếm được.
- [ ] Chế độ Cảm biến hiện trên máy có cảm biến ánh sáng, hiệu chỉnh được.
- [ ] Đếm ngược có tiếng tick, giọng đọc số (Google TTS phải có tiếng Việt nếu chọn vi).
- [ ] Nhắc tập: bật → hỏi quyền thông báo → đúng giờ có thông báo (kể cả sau khi khởi động lại máy).
- [ ] Nút Back của Android: đang tập → tạm dừng; ở tab khác → về tab Tập; ở tab Tập → thoát.
- [ ] Đổi ngôn ngữ trong Cài đặt, mọi màn hình đổi theo.
- [ ] Chặn app, bật quyền: tab Chặn app → Bật → hộp thoại giải thích → Đồng ý → Cài đặt Trợ
      năng → bật mục "Hít Đất AI". APK cài ngoài Play trên Android 13+ sẽ bị xám / báo "Cài đặt
      bị hạn chế": Thông tin ứng dụng → ⋮ → Cho phép cài đặt bị hạn chế, rồi bật lại. (Bản cài từ
      Play không bị.)
- [ ] Chặn app, hết giờ: chọn một app (vd. YouTube), số phút đang 00:00 → mở app đó → màn hình
      chặn hiện ngay. "Về màn hình chính" và nút Back đều về Home, không quay lại app bị chặn.
- [ ] Chặn app, có giờ: hít đất 3 cái → Kết thúc → "+3 phút" → mở app bị chặn → đồng hồ nhỏ góc
      trên đếm ngược; thoát app hoặc khoá màn hình thì dừng; về 0 → màn hình "Hết giờ".
- [ ] "Hít đất ngay" trên màn hình chặn mở Hít Đất AI ở tab Tập.
- [ ] Mở app bị chặn 10 lần liên tiếp (từ màn hình chính, từ đa nhiệm, từ thông báo): lần nào
      cũng bị chặn trong khoảng 1–2 giây.
- [ ] Trang web: chặn YouTube → mở youtube.com trong Chrome (và Cốc Cốc nếu có) → bị đẩy lùi
      về trang trước và hiện màn hình chặn. Trang tự thêm (vd. vnexpress.net) cũng vậy.
- [ ] Chia đôi màn hình hoặc cửa sổ nổi với app bị chặn: đồng hồ vẫn trừ, hết giờ thì bị chặn.
- [ ] Vuốt bỏ Hít Đất AI khỏi đa nhiệm (chưa khoá): mở TikTok ngay sau đó vẫn bị chặn (dịch vụ
      chạy ở tiến trình riêng `:blocker`, không chết theo app).
- [ ] Buộc dừng app trong Cài đặt: mở lại app thì tab Chặn app báo "Chặn đang không chạy" và chip
      ở màn hình Tập thành "⚠️ Chặn đã tắt". Nút "Tự khởi chạy" mở đúng trang của máy (realme:
      danh sách Tự khởi chạy); không có thì mở Thông tin ứng dụng.
- [ ] Chụp screenshot thật từ máy (tốt hơn screenshot web) nếu muốn.

## 3. Google Play Console

1. Tạo app: tên **Hít Đất AI**, ngôn ngữ mặc định English (US), ứng dụng, miễn phí.
2. **Store listing**: dán từ `store/listing.md`, thêm bản dịch Vietnamese. Upload
   `play-icon-512.png`, `feature-graphic.png`, ít nhất 2 screenshot điện thoại từ
   `store/screenshots/`.
3. **App content** (mục Policy):
   - Privacy policy: `https://betuanminh22032003.github.io/push-up/privacy.html`
   - Ads: No · App access: no restrictions · Content rating: điền IARC, trả lời No hết → Everyone
   - Target audience: 18+ · News: No · Data safety: không thu thập, không chia sẻ (xem `listing.md`)
   - Health: fitness app, không phải thiết bị y tế.
   - **Accessibility API** (bắt buộc vì có tính năng chặn app): khai báo app **không phải** công cụ
     trợ năng, dán mô tả trong `listing.md` (mục *Accessibility API declaration*), kèm một video
     ngắn quay màn hình: tab Chặn app → hộp thoại giải thích → bật dịch vụ → mở app bị chặn →
     màn hình chặn. Google duyệt mục này kỹ, có thể lâu hơn bình thường.
4. **Testing yêu cầu với tài khoản cá nhân mới** (từ 2023): phải chạy **Closed testing với ≥ 12
   tester trong 14 ngày liên tục** rồi mới được nộp đơn xin quyền Production. Tạo track Closed
   testing, thêm email tester (bạn bè, nhóm Facebook/Reddit tester), gửi link opt-in.

## 4. Build production và nộp

```bash
npm run build:android          # .aab, versionCode tự tăng trên EAS (appVersionSource: remote)
```

Lần đầu: tải `.aab` từ EAS và upload tay vào track Closed testing trong Play Console
(Play bắt buộc bản đầu tiên upload thủ công để tạo app signing key).

Các lần sau, có thể nộp thẳng từ máy:

1. Tạo Google Service Account theo https://expo.fyi/creating-google-service-account,
   tải JSON về đặt tên `google-service-account.json` ở thư mục gốc (đã nằm trong `.gitignore`).
2. `npm run submit:android` — nộp lên track `internal` ở trạng thái draft (đổi `track` /
   `releaseStatus` trong `eas.json` khi muốn lên `production`).

## 5. Sau khi lên store

- [ ] Ghi lại link store vào README.
- [ ] Mỗi bản cập nhật: tăng `version` trong `app.json` (versionCode tự tăng), `npm run verify`,
      `npm run build:android`, `npm run submit:android`, viết release notes.
- [ ] Theo dõi Android vitals (crash, ANR) trong Play Console tuần đầu.

## Rủi ro cần biết

- Tên cũ "PUPG" (quá gần "PUBG" của Krafton) đã đổi thành **Hít Đất AI**, package
  `com.betuanminh.hitdat`, trước lần upload đầu. Package không đổi được sau khi đã lên Play.
  Khoá lưu trữ nội bộ `pupg:*` và slug EAS `pupg-pushup` giữ nguyên: người dùng không thấy,
  còn đổi thì mất dữ liệu đã lưu và đứt liên kết với project EAS.
- Chế độ Camera AI phụ thuộc trang `pose.html` trên GitHub Pages và CDN (jsDelivr, Google
  Storage). Nếu đổi tên repo/tài khoản GitHub, cập nhật `POSE_PAGE_URL` trong `src/config.js`.
- Nhắc tập dùng alarm không chính xác (inexact) để không cần quyền `SCHEDULE_EXACT_ALARM`;
  thông báo có thể lệch vài phút.
- Chặn app dùng Accessibility Service, kể cả đọc tên miền trên thanh địa chỉ trình duyệt. Google
  Play chỉ cho phép khi có hộp thoại giải thích và đồng ý trước khi bật (đã có), mô tả rõ trong
  chính sách quyền riêng tư (đã có) và bản khai báo trong Play Console. Nếu bị từ chối, trả lời
  reviewer bằng mô tả + video; tính năng chặn không chạy trong Expo Go, chỉ trong bản build
  (APK/AAB).
- Máy realme/OPPO/Xiaomi tự buộc dừng app chạy nền, và Android tắt luôn dịch vụ Trợ năng của app
  bị buộc dừng. App không ngăn được việc đó, chỉ phát hiện và hướng dẫn người dùng (tab Chặn app,
  mục "Giữ chặn luôn chạy").
