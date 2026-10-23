export const forbidden = (res, message) => res.status(403).json({ message: `Forbidden: ${message}` });

export const serverError = (res, message, err) => {
  const clientError = err.name === "ValidationError" || err.name === "CastError";
  res.status(clientError ? 400 : 500).json({ message, error: err.message });
};
