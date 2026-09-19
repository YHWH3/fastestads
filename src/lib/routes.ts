/**
 * Canonical API route for semantic evaluation. Trailing slash is required:
 * `trailingSlash: 'always'` makes `/api/semantic` 308-redirect here, which
 * costs an extra round-trip per analysis.
 */
export const SEMANTIC_ENDPOINT = '/api/semantic/';
