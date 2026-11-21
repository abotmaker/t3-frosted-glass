import { execFileSync } from "node:child_process";

const mobileDir = "apps/mobile/";
const surfacePatterns = [
  /\bbg-(?!transparent\b|none\b)(?:[\w-]+|\[)/,
  /\b(?:backgroundColor|borderColor|borderRadius|shadowColor|elevation|tintColor)\b/,
  /<(?:[\w.]+\.)?(?:BlurView|GlassSurface|LiquidGlassSurface|Surface|Card|RadioButton|SegmentedControl|Modal|Dialog|Switch|Slider|Pressable|Touchable\w*|TextInput)\b/,
  /(?:android:|app:)(?:background|backgroundTint|tint)\s*=|\b(?:setBackground\w*|drawRoundRect|RenderEffect)\b/,
];

function isAndroidUiPath(path) {
  if (!path.startsWith(mobileDir)) {
    return /^packages\/shared\/src\/theme\w+\.[cm]?[jt]s$/.test(path);
  }
  const file = path.slice(mobileDir.length);
  if (/(?:^|\/)(?:__tests__|tests?|androidTest|testFixtures|fixtures)\//.test(file)) return false;
  if (/\.(?:ios|web|macos|windows|test|spec|stories)\.[^/]+$/.test(file)) return false;

  return (
    /\.(?:tsx|jsx|css|(?:android|native)\.[cm]?[jt]s)$/.test(file) ||
    /^src\/(?:components\/|lib\/[\w-]*(?:theme|Theme|designTokens)|features\/settings\/appearance\/)[\w./-]*\.[cm]?[jt]s$/.test(file) ||
    /^app\.config\.[cm]?[jt]s$/.test(file) ||
    /^plugins\/.*(?:android|clerk|theme|splash|edge|systembar)/i.test(file) ||
    /^assets\/.*\.xml$/.test(file) ||
    (/^android\/|\/android\//.test(file) && /\.(?:kt|java|xml)$/.test(file))
  );
}

function surfaceExamples(patch) {
  const examples = [];
  let newLine = 0;
  for (const line of patch.split("\n")) {
    const hunk = /^@@ .* \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      newLine = Number(hunk[1]);
    } else if (newLine > 0 && (line.startsWith("+") || line.startsWith(" "))) {
      const code = line.slice(1).trim();
      if (line.startsWith("+") && surfacePatterns.some((pattern) => pattern.test(code))) {
        examples.push({ line: newLine, code: code.slice(0, 160) });
        if (examples.length === 3) break;
      }
      newLine += 1;
    }
  }
  return examples;
}

function review(repo, base, target) {
  if (!repo || !base || !target) {
    throw new Error("Usage: node scripts/review-upstream-ui.mjs <repo> <base-commit> <target-commit>");
  }
  const git = (...args) =>
    execFileSync("git", ["-C", repo, "--literal-pathspecs", ...args], {
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
  const resolve = (ref) => git("rev-parse", "--verify", "--end-of-options", ref + "^{commit}").trim();
  const before = resolve(base);
  const after = resolve(target);
  console.log("==> Android UI review " + before.slice(0, 12) + " → " + after.slice(0, 12));

  const diff = ["diff", "--no-ext-diff", "--no-textconv", "--no-renames"];
  const changes = git(...diff, "--name-status", "-z", before, after, "--", mobileDir, "packages/shared/src/")
    .split("\0").slice(0, -1);
  const candidates = [];
  for (let index = 0; index < changes.length; index += 2) {
    const status = changes[index];
    const path = changes[index + 1];
    if (!isAndroidUiPath(path)) continue;
    const examples = status === "D"
      ? []
      : surfaceExamples(git(...diff, "--unified=0", before, after, "--", path));
    candidates.push({ path, status, examples });
  }

  if (candidates.length === 0) {
    console.log("No upstream Android UI files matched the review scan.");
    return 0;
  }

  console.log(candidates.length + " Android UI change(s) to review for Liquid Glass coverage:");
  for (const { path, status, examples } of candidates) {
    const label = { A: "added", M: "modified", D: "removed", T: "type changed" }[status] ?? status;
    const hint = examples.length > 0 ? " (surface or control styling)" : "";
    console.log("  " + label + " " + path + hint);
    for (const example of examples) {
      console.log("    " + example.line + "  " + example.code);
    }
  }
  console.log("Check shared glass component coverage and update the overlay where needed.");
  return 3;
}

try {
  process.exitCode = review(...process.argv.slice(2));
} catch (error) {
  console.error("ERROR: Could not review upstream Android UI changes. " + error.message);
  process.exitCode = 1;
}
