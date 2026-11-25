# Detector đưa ứng viên; AI chọn cách cài và chỉ hỏi khi cần

AI không cần tự khám phá repo và máy từ đầu mỗi lần cài. Detector làm phần này bằng code cố định:

- Đọc file tree, release assets, các file manifest (`flake.nix`, `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `SKILL.md`…) và phần Install trong README.
- Đọc thông tin về máy: arch, libc, Nix, GPU, PATH.
- Trả về các Recipe ứng viên, đã xếp hạng.

## Khi nào dùng gì

| Tình huống | Cách xử lý |
|---|---|
| User bấm Install, đã đủ thông tin | AI dùng kết quả Detector và hướng dẫn cài của DotCode để chọn Component, Recipe và biến thể, rồi đưa Plan để duyệt |
| Quyết định còn phụ thuộc ý user | AI hỏi trong chat với các phương án bấm được; vẫn nhận câu trả lời tự do. Trả lời không duyệt Plan |
| Detector thiếu thông tin, hoặc repo chỉ có hướng dẫn trong README | AI bổ sung Recipe trong phạm vi installer hỗ trợ; nếu không làm được thì báo rõ lý do |
| User hỏi hoặc so sánh repo | Đính kèm kết quả tìm kiếm/Card vào chat bằng kéo thả hoặc bàn phím. Hỏi đáp dùng công cụ chỉ đọc và không tự Add hay Install |
| Bản cài đã có nhưng thiếu launcher | AI đề xuất Plan bổ sung Activation; không tải lại |

## Hệ quả

- **AI không tự ghi file.** Chat gọi công cụ chỉ đọc hoặc đề xuất Plan qua `/mcp` (ADR 0005). Installer thực hiện Plan đã duyệt và cập nhật Receipt. Nếu chưa hỗ trợ cách sửa, AI báo giới hạn thay vì tự ghi file.
- **Thêm repo không cần AI.** Có ô search GitHub ngay trong app, hoặc dán URL. Detector chạy khi Add và lưu kết quả vào Card. Khi Install, nếu kết quả đã cũ hơn 24 giờ thì Detector chạy lại.
- **Token GitHub** lấy từ `GITHUB_TOKEN`, nếu không có thì từ `gh auth token`. Token không được ghi ra đĩa hay log. Không có token thì app vẫn chạy được, nhưng bị giới hạn: search 10 lượt/phút, các API khác 60 lượt/giờ.
