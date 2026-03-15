import {asyncFailure, asyncResult, asyncSuccess, ofPromise, type AsyncResult} from './asyncResult'
import {success, failure, type Result} from './result'

describe('AsyncResult', () => {
  describe('asyncSuccess', () => {
    it('resolves with the success value via mapEither', async () => {
      const result = await asyncSuccess(42).mapEither(value => value, () => 0)

      expect(result).toBe(42)
    })
  })

  describe('asyncFailure', () => {
    it('resolves with the failure reason via mapEither', async () => {
      const result = await asyncFailure<string, number>('oops').mapEither(() => 0, reason => reason.length)

      expect(result).toBe(4)
    })
  })

  describe('asyncResult', () => {
    it('wraps a resolved promise as success', async () => {
      const result = await asyncResult<number, string>(Promise.resolve(42)).mapEither(value => value, () => 0)

      expect(result).toBe(42)
    })

    it('wraps a rejected promise as failure', async () => {
      const result = await asyncResult<number, string>(Promise.reject('oops')).mapEither(() => 0, reason => reason.length)

      expect(result).toBe(4)
    })
  })

  describe('map', () => {
    it('transforms the success value', async () => {
      const result = await asyncSuccess(2).map(value => value * 3).mapEither(value => value, () => 0)

      expect(result).toBe(6)
    })

    it('passes through failure unchanged', async () => {
      const result = await asyncFailure<string, number>('oops').map(value => value * 3).mapEither(() => '', reason => reason)

      expect(result).toBe('oops')
    })
  })

  describe('andThen', () => {
    it('chains into another AsyncResult on success', async () => {
      const safeDivide = (divisor: number): AsyncResult<number, string> =>
        divisor === 0 ? asyncFailure('division by zero') : asyncSuccess(10 / divisor)

      const result = await asyncSuccess<number, string>(2).andThen(safeDivide).mapEither(value => value, () => 0)

      expect(result).toBe(5)
    })

    it('short-circuits on failure', async () => {
      const result = await asyncFailure<string, number>('oops')
        .andThen(() => asyncSuccess(42))
        .mapEither(() => '', reason => reason)

      expect(result).toBe('oops')
    })
  })

  describe('or', () => {
    it('recovers from failure', async () => {
      const result = await asyncFailure<string, number>('oops')
        .or(() => asyncSuccess(99))
        .mapEither(value => value, () => 0)

      expect(result).toBe(99)
    })

    it('passes through success unchanged', async () => {
      const result = await asyncSuccess<number, string>(42)
        .or(() => asyncSuccess(99))
        .mapEither(value => value, () => 0)

      expect(result).toBe(42)
    })
  })

  describe('either', () => {
    it('applies onSuccess branch', async () => {
      const result = await asyncSuccess<number, string>(42)
        .either(value => asyncSuccess(`got ${value}`), () => asyncSuccess('failed'))
        .mapEither(value => value, () => '')

      expect(result).toBe('got 42')
    })

    it('applies onFailure branch', async () => {
      const result = await asyncFailure<string, number>('oops')
        .either(() => asyncSuccess(0), reason => asyncSuccess(reason.length))
        .mapEither(value => value, () => 0)

      expect(result).toBe(4)
    })
  })

  describe('onSuccess', () => {
    it('runs a side effect on success and returns self', async () => {
      const log: number[] = []

      const result = await asyncSuccess(42)
        .onSuccess(value => log.push(value))
        .mapEither(value => value, () => 0)

      expect(log).toEqual([42])
      expect(result).toBe(42)
    })

    it('skips side effect on failure', async () => {
      const log: number[] = []

      const result = await asyncFailure<string, number>('oops')
        .onSuccess(value => log.push(value))
        .mapEither(() => '', reason => reason)

      expect(log).toEqual([])
      expect(result).toBe('oops')
    })
  })

  describe('onFailure', () => {
    it('runs a side effect on failure and returns self', async () => {
      const log: string[] = []

      const result = await asyncFailure<string, number>('oops')
        .onFailure(reason => log.push(reason))
        .mapEither(() => 0, reason => reason.length)

      expect(log).toEqual(['oops'])
      expect(result).toBe(4)
    })

    it('skips side effect on success', async () => {
      const log: string[] = []

      const result = await asyncSuccess<number, string>(42)
        .onFailure(reason => log.push(reason))
        .mapEither(value => value, () => 0)

      expect(log).toEqual([])
      expect(result).toBe(42)
    })
  })

  describe('onComplete', () => {
    it('runs a side effect with the full Result on success', async () => {
      const log: Result<number, string>[] = []

      await asyncSuccess<number, string>(42)
        .onComplete(result => log.push(result))
        .mapEither(value => value, () => 0)

      expect(log).toHaveLength(1)
      expect(log[0].kind).toBe('success')
    })

    it('runs a side effect with the full Result on failure', async () => {
      const log: Result<number, string>[] = []

      await asyncFailure<string, number>('oops')
        .onComplete(result => log.push(result))
        .mapEither(() => 0, reason => reason.length)

      expect(log).toHaveLength(1)
      expect(log[0].kind).toBe('failure')
    })
  })

  describe('onPending', () => {
    it('calls callback with true immediately then false when resolved', async () => {
      const log: boolean[] = []

      const pending = asyncSuccess(42).onPending(isPending => log.push(isPending))

      expect(log).toEqual([true])

      await pending.mapEither(value => value, () => 0)

      expect(log).toEqual([true, false])
    })
  })

  describe('ofPromise', () => {
    it('wraps a resolved success Result as success', async () => {
      const result = await ofPromise(Promise.resolve(success(42))).mapEither(v => v, () => 0)

      expect(result).toBe(42)
    })

    it('wraps a resolved failure Result as failure', async () => {
      const result = await ofPromise(Promise.resolve(failure<string, number>('oops'))).mapEither(() => 0, r => r.length)

      expect(result).toBe(4)
    })
  })

  describe('chaining', () => {
    it('composes map and andThen through a pipeline', async () => {
      const parse = (input: string): AsyncResult<number, string> => {
        const num = Number(input)
        return isNaN(num) ? asyncFailure('not a number') : asyncSuccess(num)
      }

      const result = await asyncSuccess<string, string>('21')
        .andThen(parse)
        .map(value => value * 2)
        .mapEither(value => value, () => 0)

      expect(result).toBe(42)
    })

    it('onSuccess runs side effects mid-chain without disrupting flow', async () => {
      const log: number[] = []

      const result = await asyncSuccess(1)
        .map(value => value + 1)
        .onSuccess(value => log.push(value))
        .map(value => value * 10)
        .mapEither(value => value, () => 0)

      expect(log).toEqual([2])
      expect(result).toBe(20)
    })
  })
})
