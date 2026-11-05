import assert from "node:assert/strict";
import test from "node:test";
import {
  chooseNewestTaskItem,
  chunkItems,
  FIRESTORE_BATCH_LIMIT,
  mergeTaskCollections,
  normalizeTaskItem,
  visibleTaskItems,
} from "../sync-core.js";

const item = (overrides = {}) => ({
  id: "task-1",
  text: "old text",
  createdAt: "2026-07-01T00:00:00.000Z",
  updatedAt: "2026-07-01T00:00:00.000Z",
  done: false,
  deletedAt: null,
  ...overrides,
});

test("newer edit wins regardless of source order", () => {
  const older = normalizeTaskItem(item());
  const newer = normalizeTaskItem(item({ text: "new text", updatedAt: "2026-07-02T00:00:00.000Z" }));
  assert.equal(chooseNewestTaskItem(older, newer).text, "new text");
  assert.equal(chooseNewestTaskItem(newer, older).text, "new text");
});

test("newer deletion is retained as a tombstone", () => {
  const merged = mergeTaskCollections(
    [item()],
    [item({ updatedAt: "2026-07-03T00:00:00.000Z", deletedAt: "2026-07-03T00:00:00.000Z" })]
  );
  assert.equal(merged.length, 1);
  assert.equal(merged[0].deletedAt, "2026-07-03T00:00:00.000Z");
  assert.deepEqual(visibleTaskItems(merged), []);
});

test("older tombstone cannot delete a newer edit", () => {
  const merged = mergeTaskCollections(
    [item({ text: "edited", updatedAt: "2026-07-04T00:00:00.000Z" })],
    [item({ updatedAt: "2026-07-03T00:00:00.000Z", deletedAt: "2026-07-03T00:00:00.000Z" })]
  );
  assert.equal(merged[0].text, "edited");
  assert.equal(merged[0].deletedAt, null);
});

test("deletion wins an exact timestamp tie", () => {
  const timestamp = "2026-07-05T00:00:00.000Z";
  const live = normalizeTaskItem(item({ updatedAt: timestamp }));
  const deleted = normalizeTaskItem(item({ updatedAt: timestamp, deletedAt: timestamp }));
  assert.equal(chooseNewestTaskItem(live, deleted).deletedAt, timestamp);
});

test("cloud timestamp values are normalized", () => {
  const normalized = normalizeTaskItem({
    ...item(),
    updatedAt: { toDate: () => new Date("2026-07-06T12:34:56.000Z") },
  });
  assert.equal(normalized.updatedAt, "2026-07-06T12:34:56.000Z");
});

test("chunkItems keeps every write batch within the Firestore limit", () => {
  const list = Array.from({ length: 1201 }, (_, index) => index);
  const chunks = chunkItems(list);
  assert.deepEqual(chunks.map((chunk) => chunk.length), [500, 500, 201]);
  assert.ok(chunks.every((chunk) => chunk.length <= FIRESTORE_BATCH_LIMIT));
  assert.deepEqual(chunks.flat(), list);
  assert.deepEqual(chunkItems([]), []);
  assert.deepEqual(chunkItems([1, 2, 3], 2), [[1, 2], [3]]);
  assert.throws(() => chunkItems([1], 0), RangeError);
});
