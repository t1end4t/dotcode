# dotcode quản lý phần AI/dev của máy, Nix giữ phần nền

Máy được quản lý bằng hai nơi: `nixos-conf` (NixOS + Home Manager) và dotcode. Nix giữ phần nền: driver, Docker, nix-ld, network, font, desktop, `nodejs`. dotcode quản lý mọi thứ AI/dev thay đổi nhanh: CLI, skill, plugin, subagent, MCP, service, runtime LLM và Model. dotcode không bao giờ sửa `nixos-conf`; khi cần thứ gì ở tầng hệ thống (ví dụ CUDA toolkit), dotcode chỉ báo cho user.

## Kind mới

| Kind | Store | Activation |
|---|---|---|
| `plugin` | Checkout ghim commit | Đăng ký qua CLI của agent: `claude plugin marketplace add <storePath>` + `install`/`enable`; `codex plugin marketplace add` + `add`. Codex không có lệnh bật/tắt, nên dotcode chỉ sửa key `[plugins."<name>@<mkt>"] enabled` trong `~/.codex/config.toml` |
| `subagent` | Checkout ghim commit (Backend `files`) | File `.md` vào `~/.claude/agents/`, file `.toml` vào `~/.codex/agents/`. Không chuyển định dạng giữa hai agent |
| `service` | Bản cài của một `cli` | Unit `systemd --user` có dòng `# managed-by: dotcode` |

- **Cả plugin là một Component.** Plugin tự quản skills, agents, hooks và MCP bên trong; dotcode không tách ra. Marketplace có nhiều plugin thì mỗi plugin là một Component.
- **Plugin chỉ Activation cho agent khớp manifest:** `.claude-plugin/plugin.json` cho Claude, `.codex-plugin/plugin.json` cho Codex.
- **Runtime LLM (llama.cpp, ollama, vllm) là `cli`** có biến thể, cộng thêm `service` khi chạy làm server.
- **Service có ba điều khiển:** enable/disable tạo/gỡ unit; start/stop điều khiển tiến trình; autostart mặc định bật khi service được enable, áp dụng khi user đăng nhập mà không cần mở DotCode. Chạy từ lúc boot trước khi đăng nhập cần linger cấu hình bên ngoài DotCode. Trạng thái chạy, port và log độc lập với trạng thái Activation. Kiểm tra xung đột port trước khi chạy.
- **Service tham chiếu một CLI:** không tắt hoặc gỡ CLI khi còn service dùng. Update/rollback CLI dừng các service đang chạy trước khi chuyển bản và chạy lại sau đó. Gỡ riêng service không gỡ bản cài CLI.
- **Config agent:** ưu tiên CLI chính thức. Nếu phải sửa file, chỉ sửa mục do DotCode sở hữu và giữ nguyên nội dung khác, kể cả comment. Từ chối ghi config do Nix/Home Manager quản lý.

## Secret của service

dotcode không lưu, không hiện và không gửi cho AI giá trị của secret. Recipe chỉ ghi tên các biến cần có. Khi install, dotcode tạo file `~/.config/dotcode/secrets/<service>.env` quyền `0600`, mỗi biến một dòng `KEY=`; user tự điền giá trị. dotcode chỉ đọc file để biết key nào còn thiếu, và chặn start khi còn thiếu. Unit đọc file qua `EnvironmentFile=`. Không ghi đè file đã có. Khi uninstall, giữ file trừ khi user chọn xoá dữ liệu.

Không mã hoá trong v1: máy chưa có sops hay agenix. `systemd-creds` và gnome-keyring bị bỏ vì service thường đọc secret từ biến môi trường, nên mỗi service cần thêm wrapper; keyring còn chỉ mở sau khi user đăng nhập. Khi `nixos-conf` có sops hoặc agenix, unit chỉ cần trỏ `EnvironmentFile=` sang file do Nix giải mã.

## Không phải Kind

- **Hook.** Cả Claude Code lẫn Codex đều không có định dạng hook đứng riêng; plugin là cách đóng gói hook. Hook ghi thẳng vào `settings.json` sẽ hỏng khi đường dẫn đổi (anthropics/claude-code#18517), còn Codex bắt duyệt lại hook mỗi khi hash đổi. Repo chỉ có script hook thì chỉ có badge `Hook`.
- **Library.** Package không có entry point chạy được (`bin`, `[project.scripts]`) được cài vào một project, không có đích Activation ở mức user. Chỉ có badge `Library`.

## Model

Model được đăng ký tại chỗ trong `DOTCODE_MODELS` (mặc định `~/LOCAL-AI-MODELS`), không chuyển vào Store. File hàng chục GB không nên nhân đôi, và user vẫn quản lý thư mục đó. Service tham chiếu tới Model; không xoá được Model khi còn service đang dùng. v1 chưa tải Model từ Hugging Face.

## Unmanaged

dotcode quét chỉ đọc: PATH, unit trong `~/.config/systemd/user/`, thư mục skill và agent, plugin đã cài. Mọi thứ trỏ vào `/nix/store` thuộc Nix và bị loại. Phần còn lại không có Receipt là Unmanaged. Nếu bản cũ xung đột với bản mới, DotCode báo để user tự xử lý trước khi cài lại. DotCode không nhận quản lý thứ không có Receipt và không chạy lifecycle script cũ. Unit `dotcode-9router.service` do luồng Runtime cũ tạo cũng là Unmanaged.

## Các phương án đã cân nhắc

- **Plugin bằng symlink vào `~/.claude/skills/`.** Claude tự load thư mục skill có `.claude-plugin/plugin.json`, nhưng tài liệu không nói gì về symlink. Bị bỏ vì không được hỗ trợ chính thức.
- **Quản lý toàn bộ config của agent và secret.** Đó là việc của Home Manager; máy chưa có sops hay agenix để mã hoá secret.

## Hệ quả

- Chưa biết Claude và Codex có nhận file subagent dạng symlink không. Nếu không, Activation là bản copy có dòng đánh dấu `managed-by: dotcode`.
- Chưa làm trong v1: Docker container, dataset Hugging Face, instruction file toàn cục.
