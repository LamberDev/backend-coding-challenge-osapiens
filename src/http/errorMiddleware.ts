import { ErrorRequestHandler } from 'express';
import { HttpError } from './HttpError';

export const errorMiddleware: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.statusCode).json({ message: err.message });
    return;
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ message: 'Internal server error' });
};
