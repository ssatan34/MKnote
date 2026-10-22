import assert from "node:assert/strict";
import test from "node:test";

const {
  BENCHMARK_TABLE_COUNTS,
  BENCHMARK_EDITOR_PROFILES,
  BENCHMARK_LAYOUTS,
  BENCHMARK_SIZES,
  buildBenchmarkMarkdown,
  parseBenchmarkBytes,
  parseBenchmarkEditorProfile,
  parseBenchmarkLayout,
  parseBenchmarkTableCount,
  percentile,
} = await import("../src/benchmarkMode.ts");

test("benchmark mode only accepts the fixed protocol sizes", () => {
  assert.deepEqual(BENCHMARK_SIZES, [100 * 1024, 500 * 1024]);
  assert.equal(parseBenchmarkBytes("?benchmarkBytes=102400"), 100 * 1024);
  assert.equal(parseBenchmarkBytes("?benchmarkBytes=512000"), 500 * 1024);
  assert.equal(parseBenchmarkBytes("?benchmarkBytes=102401"), null);
  assert.equal(parseBenchmarkBytes(""), null);
});

test("benchmark fixture is deterministic and exact-sized", () => {
  for (const size of BENCHMARK_SIZES) {
    const first = buildBenchmarkMarkdown(size);
    const second = buildBenchmarkMarkdown(size);

    assert.equal(first, second);
    assert.equal(first.length, size);
    assert.match(first, /^<!-- visual-editor-benchmark-0000 -->/);
  }
});

test("table fragment sweep keeps exact bytes and deterministic table count", () => {
  assert.deepEqual(BENCHMARK_TABLE_COUNTS, [1, 16, 64, 256, 512, 1024, 2048, 5120]);
  assert.equal(
    parseBenchmarkTableCount("?benchmarkTableCount=64"),
    64,
  );
  assert.equal(parseBenchmarkTableCount("?benchmarkTableCount=65"), null);
  assert.equal(parseBenchmarkTableCount("?benchmarkTableCount=oops"), null);

  const markdown = buildBenchmarkMarkdown(100 * 1024, "table", 64);
  assert.equal(markdown.length, 100 * 1024);
  assert.equal(
    (markdown.match(/<!-- b\d{4} -->/g) ?? []).length,
    64,
  );
});

test("largest official table fixtures fit their protocol sizes", () => {
  const oneHundredKiB = buildBenchmarkMarkdown(
    100 * 1024,
    "table",
    1024,
  );
  const fiveHundredKiB = buildBenchmarkMarkdown(
    500 * 1024,
    "table",
    5120,
  );

  assert.equal(oneHundredKiB.length, 100 * 1024);
  assert.equal(fiveHundredKiB.length, 500 * 1024);
  assert.equal((oneHundredKiB.match(/<!-- b\d{4} -->/g) ?? []).length, 1024);
  assert.equal((fiveHundredKiB.match(/<!-- b\d{4} -->/g) ?? []).length, 5120);
});

test("table fragment sweep uses the single-table row shape for fair pressure", () => {
  const size = 100 * 1024;
  const singleTable = buildBenchmarkMarkdown(size, "single-table");
  const oneTableFragment = buildBenchmarkMarkdown(size, "table", 1);
  const rowPattern = /^\| \d{4} \| deterministic row with fixed padding text \|$/gm;
  const singleTableRows = singleTable.match(rowPattern) ?? [];
  const oneTableFragmentRows = oneTableFragment.match(rowPattern) ?? [];

  assert.ok(singleTableRows.length > 1_500);
  assert.ok(
    oneTableFragmentRows.length >= singleTableRows.length - 2,
    `one-table fragment should stay near single-table row scale: ${JSON.stringify({
      singleTableRows: singleTableRows.length,
      oneTableFragmentRows: oneTableFragmentRows.length,
    })}`,
  );
  assert.ok(oneTableFragmentRows.length <= singleTableRows.length);
  assert.doesNotMatch(oneTableFragment, /\n\n[ \t]*$/);
  assert.match(
    oneTableFragment,
    /^\| index \| text <!-- b0000 --> \|$/m,
  );
});

test("high-count table fragment diagnostics fit both fixed benchmark sizes", () => {
  const cases = [
    [100 * 1024, 2048],
    [500 * 1024, 5120],
  ];

  for (const [size, tableCount] of cases) {
    const markdown = buildBenchmarkMarkdown(size, "table", tableCount);

    assert.equal(markdown.length, size);
    assert.equal(
      (markdown.match(/<!-- b\d{4} -->/g) ?? []).length,
      tableCount,
    );
    assert.doesNotMatch(markdown, /\n\n[ \t]*$/);
  }
});

test("percentile does not mutate samples and uses the protocol index", () => {
  const samples = [10, 2, 8, 4, 6];

  assert.equal(percentile(samples, 0.95), 10);
  assert.equal(percentile(samples, 0.5), 6);
  assert.deepEqual(samples, [10, 2, 8, 4, 6]);
  assert.throws(() => percentile([], 0.95), /samples/);
  assert.throws(() => percentile(samples, 0), /quantile/);
});

test("benchmark layout defaults to normal and exposes only the diagnostic layout", () => {
  assert.deepEqual(BENCHMARK_LAYOUTS, ["normal", "no-table-layout"]);
  assert.equal(parseBenchmarkLayout(""), "normal");
  assert.equal(
    parseBenchmarkLayout("?benchmarkLayout=no-table-layout"),
    "no-table-layout",
  );
  assert.equal(parseBenchmarkLayout("?benchmarkLayout=unknown"), "normal");
});

test("benchmark editor profiles expose independent table runtime diagnostics", () => {
  assert.deepEqual(BENCHMARK_EDITOR_PROFILES, [
    "normal",
    "no-gfm",
    "no-table-runtime",
    "no-table-align-runtime",
    "no-table-editing-runtime",
    "incremental-table-align-runtime",
    "virtualized-blocks",
  ]);
  assert.equal(parseBenchmarkEditorProfile(""), "normal");
  assert.equal(
    parseBenchmarkEditorProfile("?benchmarkEditorProfile=no-gfm"),
    "no-gfm",
  );
  assert.equal(
    parseBenchmarkEditorProfile("?benchmarkEditorProfile=no-table-runtime"),
    "no-table-runtime",
  );
  assert.equal(
    parseBenchmarkEditorProfile(
      "?benchmarkEditorProfile=no-table-align-runtime",
    ),
    "no-table-align-runtime",
  );
  assert.equal(
    parseBenchmarkEditorProfile(
      "?benchmarkEditorProfile=no-table-editing-runtime",
    ),
    "no-table-editing-runtime",
  );
  assert.equal(
    parseBenchmarkEditorProfile(
      "?benchmarkEditorProfile=incremental-table-align-runtime",
    ),
    "incremental-table-align-runtime",
  );
  assert.equal(
    parseBenchmarkEditorProfile("?benchmarkEditorProfile=virtualized-blocks"),
    "virtualized-blocks",
  );
  assert.equal(
    parseBenchmarkEditorProfile("?benchmarkEditorProfile=unknown"),
    "normal",
  );
});
