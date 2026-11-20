# Mọi Component đều theo mô hình Store → Activation → Receipt

Mọi Kind (`cli`, `desktop-app`, `skill`, `mcp`) đều dùng chung một mô hình, học từ skills-manager (xem `docs/research/skills-manager.md`):

- Bản cài nằm trong Store, mỗi phiên bản ở một chỗ riêng.
- dotcode tạo Activation để đưa bản cài ra chỗ dùng.
- Receipt ghi lại cả hai.

Nhờ vậy, mọi thao tác trên Component đều làm bằng code cố định, không cần AI và không phụ thuộc vào việc Component được cài bằng Backend nào:

| Thao tác | Cách làm |
|---|---|
| Enable / disable | Tạo / gỡ Activation |
| Update | Cài bản mới bên cạnh bản cũ, verify, rồi chuyển Activation; giữ 1 bản trước để rollback |
| Uninstall | Gỡ Activation, xoá Store, xoá Receipt |

Không có trạng thái "trial" riêng: cài chính là thử. Vì vậy uninstall phải sạch.

## Hệ quả

- **Ghi ra ngoài workspace.** Activation được ghi vào một số đích cố định ở mức user: `~/.local/bin` (hoặc `~/.dotcode/bin` nếu `~/.local/bin` không có trong PATH), `~/.local/share/applications`, thư mục skill của agent, và config MCP. Policy cũ chỉ cho ghi trong workspace, policy này mở rộng hơn. Vẫn không dùng sudo và không sửa cấu hình NixOS hay Home Manager.
- **Chỉ gỡ thứ chắc chắn là của dotcode.** Kiểm tra bằng `lstat`: chỉ gỡ symlink trỏ vào Store, hoặc wrapper có dòng `# managed-by: dotcode`. Thư mục thật thì không bao giờ xoá đệ quy.
- **CLI dùng wrapper thay vì symlink.** Wrapper thêm các Requirement vào PATH rồi gọi thẳng binary trong Store. Binary bị link động trên NixOS thì chạy qua `nix-alien`.
- **Uninstall không xoá dữ liệu và config của app.** Chỉ xoá khi user tích chọn trên danh sách đường dẫn cụ thể.
- **Khi update skill,** file nào có ở bản cũ mà bản mới không có thì phải liệt kê cho user duyệt trước khi thay.
- **`service` chưa thuộc mô hình này trong v1.** Service vẫn dùng luồng Runtime như hiện tại.
