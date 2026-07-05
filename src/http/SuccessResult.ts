export class SuccessResult<T> {
  constructor(
    readonly data: T,
    readonly statusCode: number = 200,
  ) {}
}
