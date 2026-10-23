export const forbidden = (res, message) => res.status(403).json({ message: `Forbidden: ${message}` });

export const serverError = (res, message, err) => {
  const clientError = err.name === "ValidationError" || err.name === "CastError";
  res.status(clientError ? 400 : 500).json({ message, error: err.message });
};

// Opt-in pagination. Lists stay plain arrays (so existing clients keep working); a client
// that sends ?page= and/or ?limit= gets one page, and the totals come back in headers:
//   X-Total-Count, X-Total-Pages, X-Page, X-Limit
// Returns { skip, limit } to apply to the query, or null when the client did not ask.
export const parsePagination = (req, { defaultLimit = 20, maxLimit = 100 } = {}) => {
  if (req.query.page === undefined && req.query.limit === undefined) return null;
  const page = Math.max(1, Number.parseInt(String(req.query.page ?? "1"), 10) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Number.parseInt(String(req.query.limit ?? defaultLimit), 10) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
};

export const setPageHeaders = (res, paging, total) => {
  res.set({
    "X-Total-Count": String(total),
    "X-Total-Pages": String(Math.max(1, Math.ceil(total / paging.limit))),
    "X-Page": String(paging.page),
    "X-Limit": String(paging.limit),
    "Access-Control-Expose-Headers": "X-Total-Count, X-Total-Pages, X-Page, X-Limit",
  });
};

export const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
