import assert from "node:assert/strict";
import test from "node:test";

const {
  BENCHMARK_FIXTURES,
  buildBenchmarkMarkdown,
  parseBenchmarkFixture,
} = await import("../src/benchmarkMode.ts");

test("diagnostic fixtures keep the official table fixture as the default", () => {
  assert.deepEqual(BENCHMARK_FIXTURES, ["table", "paragraph", "single-table"]);
  assert.equal(parseBenchmarkFixture("?benchmarkFixture=table"), "table");
  assert.equal(parseBenchmarkFixture("?benchmarkFixture=paragraph"), "paragraph");
  assert.equal(
    parseBenchmarkFixture("?benchmarkFixture=single-table"),
    "single-table",
  );
  assert.equal(parseBenchmarkFixture("?benchmarkFixture=unknown"), "table");
  assert.equal(parseBenchmarkFixture(""), "table");

  const size = 100 * 1024;
  assert.equal(
    buildBenchmarkMarkdown(size),
    buildBenchmarkMarkdown(size, "table"),
  );

  const paragraphFixture = buildBenchmarkMarkdown(size, "paragraph");
  assert.equal(paragraphFixture.length, size);
  assert.match(paragraphFixture, /deterministic paragraph benchmark row/);
  assert.doesNotMatch(paragraphFixture, /\| index \| text \|/);

  const singleTableFixture = buildBenchmarkMarkdown(size, "single-table");
  assert.equal(singleTableFixture.length, size);
  assert.equal((singleTableFixture.match(/\| index \| text \|/g) ?? []).length, 1);
  assert.match(
    singleTableFixture,
    /\| 0000 \| deterministic row with fixed padding text \|/,
  );

  const largeSingleTableFixture = buildBenchmarkMarkdown(
    500 * 1024,
    "single-table",
  );
  const dataRowCount =
    largeSingleTableFixture.match(/\n\| \d+ \|/g)?.length ?? 0;
  assert.ok(
    dataRowCount >= 9_000 && dataRowCount <= 11_000,
    `single-table fixture should stay near the official row scale, got ${dataRowCount}`,
  );
});
