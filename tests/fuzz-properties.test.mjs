import assert from "node:assert/strict";
import test from "node:test";
import fc from "fast-check";
import { mergeTaskCollections, normalizeTaskItem } from "../sync-core.js";

const itemArb = fc.record({
  id: fc.string(),
  text: fc.string(),
  createdAt: fc.integer({ min: 946684800000, max: 4102444800000 }).map((ms) => new Date(ms).toISOString()),
  updatedAt: fc.integer({ min: 946684800000, max: 4102444800000 }).map((ms) => new Date(ms).toISOString()),
  done: fc.boolean(),
  deletedAt: fc.option(fc.integer({ min: 946684800000, max: 4102444800000 }).map((ms) => new Date(ms).toISOString()), { nil: null }),
});

test("property: task normalization is idempotent", () => {
  fc.assert(
    fc.property(itemArb, (raw) => {
      const once = normalizeTaskItem(raw, "2026-01-01T00:00:00.000Z");
      const twice = normalizeTaskItem(once, "2026-01-01T00:00:00.000Z");
      assert.deepEqual(twice, once);
    }),
    { numRuns: 1000 },
  );
});

test("property: merging the same collection with itself is stable", () => {
  fc.assert(
    fc.property(fc.array(itemArb, { maxLength: 30 }), (items) => {
      const merged = mergeTaskCollections(items, items);
      assert.deepEqual(mergeTaskCollections(merged, merged), merged);
    }),
    { numRuns: 500 },
  );
});
