# FIN470 Group 4 CFO – Website v1.5

Bản website dựa trên file HTML Group 4 CFO do người dùng cung cấp. Giữ nguyên các module: Dashboard, Case, Financial Diagnosis, CFO Action Plan, Speaking Guide, Stakeholder Hearing, Review, Board Recommendation và Q&A.

## Tính năng được nâng cấp

- Chọn **người trình bày** trong danh sách 6 thành viên Group 4A/4B tại mục **Speaking Guide**. Không gán cố định cho thành viên nào. Lựa chọn được lưu trong trình duyệt đang sử dụng.
- Người nói được chọn sẽ xuất hiện trên trang Speaking Guide, Teleprompter và bản script Markdown tải về. Câu giới thiệu đầu bài tự đổi tên tương ứng; nếu chưa chọn người nói, câu mở đầu không nêu tên riêng.
- Các tab **Full / 4A / 4B** chỉ điều khiển chế độ **xem script**. Khi bấm **Rehearse full 8 min**, Teleprompter **luôn hiển thị toàn bộ Slide 1–7**, bất kể đang xem tab nào.
- Teleprompter **cuộn liên tục, không dừng/nhảy giữa các slide**; tự chuyển nhãn và nội dung từ 4A sang 4B tại mốc **05:00** khi tốc độ mặc định 100%. Có thể thay đổi tốc độ cuộn trong lúc nói mà không gây giật hoặc nhảy đến cuối từng đoạn. Có Start/Pause, Restart, đồng hồ, điều chỉnh tốc độ cuộn và nhãn slide đang nói.
- Script tiếng Anh được giữ theo từng slide với các cue Opening/Evidence/Transition, nhưng nội dung là văn nói tự nhiên. Phần 4B tiếp nối trực tiếp phần 4A.

## Chạy website tĩnh

Giải nén ZIP, tải `index.html` lên thư mục gốc trên Netlify, GitHub Pages hoặc dịch vụ hosting tĩnh. Cũng có thể mở `index.html` để thử nhanh.

Chế độ HTML tĩnh dùng **local demo**, dữ liệu nhập được lưu trong trình duyệt của từng máy. **Không đồng bộ trạng thái online** giữa các thành viên nếu chỉ dùng hosting tĩnh.

Mã dùng thử trong bản HTML độc lập: `NHOM4-CFO-S3`.

## Chạy Node.js để đồng bộ nhóm

Cần Node.js >=18; không có thư viện npm bên ngoài.

Linux/macOS:
```bash
export TEAM_ACCESS_CODE='DOI_THANH_MA_RIENG'
node server.js
```

Windows PowerShell:
```powershell
$env:TEAM_ACCESS_CODE='DOI_THANH_MA_RIENG'
node server.js
```

Mở `http://localhost:3000`. Để triển khai Internet, sử dụng hosting hỗ trợ Node server như Render/Railway/VPS, cấu hình HTTPS, mã nhóm mạnh và một thư mục lưu bền vững (`DATA_DIR`) nếu cần bảo toàn dữ liệu qua lần restart.

## Hướng dẫn luyện nói

1. Đăng nhập và mở **Speaking Guide**.
2. Ở **Chọn người thuyết trình**, chọn một trong sáu thành viên.
3. Xem riêng tab 4A hoặc 4B nếu muốn đọc trước nội dung.
4. Bấm **Rehearse full 8 min →**, sau đó bấm **Start** trong Teleprompter.
5. Tiếp tục nói khi đồng hồ qua **05:00**; hệ thống tự chuyển nhãn sang `4B · Slide 6/7` và tự cuộn văn bản.
6. Nếu muốn tải kịch bản, bấm **Export script .md** tại tab đang chọn; tab **Full script** xuất đủ cả hai phần.

Mốc thời gian trên Teleprompter là kế hoạch tập nói, không đo tốc độ nói thực tế. Người nói có thể Pause/Restart và điều chỉnh tốc độ cuộn. Khi diễn tập, cần giữ tổng thời gian trong giới hạn 8 phút.

## File trong ZIP

- `index.html`: toàn bộ giao diện và logic của website.
- `server.js`: backend đồng bộ nhóm qua Node.js.
- `package.json`, `Dockerfile`, `.gitignore`: cấu hình chạy/deploy.
- `script_data.json`: bản dữ liệu script theo từng slide, không gán người thuyết trình.
- `SCRIPT_CFO_4A4B_8_PHUT.md`: bản script độc lập để đọc, với vị trí tên người trình bày dạng mẫu.
- `README.md`: hướng dẫn.

**Lưu ý:** Website phục vụ làm việc nhóm học tập, không phải ứng dụng production có phân quyền nâng cao. Không lưu thông tin nhạy cảm hay tài liệu mật.

## Cập nhật v1.5 (độ mượt + sidebar)

- Mục menu đổi thành **CFO Speaking Guide / Kịch bản thuyết trình CFO**, không gắn cố định tên thành viên.
- Auto-scroll tính theo thời gian liên tục, không tự cuộn đến cuối một slide rồi đứng yên trước khi nhảy tới slide kế tiếp.
- Chỉnh pace 60–140% không làm nhảy vị trí. Pace ảnh hưởng vị trí đọc, trong khi đồng hồ thực vẫn đủ 8 phút; dùng 100% để các mốc trên slide khớp thời gian dự kiến.
- Cỡ chữ và giãn dòng Teleprompter được tối ưu cho màn hình desktop và điện thoại.
