import { describe, it, expect } from 'vitest';
import { Request, Response } from 'express';
import { errorMiddleware } from './errorMiddleware';
import { NotFoundError } from './HttpError';

interface CapturedResponse {
  statusCode: number;
  body: unknown;
}

function makeRes(): { res: Response; captured: CapturedResponse } {
  const captured: CapturedResponse = { statusCode: 0, body: undefined };
  const res = {
    status(code: number) {
      captured.statusCode = code;
      return res;
    },
    json(body: unknown) {
      captured.body = body;
      return res;
    },
  } as unknown as Response;
  return { res, captured };
}

describe('errorMiddleware', () => {
  describe('given a domain HttpError', () => {
    it('should render the carried status and message', () => {
      // Arrange
      const { res, captured } = makeRes();

      // Act
      errorMiddleware(
        new NotFoundError('Workflow not found'),
        {} as Request,
        res,
        () => {},
      );

      // Assert
      expect(captured.statusCode).toBe(404);
      expect(captured.body).toEqual({ message: 'Workflow not found' });
    });
  });

  describe('given an unexpected non-HttpError', () => {
    it('should render a generic 500', () => {
      // Arrange
      const { res, captured } = makeRes();

      // Act
      errorMiddleware(new Error('boom'), {} as Request, res, () => {});

      // Assert
      expect(captured.statusCode).toBe(500);
      expect(captured.body).toEqual({ message: 'Internal server error' });
    });
  });
});
