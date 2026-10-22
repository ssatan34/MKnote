export const BENCHMARK_SIZES = Object.freeze([100 * 1024, 500 * 1024]);

export const BENCHMARK_TABLE_COUNTS = Object.freeze([
  1,
  16,
  64,
  256,
  512,
  1024,
  2048,
  5120,
]);

export const BENCHMARK_LAYOUTS = Object.freeze([
  "normal",
  "no-table-layout",
] as const);

export type BenchmarkLayout = (typeof BENCHMARK_LAYOUTS)[number];

export const BENCHMARK_EDITOR_PROFILES = Object.freeze([
  "normal",
  "no-gfm",
  "no-table-runtime",
  "no-table-align-runtime",
  "no-table-editing-runtime",
  "incremental-table-align-runtime",
  "virtualized-blocks",
] as const);

export type BenchmarkEditorProfile = (typeof BENCHMARK_EDITOR_PROFILES)[number];

export const BENCHMARK_FIXTURES = Object.freeze([
  "table",
  "paragraph",
  "single-table",
] as const);

export type BenchmarkFixture = (typeof BENCHMARK_FIXTURES)[number];

const BENCHMARK_SEEDS: Record<Exclude<BenchmarkFixture, "single-table">, string> = {
  table:
    "<!-- visual-editor-benchmark-0000 -->\n\n| index | text |\n| --- | --- |\n| 0000 | deterministic row |\n\n",
  paragraph:
    "deterministic paragraph benchmark row 0000 with stable text for editor pressure measurement and fixed fixture comparisons.\n\n",
};

function buildSingleTableMarkdown(targetBytes: number): string {
  let markdown = "| index | text |\n| --- | --- |\n";
  let index = 0;

  while (markdown.length < targetBytes) {
    markdown += buildTableDataRow(index);
    index += 1;
  }

  return markdown.slice(0, targetBytes);
}

const buildTableDataRow = (rowIndex: number): string =>
  `| ${String(rowIndex).padStart(4, "0")} | deterministic row with fixed padding text |\n`;

function buildTableBundleMarkdown(
  targetBytes: number,
  tableCount: number,
): string {
  // marker 只服务于 fragment 计数；保持短小，才能让 5,120 个最小 fragment 精确落入 500 KiB。
  const buildHeader = (tableIndex: number): string =>
    `| index | text <!-- b${String(tableIndex).padStart(4, "0")} --> |\n| --- | --- |\n`;
  const buildRow = (rowIndex: number): string => buildTableDataRow(rowIndex);
  const standardMinimumBlockLength =
    buildHeader(0).length + buildRow(0).length + 1;
  const compactMinimumBlockLength = buildHeader(0).length + 1;
  const minimumBlockLength =
    standardMinimumBlockLength * tableCount <= targetBytes
      ? standardMinimumBlockLength
      : compactMinimumBlockLength;

  if (minimumBlockLength * tableCount > targetBytes) {
    throw new Error(
      `table fragment count ${tableCount} does not fit benchmark target ${targetBytes}`,
    );
  }

  let markdown = "";
  let rowIndex = 0;
  for (let tableIndex = 0; tableIndex < tableCount; tableIndex += 1) {
    const isLastTable = tableIndex === tableCount - 1;
    markdown += buildHeader(tableIndex);
    const remainingTables = tableCount - tableIndex - 1;
    const minimumRemainingLength = remainingTables * minimumBlockLength;

    while (markdown.length < targetBytes) {
      const row = buildRow(rowIndex);
      if (
        !isLastTable &&
        markdown.length + row.length + minimumRemainingLength > targetBytes
      ) {
        break;
      }
      markdown += row;
      rowIndex += 1;
      if (isLastTable && markdown.length >= targetBytes) {
        return markdown.slice(0, targetBytes);
      }
    }
    if (isLastTable) return markdown.slice(0, targetBytes);
    markdown += "\n";
  }

  return markdown.slice(0, targetBytes);
}

export function parseBenchmarkBytes(search: string): number | null {
  const rawValue = new URLSearchParams(search).get("benchmarkBytes");

  if (rawValue === null || !/^\d+$/.test(rawValue)) return null;

  const bytes = Number(rawValue);
  return BENCHMARK_SIZES.includes(bytes) ? bytes : null;
}

export function parseBenchmarkTableCount(search: string): number | null {
  const rawValue = new URLSearchParams(search).get("benchmarkTableCount");
  if (rawValue === null || !/^\d+$/.test(rawValue)) return null;
  const tableCount = Number(rawValue);
  return BENCHMARK_TABLE_COUNTS.includes(tableCount) ? tableCount : null;
}

export function parseBenchmarkLayout(search: string): BenchmarkLayout {
  return new URLSearchParams(search).get("benchmarkLayout") ===
    "no-table-layout"
    ? "no-table-layout"
    : "normal";
}

export function parseBenchmarkEditorProfile(
  search: string,
): BenchmarkEditorProfile {
  const profile = new URLSearchParams(search).get("benchmarkEditorProfile");
  return profile === "no-gfm" ||
    profile === "no-table-runtime" ||
    profile === "no-table-align-runtime" ||
    profile === "no-table-editing-runtime" ||
    profile === "incremental-table-align-runtime" ||
    profile === "virtualized-blocks"
    ? profile
    : "normal";
}

export function parseBenchmarkFixture(search: string): BenchmarkFixture {
  const fixture = new URLSearchParams(search).get("benchmarkFixture");
  return fixture === "paragraph" || fixture === "single-table"
    ? fixture
    : "table";
}

export function buildBenchmarkMarkdown(
  targetBytes: number,
  fixture: BenchmarkFixture = "table",
  tableCount: number | null = null,
): string {
  if (!BENCHMARK_SIZES.includes(targetBytes)) {
    throw new Error(
      `benchmark target must be one of: ${BENCHMARK_SIZES.join(", ")}`,
    );
  }

  if (!BENCHMARK_FIXTURES.includes(fixture)) {
    throw new Error(
      `benchmark fixture must be one of: ${BENCHMARK_FIXTURES.join(", ")}`,
    );
  }

  if (tableCount !== null) {
    if (!BENCHMARK_TABLE_COUNTS.includes(tableCount)) {
      throw new Error(
        `benchmark table count must be one of: ${BENCHMARK_TABLE_COUNTS.join(", ")}`,
      );
    }
    if (fixture !== "table") {
      throw new Error("benchmark table count only applies to the table fixture");
    }
    return buildTableBundleMarkdown(targetBytes, tableCount);
  }

  if (fixture === "single-table") {
    return buildSingleTableMarkdown(targetBytes);
  }

  const seed = BENCHMARK_SEEDS[fixture];
  let markdown = "";
  let index = 0;

  while (markdown.length < targetBytes) {
    markdown += seed.replaceAll("0000", String(index).padStart(4, "0"));
    index += 1;
  }

  return markdown.slice(0, targetBytes);
}

export function percentile(samples: number[], quantile: number): number {
  if (samples.length === 0) throw new Error("samples must not be empty");
  if (!(quantile > 0 && quantile <= 1)) {
    throw new Error("quantile must greater 0 and at most 1");
  }

  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.ceil(sorted.length * quantile) - 1,
  );
  return sorted[index];
}
