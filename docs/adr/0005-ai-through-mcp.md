# AI điều khiển dotcode qua endpoint `/mcp` của server

AI không chạy shell và không tự ghi file. AI chỉ gọi các thao tác cố định của dotcode (`search`, `add`, `detect`, `install`, `enable`, `disable`, `update`, `rollback`, `pin`, `uninstall`, thao tác cho service và Model), dùng đúng code mà nút bấm trên UI dùng. Các thao tác này là tool MCP trên endpoint `/mcp` của server Express sẵn có.

- **Chat trong app dùng Codex SDK ngay trong v1.** SDK chạy chat; `/mcp` là giao diện chung cho chat trong app, Codex CLI và Claude Code.
- **Trong server, không phải process riêng.** Installer trong server là nơi ghi Store, Activation và Receipt, và giữ các Plan đang chờ.
- **Thao tác có thay đổi chỉ tạo Plan.** AI có thể bổ sung Recipe hoặc đề xuất sửa Activation. Tool trả `planId` kèm link tới UI; user duyệt trên UI; AI theo dõi bằng `plan_status`. Không có tool nào duyệt Plan. Hỏi đáp về repo dùng công cụ chỉ đọc, không cần duyệt.
- Chat không tự ghi file hoặc chạy shell để lách Plan. Wrapper sinh bởi installer và các bước build/chuẩn bị trong Recipe không đồng nghĩa với cấp quyền shell tùy ý cho AI; quyền đó chưa được quyết định.

## Bảo mật

Installer có thể chạy code trên máy, nên `/mcp` là ranh giới tin cậy. Nội dung repo và đầu ra công cụ là dữ liệu, không cấp quyền thực thi:

- `/mcp` dùng cùng kiểm tra request local như API của installer: IP loopback, `Host` là localhost, `Origin` cùng origin. Kiểm tra này chặn máy khác trong mạng và DNS rebinding từ trình duyệt.
- Thêm bearer token, sinh ngẫu nhiên và lưu ở `DOTCODE_HOME/mcp-token` với quyền `0600`, vì client MCP không gửi `Origin` nên kiểm tra origin không phân biệt được client hợp lệ. Token chặn user khác trên cùng máy, những người không đọc được file đó.
- `HOST` mặc định là `127.0.0.1`. Mọi route ghi, kể cả ghi Library, kiểm tra request local ngay cả khi user đổi `HOST`.

## Các phương án đã cân nhắc

- **Structured output `installerActions`** (bản cũ của issue #13). Bị bỏ vì chỉ chạy được trong chat của app và gắn với một SDK.
- **Lệnh `dotcode mcp` dạng stdio** chuyển tiếp sang HTTP API. Không thêm endpoint mạng, nhưng thêm một process và vẫn cần token. Không bớt được việc gì.
- **Trợ lý Codex cũ** (xoá ở commit `f1ad5fe`) cho AI tự viết lifecycle script. Kết quả không ổn định; xem ADR 0002 và 0003.
