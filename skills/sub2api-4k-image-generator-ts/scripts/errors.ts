export class UsageError extends Error {
  exitCode = 2;
}

export class RequestFailed extends Error {
  exitCode = 1;
}
