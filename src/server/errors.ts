/** An expected failure: a code the pages translate, and the HTTP status to answer with. */
export class ApiFailure extends Error {
  constructor(
    public code: string,
    public status: number,
    public details?: unknown,
  ) {
    super(code);
  }
}
