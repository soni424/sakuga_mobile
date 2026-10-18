export const BASE_URL = 'https://www.sakugabooru.com';

// Values are percent-encoded so characters like `&`, `#`, `+` and newlines in
// searches or comment bodies can't truncate or corrupt the query string.
// Keys are fixed API parameter names (e.g. `comment[body]`) and are left as-is.
export const buildUrl = (path, params = {}) => {
  const query = Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value == null ? '' : String(value))}`)
    .join('&');
  return `${BASE_URL}${path}${query ? `?${query}` : ''}`;
};
