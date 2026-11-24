# Recipe dạng dữ liệu chạy trên các Backend Nix và mise, v1 chỉ cho NixOS

Hiện tại AI tự viết `install.sh`, `update.sh`, `uninstall.sh`, `verify.sh` cho mỗi app. Cách này tốn nhiều bước, kết quả không ổn định, và nghiêng về một vài cách cài (AppImage, Nix) bất kể README của repo khuyên gì. Từ nay, mỗi Component được cài bằng một Recipe dạng dữ liệu, và dotcode thực thi Recipe đó bằng code cố định của từng Backend.

- Recipe ghi **nguồn để theo dõi bản mới**. Receipt ghi **đúng bản đã cài**.
- Pin khoá Recipe vào một phiên bản.

## Các Backend trong v1, xếp theo thứ tự ưu tiên trên NixOS

| Backend | Dùng cho |
|---|---|
| `files` | skill, MCP, instruction. Git checkout vào Store, ghim commit |
| `nix` | flake của repo, hoặc gói trong nixpkgs. Out-link trong Store chính là gc-root |
| `mise` | CLI từ GitHub release (`github:`, `aqua:`) và package của ngôn ngữ (`npm:`, `pypi:`, `cargo:`, `go:`) |
| `appimage` | desktop app (AppImage, tarball). Phải khớp digest nếu GitHub có cung cấp. Chạy qua `appimage-run` |
| `script` | AI viết script, chỉ khi không Backend nào khác dùng được. Script chỉ được ghi vào Store; Activation và Receipt vẫn do dotcode làm |

Thứ tự trên NixOS là `nix` → `mise` → `script`. Cách cài mà README khuyên là tín hiệu mạnh khi xếp hạng, nhưng được chuyển sang Backend cô lập tương ứng. Ví dụ `pip install` → `mise pypi:`.

## Cách Nix và mise phối hợp

- **Nix cung cấp Requirement** (node, python, rust…), lấy từ nixpkgs.
- **mise cài tool**, dùng các Requirement đó. mise không tự tải runtime về và không tự build từ source.
- Lý do: các bản prebuilt của mise và uv cần nix-ld, mà dotcode không được sửa `configuration.nix`.

dotcode dùng một **bản mise riêng**:
- Lấy từ nixpkgs, ghim phiên bản.
- `MISE_DATA_DIR`, `MISE_CONFIG_DIR`, `MISE_CACHE_DIR` đều nằm trong `DOTCODE_HOME`, nên không đụng tới mise của user.
- mise chỉ được gọi lúc install, update, uninstall và kiểm tra bản mới. Wrapper gọi thẳng binary, không qua shims của mise. Nếu mise hỏng thì các tool đã cài vẫn chạy.

## Các phương án đã cân nhắc

- **Chỉ dùng backend tự viết, không dùng mise.** Ban đầu được chọn để v1 nhỏ hơn. Bị bỏ vì mise đã giải quyết sẵn npm, pip, cargo, go và GitHub release, có output JSON, có kiểm tra bản mới. mise cũng chạy được trên macOS và Windows, nên sau này đa nền tảng sẽ dễ hơn.
- **Giao hết cho mise.** Không được, vì mise không cài desktop app. Trên NixOS, binary prebuilt mà mise tải về cũng cần nix-ld.
- **Giữ script tự do làm cách chính.** Không được, vì update, disable và uninstall khi đó vẫn cần AI, và kết quả không ổn định.

## Hệ quả

- **nix-ld là thông tin máy, không phải giả định.** Detector kiểm tra nix-ld có được bật không. Có thì wrapper gọi binary link động trực tiếp; không có thì chạy qua `nix-alien`. Nix vẫn cung cấp Requirement trong cả hai trường hợp, để Recipe chạy được trên máy không bật nix-ld.
- **v1 chỉ nhắm tới NixOS.** Schema của Recipe vẫn có khoá theo nền tảng. Phần cho máy không có Nix (mise tự cài Requirement, tải mise bản static) và macOS/Windows để sau.
- **App cũ đang có `install.sh` và các script khác thì tạm thời để nguyên.** v1 không tự chuyển, cũng không có nút chuyển sang Recipe. Sau này có thể gắn chúng vào Backend `script`, hoặc chuyển dần sang Recipe bằng cách cài song song rồi gỡ bản cũ.
- **Với `mcp`, Component có thể là một lệnh `npx`/`uvx` đã ghim phiên bản**, không cần Store. Activation khi đó chỉ là một entry trong config của agent.
