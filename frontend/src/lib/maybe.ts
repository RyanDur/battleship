type Some<T> = {
  isNothing: false
  map<U>(fn: (value: T) => U): Maybe<U>
  mBind<U>(fn: (value: T) => Maybe<U>): Maybe<U>
  or(_fn: () => Maybe<T>): Maybe<T>
  orElse(_fallback: T): T
  orNull(): T
}

type Nothing<T> = {
  isNothing: true
  map<U>(_fn: (value: T) => U): Maybe<U>
  mBind<U>(_fn: (value: T) => Maybe<U>): Maybe<U>
  or(fn: () => Maybe<T>): Maybe<T>
  orElse(fallback: T): T
  orNull(): null
}

export type Maybe<T> = Some<T> | Nothing<T>

export const some = <T>(value: T): Maybe<T> => ({
  isNothing: false,
  map: (fn) => some(fn(value)),
  mBind: (fn) => fn(value),
  or: (_fn) => some(value),
  orElse: (_fallback) => value,
  orNull: () => value,
})

export const nothing = <T = never>(): Maybe<T> => ({
  isNothing: true,
  map: (_fn) => nothing(),
  mBind: (_fn) => nothing(),
  or: (fn) => fn(),
  orElse: (fallback) => fallback,
  orNull: () => null,
})

export const maybe = <T>(value: T | null | undefined): Maybe<T> =>
  value == null ? nothing() : some(value)
