// The complete set of HTML legacy named entities (character-entities-legacy@1.1.4).
//
// Ref: https://github.com/wooorm/character-entities-legacy/blob/main/index.js
//
// These are the ONLY names parse-entities can prefix-match without a semicolon,
// so this list is both necessary and sufficient.
// Sorted longest-first so the regex engine prefers longer matches when names
// share a prefix (e.g. 'brvbar' before 'br' if such conflicts existed).
const LEGACY_ENTITY_NAMES = [
  "brvbar",
  "curren",
  "frac12",
  "frac14",
  "frac34",
  "AElig",
  "Aacute",
  "Acirc",
  "Agrave",
  "Aring",
  "Atilde",
  "Auml",
  "Ccedil",
  "Eacute",
  "Ecirc",
  "Egrave",
  "Euml",
  "Iacute",
  "Icirc",
  "Igrave",
  "Iuml",
  "Ntilde",
  "Oacute",
  "Ocirc",
  "Ograve",
  "Oslash",
  "Otilde",
  "Ouml",
  "THORN",
  "Uacute",
  "Ucirc",
  "Ugrave",
  "Uuml",
  "Yacute",
  "aacute",
  "acirc",
  "acute",
  "aelig",
  "agrave",
  "aring",
  "atilde",
  "auml",
  "ccedil",
  "cedil",
  "divide",
  "eacute",
  "ecirc",
  "egrave",
  "euml",
  "iacute",
  "icirc",
  "iexcl",
  "igrave",
  "iquest",
  "iuml",
  "laquo",
  "macr",
  "micro",
  "middot",
  "ntilde",
  "oacute",
  "ocirc",
  "ograve",
  "ordf",
  "ordm",
  "oslash",
  "otilde",
  "ouml",
  "plusmn",
  "pound",
  "raquo",
  "szlig",
  "thorn",
  "times",
  "uacute",
  "ucirc",
  "ugrave",
  "uuml",
  "yacute",
  "yuml",
  "COPY",
  "QUOT",
  "AMP",
  "ETH",
  "GT",
  "LT",
  "REG",
  "cent",
  "copy",
  "deg",
  "eth",
  "nbsp",
  "not",
  "para",
  "quot",
  "reg",
  "sect",
  "shy",
  "sup1",
  "sup2",
  "sup3",
  "uml",
  "yen",
  "amp",
  "gt",
  "lt",
].join("|");

// Match &ENTITY not already followed by ;
// parse-entities prefix-matches legacy entities even inside longer alphanumeric
// runs (e.g. &nbspkm → captures &nbsp, warns, then continues with km).
// So we must insert ; right after the entity name regardless of what follows.
const MALFORMED_ENTITY_RE = new RegExp(`&(${LEGACY_ENTITY_NAMES})(?!;)`, "g");

// Fix 2: &NAME; where NAME is not a valid HTML5 named entity.
// parse-entities emits namedUnknown (code 5), which remark does not suppress,
// crashing the broken VMessage constructor. Escape & → &amp; so it renders
// as literal text instead of being parsed as an entity reference.
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const ALL_ENTITIES = new Set(Object.keys(require("character-entities")));
const UNKNOWN_TERMINATED_RE = /&([a-zA-Z][a-zA-Z0-9]*);/g;

function fixMalformedEntities(markdown) {
  // Pass 1: add missing ; to legacy entities (namedNotTerminated, code 1)
  let result = markdown.replace(MALFORMED_ENTITY_RE, "&$1;");
  // Pass 2: escape & for terminated but unknown entities (namedUnknown, code 5)
  result = result.replace(UNKNOWN_TERMINATED_RE, (match, name) =>
    ALL_ENTITIES.has(name) ? match : `&amp;${name};`
  );
  return result;
}

let passed = 0;
let failed = 0;

function test(description, input, expected) {
  const actual = fixMalformedEntities(input);
  if (actual === expected) {
    console.log(`  PASS  ${description}`);
    passed++;
  } else {
    console.error(`  FAIL  ${description}`);
    console.error(`        input:    ${JSON.stringify(input)}`);
    console.error(`        expected: ${JSON.stringify(expected)}`);
    console.error(`        actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

// --- Cases that must be fixed (trigger the crash) ---
console.log("\nMalformed entities (missing semicolon) — must be fixed:");
test(
  "&nbsp missing semicolon",
  "travelling at 60&nbspkm/h",
  "travelling at 60&nbsp;km/h",
);
test("&middot missing semicolon", "a&middotb", "a&middot;b");
// mdash/ndash are NOT in the legacy table → parse-entities emits namedEmpty
// (type 3), which remark suppresses → no crash → no fix needed.
test("&mdash not in legacy table, unchanged", "yes&mdashno", "yes&mdashno");
test("&ndash not in legacy table, unchanged", "yes&ndashno", "yes&ndashno");
test("&amp missing semicolon", "fish &amp chips", "fish &amp; chips");
test("&lt missing semicolon", "1&lt2", "1&lt;2");
test("&gt missing semicolon", "2&gt1", "2&gt;1");
// hellip is also NOT in the legacy table → type-3 warning → suppressed → unchanged.
test("&hellip not in legacy table, unchanged", "wait&hellip", "wait&hellip");
// Completely unknown names — not in legacy table, no warning at all → unchanged.
test("&foo unknown entity, unchanged", "a &foo bar", "a &foo bar");
test("&random unknown entity, unchanged", "a &random bar", "a &random bar");
// Unknown names with semicolon — namedUnknown (code 5), not suppressed → crashes.
// Fix: escape & → &amp; so they render as literal text.
test("&foo; terminated unknown entity, escaped", "a &foo; bar", "a &amp;foo; bar");
test("&random; terminated unknown entity, escaped", "a &random; bar", "a &amp;random; bar");
test(
  "multiple in one string",
  "60&nbspkm/h and a&middotb",
  "60&nbsp;km/h and a&middot;b",
);

// --- Cases that must be left alone ---
console.log("\nAlready-valid entities — must be unchanged:");
test("&nbsp; already terminated", "foo &nbsp; bar", "foo &nbsp; bar");
test("&middot; already terminated", "a &middot; b", "a &middot; b");
test("&amp; already terminated", "fish &amp; chips", "fish &amp; chips");
test("numeric entity &#160;", "foo&#160;bar", "foo&#160;bar");
test("numeric entity &#x00A0;", "foo&#x00A0;bar", "foo&#x00A0;bar");
test("bare && (type-3, suppressed)", "a && b", "a && b");
test("no entities at all", "plain text", "plain text");
test("empty string", "", "");

// --- The exact string from the bug report ---
console.log("\nReal-world content from the bug report:");
test(
  "ambulance question prompt",
  "_An ambulance travelling at 60&nbspkm/h drives past you..._",
  "_An ambulance travelling at 60&nbsp;km/h drives past you..._",
);

// --- Summary ---
console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
