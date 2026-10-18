import { buildUrl } from './url';

export const getComments = async ({ id }) => {
  const url = buildUrl('/comment.json', { post_id: id });
  const response = await fetch(url);
  return response.json();
};

export const addComment = async ({ id, body, user, password_hash }) => {
  const options = {
    method: 'POST',
  };
  const url = buildUrl('/comment/create.json', {
    'comment[post_id]': id,
    'comment[body]': body,
    login: user,
    password_hash,
  });
  const response = await fetch(url, options);
  return response.json();
};

export const editComment = async ({ id, body, user, password_hash }) => {
  const options = {
    method: 'POST',
  };
  const url = buildUrl('/comment/update.json', { id, 'comment[body]': body, login: user, password_hash });
  const response = await fetch(url, options);
  return response.json();
};

export const deleteComment = async ({ id, user, password_hash }) => {
  const options = {
    method: 'DELETE',
  };
  const url = buildUrl('/comment/destroy.json', { id, login: user, password_hash });
  const response = await fetch(url, options);
  return response.json();
};

export const flagComment = async ({ id, user, password_hash }) => {
  const options = {
    method: 'POST',
  };
  const url = buildUrl('/comment/mark_as_spam.json', {
    id,
    'comment[is_spam]': 1,
    login: user,
    password_hash,
  });
  const response = await fetch(url, options);
  return response.json();
};
