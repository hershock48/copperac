// JSON-LD is written into a <script> block with dangerouslySetInnerHTML, and
// JSON.stringify does not escape "<". A string containing "</script>" would
// close the block and run whatever follows. The menu schema carries tap and
// cocktail names from the Scooplist feed, so that string is not ours to
// trust. Escaping "<" as < is valid JSON and inert in HTML.
export function jsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
