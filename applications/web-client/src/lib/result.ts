export type Result<S, F> = Success<S, F> | Failure<S, F>

export type Success<S, F> = {
    readonly kind: 'success'
    map<T>(fn: (value: S) => T): Success<T, F>
    flatMap<T, F2>(fn: (value: S) => Result<T, F2>): Result<T, F2>
    or<F2>(_fn: (reason: F) => Result<S, F2>): Result<S, F2>
    either<T>(onSuccess: (value: S) => T, onFailure: (reason: F) => T): T
}

export type Failure<S, F> = {
    readonly kind: 'failure'
    map<T>(_fn: (value: S) => T): Failure<T, F>
    flatMap<T, F2>(_fn: (value: S) => Result<T, F2>): Failure<T, F>
    or<F2>(fn: (reason: F) => Result<S, F2>): Result<S, F2>
    either<T>(onSuccess: (value: S) => T, onFailure: (reason: F) => T): T
}

export const success = <S, F = never>(value: S): Success<S, F> => Object.freeze({
    kind: 'success' as const,
    map: (fn) => success(fn(value)),
    flatMap: (fn) => fn(value),
    or: () => success(value),
    either: (onSuccess) => onSuccess(value),
})

export const failure = <F, S = never>(reason: F): Failure<S, F> => Object.freeze({
    kind: 'failure' as const,
    map: () => failure(reason),
    flatMap: () => failure(reason),
    or: (fn) => fn(reason),
    either: (_onSuccess, onFailure) => onFailure(reason),
})
