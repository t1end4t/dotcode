# Bài học từ xingkongliang/skills-manager

Nguồn: https://github.com/xingkongliang/skills-manager, commit `f374817` (2026-11-14).
Đã đọc cả code Rust trong `src-tauri/src/core`, không chỉ README.

Trạng thái: ghi chú nghiên cứu. Các quyết định đã chốt nằm ở ADR 0001–0003 và có hiệu lực cao hơn file này. Phần "Mở rộng cho dotcode" bên dưới đã bị ADR 0002 thay thế. File được giữ lại vì có các chi tiết triển khai mà ADR không ghi: quy tắc ownership, update an toàn, content hash.

## Vì sao update, disable/enable, uninstall lại dễ

Họ tách việc **cài skill** khỏi việc **bật skill cho agent**:

```
~/.skills-manager/skills/<name>/      ← library: mỗi skill chỉ có 1 bản thật
~/.claude/skills/<name>  → symlink    ← deployment: link tới library
~/.codex/skills/<name>   → symlink
```

Có 2 bảng ghi (`core/migrations.rs:72-106`):

- **`skills`**: skill đến từ đâu và đang ở phiên bản nào. Gồm `source_type` (git, skillssh, local, zip), `source_ref`, `source_subpath`, `source_branch`, `source_revision` (commit đang cài), `remote_revision`, `content_hash`, `update_status`, `last_checked_at`, `last_check_error`.
- **`skill_targets`**: skill đã được đặt vào đâu, cho agent nào. Gồm `tool`, `target_path`, `mode` (symlink hoặc copy), `source_hash`, `UNIQUE(skill_id, tool)`.

| Thao tác | Cách làm |
|---|---|
| Enable cho agent | Tạo symlink và ghi 1 dòng vào `skill_targets` (`commands/sync.rs:300`) |
| Disable | Xoá symlink. Bản trong library vẫn còn nên bật lại tức thì |
| Update | Thay thư mục trong library. Mọi symlink tự thấy bản mới, chỉ các bản copy phải đồng bộ lại (`resync_copy_targets`) |
| Uninstall | Gỡ các target đã ghi, xoá thư mục library, xoá record, ghi audit log (`commands/skills.rs:750`) |
| Check update | Chỉ chạy `git ls-remote` rồi so commit với `source_revision`, không cần clone. Các skill cùng một repo lớn chỉ hỏi remote 1 lần (`check_all_skill_updates`) |

## Dotcode hiện tại (lúc ghi chú)

- Skill được viết bằng form, rồi ghi thẳng file `workspace/.agents|.claude/skills/<name>/SKILL.md` (`runtime.mjs` `agentFiles`).
- Disable nghĩa là **xoá file** và lưu một bản backup vào `runtime/backups/`. Bật lại thì phải viết lại nội dung.
- Mỗi skill gắn với đúng một agent (id `agent:skill:name`). Muốn dùng cho cả Codex và Claude thì phải tạo 2 bản.
- Skill bên thứ ba (`npx skills add …` trong `frontend/src/data/items.ts`) đi qua AI chat như một tool bình thường, với `install.sh`/`update.sh`. Cách này nặng và kết quả không ổn định cho thứ chỉ là một thư mục file.
- Skill global (`~/.claude/skills`, `~/.agents/skills`, `~/.codex/skills`) chỉ hiển thị, không quản lý được (`installedSkills`).

## Nên học gì, xếp theo giá trị

1. **Library + symlink deploy.** Đây là thay đổi cốt lõi. Lưu skill ở `DOTCODE_HOME/skills/<name>/` và symlink vào `workspace/.agents/skills/` hoặc `workspace/.claude/skills/`. Một skill dùng được cho cả hai agent, và disable chỉ là xoá link.

2. **Ghi lại nguồn gốc khi cài từ GitHub.** Lưu repo, subpath, branch, commit và content hash. Có mấy trường này thì update thành thao tác cố định do server chạy, không cần AI viết script. Cài skill cũng nên tách khỏi luồng lifecycle-scripts của tool.

3. **Chỉ xoá thứ chắc chắn là của mình** (`core/sync_engine.rs:83-230`, `:475-530`).
   - Kiểm tra loại target bằng `lstat` (không đi theo symlink). Các loại gồm: không có gì, link của mình, link lạ, thư mục thật, file thật.
   - Quyền xoá được biểu diễn bằng `ReplacePolicy` (enum, không dùng bool), để mỗi chỗ gọi hàm phải nói rõ ý định.
   - *"A row is a statement about the past, never proof that whatever is on disk is ours."* Record ghi `symlink` thì không được phép xoá một thư mục thật đã thay chỗ link đó.
   - Hàm xoá phải đúng với loại đã kiểm tra: link thì `unlink`, không dùng `remove_dir_all`. Như vậy nếu đĩa thay đổi giữa lúc kiểm tra và lúc xoá thì thao tác báo lỗi chứ không xoá nhầm.
   - Từ chối khi src và dst lồng nhau theo bất kỳ chiều nào.
   - Với symlink: link trỏ vào library thì chắc chắn là của dotcode.

4. **Update an toàn** (`core/removals.rs`, `update_git_skill_internal` trong `commands/skills.rs`).
   - Giải nén bản mới vào một thư mục staging bên cạnh, rồi đổi chỗ bằng `rename`. Có guard dọn thư mục staging nếu thất bại.
   - Trước khi đổi, liệt kê **những file đang có mà bản mới không có**. Đó có thể là file user hoặc chính skill đã ghi vào thư mục (issue #256: người dùng mất template). Thư mục bị bỏ hẳn được báo thành 1 dòng `dir/`.
   - User phải duyệt đúng danh sách đó. Nếu danh sách đổi thì hỏi lại. Khi update hàng loạt thì skill đó được giữ lại (held back), không tự áp dụng.
   - Cách này khớp với cơ chế plan/approve sẵn có của dotcode.

5. **Các chi tiết nhỏ**
   - Chỉ coi một thư mục là skill khi có `SKILL.md` (chấp nhận `skill.md` cho bản cũ), không dùng `README.md` hay `CLAUDE.md` (`docs/skill-format-detection-spec.md`).
   - Khi tính content hash, bỏ qua `__pycache__`, `*.pyc`, `.DS_Store`, nếu không thì bản copy sẽ luôn bị coi là đã sửa (`core/content_hash.rs`).
   - Giải nén zip an toàn, chống zip-slip. Archive phải chứa đúng 1 skill (`core/installer.rs`).
   - Không giữ lock trong lúc gọi mạng: resolve remote trước, lấy lock sau.

6. **Adopt.** Họ có lệnh `skills adopt <dir> --dry-run`, chuyển skill đang có vào library rồi thay bằng symlink. Dotcode có thể dùng cách này cho skill global đang chỉ đọc được. Cần quyết định chính sách, vì dotcode hiện chỉ cho phép thay đổi trong workspace.

7. **Để AI gọi lệnh thay vì tự ghi file.** Skill `manage-skills` cho phép agent điều khiển app qua CLI (`--json`, `--dry-run`, lỗi có kiểu như `TARGET_CONFLICT`), không ghi thẳng vào thư mục của agent. Áp vào dotcode: assistant gọi các thao tác cố định như install-from-repo, enable, disable, update, remove.

## Không cần học

SQLite (state JSON hiện tại đủ dùng), engine merge và backup bằng git, hỗ trợ 56 agent, junction trên Windows. Presets có thể để sau.

## Mở rộng cho dotcode: không chỉ có skill

Dotcode quản lý nhiều kiểu item: skill, MCP, instruction, CLI tool, desktop app, service, tài liệu học. Phần đáng học không nằm ở skill. Đó là cách tổ chức có thể áp cho mọi thứ: **bản cài có phiên bản → bước kích hoạt (link) → bản ghi nguồn gốc**. Package manager nào cũng đã có sẵn mô hình này:

| | Nơi chứa bản cài | Kích hoạt | Gỡ / rollback |
|---|---|---|---|
| skills-manager | `~/.skills-manager/skills/<name>` | symlink vào thư mục agent | xoá link |
| Nix | `/nix/store/<hash>-pkg` | profile / gc-root | xoá root, rollback generation |
| Scoop (Windows) | `apps/<name>/<version>` | junction `current` + shim | `scoop reset`, uninstall |
| Homebrew (macOS) | `Cellar/<name>/<version>` | symlink vào prefix | `brew unlink` / `switch` |

Dotcode không cần tự làm lại phần này. Việc của dotcode là đặt một hợp đồng chung lên trên các backend: install, update, uninstall, verify, cùng bản ghi nguồn gốc.

### Theo kiểu item

| Kiểu | Cách làm |
|---|---|
| Skill, MCP, instruction | Chỉ là file. Dotcode tự quản lý bằng code cố định (library + symlink), không cần AI hay Nix |
| CLI tool, desktop app | Cài qua backend, ưu tiên Nix |
| Service | Như trên, thêm phần runtime (hiện là systemd user) |
| Tài liệu học | Không cài, chỉ là card (cùng lắm là clone vào workspace để đọc) |

### Nix là backend ưu tiên, không phải mô hình trung tâm

Nix chạy được trên NixOS, các distro Linux khác và macOS. Windows chỉ dùng được qua WSL.

Thứ tự ưu tiên đề xuất:

1. Repo có sẵn `flake.nix`
2. Gói trong nixpkgs
3. Release binary đã ghim checksum (bọc bằng `buildFHSEnv` / `steam-run` nếu cần)
4. Package manager của ngôn ngữ (`uvx`, `npx`, `cargo`)
5. Cuối cùng mới tới derivation tự viết (AI rất dễ sai hash và dependency)

Để update tự kiểm tra được mà không cần hỏi AI, nên ghim revision (flake ref hoặc nixpkgs rev) trong bản ghi nguồn gốc.

### Recipe dạng dữ liệu thay cho script tự do

Hiện AI viết `install.sh` tuỳ ý cho mỗi app. Nên chuyển dần sang việc AI sinh ra một recipe dạng dữ liệu, server thực thi theo cách cố định:

```json
{ "backend": "nix-flake", "ref": "github:owner/repo/<rev>", "attr": "default" }
{ "backend": "nixpkgs", "attr": "ripgrep", "rev": "<nixpkgs-rev>" }
{ "backend": "github-release", "repo": "owner/repo", "asset": "...", "sha256": "..." }
```

Khi đó update, disable và uninstall trở thành thao tác cố định, và chỉ cần AI ở bước chọn recipe. Script tự do được giữ làm phương án cuối.

## Đã chốt (2026-11-20)

- **Không có trạng thái "trial" riêng.** Cài và dùng chính là thử; không ổn thì uninstall. Hệ quả: uninstall phải sạch và đáng tin cậy, vì đó là điều làm cho việc "cứ cài thử" trở nên an toàn.
- **Đa nền tảng (Windows, macOS) để ngỏ, chưa nhắm tới.** Không làm phần tách backend bây giờ. Chỉ tránh ghi cứng những chỗ dễ tránh, ví dụ prompt nên ghi "chọn backend theo nền tảng đã phát hiện, ưu tiên Nix khi có" thay vì "luôn dùng .nix". Lưu ý: dotcode hiện đã gắn với Linux (script bash, systemd user, launcher `.desktop`), nên hỗ trợ Windows sau này là một dự án riêng.
- **Luồng cài repo GitHub đã chốt**, xem các ADR và các thuật ngữ trong `GLOSSARY.md`:
  - [0001](../adr/0001-store-activation-receipt.md): mô hình Store → Activation → Receipt cho mọi Kind.
  - [0002](../adr/0002-recipes-on-nix-and-mise.md): Recipe chạy trên các Backend Nix và mise, v1 chỉ cho NixOS.
  - [0003](../adr/0003-detector-first-ai-fallback.md): Detector chạy trước, AI chỉ dùng khi cần.
  - So với các phần ở trên: mise thay cho phần "release binary" và "package manager của ngôn ngữ" trong thứ tự ưu tiên của Nix.
  - App cũ đang dùng `install.sh` tạm thời để nguyên.
  - Phần sắp xếp Library sẽ bàn ở một buổi riêng.

## Lỗi nhỏ phát hiện được

Card `skills-manager` trong `frontend/src/data/items.ts` ghi sai thông tin. Lệnh cài không phải `cargo install skills-manager` (app tải từ trang release, còn CLI tên là `skills-manager-cli`), và library nằm ở `~/.skills-manager`, không phải `~/.skills`.
