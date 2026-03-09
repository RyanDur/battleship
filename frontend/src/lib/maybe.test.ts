import { describe, it, expect } from 'vitest'
import { maybe, some, nothing, type Maybe } from './maybe'

describe('Maybe', () => {
  describe('maybe — wraps nullable values', () => {
    it('creates Some for non-null values', () => {
      const result = maybe(42)

      expect(result.isNothing).toBe(false)
      expect(result.orNull()).toBe(42)
    })

    it('creates Nothing for null', () => {
      const result = maybe(null)

      expect(result.isNothing).toBe(true)
      expect(result.orNull()).toBeNull()
    })

    it('creates Nothing for undefined', () => {
      const result = maybe(undefined)

      expect(result.isNothing).toBe(true)
      expect(result.orNull()).toBeNull()
    })
  })

  describe('some', () => {
    it('maps over the value', () => {
      const result = some(2).map(n => n * 3)

      expect(result.orNull()).toBe(6)
    })

    it('flatMaps into another Maybe', () => {
      const safeSqrt = (n: number): Maybe<number> =>
        n < 0 ? nothing() : some(Math.sqrt(n))

      const result = some(9).mBind(safeSqrt)

      expect(result.orNull()).toBe(3)
    })

    it('ignores or, returning itself', () => {
      const result = some(42).or(() => some(0))

      expect(result.orNull()).toBe(42)
    })

    it('unwraps with orElse, ignoring the fallback', () => {
      const value = some(42).orElse(0)

      expect(value).toBe(42)
    })

    it('unwraps with orNull', () => {
      expect(some('hello').orNull()).toBe('hello')
    })
  })

  describe('nothing', () => {
    it('passes through map unchanged', () => {
      const result = nothing<number>().map(n => n * 3)

      expect(result.isNothing).toBe(true)
      expect(result.orNull()).toBeNull()
    })

    it('passes through mBind unchanged', () => {
      const result = nothing<number>().mBind(() => some(42))

      expect(result.isNothing).toBe(true)
    })

    it('tries the alternative with or', () => {
      const result = nothing<number>().or(() => some(42))

      expect(result.orNull()).toBe(42)
    })

    it('returns the fallback with orElse', () => {
      const value = nothing<number>().orElse(99)

      expect(value).toBe(99)
    })

    it('returns null with orNull', () => {
      expect(nothing().orNull()).toBeNull()
    })
  })

  describe('chaining', () => {
    it('short-circuits on first Nothing in an mBind chain', () => {
      const lookup = (key: string): Maybe<number> =>
        key === 'a' ? some(1) : nothing()

      const result = some('b')
        .mBind(lookup)
        .map(n => n * 10)

      expect(result.isNothing).toBe(true)
    })

    it('composes map and mBind through a pipeline', () => {
      const lookup = (key: string): Maybe<number> =>
        key === 'a' ? some(1) : nothing()

      const result = some('a')
        .mBind(lookup)
        .map(n => n * 10)

      expect(result.orNull()).toBe(10)
    })

    it('falls through a chain of or alternatives', () => {
      const result = nothing<number>()
        .or(() => nothing())
        .or(() => nothing())
        .or(() => some(42))

      expect(result.orNull()).toBe(42)
    })

    it('works with schemawax decode pattern', () => {
      // schemawax decode() returns T | null — maybe() bridges to Maybe<T>
      const decode = (raw: unknown): string | null =>
        typeof raw === 'string' ? raw : null

      const result = maybe(decode(42))

      expect(result.isNothing).toBe(true)

      const result2 = maybe(decode('hello'))

      expect(result2.orNull()).toBe('hello')
    })
  })
})
