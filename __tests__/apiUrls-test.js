import { buildUrl } from '../api/url';
import { addComment, editComment } from '../api/comment';
import { getPosts } from '../api/post';
import { findTag } from '../api/tag';

const queryOf = (url) => {
  const params = {};
  for (const pair of url.split('?')[1].split('&')) {
    const [key, value] = pair.split('=');
    params[key] = decodeURIComponent(value);
  }
  return params;
};

describe('API URLs', () => {
  beforeEach(() => {
    global.fetch = jest.fn(() => Promise.resolve({ json: () => Promise.resolve({}) }));
  });

  afterEach(() => {
    delete global.fetch;
  });

  it('encodes values and leaves bracketed keys readable', () => {
    expect(buildUrl('/tag.json', { name: 'a&b', 'comment[body]': '1 + 1', empty: undefined })).toBe(
      'https://www.sakugabooru.com/tag.json?name=a%26b&comment[body]=1%20%2B%201&empty=',
    );
  });

  it('keeps comment bodies with #, & and newlines intact alongside the credentials', async () => {
    const body = 'cut #3 & #4\nare great';
    await addComment({ id: 42, body, user: 'me', password_hash: 'abc' });

    const url = fetch.mock.calls[0][0];
    expect(url).not.toContain('#');
    expect(queryOf(url)).toEqual({
      'comment[post_id]': '42',
      'comment[body]': body,
      login: 'me',
      password_hash: 'abc',
    });
  });

  it('does not double-encode newlines when editing', async () => {
    await editComment({ id: 7, body: 'line one\nline two', user: 'me', password_hash: 'abc' });

    expect(queryOf(fetch.mock.calls[0][0])['comment[body]']).toBe('line one\nline two');
  });

  it('sends multi-tag searches and special characters as a single tags value', async () => {
    await getPosts({ search: 'k-on! order:score +effects', page: 2 });

    const params = queryOf(fetch.mock.calls[0][0]);
    expect(params.tags).toBe('k-on! order:score +effects');
    expect(params.page).toBe('2');
    expect(params.limit).toBe('9');
  });

  it('encodes tag names', async () => {
    await findTag({ name: 'fate/stay_night&more' });

    expect(queryOf(fetch.mock.calls[0][0]).name).toBe('fate/stay_night&more');
  });
});
