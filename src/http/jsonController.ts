import { Request } from 'express';
import { asyncHandler } from './asyncHandler';
import { SuccessResult } from './SuccessResult';

export const jsonController = (
  fn: (req: Request) => Promise<SuccessResult<unknown>>,
) =>
  asyncHandler(async (req, res) => {
    const result = await fn(req);
    res.status(result.statusCode).json(result.data);
  });
