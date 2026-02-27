"use client";

import ReactMarkdown from 'react-markdown';

// Fix malformed legacy HTML entities (missing semicolon) before they reach
// parse-entities, preventing the vfile-message SWC minification crash.
//
// This hardcoded list could be replaced with an import from the authoritative package:
//   import legacy from 'character-entities-legacy/index.json';
//   const LEGACY_ENTITY_NAMES = Object.keys(legacy).join('|');
const LEGACY_ENTITY_NAMES = [
  "brvbar","curren","frac12","frac14","frac34",
  "AElig","Aacute","Acirc","Agrave","Aring","Atilde","Auml",
  "Ccedil","Eacute","Ecirc","Egrave","Euml",
  "Iacute","Icirc","Igrave","Iuml",
  "Ntilde","Oacute","Ocirc","Ograve","Oslash","Otilde","Ouml",
  "THORN","Uacute","Ucirc","Ugrave","Uuml","Yacute",
  "aacute","acirc","acute","aelig","agrave","aring","atilde","auml",
  "ccedil","cedil","divide","eacute","ecirc","egrave","euml",
  "iacute","icirc","iexcl","igrave","iquest","iuml",
  "laquo","macr","micro","middot",
  "ntilde","oacute","ocirc","ograve","ordf","ordm","oslash","otilde","ouml",
  "plusmn","pound","raquo","szlig","thorn","times",
  "uacute","ucirc","ugrave","uuml","yacute","yuml",
  "COPY","QUOT","AMP","ETH","GT","LT","REG",
  "cent","copy","deg","eth","nbsp","not","para","quot","reg",
  "sect","shy","sup1","sup2","sup3","uml","yen",
  "amp","gt","lt",
].join("|");
const MALFORMED_ENTITY_RE = new RegExp(`&(${LEGACY_ENTITY_NAMES})(?!;)`, "g");

import characterEntities from "character-entities/index.json";
const ALL_ENTITIES = new Set(Object.keys(characterEntities));
const UNKNOWN_TERMINATED_RE = /&([a-zA-Z][a-zA-Z0-9]*);/g;

function fixMalformedEntities(md) {
  // Pass 1: add missing ; to legacy entities (namedNotTerminated, code 1)
  let result = md.replace(MALFORMED_ENTITY_RE, "&$1;");
  // Pass 2: escape & for terminated but unknown entities (namedUnknown, code 5)
  result = result.replace(UNKNOWN_TERMINATED_RE, (match, name) =>
    ALL_ENTITIES.has(name) ? match : `&amp;${name};`
  );
  return result;
}

// Prevent Next.js static prerendering so the crash happens at request time
// (matching production behaviour, where the challenge page is dynamic/auth-gated).
export const dynamic = "force-dynamic";

// The &nbsp without a closing semicolon is the malformed HTML entity from Post ID 125696.
// parse-entities@1.2.2 emits a namedNotTerminated warning (code 1) for it, which flows into
// vfile.message() → new VMessage(). In the Next.js 15.5.x SWC-minified bundle the VMessage
// constructor contains `this.source = parts[0]` where `parts` was not renamed to `s`,
// causing a ReferenceError and crashing the component tree.
//
// This crash is ONLY visible in a production build (`next build && next start`).
// In development the source is not minified so VMessage works correctly.
const CONTENT = "_An ambulance travelling at 60&nbspkm/h drives past you..._";

// Unknown entity names — not in character-entities-legacy, so parse-entities
// emits no namedNotTerminated warning and VMessage is never called.
// These should render without error.
const CONTENT_FOO = "Test with unknown entity: &foo bar";
const CONTENT_RANDOM = "Test with unknown entity: &random bar";
// NOTE: &foo; and &random; (terminated but unknown entities) also crash the
// build — parse-entities emits namedUnknown (code 5), which is not suppressed
// by remark's decode module and hits the broken VMessage constructor.
// They are tested in test-fix.mjs but omitted here to keep the build passing.
const CONTENT_FOO_TERMINATED = "Test with terminated unknown entity: &foo; bar";
const CONTENT_RANDOM_TERMINATED = "Test with terminated unknown entity: &random; bar";

export default function Home() {
  return (
    <main style={{ fontFamily: "sans-serif", padding: "2rem" }}>
      <h1>vfile-message SWC minification repro</h1>
      <p>
        In <strong>production</strong>, rendering the markdown below crashes
        with <code>ReferenceError: parts is not defined</code> inside the
        minified <code>VMessage</code> constructor (vfile-message@1.1.1).
      </p>
      <hr />
      <ReactMarkdown source={fixMalformedEntities(CONTENT)} />
      <hr />
      <ReactMarkdown source={CONTENT_FOO} />
      <ReactMarkdown source={CONTENT_RANDOM} />
      <ReactMarkdown source={fixMalformedEntities(CONTENT_FOO_TERMINATED)} />
      <ReactMarkdown source={fixMalformedEntities(CONTENT_RANDOM_TERMINATED)} />
    </main>
  );
}
