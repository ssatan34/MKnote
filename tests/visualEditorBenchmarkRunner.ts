import { performance } from "node:perf_hooks";
import { buildBenchmarkMarkdown } from "./fixtures/visual-editor/benchmark.ts";
import { luteMarkdownToHtml } from "../src/utils/luteMarkdown.ts";

const sizes = [100 * 1024, 500 * 1024];
const results = sizes.map((sizeBytes) => {
  const markdown = buildBenchmarkMarkdown(sizeBytes);

  for (let index = 0; index < 5; index += 1) {
    luteMarkdownToHtml(markdown);
  }

  const samplesMs: number[] = [];
  for (let index = 0; index < 30; index += 1) {
    const start = performance.now();
    luteMarkdownToHtml(markdown);
    samplesMs.push(performance.now() - start);
  }

  samplesMs.sort((left, right) => left - right);
  const p95Index = Math.min(samplesMs.length - 1, Math.ceil(samplesMs.length * 0.95) - 1);
  return {
    sizeBytes,
    medianMs: Number(samplesMs[Math.floor(samplesMs.length / 2)].toFixed(2)),
    p95Ms: Number(samplesMs[p95Index].toFixed(2)),
    minMs: Number(samplesMs[0].toFixed(2)),
    maxMs: Number(samplesMs[samplesMs.length - 1].toFixed(2)),
    samples: samplesMs.map((value) => Number(value.toFixed(2))),
  };
});

console.log(JSON.stringify({ runtime: "Node baseline; not WebView2 acceptance", results }, null, 2));
