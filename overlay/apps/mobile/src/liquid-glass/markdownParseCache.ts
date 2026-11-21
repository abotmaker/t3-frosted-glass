import type { Root } from "mdast";
import type { AccessibilityLabels, TextSelectionMenuConfig } from "react-native-enriched-markdown";

const MAX_AST_ENTRIES = 192;
const MAX_RENDERED_ENTRIES = 256;
const MAX_CACHEABLE_LENGTH = 131_072;

const astCache = new Map<string, Root>();
const renderedMarkdownCache = new Map<string, string>();
const linkUrlsCache = new Map<string, readonly string[]>();

export const EMPTY_LINK_URLS: readonly string[] = [];

const LINK_CANDIDATE_RE = /(?:\]\(|\]\[|\]:|https?:\/\/|www\.|mailto:|t3-|<[a-z][a-z0-9+.-]*:)/i;

function hasEmailCandidate(markdown: string): boolean {
  let at = markdown.indexOf("@");
  while (at !== -1) {
    if (
      at > 0 &&
      at + 1 < markdown.length &&
      !/[\s@]/.test(markdown[at - 1]!) &&
      !/[\s@]/.test(markdown[at + 1]!)
    ) {
      return true;
    }
    at = markdown.indexOf("@", at + 1);
  }
  return false;
}

interface MdastNodeLike {
  readonly type: string;
  readonly url?: string;
  readonly identifier?: string;
  readonly children?: ReadonlyArray<MdastNodeLike>;
}

/**
 * Synchronously extracts unique link URLs in document order from an already-preprocessed
 * native markdown string so `MobileEnrichedMarkdownText` can pass `linkVariants` and
 * `linkPillContent` on Render 1 instead of triggering a post-layout re-render and full
 * native Android segment recreation (`RECREATE_SEGMENTS`) on every message with links.
 */
export function getCachedMarkdownLinkUrls(
  markdown: string,
  parse: (input: string) => Root,
): readonly string[] {
  if (markdown.length === 0 || (!LINK_CANDIDATE_RE.test(markdown) && !hasEmailCandidate(markdown))) {
    return EMPTY_LINK_URLS;
  }
  const cacheable = markdown.length <= MAX_CACHEABLE_LENGTH;
  if (cacheable) {
    const hit = lruGet(linkUrlsCache, markdown);
    if (hit !== undefined) return hit;
  }
  const root = parse(markdown) as unknown as MdastNodeLike;
  let definitions: Map<string, string> | null = null;
  if (markdown.includes("]:")) {
    definitions = new Map<string, string>();
    const collectDefs = (node: MdastNodeLike) => {
      if (node.type === "definition" && node.identifier && typeof node.url === "string") {
        const id = node.identifier.toUpperCase();
        if (!definitions!.has(id)) definitions!.set(id, node.url);
      }
      if (node.children) {
        for (let i = 0; i < node.children.length; i++) collectDefs(node.children[i]!);
      }
    };
    collectDefs(root);
  }
  const seen = new Set<string>();
  const urls: string[] = [];
  const visit = (node: MdastNodeLike) => {
    if (node.type === "link" && typeof node.url === "string") {
      if (!seen.has(node.url)) {
        seen.add(node.url);
        urls.push(node.url);
      }
    } else if (node.type === "linkReference" && node.identifier && definitions !== null) {
      const resolved = definitions.get(node.identifier.toUpperCase());
      if (resolved !== undefined && !seen.has(resolved)) {
        seen.add(resolved);
        urls.push(resolved);
      }
    }
    if (node.children) {
      for (let i = 0; i < node.children.length; i++) visit(node.children[i]!);
    }
  };
  visit(root);
  const result: readonly string[] = urls.length === 0 ? EMPTY_LINK_URLS : urls;
  if (cacheable) {
    lruSet(linkUrlsCache, markdown, result, MAX_RENDERED_ENTRIES);
  }
  return result;
}

function lruGet<V>(cache: Map<string, V>, key: string): V | undefined {
  const hit = cache.get(key);
  if (hit === undefined) return undefined;
  cache.delete(key);
  cache.set(key, hit);
  return hit;
}

function lruSet<V>(cache: Map<string, V>, key: string, value: V, maxEntries: number): void {
  if (cache.has(key)) {
    cache.delete(key);
  } else if (cache.size >= maxEntries) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, value);
}

/**
 * Bounded LRU cache for read-only mdast ASTs produced by `remark-parse` + `remark-gfm`.
 * Eliminates repeated full-document parses when multiple transforms inspect the same message
 * or when reopening a recently viewed thread.
 */
export function getCachedMarkdownAst(markdown: string, parse: (input: string) => Root): Root {
  if (markdown.length > MAX_CACHEABLE_LENGTH) return parse(markdown);
  const hit = lruGet(astCache, markdown);
  if (hit !== undefined) return hit;
  const parsed = parse(markdown);
  lruSet(astCache, markdown, parsed, MAX_AST_ENTRIES);
  return parsed;
}

/**
 * Bounded LRU cache for pure native-markdown preprocessing (when no per-thread file embed
 * labels transform the output).
 */
export function getCachedNativeMarkdown(
  markdown: string,
  compute: (input: string) => string,
): string {
  if (markdown.length > MAX_CACHEABLE_LENGTH) return compute(markdown);
  const hit = lruGet(renderedMarkdownCache, markdown);
  if (hit !== undefined) return hit;
  const rendered = compute(markdown);
  lruSet(renderedMarkdownCache, markdown, rendered, MAX_RENDERED_ENTRIES);
  return rendered;
}

export const EMPTY_FILE_HREFS: ReadonlySet<string> = new Set<string>();

type GtTranslate = (
  text: string,
  options?: Readonly<Record<string, unknown>>,
) => string;

interface EnrichedStaticLabels {
  readonly accessibilityLabels: AccessibilityLabels;
  readonly selectionMenuConfig: TextSelectionMenuConfig;
}

const staticLabelsByGt = new WeakMap<GtTranslate, EnrichedStaticLabels>();

/**
 * Shares static AccessibilityLabels and TextSelectionMenuConfig across all mounted
 * MobileEnrichedMarkdownText rows for the current locale's `gt` function reference,
 * avoiding ~17 `gt()` calls per message row on every chat open.
 */
export function getCachedEnrichedStaticLabels(gt: GtTranslate): EnrichedStaticLabels {
  const cached = staticLabelsByGt.get(gt);
  if (cached !== undefined) return cached;
  const created: EnrichedStaticLabels = {
    accessibilityLabels: {
      list: {
        bulletPoint: gt("Bullet point"),
        nestedBulletPoint: gt("Nested bullet point"),
        orderedItem: gt("List item {n}", { n: "{n}" }),
        nestedOrderedItem: gt("Nested list item {n}", { n: "{n}" }),
      },
      blockquote: { quote: gt("Blockquote"), nestedQuote: gt("Nested blockquote") },
      table: { row: gt("Row {n}: {content}", { n: "{n}", content: "{content}" }) },
      math: { equation: gt("Math: {speech}", { speech: "{speech}" }) },
      codeBlock: { wrap: gt("Wrap lines"), unwrap: gt("Disable line wrap") },
      rotor: {
        headings: gt("Headings", { $context: "screen reader rotor category" }),
        links: gt("Links", { $context: "screen reader rotor category" }),
        images: gt("Images", { $context: "screen reader rotor category" }),
      },
    },
    selectionMenuConfig: {
      copy: { label: gt("Copy", { $context: "verb" }) },
      copyAsMarkdown: { label: gt("Copy as Markdown") },
      copyImageUrl: {
        label: gt("Copy Image URL"),
        pluralLabels: { other: gt("Copy {count} Image URLs", { count: "{count}" }) },
      },
    },
  };
  staticLabelsByGt.set(gt, created);
  return created;
}
