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
}
