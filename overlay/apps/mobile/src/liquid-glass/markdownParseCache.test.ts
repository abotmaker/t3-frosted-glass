import type { Root } from "mdast";
import { describe, expect, it, vi } from "vite-plus/test";

import { parseMarkdownAst } from "../lib/markdownDocument";
import {
  EMPTY_LINK_URLS,
  getCachedEnrichedStaticLabels,
  getCachedMarkdownAst,
  getCachedMarkdownLinkUrls,
  getCachedNativeMarkdown,
} from "./markdownParseCache";

describe("markdownParseCache", () => {
  it("caches repeated AST parses for identical markdown strings", () => {
    const parse = vi.fn((text: string): Root => ({ type: "root", children: [] }));
    const first = getCachedMarkdownAst("# Hello world\n`src/a.ts`", parse);
    const second = getCachedMarkdownAst("# Hello world\n`src/a.ts`", parse);
    expect(first).toBe(second);
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it("caches repeated native markdown transforms", () => {
    const compute = vi.fn((text: string) => `rendered:${text}`);
    expect(getCachedNativeMarkdown("abc", compute)).toBe("rendered:abc");
    expect(getCachedNativeMarkdown("abc", compute)).toBe("rendered:abc");
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("shares static enriched markdown labels across rows for the same gt function", () => {
    const gt = vi.fn((text: string) => text);
    const first = getCachedEnrichedStaticLabels(gt);
    const second = getCachedEnrichedStaticLabels(gt);
    expect(first).toBe(second);
    expect(first.accessibilityLabels).toBe(second.accessibilityLabels);
    expect(first.selectionMenuConfig).toBe(second.selectionMenuConfig);
    expect(gt).toHaveBeenCalledTimes(17);

    // A new locale's gt function builds fresh localized labels.
    const gtFr = vi.fn((text: string) => `fr:${text}`);
    const french = getCachedEnrichedStaticLabels(gtFr);
    expect(french).not.toBe(first);
    expect(french.selectionMenuConfig.copy?.label).toBe("fr:Copy");
  });

  it("extracts and caches unique link URLs without parsing link-free prose", () => {
    const parse = vi.fn((input: string): Root => {
      if (input.includes("[ref]")) {
        return {
          type: "root",
          children: [
            {
              type: "paragraph",
              children: [
                { type: "link", url: "src/a.ts", children: [] },
                { type: "linkReference", identifier: "ref", referenceType: "shortcut", children: [] },
                { type: "link", url: "src/a.ts", children: [] },
              ],
            },
            { type: "definition", identifier: "ref", url: "https://example.com" },
          ],
        } as unknown as Root;
      }
      return { type: "root", children: [] };
    });

    // Link-free prose skips parsing entirely.
    expect(getCachedMarkdownLinkUrls("Just plain text without links.", parse)).toBe(EMPTY_LINK_URLS);
    expect(parse).not.toHaveBeenCalled();

    const doc = "Check [a](<src/a.ts>) and [ref]\n\n[ref]: https://example.com";
    const first = getCachedMarkdownLinkUrls(doc, parse);
    const second = getCachedMarkdownLinkUrls(doc, parse);
    expect(first).toEqual(["src/a.ts", "https://example.com"]);
    expect(second).toBe(first);
    expect(parse).toHaveBeenCalledTimes(1);
  });

  it("extracts GFM email autolinks with the configured remark-gfm parser", () => {
    const urls = getCachedMarkdownLinkUrls("Contact contact@example.com", parseMarkdownAst);
    expect(urls).toEqual(["mailto:contact@example.com"]);
    expect(getCachedMarkdownLinkUrls("Contact contact@example.com", parseMarkdownAst)).toBe(urls);
    expect(
      getCachedMarkdownLinkUrls("Ping @alice or contact@example.com", parseMarkdownAst),
    ).toEqual(["mailto:contact@example.com"]);
    const parse = vi.fn((): Root => ({ type: "root", children: [] }));
    expect(getCachedMarkdownLinkUrls("a".repeat(20_000), parse)).toBe(EMPTY_LINK_URLS);
    expect(parse).not.toHaveBeenCalled();
  });
});
