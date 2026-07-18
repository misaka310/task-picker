// @ts-check

/**
 * @typedef {Object} TaskItem
 * @property {string} id
 * @property {string} text
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {boolean} done
 * @property {string|null} deletedAt
 */

/** @param {unknown} value @param {string} fallback */
export function toIsoString(value, fallback = new Date().toISOString()) {
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
  }
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") {
    return value.toDate().toISOString();
  }
  const date = new Date(/** @type {string|number|Date} */ (value));
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

/** @param {Record<string, unknown>} item @param {string} [now] @returns {TaskItem} */
export function normalizeTaskItem(item, now = new Date().toISOString()) {
  const createdAt = toIsoString(item.createdAt ?? now, now);
  const updatedAt = toIsoString(item.updatedAt ?? item.createdAt ?? now, createdAt);
  const deletedAt = item.deletedAt ? toIsoString(item.deletedAt, updatedAt) : null;
  return {
    id: String(item.id ?? "").trim(),
    text: String(item.text ?? "").trim(),
    createdAt,
    updatedAt,
    done: Boolean(item.done),
    deletedAt,
  };
}

/** @param {TaskItem} item */
function versionTimestamp(item) {
  return item.deletedAt ?? item.updatedAt;
}

/** @param {TaskItem} left @param {TaskItem} right @returns {TaskItem} */
export function chooseNewestTaskItem(left, right) {
  const leftVersion = versionTimestamp(left);
  const rightVersion = versionTimestamp(right);
  if (leftVersion > rightVersion) return left;
  if (rightVersion > leftVersion) return right;
  if (left.deletedAt && !right.deletedAt) return left;
  if (right.deletedAt && !left.deletedAt) return right;
  if (left.updatedAt > right.updatedAt) return left;
  if (right.updatedAt > left.updatedAt) return right;
  return JSON.stringify(left) <= JSON.stringify(right) ? left : right;
}

/**
 * Merge local and cloud state by id. The newest update wins; a newer deletion is
 * kept as a tombstone so an older copy on another device cannot resurrect it.
 * @param {Array<Record<string, unknown>>} localItems
 * @param {Array<Record<string, unknown>>} cloudItems
 * @returns {TaskItem[]}
 */
export function mergeTaskCollections(localItems, cloudItems) {
  /** @type {Map<string, TaskItem>} */
  const merged = new Map();
  for (const raw of [...cloudItems, ...localItems]) {
    const item = normalizeTaskItem(raw);
    if (!item.id) continue;
    const current = merged.get(item.id);
    merged.set(item.id, current ? chooseNewestTaskItem(current, item) : item);
  }
  return [...merged.values()].sort(
    (a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id)
  );
}

/** @param {TaskItem[]} items */
export function visibleTaskItems(items) {
  return items.filter((item) => !item.deletedAt);
}
