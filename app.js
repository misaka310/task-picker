import { firebaseConfig } from "./firebase-client-settings.js";
import { mergeTaskCollections, normalizeTaskItem, visibleTaskItems } from "./sync-core.js";

const STORAGE_KEY = "taskdecision-memo-items";
const FIREBASE_SDK_VERSION = "10.12.5";

const elements = {
  input: document.getElementById("task-input"),
  addButton: document.getElementById("add-button"),
  focusInputButton: document.getElementById("focus-input-button"),
  decideButton: document.getElementById("decide-button"),
  resultArea: document.getElementById("result-area"),
  pendingList: document.getElementById("pending-list"),
  doneList: document.getElementById("done-list"),
  pendingCount: document.getElementById("pending-count"),
  doneCount: document.getElementById("done-count"),
  saveStatus: document.getElementById("save-status"),
  syncButton: document.getElementById("sync-button"),
  syncButtonText: document.getElementById("sync-button-text"),
  signoutButton: document.getElementById("signout-button"),
  syncNote: document.getElementById("sync-note"),
};

let items = loadLocalItems();
let currentDecisionId = null;
let editingItemId = null;
let sync = {
  ready: false,
  enabled: false,
  user: null,
  unsubscribe: null,
  auth: null,
  provider: null,
  db: null,
  api: null,
};

render();
void prepareFirebase();

elements.addButton.addEventListener("click", addItem);
elements.decideButton.addEventListener("click", decideItem);
elements.focusInputButton.addEventListener("click", () => elements.input.focus());
elements.input.addEventListener("keydown", (event) => {
  if (event.key === "Enter") addItem();
});
elements.resultArea.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const { action, id } = button.dataset;
  if (action === "complete") markDone(id);
  if (action === "close") clearDecision();
});
elements.pendingList.addEventListener("click", handleListAction);
elements.doneList.addEventListener("click", handleListAction);
elements.pendingList.addEventListener("keydown", (event) => {
  const input = event.target.closest("[data-edit-input]");
  if (!input) return;
  const id = input.dataset.editInput;
  if (event.key === "Enter") saveEdit(id);
  if (event.key === "Escape") cancelEdit();
});
document.addEventListener("click", (event) => {
  const toggleButton = event.target.closest("[data-toggle]");
  if (!toggleButton) return;
  const panel = toggleButton.closest(".list-panel");
  const list = panel?.querySelector(".item-list");
  if (!list) return;
  list.classList.toggle("hidden");
  toggleButton.querySelector(".chevron").textContent = list.classList.contains("hidden") ? "⌄" : "⌃";
});
elements.syncButton.addEventListener("click", signInWithGoogle);
elements.signoutButton.addEventListener("click", signOutFromGoogle);

function hasFirebaseConfig() {
  return Boolean(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.authDomain);
}

async function prepareFirebase() {
  if (!hasFirebaseConfig()) {
    elements.syncNote.textContent = "Firebase未設定：ローカル保存のみ";
    return;
  }

  try {
    const [{ initializeApp }, authModule, firestoreModule] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-auth.js`),
      import(`https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}/firebase-firestore.js`),
    ]);

    const app = initializeApp(firebaseConfig);
    sync.auth = authModule.getAuth(app);
    sync.provider = new authModule.GoogleAuthProvider();
    sync.db = firestoreModule.getFirestore(app);
    sync.api = { authModule, firestoreModule };
    sync.ready = true;

    authModule.onAuthStateChanged(sync.auth, (user) => {
      if (user) {
        void enableCloudSync(user).catch(handlePersistError);
      } else {
        disableCloudSync();
      }
    });
  } catch (error) {
    console.error(error);
    setStatus("error", "同期初期化に失敗");
    elements.syncNote.textContent = "Firebase設定かネットワークを確認";
  }
}

async function signInWithGoogle() {
  if (!sync.ready) {
    showToast(hasFirebaseConfig() ? "Firebaseを読み込み中です" : "firebase-client-settings.js にFirebase設定を入れてください");
    return;
  }
  try {
    await sync.api.authModule.signInWithPopup(sync.auth, sync.provider);
  } catch (popupError) {
    try {
      await sync.api.authModule.signInWithRedirect(sync.auth, sync.provider);
    } catch (redirectError) {
      console.error(popupError, redirectError);
      showToast("Googleログインに失敗しました");
    }
  }
}

async function signOutFromGoogle() {
  if (!sync.ready) return;
  await sync.api.authModule.signOut(sync.auth);
  showToast("ローカル保存に戻しました");
}

async function enableCloudSync(user) {
  sync.user = user;
  sync.enabled = true;
  setStatus("sync", "Google同期中");
  elements.syncButtonText.textContent = user.displayName || "同期中";
  elements.signoutButton.classList.remove("hidden");
  elements.syncNote.textContent = "更新日時を比較して端末とクラウドを統合します";

  await mergeLocalItemsIntoCloud(loadLocalItems());
  subscribeCloudItems();
}

function disableCloudSync() {
  if (sync.unsubscribe) sync.unsubscribe();
  sync.unsubscribe = null;
  sync.user = null;
  sync.enabled = false;
  items = loadLocalItems();
  currentDecisionId = null;
  setStatus("local", "ローカル保存中");
  elements.syncButtonText.textContent = "Googleで同期";
  elements.signoutButton.classList.add("hidden");
  if (hasFirebaseConfig()) elements.syncNote.textContent = "同期したい人だけログイン";
  render();
}

async function mergeLocalItemsIntoCloud(localItems) {
  if (!sync.enabled) return;
  const { collection, doc, getDocs, serverTimestamp, writeBatch } = sync.api.firestoreModule;
  const collectionRef = collection(sync.db, "users", sync.user.uid, "items");
  const snapshot = await getDocs(collectionRef);
  const cloudItems = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
  const merged = mergeTaskCollections(localItems, cloudItems);
  const batch = writeBatch(sync.db);

  for (const item of merged) {
    batch.set(doc(collectionRef, item.id), { ...item, syncedAt: serverTimestamp() });
  }
  await batch.commit();
  items = merged;
  saveLocalItems(items);
  render();
}

function subscribeCloudItems() {
  if (sync.unsubscribe) sync.unsubscribe();
  const { collection, onSnapshot, orderBy, query } = sync.api.firestoreModule;
  const itemsQuery = query(collection(sync.db, "users", sync.user.uid, "items"), orderBy("createdAt", "desc"));
  sync.unsubscribe = onSnapshot(itemsQuery, (snapshot) => {
    const cloudItems = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }));
    items = mergeTaskCollections(items, cloudItems);
    saveLocalItems(items);
    render();
  }, (error) => {
    console.error(error);
    setStatus("error", "同期エラー");
    showToast("同期に失敗しました。ローカルの表示は維持します");
  });
}

function loadLocalItems() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? parsed.map(normalizeItem).filter((item) => item.id) : [];
  } catch {
    return [];
  }
}

function saveLocalItems(nextItems) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(nextItems));
}

async function persistOne(item) {
  const normalized = normalizeItem(item);
  const index = items.findIndex((entry) => entry.id === normalized.id);
  if (index >= 0) items[index] = normalized;
  else items.unshift(normalized);
  saveLocalItems(items);
  if (!sync.enabled) return;
  const { collection, doc, serverTimestamp, setDoc } = sync.api.firestoreModule;
  const collectionRef = collection(sync.db, "users", sync.user.uid, "items");
  await setDoc(doc(collectionRef, normalized.id), {
    ...normalized,
    syncedAt: serverTimestamp(),
  });
}

function makeId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeItem(item) {
  return normalizeTaskItem({ ...item, id: item.id || makeId() });
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ja-JP", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function addItem() {
  const text = elements.input.value.trim();
  if (!text) {
    elements.input.focus();
    return;
  }
  const now = new Date().toISOString();
  const item = normalizeItem({ id: makeId(), text, createdAt: now, updatedAt: now, done: false, deletedAt: null });
  items.unshift(item);
  elements.input.value = "";
  void persistOne(item).catch(handlePersistError);
  render();
  elements.input.focus();
}

function decideItem() {
  const candidates = visibleTaskItems(items).filter((item) => !item.done);
  if (candidates.length === 0) {
    currentDecisionId = null;
    renderResult(null);
    return;
  }
  const selected = candidates[Math.floor(Math.random() * candidates.length)];
  currentDecisionId = selected.id;
  renderResult(selected);
}

function clearDecision() {
  currentDecisionId = null;
  renderResult(null);
}

function markDone(id) {
  const item = items.find((entry) => entry.id === id && !entry.deletedAt);
  if (!item) return;
  item.done = true;
  item.updatedAt = new Date().toISOString();
  if (currentDecisionId === id) currentDecisionId = null;
  void persistOne(item).catch(handlePersistError);
  render();
}

function deleteItem(id) {
  const item = items.find((entry) => entry.id === id && !entry.deletedAt);
  if (!item) return;
  const deletedAt = new Date().toISOString();
  item.deletedAt = deletedAt;
  item.updatedAt = deletedAt;
  if (currentDecisionId === id) currentDecisionId = null;
  if (editingItemId === id) editingItemId = null;
  void persistOne(item).catch(handlePersistError);
  render();
}

function handleListAction(event) {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const { action, id } = button.dataset;
  if (action === "done") markDone(id);
  if (action === "delete") deleteItem(id);
  if (action === "edit") startEdit(id);
  if (action === "cancel-edit") cancelEdit();
  if (action === "save-edit") saveEdit(id);
}

function startEdit(id) {
  if (!items.some((item) => item.id === id && !item.done && !item.deletedAt)) return;
  editingItemId = id;
  render();
  const input = document.querySelector(`[data-edit-input="${cssEscape(id)}"]`);
  input?.focus();
  input?.select();
}

function cancelEdit() {
  editingItemId = null;
  render();
}

function saveEdit(id) {
  const input = document.querySelector(`[data-edit-input="${cssEscape(id)}"]`);
  const nextText = input?.value.trim();
  if (!nextText) {
    input?.focus();
    return;
  }
  const item = items.find((entry) => entry.id === id && !entry.done && !entry.deletedAt);
  if (!item) return;
  item.text = nextText;
  item.updatedAt = new Date().toISOString();
  editingItemId = null;
  void persistOne(item).catch(handlePersistError);
  render();
}

function cssEscape(value) {
  if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(value);
  return String(value).replaceAll('"', '\\"');
}

function handlePersistError(error) {
  console.error(error);
  setStatus("error", "保存エラー");
  showToast("保存に失敗しました。通信状態を確認してください");
}

function render() {
  const visibleItems = visibleTaskItems(items);
  const pendingItems = visibleItems.filter((item) => !item.done);
  const doneItems = visibleItems.filter((item) => item.done);
  elements.pendingCount.textContent = String(pendingItems.length);
  elements.doneCount.textContent = String(doneItems.length);
  renderList(elements.pendingList, pendingItems, false);
  renderList(elements.doneList, doneItems, true);
  const currentDecision = visibleItems.find((item) => item.id === currentDecisionId && !item.done);
  renderResult(currentDecision ?? null);
}

function renderList(container, list, isDoneList) {
  if (list.length === 0) {
    container.innerHTML = `<p class="empty-state">${isDoneList ? "まだ完了済みはありません" : "まだ項目がありません"}</p>`;
    return;
  }
  container.innerHTML = list.map((item) => {
    const leading = isDoneList ? `<span class="done-check">✓</span>` : `<span class="drag-dots" aria-hidden="true">⋮⋮</span>`;
    if (!isDoneList && editingItemId === item.id) {
      return `
        <article class="item-card pending editing">
          ${leading}
          <div class="edit-form">
            <input class="edit-input" data-edit-input="${escapeHtml(item.id)}" value="${escapeHtml(item.text)}" maxlength="120" aria-label="タスクを編集" />
            <button class="item-action save" type="button" data-action="save-edit" data-id="${item.id}">保存</button>
            <button class="item-action cancel" type="button" data-action="cancel-edit" data-id="${item.id}">取消</button>
          </div>
        </article>
      `;
    }
    const actions = isDoneList
      ? `<button class="item-action delete" type="button" data-action="delete" data-id="${item.id}" aria-label="削除">削除</button>`
      : `
          <button class="item-action complete" type="button" data-action="done" data-id="${item.id}">完了</button>
          <button class="item-action edit" type="button" data-action="edit" data-id="${item.id}">編集</button>
          <button class="item-action delete" type="button" data-action="delete" data-id="${item.id}">削除</button>
        `;
    return `
      <article class="item-card ${isDoneList ? "done" : "pending"}">
        ${leading}
        <div>
          <p class="item-text">${escapeHtml(item.text)}</p>
          ${isDoneList ? `<p class="item-meta">${formatDate(item.updatedAt)}</p>` : ""}
        </div>
        <div class="item-actions">${actions}</div>
      </article>
    `;
  }).join("");
}

function renderResult(item) {
  if (!item) {
    elements.resultArea.innerHTML = `
      <div class="result-placeholder">未完了タスクから、まだ何も決まっていません</div>
    `;
    return;
  }
  elements.resultArea.innerHTML = `
    <div class="result-inline">
      <div class="result-icon" aria-hidden="true">◎</div>
      <div class="result-copy">
        <p class="result-title">今やること</p>
        <p class="result-text">${escapeHtml(item.text)}</p>
      </div>
      <div class="result-actions">
        <button class="item-action complete" type="button" data-action="complete" data-id="${item.id}">完了</button>
        <button class="item-action" type="button" data-action="close">あとで</button>
      </div>
    </div>
  `;
}

function setStatus(mode, text) {
  elements.saveStatus.className = `status-pill ${mode}`;
  elements.saveStatus.innerHTML = `<span></span>${escapeHtml(text)}`;
}

function showToast(message) {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), 2800);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
