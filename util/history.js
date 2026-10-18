// AsyncStorage on Android defaults to a 6MB database, and every viewed post is
// stored in full, so the history is capped rather than left to grow forever.
export const POST_HISTORY_LIMIT = 200;

export const addToHistory = (history, item, limit = POST_HISTORY_LIMIT) => {
  const previous = Array.isArray(history) ? history.filter((p) => p.id !== item.id) : [];
  return [item, ...previous].slice(0, limit);
};
