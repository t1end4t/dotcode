# Detector chạy trước, AI chỉ dùng khi Detector không tự quyết được

Hiện tại, muốn cài một repo thì AI phải tự khám phá repo và máy, tốn nhiều bước. Từ nay, Detector làm việc này bằng code cố định:

- Đọc file tree, release assets, các file manifest (`flake.nix`, `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `SKILL.md`…) và phần Install trong README.
- Đọc thông tin về máy: arch, libc, Nix, GPU, PATH.
- Trả về các Recipe ứng viên, đã xếp hạng.

## Khi nào dùng gì

| Tình huống | Cách xử lý |
|---|---|
| Có một ứng viên rõ ràng | Cài bằng một lần bấm, không cần AI |
| Còn nhiều biến thể (ví dụ llama.cpp: CPU, CUDA, Vulkan) | Hỏi user trên UI |
| Detector không chắc chắn, hoặc repo chỉ có hướng dẫn trong README | Gọi AI, đưa sẵn kết quả của Detector |
| Phải dùng Backend `script` | Gọi AI |

## Hệ quả

- **AI không tự ghi file nữa.** AI gọi các thao tác cố định: `search`, `add`, `detect`, `install(recipe)`, `enable`, `disable`, `update`, `rollback`, `uninstall`. Đây là bài học số 7 trong `docs/research/skills-manager.md`. Câu "tool activation unsupported" trong `instructions.md` sẽ bị bỏ.
- **Thêm repo không cần AI.** Có ô search GitHub ngay trong app, hoặc dán URL. Detector chạy khi Add và lưu kết quả vào Card. Khi Install, nếu kết quả đã cũ hơn 24 giờ thì Detector chạy lại.
- **Token GitHub** lấy từ `GITHUB_TOKEN`, nếu không có thì từ `gh auth token`. Token không được ghi ra đĩa hay log. Không có token thì app vẫn chạy được, nhưng bị giới hạn: search 10 lượt/phút, các API khác 60 lượt/giờ.
