import {
  CDN_CSS_URL,
  CDN_JS_URL,
  type ClaudiusConfigObject,
} from "../config";

/**
 * Generate the copy-paste embed snippet for a config. Mirrors the layout the
 * CLI produces (scripts/lib/snippet.ts) with the CDN stylesheet line the
 * README's embed instructions include.
 */
export function generateScriptSnippet(config: ClaudiusConfigObject): string {
  const json = JSON.stringify(config, null, 2);
  // Indent continuation lines so the object aligns under the assignment.
  const indentedJson = json.replace(/\n/g, "\n    ");

  return [
    `<!-- Claudius Chat Widget -->`,
    `<link rel="stylesheet" href="${CDN_CSS_URL}" />`,
    `<script>`,
    `  window.ClaudiusConfig = ${indentedJson};`,
    `</script>`,
    `<script src="${CDN_JS_URL}" defer></script>`,
  ].join("\n");
}

/**
 * A complete standalone HTML page around the snippet, used for the
 * StackBlitz / CodeSandbox exports.
 */
export function generateSandboxHtml(config: ClaudiusConfigObject): string {
  return [
    `<!doctype html>`,
    `<html lang="en">`,
    `  <head>`,
    `    <meta charset="utf-8" />`,
    `    <meta name="viewport" content="width=device-width, initial-scale=1" />`,
    `    <title>Claudius widget demo</title>`,
    `    <style>`,
    `      body { font-family: system-ui, sans-serif; margin: 0; padding: 4rem 2rem; }`,
    `      main { max-width: 40rem; margin: 0 auto; }`,
    `    </style>`,
    `  </head>`,
    `  <body>`,
    `    <main>`,
    `      <h1>Your page</h1>`,
    `      <p>`,
    `        The Claudius chat widget is docked to a corner of this page. Point`,
    `        <code>apiUrl</code> at your own deployed worker; chat requests are`,
    `        rejected until the worker's <code>ALLOWED_ORIGIN</code> includes`,
    `        the origin embedding the widget.`,
    `      </p>`,
    `      <p>Docs: https://claudius-docs.pages.dev</p>`,
    `    </main>`,
    ``,
    `    ${generateScriptSnippet(config).split("\n").join("\n    ")}`,
    `  </body>`,
    `</html>`,
    ``,
  ].join("\n");
}
