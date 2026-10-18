// Returns a new array so list components see a changed `data` reference.
export const sortComments = (comments, order = 'Newest') => {
  if (!Array.isArray(comments)) return [];
  const direction = order === 'Oldest' ? 1 : -1;
  return [...comments].sort((a, b) => direction * (new Date(a.created_at) - new Date(b.created_at)));
};
