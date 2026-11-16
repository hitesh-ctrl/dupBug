/**
 * Text clean-up applied to bodies both when indexing and when querying.
 * Issue templates put instructions inside HTML comments; they are invisible on GitHub but would
 * otherwise fill the body with the same words in every report.
 */
export function cleanBody(body: string): string {
  return body.replace(/<!--[\s\S]*?(-->|$)/g, " ").replace(/\s+/g, " ").trim();
}
