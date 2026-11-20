// Throwaway: compare three Library layouts at /?variant=A|B|C, outside the live app.
// ponytail: one Component per mock Card; expand fixtures when testing multi-Component flows.
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { ArrowLeft, ArrowRight, ArrowUpRight, Box, Check, Search, Terminal } from "lucide-react";
import "./prototype.css";

type Card = {
  name: string; repo: string; kind: "cli" | "desktop-app" | "skill" | "mcp";
  description: string; backend: string; version: string; state: "available" | "enabled" | "disabled";
};
const initialCards: Card[] = [
  { name: "ripgrep", repo: "BurntSushi/ripgrep", kind: "cli", description: "Tìm kiếm trong code, nhanh và đúng chỗ.", backend: "nix", version: "14.1.1", state: "enabled" },
  { name: "Zed", repo: "zed-industries/zed", kind: "desktop-app", description: "Không gian viết code với hiệu năng của một ứng dụng native.", backend: "appimage", version: "0.161.2", state: "enabled" },
  { name: "Taste Skill", repo: "Leonxlnx/taste-skill", kind: "skill", description: "Hướng dẫn thiết kế giao diện cho coding agent.", backend: "files", version: "a31c8ef", state: "enabled" },
  { name: "Context7", repo: "upstash/context7", kind: "mcp", description: "Đưa tài liệu mới nhất vào ngữ cảnh của agent.", backend: "mise", version: "1.0.0", state: "disabled" },
  { name: "llama.cpp", repo: "ggml-org/llama.cpp", kind: "cli", description: "Chạy mô hình ngôn ngữ ngay trên máy của bạn.", backend: "nix", version: "b4120", state: "available" },
  { name: "Skills Manager", repo: "xingkongliang/skills-manager", kind: "cli", description: "Quản lý một bộ skill chung cho các coding agent.", backend: "mise", version: "0.2.0", state: "available" },
];
const variants = ["A", "B", "C"] as const;
type Variant = typeof variants[number];
const names = { A: "Library · Card grid", B: "Workbench · Table", C: "Focus · Split view" };
const stateLabels = { available: "Chưa cài", enabled: "Đã cài · Bật", disabled: "Đã cài · Tắt" };
const readVariant = (): Variant => {
  const value = new URLSearchParams(location.search).get("variant");
  return variants.find(key => key === value) ?? "A";
};

type LayoutProps = { cards: Card[]; selected: Card; select: (card: Card) => void; act: (card: Card) => void };
function CardIdentity({ card }: { card: Card }) {
  return <><span className="app-icon"><Box size={20} aria-hidden="true" /></span><span><strong>{card.name}</strong><small>{card.repo}</small></span></>;
}
function Action({ card, act }: Pick<LayoutProps, "act"> & { card: Card }) {
  return <button className="action" onClick={() => act(card)}>{card.state === "available" ? "Cài thử" : card.state === "enabled" ? "Tắt" : "Bật"}<ArrowUpRight size={14} aria-hidden="true" /></button>;
}

export function VariantA({ cards, selected, select, act }: LayoutProps) {
  return <div className="library-layout">
    <aside className="library-sidebar"><p className="eyebrow">WORKSPACE</p><h2>Thư viện<br />của bạn.</h2><p>Mọi công cụ, một nơi.<br />Chọn một Card để khám phá.</p><span className="sidebar-label"><Box size={16} aria-hidden="true" /> Library <b>{cards.length}</b></span><div className="sidebar-bottom">01 / LIBRARY<br /><small>Chọn công cụ. Giữ tập trung.</small></div></aside>
    <main><div className="section-heading"><h2>Trong Library</h2><span>{cards.length} Card</span></div><div className="card-grid">{cards.map(card => <article key={card.repo} className={selected.repo === card.repo ? "tool-card selected" : "tool-card"}>
      <button className="card-open" onClick={() => select(card)} aria-pressed={selected.repo === card.repo}><span className="identity"><CardIdentity card={card} /></span><p>{card.description}</p></button>
      <div className="card-meta"><span>{card.kind}</span><span className={`status ${card.state}`}>{stateLabels[card.state]}</span></div><footer><code>{card.backend} / {card.version}</code><Action card={card} act={act} /></footer>
    </article>)}</div></main>
  </div>;
}

export function VariantB({ cards, selected, select, act }: LayoutProps) {
  return <main className="workbench-layout"><div className="workbench-heading"><div><p className="eyebrow">LOCAL / LIBRARY</p><h2>Công cụ trong tầm tay<span>_</span></h2></div><Terminal size={38} strokeWidth={1} aria-hidden="true" /></div>
    <div className="table-scroll"><table><thead><tr><th>Card / Repository</th><th>Kind</th><th>Recipe</th><th>Trạng thái</th><th><span className="sr-only">Thao tác</span></th></tr></thead><tbody>{cards.map((card, index) => <tr key={card.repo} className={selected.repo === card.repo ? "selected" : ""}><td><button className="table-name" onClick={() => select(card)} aria-pressed={selected.repo === card.repo}><span className="row-number">{String(index + 1).padStart(2, "0")}</span><span><strong>{card.name}</strong><small>{card.repo}</small></span></button></td><td>{card.kind}</td><td><code>{card.backend}<small>{card.version}</small></code></td><td><span className={`status ${card.state}`}>{stateLabels[card.state]}</span></td><td><Action card={card} act={act} /></td></tr>)}</tbody></table></div>
    <div className="workbench-note"><span>SELECTED / {selected.name}</span><p>{selected.description}</p></div>
  </main>;
}

export function VariantC({ cards, selected, select, act }: LayoutProps) {
  return <main className="focus-layout"><section className="focus-list"><p className="eyebrow">LIBRARY / {cards.length} CARD</p><h2>Ít nhiễu hơn.<br />Rõ việc hơn.</h2>{cards.map(card => <button key={card.repo} className={`focus-row ${selected.repo === card.repo ? "selected" : ""}`} onClick={() => select(card)} aria-pressed={selected.repo === card.repo}><span className="identity"><CardIdentity card={card} /></span><ArrowRight size={17} aria-hidden="true" /></button>)}</section>
    <section className="focus-detail" aria-label={`Chi tiết ${selected.name}`}><div className="detail-top"><span>{selected.kind}</span><span className={`status ${selected.state}`}>{stateLabels[selected.state]}</span></div><span className="detail-icon"><Box size={48} strokeWidth={1} aria-hidden="true" /></span><h2>{selected.name}</h2><code>{selected.repo}</code><p className="detail-description">{selected.description}</p><dl><div><dt>Backend</dt><dd>{selected.backend}</dd></div><div><dt>Phiên bản mẫu</dt><dd>{selected.version}</dd></div><div><dt>Activation</dt><dd>{selected.state === "enabled" ? "Bật" : selected.state === "disabled" ? "Tắt" : "Chưa tạo"}</dd></div></dl><Action card={selected} act={act} /><p className="detail-caption">Thử thao tác để đánh giá thiết kế.</p></section>
  </main>;
}

function PrototypeSwitcher({ variant, change }: { variant: Variant; change: (offset: number) => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]')) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); change(event.key === "ArrowLeft" ? -1 : 1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [change]);
  return <nav className="prototype-switcher" aria-label="Bố cục prototype"><button onClick={() => change(-1)} aria-label="Bố cục trước"><ArrowLeft size={18} /></button><span aria-live="polite"><small>PROTOTYPE / {variant}</small>{names[variant]}</span><button onClick={() => change(1)} aria-label="Bố cục sau"><ArrowRight size={18} /></button></nav>;
}

function Prototype() {
  const [variant, setVariant] = useState(readVariant);
  const [cards, setCards] = useState(initialCards);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const [selectedRepo, setSelectedRepo] = useState(initialCards[0].repo);
  const [lastAction, setLastAction] = useState("Chưa có thao tác.");
  useEffect(() => {
    const sync = () => setVariant(readVariant());
    window.addEventListener("popstate", sync);
    return () => window.removeEventListener("popstate", sync);
  }, []);
  const change = (offset: number) => {
    const next = variants[(variants.indexOf(variant) + offset + variants.length) % variants.length];
    const url = new URL(location.href);
    url.searchParams.set("variant", next);
    history.replaceState(null, "", url);
    setVariant(next);
  };
  const act = (card: Card) => {
    const state = card.state === "enabled" ? "disabled" : "enabled";
    setCards(previous => previous.map(entry => entry.repo === card.repo ? { ...entry, state } : entry));
    setSelectedRepo(card.repo);
    setLastAction(`${card.name}: ${stateLabels[state]} (mô phỏng).`);
  };
  const visible = cards.filter(card => (kind === "all" || card.kind === kind) && `${card.name} ${card.repo} ${card.description}`.toLowerCase().includes(query.toLowerCase()));
  const selected = visible.find(card => card.repo === selectedRepo) ?? visible[0] ?? cards.find(card => card.repo === selectedRepo)!;
  const Layout = { A: VariantA, B: VariantB, C: VariantC }[variant];
  return <div className={`prototype variant-${variant}`}><div className="prototype-notice">BẢN THỬ UI · Dữ liệu giả, thao tác trong bộ nhớ · Tải lại để đặt lại</div><header className="topbar"><a className="brand" href="/"><span className="brand-mark">d.</span>dotcode<span className="brand-section">/ Library</span></a><span className="local-label"><Check size={13} aria-hidden="true" /> Local workspace</span></header>
    <div className="toolbar"><label className="search"><Search size={17} aria-hidden="true" /><span className="sr-only">Tìm trong Library mẫu</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm trong Library…" /></label><label className="kind-filter"><span>Kind</span><select value={kind} onChange={event => setKind(event.target.value)}><option value="all">Tất cả</option>{["cli", "desktop-app", "skill", "mcp"].map(value => <option key={value}>{value}</option>)}</select></label><span className="result-count">{visible.length} / {cards.length} Card</span></div>
    {visible.length ? <Layout cards={visible} selected={selected} select={card => setSelectedRepo(card.repo)} act={act} /> : <main className="empty">Không có Card phù hợp. Hãy đổi từ khoá hoặc Kind.</main>}
    <section className="prototype-state"><p role="status">{lastAction}</p><details><summary>Trạng thái prototype · {variant} · {selected.name}</summary><pre>{JSON.stringify({ variant, query, kind, selected: selected.repo, lastAction, cards }, null, 2)}</pre></details></section>
    {import.meta.env.DEV && <PrototypeSwitcher variant={variant} change={change} />}
  </div>;
}

createRoot(document.getElementById("root")!).render(<Prototype />);
