export type Result<S, F> = Success<S, F> | Failure<S, F>

export interface Success<S, F> {
  readonly kind: 'success'
  readonly value: S
  map<T>(fn: (value: S) => T): Success<T, F>
  flatMap<T>(fn: (value: S) => Result<T, F>): Result<T, F>
  or(_fn: (reason: F) => S): S
  either<T>(onSuccess: (value: S) => T, onFailure: (reason: F) => T): T
}

export interface Failure<S, F> {
  readonly kind: 'failure'
  readonly reason: F
  map<T>(_fn: (value: S) => T): Failure<T, F>
  flatMap<T>(_fn: (value: S) => Result<T, F>): Failure<T, F>
  or(fn: (reason: F) => S): S
  either<T>(onSuccess: (value: S) => T, onFailure: (reason: F) => T): T
}

const successProto = {
  kind: 'success' as const,
  map<S, F, T>(this: Success<S, F>, fn: (value: S) => T): Success<T, F> {
    return success(fn(this.value))
  },
  flatMap<S, F, T>(this: Success<S, F>, fn: (value: S) => Result<T, F>): Result<T, F> {
    return fn(this.value)
  },
  or<S, F>(this: Success<S, F>): S {
    return this.value
  },
  either<S, F, T>(this: Success<S, F>, onSuccess: (value: S) => T): T {
    return onSuccess(this.value)
  },
}

const failureProto = {
  kind: 'failure' as const,
  map<F>(this: Failure<unknown, F>): Failure<never, F> {
    return this as unknown as Failure<never, F>
  },
  flatMap<F>(this: Failure<unknown, F>): Failure<never, F> {
    return this as unknown as Failure<never, F>
  },
  or<S, F>(this: Failure<S, F>, fn: (reason: F) => S): S {
    return fn(this.reason)
  },
  either<S, F, T>(this: Failure<S, F>, _onSuccess: (value: S) => T, onFailure: (reason: F) => T): T {
    return onFailure(this.reason)
  },
}

export const success = <S, F = never>(value: S): Success<S, F> =>
  Object.assign(Object.create(successProto), { value }) as Success<S, F>

export const failure = <F, S = never>(reason: F): Failure<S, F> =>
  Object.assign(Object.create(failureProto), { reason }) as Failure<S, F>
