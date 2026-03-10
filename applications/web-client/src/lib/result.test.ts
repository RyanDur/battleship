import { describe, it, expect } from 'vitest'
import { success, failure, type Result } from './result'

describe('Result', () => {
  describe('success', () => {
    it('maps over the value', () => {
      const result = success(2).map(n => n * 3)

      expect(result.kind).toBe('success')
      expect(result.either(v => v, () => 0)).toBe(6)
    })

    it('flatMaps into another Result', () => {
      const safeDivide = (n: number): Result<number, string> =>
        n === 0 ? failure('division by zero') : success(10 / n)

      const result = success(2).flatMap(safeDivide)

      expect(result.kind).toBe('success')
      expect(result.either(v => v, () => 0)).toBe(5)
    })

    it('passes through or, ignoring the recovery function', () => {
      const result = success<number, string>(42).or(() => failure('recovered'))

      expect(result.kind).toBe('success')
      expect(result.either(v => v, () => 0)).toBe(42)
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

    it('recovers with or, applying the recovery function', () => {
      const result = failure<string, number>('oops').or(reason => success(reason.length))

      expect(result.kind).toBe('success')
      expect(result.either(v => v, () => 0)).toBe(4)
    })

    it('can recover to another failure with or', () => {
      const result = failure<string, number>('oops').or(() => failure(42))

      expect(result.kind).toBe('failure')
      expect(result.either(() => 0, v => v)).toBe(42)
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

      expect(result.either(v => v, () => 0)).toBe(42)
    })

    it('recovers from failure mid-chain with or', () => {
      const parse = (s: string): Result<number, string> => {
        const n = Number(s)
        return isNaN(n) ? failure('not a number') : success(n)
      }

      const result = success('abc')
        .flatMap(parse)
        .or(() => success(0))
        .map(n => n + 1)

      expect(result.kind).toBe('success')
      expect(result.either(v => v, () => -1)).toBe(1)
    })
  })
})
