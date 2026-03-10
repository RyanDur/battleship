package com.battleship.shared

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ResultTest {

    @Test
    fun `tee runs side effect on success and returns self`() {
        val log = mutableListOf<Int>()

        val result = 42.asSuccess<Int>().tee { log.add(it) }

        assertEquals(listOf(42), log)
        assertTrue(result is Result.Success)
        assertEquals(42, (result as Result.Success).value)
    }

    @Test
    fun `tee skips side effect on failure and passes through`() {
        val log = mutableListOf<String>()

        val result = "oops".asFailure<String>().tee { log.add(it.toString()) }

        assertTrue(log.isEmpty())
        assertTrue(result is Result.Failure)
        assertEquals("oops", result.reason)
    }

    @Test
    fun `tee does not disrupt the chain`() {
        val log = mutableListOf<Int>()

        val result = 1.asSuccess<Int>()
            .map { it + 1 }
            .tee { log.add(it) }
            .map { it * 10 }

        assertEquals(listOf(2), log)
        assertTrue(result is Result.Success)
        assertEquals(20, result.value)
    }

    @Test
    fun `tryCatch wraps a successful computation in success`() {
        val result = tryCatch({ 42 }, { _: Throwable -> "error" })

        assertTrue(result is Result.Success)
        assertEquals(42, result.value)
    }

    @Test
    fun `tryCatch wraps a thrown exception in failure`() {
        val result = tryCatch(
            { throw IllegalArgumentException("boom") },
            { e: Throwable -> e.message ?: "unknown" }
        )

        assertTrue(result is Result.Failure)
        assertEquals("boom", result.reason)
    }

    @Test
    fun `tryCatch maps the error using the onError function`() {
        val result = tryCatch(
            { throw RuntimeException("bad") },
            { e: Throwable -> (e.message ?: "").length }
        )

        assertTrue(result is Result.Failure)
        assertEquals(3, result.reason)
    }

    @Test
    fun `either applies onSuccess and returns a Result`() {
        val result = 42.asSuccess<Int>().either(
            onSuccess = { n -> "value: $n".asSuccess() },
            onFailure = { "failed".asFailure() }
        )

        assertTrue(result is Result.Success)
        assertEquals("value: 42", result.value)
    }

    @Test
    fun `either applies onFailure and returns a Result`() {
        val result = "oops".asFailure<String>().either(
            onSuccess = { 0.asSuccess() },
            onFailure = { reason -> reason.length.asSuccess() }
        )

        assertTrue(result is Result.Success)
        assertEquals(4, result.value)
    }

    @Test
    fun `either branches both tracks into new Results`() {
        fun toMessage(r: Result<Int, String>): Result<String, Nothing> =
            r.either(
                onSuccess = { n -> "value: $n".asSuccess() },
                onFailure = { e -> "error: $e".asSuccess() }
            )

        val ok = 21.asSuccess<Int>().map { it * 2 }
        val err = "oops".asFailure<String>()

        assertEquals("value: 42", (toMessage(ok) as Result.Success).value)
        assertEquals("error: oops", (toMessage(err) as Result.Success).value)
    }

    @Test
    fun `mapEither folds success to a plain value`() {
        val value = 42.asSuccess<Int>().mapEither(
            onSuccess = { n -> "got $n" },
            onFailure = { "failed" }
        )

        assertEquals("got 42", value)
    }

    @Test
    fun `mapEither folds failure to a plain value`() {
        val value = "oops".asFailure<String>().mapEither(
            onSuccess = { "succeeded" },
            onFailure = { reason -> "failed: $reason" }
        )

        assertEquals("failed: oops", value)
    }
}
