package com.battleship.backend

import java.awt.desktop.QuitResponse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify
import org.springframework.context.ConfigurableApplicationContext

class MacOsQuitHandlerRegistrarTest {

    @Test
    fun `handleQuit closes the application context and performs quit`() {
        val ctx = mock(ConfigurableApplicationContext::class.java)
        val registrar = MacOsQuitHandlerRegistrar(ctx)
        var quitPerformed = false
        val response = object : QuitResponse {
            override fun performQuit() { quitPerformed = true }
            override fun cancelQuit() {}
        }

        registrar.handleQuit(response)

        verify(ctx).close()
        assertTrue(quitPerformed)
    }
}
