import { buildUrl } from './url';

export const getTags = async ({ name = '', page = 1, order = 'date', type = '', limit = '' }) => {
  const url = buildUrl('/tag.json', { order, page, type, name, limit });
  const response = await fetch(url);
  return response.json();
};

export const findTag = async ({ name = '' }) => {
  const url = buildUrl('/tag.json', { name });
  const response = await fetch(url);
  return response.json();
};

export const getRelatedTags = async ({ tags = '', type = '' }) => {
  const url = buildUrl('/tag/related.json', { tags, type });
  const response = await fetch(url);
  return response.json();
};
