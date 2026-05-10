const STORAGE_KEY = "employee-file-portal:v1";

const initialState = {
  currentUserId: null,
  route: "home",
  selectedFileId: null,
  search: "",
  targetFilter: "all",
  typeFilter: "all",
  users: [
    { id: "admin", name: "管理者", role: "admin", department: "総務", password: "admin123" },
    { id: "sato", name: "佐藤 花子", role: "employee", department: "営業", password: "sato123" },
    { id: "suzuki", name: "鈴木 一郎", role: "employee", department: "開発", password: "suzuki123" },
    { id: "tanaka", name: "田中 美咲", role: "employee", department: "経理", password: "tanaka123" },
  ],
  files: [],
};

let state = loadState();
let editFileId = null;
let pendingFileData = null;
let toastTimer = null;

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return structuredClone(initialState);

  try {
    return { ...structuredClone(initialState), ...JSON.parse(saved) };
  } catch {
    return structuredClone(initialState);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function currentUser() {
  return state.users.find((user) => user.id === state.currentUserId);
}

function isAdmin() {
  return currentUser()?.role === "admin";
}

function employees() {
  return state.users.filter((user) => user.role === "employee");
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function fileIcon(type) {
  if (type.includes("pdf")) return "PDF";
  if (type.includes("image")) return "IMG";
  if (type.includes("spreadsheet") || type.includes("excel")) return "XLS";
  if (type.includes("word")) return "DOC";
  return "FILE";
}

function visibleFiles() {
  const user = currentUser();
  const query = state.search.trim().toLowerCase();

  return state.files
    .filter((file) => isAdmin() || file.targetUserIds.includes(user.id))
    .filter((file) => state.targetFilter === "all" || file.targetUserIds.includes(state.targetFilter))
    .filter((file) => state.typeFilter === "all" || file.category === state.typeFilter)
    .filter((file) => {
      const targetNames = file.targetUserIds.map((id) => userName(id)).join(" ");
      return [file.title, file.description, file.originalName, targetNames]
        .join(" ")
        .toLowerCase()
        .includes(query);
    })
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function userName(id) {
  return state.users.find((user) => user.id === id)?.name ?? "未設定";
}

function render() {
  const app = document.querySelector("#app");
  const user = currentUser();

  if (!user) {
    app.innerHTML = renderLogin();
    bindLogin();
    return;
  }

  app.innerHTML = `
    <div class="app-shell">
      ${renderTopbar(user)}
      <div class="layout">
        ${renderSidebar()}
        <main class="main">
          ${state.route === "home" ? renderHome() : ""}
          ${state.route === "detail" ? renderDetail() : ""}
          ${state.route === "settings" ? renderSettings() : ""}
        </main>
      </div>
    </div>
    <div id="modal-root"></div>
    <div id="toast" class="toast hidden"></div>
  `;

  bindApp();
}

function renderLogin() {
  return `
    <div class="login-wrap">
      <section class="login-panel">
        <div class="login-visual">
          <h1>社員向けファイル共有</h1>
          <p>管理者が社員ごとにファイルと説明を登録し、社員は自分宛の資料だけを確認できます。</p>
        </div>
        <form class="login-form" id="login-form">
          <div class="brand">
            <span class="brand-mark">F</span>
            <span>File Portal</span>
          </div>
          <p class="hint">デモログイン: 管理者は admin / admin123、社員は sato / sato123 などでログインできます。</p>
          <div class="field">
            <label for="user-id">ユーザーID</label>
            <input id="user-id" autocomplete="username" placeholder="admin" required />
          </div>
          <div class="field">
            <label for="password">パスワード</label>
            <input id="password" type="password" autocomplete="current-password" placeholder="admin123" required />
          </div>
          <button class="btn primary" type="submit">ログイン</button>
        </form>
      </section>
    </div>
  `;
}

function renderTopbar(user) {
  return `
    <header class="topbar">
      <div class="brand">
        <span class="brand-mark">F</span>
        <span>File Portal</span>
      </div>
      <div class="topbar-actions">
        <div class="user-chip">
          <span class="avatar">${user.name.slice(0, 1)}</span>
          <span>${user.name} / ${user.role === "admin" ? "管理者" : "社員"}</span>
        </div>
        <button class="btn secondary" data-action="logout">ログアウト</button>
      </div>
    </header>
  `;
}

function renderSidebar() {
  return `
    <aside class="sidebar">
      <nav class="nav" aria-label="メインメニュー">
        <button class="${state.route === "home" ? "active" : ""}" data-route="home">一覧</button>
        <button class="${state.route === "detail" ? "active" : ""}" data-route="detail" ${state.selectedFileId ? "" : "disabled"}>詳細</button>
        <button class="${state.route === "settings" ? "active" : ""}" data-route="settings">設定</button>
      </nav>
    </aside>
  `;
}

function renderHome() {
  const files = visibleFiles();
  return `
    <div class="page-head">
      <div>
        <h1>${isAdmin() ? "アップロード管理" : "受信ファイル"}</h1>
        <p>${isAdmin() ? "社員宛のファイル登録、検索、編集、削除を行えます。" : "自分宛に共有されたファイルを確認できます。"}</p>
      </div>
      ${isAdmin() ? `<button class="btn primary" data-action="new-upload">新規アップロード</button>` : ""}
    </div>
    ${isAdmin() ? renderUploadPanel() : ""}
    ${renderToolbar()}
    <section class="panel table-wrap">
      ${files.length ? renderTable(files) : `<div class="empty">表示できるファイルがありません。</div>`}
    </section>
  `;
}

function renderUploadPanel() {
  return `
    <form class="panel upload-panel" id="upload-form">
      <input type="hidden" id="editing-id" />
      <div class="field">
        <label for="file-title">タイトル</label>
        <input id="file-title" required placeholder="例: 5月給与明細" />
      </div>
      <div class="field">
        <label for="target-users">宛先社員</label>
        <select id="target-users" multiple size="4" required>
          ${employees().map((user) => `<option value="${user.id}">${user.name} / ${user.department}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label for="category">分類</label>
        <select id="category">
          <option value="notice">お知らせ</option>
          <option value="payroll">給与・経理</option>
          <option value="contract">契約・申請</option>
          <option value="manual">マニュアル</option>
          <option value="other">その他</option>
        </select>
      </div>
      <div class="field">
        <label for="file-input">ファイル</label>
        <input id="file-input" type="file" />
      </div>
      <div class="field wide">
        <label for="description">説明</label>
        <textarea id="description" placeholder="社員に伝えたい補足を入力してください。"></textarea>
      </div>
      <div class="btn-row wide">
        <button class="btn primary" type="submit">保存</button>
        <button class="btn secondary" type="button" data-action="clear-form">入力をクリア</button>
      </div>
    </form>
  `;
}

function renderToolbar() {
  const types = [
    ["all", "すべての分類"],
    ["notice", "お知らせ"],
    ["payroll", "給与・経理"],
    ["contract", "契約・申請"],
    ["manual", "マニュアル"],
    ["other", "その他"],
  ];

  return `
    <div class="toolbar">
      <div class="field">
        <input id="search" value="${escapeHtml(state.search)}" placeholder="タイトル、説明、ファイル名、宛先で検索" />
      </div>
      <div class="field">
        <select id="target-filter">
          <option value="all">すべての宛先</option>
          ${employees().map((user) => `<option value="${user.id}" ${state.targetFilter === user.id ? "selected" : ""}>${user.name}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <select id="type-filter">
          ${types.map(([value, label]) => `<option value="${value}" ${state.typeFilter === value ? "selected" : ""}>${label}</option>`).join("")}
        </select>
      </div>
    </div>
  `;
}

function renderTable(files) {
  return `
    <table>
      <thead>
        <tr>
          <th>ファイル</th>
          <th>宛先</th>
          <th>分類</th>
          <th>更新日</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        ${files
          .map(
            (file) => `
              <tr>
                <td>
                  <p class="file-title">${escapeHtml(file.title)}</p>
                  <div class="file-meta">${fileIcon(file.type)} / ${escapeHtml(file.originalName)} / ${formatBytes(file.size)}</div>
                </td>
                <td>${file.targetUserIds.map((id) => `<span class="badge">${userName(id)}</span>`).join(" ")}</td>
                <td>${categoryName(file.category)}</td>
                <td>${formatDate(file.updatedAt)}</td>
                <td>
                  <div class="btn-row">
                    <button class="btn secondary" data-action="view" data-id="${file.id}">詳細</button>
                    ${isAdmin() ? `<button class="btn secondary" data-action="edit" data-id="${file.id}">編集</button><button class="btn danger" data-action="delete" data-id="${file.id}">削除</button>` : ""}
                  </div>
                </td>
              </tr>
            `,
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function renderDetail() {
  const file = state.files.find((item) => item.id === state.selectedFileId);
  if (!file) {
    state.route = "home";
    return renderHome();
  }

  const canAccess = isAdmin() || file.targetUserIds.includes(currentUser().id);
  if (!canAccess) return `<div class="empty">このファイルを閲覧する権限がありません。</div>`;

  return `
    <div class="page-head">
      <div>
        <h1>詳細</h1>
        <p>ファイル情報と説明を確認できます。</p>
      </div>
      <div class="btn-row">
        <button class="btn secondary" data-route="home">一覧へ戻る</button>
        ${isAdmin() ? `<button class="btn primary" data-action="edit" data-id="${file.id}">編集</button>` : ""}
      </div>
    </div>
    <div class="detail-grid">
      <section class="panel detail-main">
        <h2 class="detail-title">${escapeHtml(file.title)}</h2>
        <div class="file-meta">${escapeHtml(file.originalName)} / ${formatBytes(file.size)}</div>
        <div class="description">${escapeHtml(file.description || "説明は登録されていません。")}</div>
        ${renderPreview(file)}
        <div class="btn-row" style="margin-top: 16px;">
          <a class="btn primary" href="${file.dataUrl}" download="${escapeHtml(file.originalName)}">ダウンロード</a>
        </div>
      </section>
      <aside class="panel detail-side">
        <dl class="meta-list">
          <div><dt>分類</dt><dd>${categoryName(file.category)}</dd></div>
          <div><dt>宛先</dt><dd>${file.targetUserIds.map(userName).join("、")}</dd></div>
          <div><dt>登録者</dt><dd>${userName(file.createdBy)}</dd></div>
          <div><dt>登録日</dt><dd>${formatDate(file.createdAt)}</dd></div>
          <div><dt>更新日</dt><dd>${formatDate(file.updatedAt)}</dd></div>
        </dl>
      </aside>
    </div>
  `;
}

function renderPreview(file) {
  if (file.type.startsWith("image/")) {
    return `<div class="preview-box"><img src="${file.dataUrl}" alt="${escapeHtml(file.title)}" style="max-width: 100%; max-height: 420px; border-radius: 8px;" /></div>`;
  }

  if (file.type === "application/pdf") {
    return `<iframe title="${escapeHtml(file.title)}" src="${file.dataUrl}" style="width: 100%; height: 460px; border: 1px solid var(--line); border-radius: 8px;"></iframe>`;
  }

  return `<div class="preview-box">この形式はプレビュー非対応です。ダウンロードして確認してください。</div>`;
}

function renderSettings() {
  return `
    <div class="page-head">
      <div>
        <h1>設定</h1>
        <p>デモユーザー、保存方式、将来の拡張ポイントを確認できます。</p>
      </div>
    </div>
    <div class="settings-grid">
      <section class="panel">
        <h2>ユーザー</h2>
        <div class="people-list">
          ${state.users
            .map(
              (user) => `
                <div class="person-row">
                  <div>
                    <strong>${user.name}</strong>
                    <div class="file-meta">${user.id} / ${user.department} / ${user.role === "admin" ? "管理者" : "社員"}</div>
                  </div>
                  <span class="badge">${user.password}</span>
                </div>
              `,
            )
            .join("")}
        </div>
      </section>
      <section class="panel">
        <h2>保存設定</h2>
        <p class="hint">現在はブラウザの localStorage に保存しています。同じブラウザ内で試せますが、大容量ファイルや複数端末共有にはDBとファイルストレージへの移行が必要です。</p>
        <div class="btn-row">
          <button class="btn danger" data-action="reset-data">データを初期化</button>
        </div>
      </section>
    </div>
  `;
}

function bindLogin() {
  document.querySelector("#login-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const id = document.querySelector("#user-id").value.trim();
    const password = document.querySelector("#password").value;
    const user = state.users.find((item) => item.id === id && item.password === password);

    if (!user) {
      alert("ユーザーIDまたはパスワードが違います。");
      return;
    }

    state.currentUserId = user.id;
    state.route = "home";
    saveState();
    render();
  });
}

function bindApp() {
  document.querySelectorAll("[data-route]").forEach((button) => {
    button.addEventListener("click", () => {
      state.route = button.dataset.route;
      saveState();
      render();
    });
  });

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleAction(button.dataset.action, button.dataset.id));
  });

  document.querySelector("#search")?.addEventListener("input", (event) => {
    state.search = event.target.value;
    saveState();
    render();
  });

  document.querySelector("#target-filter")?.addEventListener("change", (event) => {
    state.targetFilter = event.target.value;
    saveState();
    render();
  });

  document.querySelector("#type-filter")?.addEventListener("change", (event) => {
    state.typeFilter = event.target.value;
    saveState();
    render();
  });

  document.querySelector("#file-input")?.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    pendingFileData = file ? await readAsDataUrl(file) : null;
  });

  document.querySelector("#upload-form")?.addEventListener("submit", saveFileFromForm);
}

function handleAction(action, id) {
  if (action === "logout") {
    state.currentUserId = null;
    saveState();
    render();
  }

  if (action === "new-upload") {
    document.querySelector("#file-title")?.focus();
  }

  if (action === "clear-form") {
    editFileId = null;
    pendingFileData = null;
    document.querySelector("#upload-form").reset();
  }

  if (action === "view") {
    state.selectedFileId = id;
    state.route = "detail";
    saveState();
    render();
  }

  if (action === "edit") {
    startEdit(id);
  }

  if (action === "delete") {
    deleteFile(id);
  }

  if (action === "reset-data") {
    if (confirm("保存済みファイルをすべて削除して初期状態に戻しますか？")) {
      localStorage.removeItem(STORAGE_KEY);
      state = structuredClone(initialState);
      editFileId = null;
      pendingFileData = null;
      render();
    }
  }
}

async function saveFileFromForm(event) {
  event.preventDefault();
  const title = document.querySelector("#file-title").value.trim();
  const description = document.querySelector("#description").value.trim();
  const category = document.querySelector("#category").value;
  const targetUserIds = Array.from(document.querySelector("#target-users").selectedOptions).map((option) => option.value);
  const selectedFile = document.querySelector("#file-input").files[0];
  const now = new Date().toISOString();

  if (!targetUserIds.length) {
    showToast("宛先社員を選択してください。");
    return;
  }

  if (!editFileId && !selectedFile) {
    showToast("アップロードするファイルを選択してください。");
    return;
  }

  let fileData = pendingFileData;
  if (selectedFile && !fileData) fileData = await readAsDataUrl(selectedFile);

  if (editFileId) {
    const existing = state.files.find((file) => file.id === editFileId);
    Object.assign(existing, {
      title,
      description,
      category,
      targetUserIds,
      updatedAt: now,
    });

    if (selectedFile && fileData) {
      Object.assign(existing, {
        originalName: selectedFile.name,
        type: selectedFile.type || "application/octet-stream",
        size: selectedFile.size,
        dataUrl: fileData,
      });
    }

    showToast("ファイル情報を更新しました。");
  } else {
    state.files.push({
      id: crypto.randomUUID(),
      title,
      description,
      category,
      targetUserIds,
      originalName: selectedFile.name,
      type: selectedFile.type || "application/octet-stream",
      size: selectedFile.size,
      dataUrl: fileData,
      createdBy: currentUser().id,
      createdAt: now,
      updatedAt: now,
    });

    showToast("ファイルを登録しました。");
  }

  editFileId = null;
  pendingFileData = null;
  state.route = "home";
  saveState();
  render();
}

function startEdit(id) {
  if (!isAdmin()) return;
  const file = state.files.find((item) => item.id === id);
  if (!file) return;

  state.route = "home";
  saveState();
  render();

  editFileId = id;
  pendingFileData = null;
  document.querySelector("#file-title").value = file.title;
  document.querySelector("#description").value = file.description;
  document.querySelector("#category").value = file.category;
  Array.from(document.querySelector("#target-users").options).forEach((option) => {
    option.selected = file.targetUserIds.includes(option.value);
  });
  document.querySelector("#file-title").focus();
  showToast("編集内容を入力して保存してください。ファイル未選択なら既存ファイルを保持します。");
}

function deleteFile(id) {
  if (!isAdmin()) return;
  const file = state.files.find((item) => item.id === id);
  if (!file) return;

  if (confirm(`「${file.title}」を削除しますか？`)) {
    state.files = state.files.filter((item) => item.id !== id);
    if (state.selectedFileId === id) {
      state.selectedFileId = null;
      state.route = "home";
    }
    saveState();
    render();
  }
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function categoryName(value) {
  return {
    notice: "お知らせ",
    payroll: "給与・経理",
    contract: "契約・申請",
    manual: "マニュアル",
    other: "その他",
  }[value];
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 2600);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

render();
