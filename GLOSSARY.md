# DotCode

Dashboard chạy trên máy local, dùng để tìm, cài và quản lý các repo GitHub: CLI, desktop app, skill và MCP server cho coding agent.

## Thư viện

**Library**:
Tập hợp các Card mà user đã thêm.
_Avoid_: catalog (chỉ dùng khi nói về file lưu trữ), collection

**Card**:
Một repo GitHub có trong Library, gồm cả metadata và ghi chú của user. Card không phải là bản cài: thêm hay xoá Card không cài hay gỡ gì cả.
_Avoid_: item, tool entry

**Component**:
Một phần cài được của repo mà Card trỏ tới, có đúng một Kind. Một repo có thể có nhiều Component, ví dụ vừa có desktop app vừa có CLI.
_Avoid_: part, module, package

**Kind**:
Loại của một Component: `cli`, `desktop-app`, `skill` hoặc `mcp`.
_Avoid_: type, category (category dùng để sắp xếp Card)

## Cài đặt

**Recipe**:
Mô tả bằng dữ liệu cách cài một Component: dùng Backend nào, lấy từ nguồn nào, theo dõi bản mới ra sao. Recipe không phải là script.
_Avoid_: install plan, install script

**Backend**:
Cách cài mà dotcode biết thực thi, mỗi Backend chạy được một loại Recipe: `files`, `nix`, `mise`, `appimage`, `script`.
_Avoid_: installer, method, provider

**Detector**:
Phần của dotcode đọc một repo và thông tin về máy, rồi đưa ra các Recipe ứng viên đã được xếp hạng.
_Avoid_: analyzer, scanner

**Requirement**:
Một chương trình mà Component cần để cài hoặc để chạy, ví dụ node hoặc python. dotcode cung cấp nó riêng cho Component, không đưa lên PATH chung của user.
_Avoid_: runtime, dependency

**Store**:
Nơi chứa các bản cài, mỗi phiên bản của một Component nằm ở một chỗ riêng và không bị sửa sau khi cài.
_Avoid_: install dir, library (Library là tập Card)

**Activation**:
Những thứ dotcode đặt ra ngoài Store để một bản cài dùng được: wrapper trên PATH, launcher, link skill, entry trong config MCP. Component **enabled** nghĩa là đang có Activation.
_Avoid_: deployment, link (link chỉ là một dạng Activation)

**Receipt**:
Bản ghi của dotcode về một Component đã cài: Recipe đã dùng, đúng phiên bản đã cài, vị trí trong Store, và các Activation đã tạo. Receipt ghi lại quá khứ, nó không chứng minh rằng thứ đang có trên đĩa là của dotcode.
_Avoid_: install record, inventory entry

**Pin**:
Khoá Recipe vào một phiên bản cụ thể để dotcode không update Component đó.
_Avoid_: lock, freeze
