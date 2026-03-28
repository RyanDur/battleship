package com.battleship.backend

import java.net.BindException
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class StartupErrorMessageTest {

    @Test
    fun `port-in-use cause chain returns specific message`() {
        val bindException = BindException("Address already in use")
        val wrapped = RuntimeException("Failed to start", RuntimeException("nested", bindException))

        val message = startupErrorMessage(wrapped)

        assertTrue(message.contains("already running"), "Expected port-in-use message, got: $message")
        assertTrue(message.contains("8080"), "Expected port number in message, got: $message")
    }

    @Test
    fun `generic exception returns message with exception text`() {
        val ex = RuntimeException("Something went wrong unexpectedly")

        val message = startupErrorMessage(ex)

        assertTrue(message.contains("failed to start"), "Expected generic failure message, got: $message")
        assertTrue(message.contains("Something went wrong unexpectedly"), "Expected exception message in output, got: $message")
    }
}
