# Đưa Hít Đất AI lên Google Play — checklist

Mọi bước build đều chạy trên cloud của EAS, **không cần Android Studio hay JDK** trên máy.
Chỉ cần Node, tài khoản Expo (miễn phí) và tài khoản Google Play Developer (25 USD, một lần).

## 0. Trước khi build

- [ ] `npm run verify` xanh (83 assertion).
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
