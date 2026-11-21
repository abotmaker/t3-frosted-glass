import type { WideMarkdownBlockOptions } from "../lib/wideMarkdownBlocks";

const fence = /^ {0,3}(?:```|~~~)/m;
const quote = /^ {0,3}>[ \t]?/;
const orderedItem = /^ {0,3}\d{1,9}[.)](?:[ \t]+|$)/;
const tableDelimiter = /^[|\-: \t]+$/;

function isWideLine(raw: string, options: WideMarkdownBlockOptions): boolean {
  if (fence.test(raw)) return true;
  let line = raw;
  while (quote.test(line)) {
    if (options.includeBlockquotes) return true;
    line = line.replace(quote, "");
  }

  let indent = 0;
  let i = 0;
  while (i < line.length) {
    if (line[i] === " ") indent++;
    else if (line[i] === "\t") indent += 4 - (indent % 4);
    else break;
    i++;
  }
  // This also covers deeply indented numbered lists.
  if (indent >= 4 && i < line.length && line[i] !== "\r") return true;
  if (options.includeOrderedLists !== false && orderedItem.test(line)) return true;
  return raw.includes("|") && raw.includes("-") && tableDelimiter.test(raw.trim());
}

/** Each mounted feed keeps a checkpoint for one streaming reply. Completed rows use a single pass. */
export function createWideMarkdownDetector(options: WideMarkdownBlockOptions) {
  let previousText = "";
  let nextLine = 0;
  let completedWideLine = false;

  return (text: string, streaming: boolean): boolean => {
    let start = 0;
    if (streaming) {
      if (text.startsWith(previousText)) {
        if (completedWideLine) return true;
        start = nextLine;
      } else {
        completedWideLine = false;
        nextLine = 0;
      }
      previousText = text;
    }
    for (;;) {
      const end = text.indexOf("\n", start);
      if (end === -1) {
        if (streaming) nextLine = start;
        // An unfinished delimiter or ordered-list marker can become ordinary prose.
        return isWideLine(text.slice(start), options);
      }
      if (isWideLine(text.slice(start, end), options)) {
        if (streaming) completedWideLine = true;
        return true;
      }
      start = end + 1;
    }
  };
}
