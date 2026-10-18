import { addToHistory, POST_HISTORY_LIMIT } from '../util/history';
import { sortComments } from '../util/comments';

describe('Post history', () => {
  it('starts a history when none is stored', () => {
    expect(addToHistory(null, { id: 1 })).toEqual([{ id: 1 }]);
  });

  it('moves a re-viewed post to the front without duplicating it', () => {
    const history = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(addToHistory(history, { id: 2 }).map((p) => p.id)).toEqual([2, 1, 3]);
  });

  it('drops the oldest posts once the limit is reached', () => {
    const history = Array.from({ length: POST_HISTORY_LIMIT }, (_, i) => ({ id: i }));
    const next = addToHistory(history, { id: 'new' });

    expect(next).toHaveLength(POST_HISTORY_LIMIT);
    expect(next[0].id).toBe('new');
    expect(next[next.length - 1].id).toBe(POST_HISTORY_LIMIT - 2);
  });

  it('trims an oversized history saved by older versions', () => {
    const history = Array.from({ length: POST_HISTORY_LIMIT * 3 }, (_, i) => ({ id: i }));
    expect(addToHistory(history, { id: 'new' })).toHaveLength(POST_HISTORY_LIMIT);
  });
});

describe('Comment sorting', () => {
  const comments = [
    { id: 'b', created_at: '2020-12-05T14:26:26.933Z' },
    { id: 'c', created_at: '2020-12-28T04:08:11.027Z' },
    { id: 'a', created_at: '2020-01-28T12:16:54.474Z' },
  ];

  it('sorts newest and oldest first', () => {
    expect(sortComments(comments, 'Newest').map((c) => c.id)).toEqual(['c', 'b', 'a']);
    expect(sortComments(comments, 'Oldest').map((c) => c.id)).toEqual(['a', 'b', 'c']);
  });

  it('returns a new array and leaves the input untouched', () => {
    const sorted = sortComments(comments, 'Oldest');
    expect(sorted).not.toBe(comments);
    expect(comments.map((c) => c.id)).toEqual(['b', 'c', 'a']);
  });

  it('round-trips back to newest after toggling', () => {
    const newest = sortComments(sortComments(comments, 'Oldest'), 'Newest');
    expect(newest.map((c) => c.id)).toEqual(['c', 'b', 'a']);
  });

  it('handles a non-array API response', () => {
    expect(sortComments(undefined)).toEqual([]);
  });
});
