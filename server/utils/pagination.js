// Reads ?page= & ?limit= and returns skip/limit plus a helper to build the response meta.
module.exports = (query, defaultLimit = 10, maxLimit = 100) => {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, parseInt(query.limit, 10) || defaultLimit));
  return {
    page,
    limit,
    skip: (page - 1) * limit,
    meta: (total) => ({ total, page, pages: Math.max(1, Math.ceil(total / limit)) }),
  };
};
