"use client";

// Prevent Next.js static prerendering so the crash happens at request time
// (matching production behaviour, where the challenge page is dynamic/auth-gated).
export const dynamic = "force-dynamic";

import ReactMarkdown from "react-markdown";

// The &nbsp without a closing semicolon is the malformed HTML entity from Post ID 125696.
// parse-entities@1.2.2 emits a namedNotTerminated warning (code 1) for it, which flows into
// vfile.message() → new VMessage(). In the Next.js 15.5.x SWC-minified bundle the VMessage
// constructor contains `this.source = parts[0]` where `parts` was not renamed to `s`,
// causing a ReferenceError and crashing the component tree.
//
// This crash is ONLY visible in a production build (`next build && next start`).
// In development the source is not minified so VMessage works correctly.
const CONTENT = "_An ambulance travelling at 60&nbspkm/h drives past you..._";

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
      <ReactMarkdown source={CONTENT} />
    </main>
  );
}
