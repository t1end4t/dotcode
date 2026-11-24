# AI điều khiển dotcode qua endpoint `/mcp` của server

AI không chạy shell và không tự ghi file. AI chỉ gọi các thao tác cố định của dotcode (`search`, `add`, `detect`, `install`, `enable`, `disable`, `update`, `rollback`, `pin`, `uninstall`, thao tác cho service và Model), dùng đúng code mà nút bấm trên UI dùng. Các thao tác này là tool MCP trên endpoint `/mcp` của server Express sẵn có.

- **MCP, không phải SDK.** Codex SDK, Claude Agent SDK, Codex CLI và Claude Code đều nhận tool tự viết qua MCP. Một bộ tool dùng được cho mọi client; đổi SDK chỉ là đổi phía client. Chat trong app chỉ là một client của `/mcp`, làm sau.
- **Trong server, không phải process riêng.** Server là process duy nhất ghi Store và Receipt, và giữ các Plan đang chờ.
- **Thao tác có thay đổi chỉ tạo Plan.** Tool trả về `planId` kèm link tới UI; user duyệt trên UI; AI theo dõi bằng `plan_status`. Không có tool nào duyệt Plan. Thao tác chỉ đọc thì AI gọi tự do.
- Ngoại lệ duy nhất là Backend `script`: AI viết script, nhưng chỉ được ghi vào Store.

## Bảo mật

`install` và Backend `script` chạy code trên máy, nên `/mcp` là ranh giới tin cậy:

- `/mcp` dùng cùng kiểm tra request local như API của installer: IP loopback, `Host` là localhost, `Origin` cùng origin. Kiểm tra này chặn máy khác trong mạng và DNS rebinding từ trình duyệt.
- Thêm bearer token, sinh ngẫu nhiên và lưu ở `DOTCODE_HOME/mcp-token` với quyền `0600`, vì client MCP không gửi `Origin` nên kiểm tra origin không phân biệt được client hợp lệ. Token chặn user khác trên cùng máy, những người không đọc được file đó.
- `HOST` mặc định là `127.0.0.1`, để các route chưa có kiểm tra local (ví dụ ghi Library) cũng không lộ ra mạng.

## Các phương án đã cân nhắc

- **Structured output `installerActions`** (bản cũ của issue #13). Bị bỏ vì chỉ chạy được trong chat của app và gắn với một SDK.
- **Lệnh `dotcode mcp` dạng stdio** chuyển tiếp sang HTTP API. Không thêm endpoint mạng, nhưng thêm một process và vẫn cần token. Không bớt được việc gì.
- **Trợ lý Codex cũ** (xoá ở commit `f1ad5fe`) cho AI tự viết lifecycle script. Kết quả không ổn định; xem ADR 0002 và 0003.
