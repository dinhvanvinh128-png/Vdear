/* ============================================================
   Gia Phả — Family Tree Web App
   Pure client-side. Data persisted in localStorage.
   ============================================================ */

const STORAGE_KEY = "giapha.data.v1";

// Layout constants
const NODE_W = 170;
const NODE_H = 82;
const H_GAP = 34;      // horizontal gap between sibling subtrees
const V_GAP = 76;      // vertical gap between generations
const COUPLE_GAP = 26; // gap between spouses

/** @type {Array<{id:string,name:string,gender:string,birth:string,death:string,note:string,parentId:string|null,spouseId:string|null}>} */
let people = [];

/* ---------------------- Persistence ---------------------- */
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    people = raw ? JSON.parse(raw) : [];
  } catch { people = []; }
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(people)); } catch {}
}
function uid() { return "p" + Math.random().toString(36).slice(2, 9); }
function byId(id) { return people.find(p => p.id === id) || null; }

/* ---------------------- Layout engine ---------------------- */
function childrenOf(person, spouse) {
  const kids = people.filter(p =>
    p.parentId === person.id || (spouse && p.parentId === spouse.id)
  );
  kids.sort((a, b) => (parseInt(a.birth) || 9999) - (parseInt(b.birth) || 9999));
  return kids;
}

function computeLayout() {
  const pos = {};              // id -> {x, y}
  const spouseLinks = [];      // [aId, bId]
  const parentLinks = [];      // {parentCenterX, parentBottomY, childCenterX, childTopY}
  const rendered = new Set();
  let cursorX = 0;

  function place(personId, depth) {
    if (rendered.has(personId)) return null;
    rendered.add(personId);
    const person = byId(personId);
    const spouse = person.spouseId ? byId(person.spouseId) : null;
    if (spouse) rendered.add(spouse.id);

    const y = depth * (NODE_H + V_GAP);
    const coupleW = spouse ? NODE_W * 2 + COUPLE_GAP : NODE_W;
    const kids = childrenOf(person, spouse);

    let coupleLeftX;
    if (kids.length === 0) {
      coupleLeftX = cursorX;
      cursorX += coupleW + H_GAP;
    } else {
      const centers = kids.map(k => place(k.id, depth + 1)).filter(c => c !== null);
      const childrenCenter = centers.length
        ? (centers[0] + centers[centers.length - 1]) / 2
        : cursorX + coupleW / 2;
      coupleLeftX = childrenCenter - coupleW / 2;
    }

    pos[person.id] = { x: coupleLeftX, y };
    let coupleCenter = coupleLeftX + coupleW / 2;
    if (spouse) {
      pos[spouse.id] = { x: coupleLeftX + NODE_W + COUPLE_GAP, y };
      spouseLinks.push([person.id, spouse.id]);
    }

    // record parent-child links
    for (const k of kids) {
      if (!pos[k.id]) continue;
      parentLinks.push({
        parentCenterX: coupleCenter,
        parentBottomY: y + NODE_H,
        childCenterX: pos[k.id].x + NODE_W / 2,
        childTopY: (depth + 1) * (NODE_H + V_GAP),
        childId: k.id
      });
    }
    return coupleCenter;
  }

  // Roots = people with no parent, excluding married-in spouses whose partner is in the line.
  const roots = people.filter(p => !p.parentId)
    .filter(p => !(p.spouseId && byId(p.spouseId) && byId(p.spouseId).parentId));

  for (const r of roots) {
    if (rendered.has(r.id)) continue;
    place(r.id, 0);
    cursorX += H_GAP * 2; // extra gap between separate family roots
  }
  // Any orphans not reached (safety)
  for (const p of people) {
    if (!rendered.has(p.id)) { place(p.id, 0); cursorX += H_GAP; }
  }

  return { pos, spouseLinks, parentLinks };
}

/* ---------------------- Rendering ---------------------- */
const treeEl = document.getElementById("tree");
const emptyEl = document.getElementById("emptyState");

function render() {
  save();
  if (people.length === 0) {
    treeEl.innerHTML = "";
    emptyEl.hidden = false;
    return;
  }
  emptyEl.hidden = true;

  const { pos, spouseLinks, parentLinks } = computeLayout();

  // Normalize coordinates so minimum is 0
  const xs = Object.values(pos).map(p => p.x);
  const ys = Object.values(pos).map(p => p.y);
  const minX = Math.min(...xs), minY = Math.min(...ys);
  const maxX = Math.max(...xs) + NODE_W, maxY = Math.max(...ys) + NODE_H;
  const width = maxX - minX, height = maxY - minY;
  const off = (p) => ({ x: pos[p].x - minX, y: pos[p].y - minY });

  treeEl.style.width = width + "px";
  treeEl.style.height = height + "px";

  // Build SVG links
  let paths = "";
  for (const [a, b] of spouseLinks) {
    const A = off(a), B = off(b);
    const y = A.y + NODE_H / 2;
    paths += `<line x1="${A.x + NODE_W}" y1="${y}" x2="${B.x}" y2="${y}" stroke="#b58d5f" stroke-width="2.5"/>`;
  }
  for (const l of parentLinks) {
    const px = l.parentCenterX - minX, py = l.parentBottomY - minY;
    const cx = l.childCenterX - minX, cy = l.childTopY - minY;
    const midY = py + (cy - py) / 2;
    paths += `<path d="M ${px} ${py} V ${midY} H ${cx} V ${cy}" fill="none" stroke="#c4a373" stroke-width="2"/>`;
  }
  const svg = `<svg class="links" width="${width}" height="${height}">${paths}</svg>`;

  // Build nodes
  let nodes = "";
  for (const person of people) {
    if (!pos[person.id]) continue;
    const o = off(person.id);
    const cls = person.gender === "male" ? "male" : person.gender === "female" ? "female" : "other";
    const dates = formatDates(person);
    const dead = person.death ? ` <span class="badge-dead" title="Đã mất">🕯</span>` : "";
    const note = person.note ? `<div class="note" title="${esc(person.note)}">${esc(person.note)}</div>` : "";
    nodes += `<div class="node ${cls}" style="left:${o.x}px;top:${o.y}px" data-id="${person.id}">
      <div class="name">${esc(person.name)}${dead}</div>
      ${dates ? `<div class="dates">${dates}</div>` : ""}
      ${note}
    </div>`;
  }

  treeEl.innerHTML = svg + nodes;

  // Attach click handlers
  treeEl.querySelectorAll(".node").forEach(n => {
    n.addEventListener("click", (e) => { e.stopPropagation(); openEdit(n.dataset.id); });
  });
}

function formatDates(p) {
  if (!p.birth && !p.death) return "";
  return `${p.birth || "?"}${p.death ? " – " + p.death : ""}`;
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------------------- Modal / Form ---------------------- */
const modal = document.getElementById("modal");
const form = document.getElementById("memberForm");
const fId = document.getElementById("memberId");
const fName = document.getElementById("fName");
const fGender = document.getElementById("fGender");
const fBirth = document.getElementById("fBirth");
const fDeath = document.getElementById("fDeath");
const fParent = document.getElementById("fParent");
const fSpouse = document.getElementById("fSpouse");
const fNote = document.getElementById("fNote");
const btnDelete = document.getElementById("btnDelete");
const modalTitle = document.getElementById("modalTitle");

function fillSelects(excludeId) {
  const opts = people
    .filter(p => p.id !== excludeId)
    .map(p => `<option value="${p.id}">${esc(p.name)}${p.birth ? " (" + p.birth + ")" : ""}</option>`)
    .join("");
  fParent.innerHTML = `<option value="">— Không (đời đầu tiên) —</option>` + opts;
  fSpouse.innerHTML = `<option value="">— Không —</option>` + opts;
}

function openAdd() {
  form.reset();
  fId.value = "";
  modalTitle.textContent = "Thêm thành viên";
  btnDelete.hidden = true;
  fillSelects(null);
  modal.hidden = false;
  fName.focus();
}

function openEdit(id) {
  const p = byId(id);
  if (!p) return;
  modalTitle.textContent = "Sửa thông tin";
  fId.value = p.id;
  fName.value = p.name;
  fGender.value = p.gender || "other";
  fBirth.value = p.birth || "";
  fDeath.value = p.death || "";
  fNote.value = p.note || "";
  btnDelete.hidden = false;
  fillSelects(p.id);
  fParent.value = p.parentId || "";
  fSpouse.value = p.spouseId || "";
  modal.hidden = false;
  fName.focus();
}

function closeModal() { modal.hidden = true; }

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const id = fId.value || uid();
  const existing = byId(id);
  const spouseId = fSpouse.value || null;

  const rec = {
    id,
    name: fName.value.trim(),
    gender: fGender.value,
    birth: fBirth.value.trim(),
    death: fDeath.value.trim(),
    note: fNote.value.trim(),
    parentId: fParent.value || null,
    spouseId
  };
  if (!rec.name) return;

  // Prevent selecting self as parent (already excluded) and simple cycle guard
  if (rec.parentId && wouldCreateCycle(id, rec.parentId)) {
    alert("Không thể chọn cha/mẹ này vì sẽ tạo vòng lặp trong gia phả.");
    return;
  }

  if (existing) {
    Object.assign(existing, rec);
  } else {
    people.push(rec);
  }

  // Keep spouse relationship symmetric
  syncSpouse(id, spouseId);

  closeModal();
  render();
});

function syncSpouse(id, spouseId) {
  // clear any previous partner pointing to this id (if changed)
  people.forEach(p => {
    if (p.id !== id && p.spouseId === id && p.id !== spouseId) p.spouseId = null;
  });
  if (spouseId) {
    const sp = byId(spouseId);
    if (sp) sp.spouseId = id;
  }
}

function wouldCreateCycle(id, parentId) {
  let cur = parentId, guard = 0;
  while (cur && guard++ < 500) {
    if (cur === id) return true;
    cur = byId(cur)?.parentId || null;
  }
  return false;
}

btnDelete.addEventListener("click", () => {
  const id = fId.value;
  if (!id) return;
  const p = byId(id);
  if (!confirm(`Xóa "${p?.name}" khỏi gia phả? Con cháu sẽ trở thành đời gốc.`)) return;
  // Detach references
  people.forEach(x => {
    if (x.parentId === id) x.parentId = null;
    if (x.spouseId === id) x.spouseId = null;
  });
  people = people.filter(x => x.id !== id);
  closeModal();
  render();
});

/* ---------------------- Toolbar actions ---------------------- */
document.getElementById("btnAdd").addEventListener("click", openAdd);
document.getElementById("modalClose").addEventListener("click", closeModal);
document.getElementById("btnCancel").addEventListener("click", closeModal);
modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) closeModal(); });

document.getElementById("btnExport").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(people, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "gia-pha.json";
  a.click();
  URL.revokeObjectURL(url);
});

const fileInput = document.getElementById("fileInput");
document.getElementById("btnImport").addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data)) throw new Error("format");
      people = data.map(p => ({
        id: p.id || uid(),
        name: p.name || "Không tên",
        gender: p.gender || "other",
        birth: p.birth || "",
        death: p.death || "",
        note: p.note || "",
        parentId: p.parentId || null,
        spouseId: p.spouseId || null
      }));
      render();
    } catch {
      alert("Tệp không hợp lệ. Vui lòng chọn tệp JSON đã xuất từ ứng dụng.");
    }
  };
  reader.readAsText(file);
  fileInput.value = "";
});

document.getElementById("btnClear").addEventListener("click", () => {
  if (people.length && !confirm("Xóa toàn bộ gia phả? Hành động này không thể hoàn tác.")) return;
  people = [];
  render();
});

document.getElementById("btnSample").addEventListener("click", () => {
  if (people.length && !confirm("Thay thế dữ liệu hiện tại bằng dữ liệu mẫu?")) return;
  people = sampleData();
  render();
  resetZoom();
});

/* ---------------------- Zoom & Pan ---------------------- */
const container = document.getElementById("treeContainer");
let zoom = 1;
function applyZoom() { treeEl.style.transform = `scale(${zoom})`; }
function resetZoom() { zoom = 1; applyZoom(); container.scrollLeft = 0; container.scrollTop = 0; }
document.getElementById("zoomIn").addEventListener("click", () => { zoom = Math.min(2, zoom + 0.1); applyZoom(); });
document.getElementById("zoomOut").addEventListener("click", () => { zoom = Math.max(0.3, zoom - 0.1); applyZoom(); });
document.getElementById("zoomReset").addEventListener("click", resetZoom);

// Drag to pan
let panning = false, startX, startY, scrollX, scrollY;
container.addEventListener("mousedown", (e) => {
  if (e.target.closest(".node")) return;
  panning = true;
  container.classList.add("dragging");
  startX = e.clientX; startY = e.clientY;
  scrollX = container.scrollLeft; scrollY = container.scrollTop;
});
window.addEventListener("mousemove", (e) => {
  if (!panning) return;
  container.scrollLeft = scrollX - (e.clientX - startX);
  container.scrollTop = scrollY - (e.clientY - startY);
});
window.addEventListener("mouseup", () => { panning = false; container.classList.remove("dragging"); });

// Ctrl+wheel zoom
container.addEventListener("wheel", (e) => {
  if (!e.ctrlKey) return;
  e.preventDefault();
  zoom = Math.min(2, Math.max(0.3, zoom - Math.sign(e.deltaY) * 0.1));
  applyZoom();
}, { passive: false });

/* ---------------------- Sample data ---------------------- */
function sampleData() {
  return [
    { id: "a1", name: "Nguyễn Văn Tổ", gender: "male", birth: "1920", death: "1998", note: "Ông tổ dòng họ", parentId: null, spouseId: "a2" },
    { id: "a2", name: "Trần Thị Bà", gender: "female", birth: "1925", death: "2005", note: "", parentId: null, spouseId: "a1" },
    { id: "b1", name: "Nguyễn Văn Cả", gender: "male", birth: "1948", death: "", note: "Con trưởng", parentId: "a1", spouseId: "b2" },
    { id: "b2", name: "Lê Thị Hoa", gender: "female", birth: "1950", death: "", note: "", parentId: null, spouseId: "b1" },
    { id: "b3", name: "Nguyễn Thị Hai", gender: "female", birth: "1952", death: "", note: "", parentId: "a1", spouseId: null },
    { id: "c1", name: "Nguyễn Văn Minh", gender: "male", birth: "1975", death: "", note: "Kỹ sư", parentId: "b1", spouseId: "c2" },
    { id: "c2", name: "Phạm Thị Lan", gender: "female", birth: "1978", death: "", note: "Giáo viên", parentId: null, spouseId: "c1" },
    { id: "c3", name: "Nguyễn Thị Mai", gender: "female", birth: "1980", death: "", note: "", parentId: "b1", spouseId: null },
    { id: "d1", name: "Nguyễn Văn An", gender: "male", birth: "2005", death: "", note: "", parentId: "c1", spouseId: null },
    { id: "d2", name: "Nguyễn Thị Bình", gender: "female", birth: "2008", death: "", note: "", parentId: "c1", spouseId: null }
  ];
}

/* ---------------------- Init ---------------------- */
load();
render();
