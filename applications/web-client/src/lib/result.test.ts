import { describe, it, expect } from 'vitest'
import { success, failure, type Result } from './result'

describe('Result', () => {
  describe('success', () => {
    it('maps over the value', () => {
      const result = success(2).map(n => n * 3)

      expect(result.kind).toBe('success')
      expect(result.or(() => 0)).toBe(6)
    })

    it('flatMaps into another Result', () => {
      const safeDivide = (n: number): Result<number, string> =>
        n === 0 ? failure('division by zero') : success(10 / n)

      const result = success(2).flatMap(safeDivide)

      expect(result.kind).toBe('success')
      expect(result.or(() => 0)).toBe(5)
    })

    it('unwraps with or, ignoring the fallback', () => {
      const value = success(42).or(() => 0)

      expect(value).toBe(42)
    })

    it('folds with either, calling onSuccess', () => {
      const value = success(42).either(
        n => `got ${n}`,
        () => 'failed'
      )

      expect(value).toBe('got 42')
    })
  })

  describe('failure', () => {
    it('passes through map unchanged', () => {
      const result = failure<string>('oops').map((n: number) => n * 3)

      expect(result.kind).toBe('failure')
      expect(result.either(() => '', reason => reason)).toBe('oops')
    })

    it('passes through flatMap unchanged', () => {
      const result = failure<string>('oops').flatMap(() => success(42))

      expect(result.kind).toBe('failure')
      expect(result.either(() => '', reason => reason)).toBe('oops')
    })

    it('unwraps with or, using the fallback', () => {
      const value = failure<string, number>('oops').or(reason => reason.length)

      expect(value).toBe(4)
    })

    it('folds with either, calling onFailure', () => {
      const value = failure('oops').either(
        () => 'succeeded',
        reason => `failed: ${reason}`
      )

      expect(value).toBe('failed: oops')
    })
  })

  describe('chaining', () => {
    it('short-circuits on first failure in a flatMap chain', () => {
      const parse = (s: string): Result<number, string> => {
        const n = Number(s)
        return isNaN(n) ? failure('not a number') : success(n)
      }

      const result = success('abc')
        .flatMap(parse)
        .map(n => n * 2)

      expect(result.kind).toBe('failure')
      expect(result.either(() => '', reason => reason)).toBe('not a number')
    })

    it('composes map and flatMap through a pipeline', () => {
      const parse = (s: string): Result<number, string> => {
        const n = Number(s)
        return isNaN(n) ? failure('not a number') : success(n)
      }

      const result = success('21')
        .flatMap(parse)
        .map(n => n * 2)

      expect(result.or(() => 0)).toBe(42)
    })
  })
})
