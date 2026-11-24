# Một luồng cài theo Recipe trên NixOS

Luồng cũ để AI viết `install.sh`, `update.sh`, `uninstall.sh`, `verify.sh` riêng cho mỗi app. Cách đó tốn nhiều bước và kết quả không ổn định. DotCode dùng chung một installer để thực thi Recipe, tạo Activation và ghi Receipt.

- Recipe mô tả nguồn để lấy và theo dõi bản mới, Requirement khi cài hoặc chạy, bước build/chuẩn bị của repo nếu cần, và thông tin để tạo Activation. Receipt ghi đúng bản đã cài; Pin khoá Recipe vào một phiên bản.
- Một tích hợp mise xử lý CLI từ GitHub Release, npm, PyPI, Cargo và Go. Khi cả mise và Nix có Recipe phù hợp cho cùng CLI, Detector xếp mise trước và AI ưu tiên Recipe đó. Dùng Nix nếu chỉ có flake/nixpkgs hoặc không có Recipe mise tương thích. Checkout file đã ghim commit và tải AppImage hoặc tarball trực tiếp vẫn là các cách lấy bản cài trong cùng luồng.
- Tách điều kiện để chạy khỏi cách lấy bản cài. Nếu CLI npm cần Node thì thêm Requirement, không viết lại cách cài. AppImage phải khớp digest nếu nguồn cung cấp; wrapper do DotCode sinh gọi `appimage-run` mà không thay đổi bản tải về.
- Recipe có thể mô tả bước build/chuẩn bị, ưu tiên lệnh có sẵn của repo. Chưa quyết định cho AI sinh hoặc chạy shell tùy ý; đổi thư mục làm việc sang Store không phải sandbox.

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
- **App cũ không có Receipt là Unmanaged.** DotCode không chạy lifecycle script cũ và không tự chuyển sang Recipe. Nếu bản cũ chặn cài mới, user xử lý xung đột trước khi thử lại.
- **Với `mcp`, Component có thể là một lệnh `npx`/`uvx` đã ghim phiên bản**, không cần Store. Activation khi đó chỉ là một entry trong config của agent.
