import { describe, it, expect, vi } from 'vitest'
import { success, failure, tryCatch, type Result } from './result'

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

    it('runs a side effect with tee and returns self', () => {
      const spy = vi.fn()
      const result = success(42).tee(spy)

      expect(spy).toHaveBeenCalledWith(42)
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

    it('skips tee side effect and passes through', () => {
      const spy = vi.fn()
      const result = failure<string>('oops').tee(spy)

      expect(spy).not.toHaveBeenCalled()
      expect(result.kind).toBe('failure')
      expect(result.either(() => '', r => r)).toBe('oops')
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

    it('tee runs side effects mid-chain without disrupting flow', () => {
      const log: number[] = []

      const result = success(1)
        .map(n => n + 1)
        .tee(n => log.push(n))
        .map(n => n * 10)

      expect(log).toEqual([2])
      expect(result.either(v => v, () => 0)).toBe(20)
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

  describe('tryCatch', () => {
    it('wraps a successful computation in success', () => {
      const result = tryCatch(() => JSON.parse('{"x":1}'), () => 'parse error')

      expect(result.kind).toBe('success')
      expect(result.either(v => v.x, () => 0)).toBe(1)
    })

    it('wraps a thrown exception in failure', () => {
      const result = tryCatch(() => JSON.parse('bad json'), (e) => `error: ${e}`)

      expect(result.kind).toBe('failure')
      expect(result.either(() => '', r => r)).toMatch(/error:/)
    })

    it('maps the error using the onError function', () => {
      const result = tryCatch<number, string>(
        () => { throw new Error('boom') },
        (e) => (e as Error).message
      )

      expect(result.kind).toBe('failure')
      expect(result.either(() => '', r => r)).toBe('boom')
    })
  })
})
