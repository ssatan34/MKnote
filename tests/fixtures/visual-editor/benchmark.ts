export function buildBenchmarkMarkdown(targetBytes: number): string {
  if (!Number.isInteger(targetBytes) || targetBytes <= 0) {
    throw new Error("targetBytes 必须是正整数");
  }

  const seed =
    "<!-- visual-editor-benchmark-0000 -->\n\n| index | text |\n| --- | --- |\n| 0000 | deterministic row |\n\n";
  let markdown = "";
  let index = 0;
  while (markdown.length < targetBytes) {
    markdown += seed.replaceAll("0000", String(index).padStart(4, "0"));
    index += 1;
  }

  return markdown.slice(0, targetBytes);
}
