import { describe, expect, it } from "vite-plus/test";
import { hasWideMarkdownBlock } from "../lib/wideMarkdownBlocks";
import { createWideMarkdownDetector } from "./wideMarkdownLayout";

describe("streaming wide Markdown layout", () => {
  const samples = [
    "prose\n1.x\n2. item", "prose\n|-|text\n---", "> >  \tfoo\r\n", "\u2028~~~",
    "\n    \r\n  > >  2. item", "\n| :-- |\r\nend", "prose\n    12) nested",
    "   ```js\na", ">   ```\na", "- parent\n\n    1. child", "\t \n",
  ];
  for (const options of [{}, { includeBlockquotes: true, includeOrderedLists: false }]) {
    it(`matches upstream for appends, edits, truncation and interleaved rows ${JSON.stringify(options)}`, () => {
      const detect = createWideMarkdownDetector(options);
      for (const sample of samples) {
        for (let end = 0; end <= sample.length; end++) {
          const text = sample.slice(0, end);
          expect(detect("plain settled row", false)).toBe(false);
          expect(detect(text, true)).toBe(hasWideMarkdownBlock(text, options));
        }
        expect(detect(sample, false)).toBe(hasWideMarkdownBlock(sample, options));
        expect(detect(sample.slice(0, 1), true)).toBe(hasWideMarkdownBlock(sample.slice(0, 1), options));
      }
    });
  }
});
