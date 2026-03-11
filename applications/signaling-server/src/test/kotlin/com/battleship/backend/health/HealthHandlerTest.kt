package com.battleship.backend.health

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.assertEquals
import org.mockito.Mockito.any
import org.mockito.Mockito.mock
import org.mockito.Mockito.never
import org.mockito.Mockito.verify
import org.mockito.Mockito.`when`
import org.springframework.web.socket.CloseStatus
import org.springframework.web.socket.TextMessage
import org.springframework.web.socket.WebSocketSession
import org.springframework.web.socket.WebSocketMessage

class HealthHandlerTest {

    private val handler = HealthHandler("1.2.3")

    @Test
    fun `sendHeartbeat sends message to open sessions`() {
        val session = mock(WebSocketSession::class.java)
        `when`(session.isOpen).thenReturn(true)

        handler.afterConnectionEstablished(session)
        handler.sendHeartbeat()

        verify(session).sendMessage(TextMessage("""{"type":"heartbeat","version":"1.2.3"}"""))
    }

    @Test
    fun `sendHeartbeat skips closed sessions`() {
        val session = mock(WebSocketSession::class.java)
        `when`(session.isOpen).thenReturn(false)

        handler.afterConnectionEstablished(session)
        handler.sendHeartbeat()

        verify(session, never()).sendMessage(any(WebSocketMessage::class.java))
    }

    @Test
    fun `closed connection is removed and does not receive heartbeat`() {
        val session = mock(WebSocketSession::class.java)
        `when`(session.isOpen).thenReturn(true)

        handler.afterConnectionEstablished(session)
        handler.afterConnectionClosed(session, CloseStatus.NORMAL)
        handler.sendHeartbeat()

        verify(session, never()).sendMessage(any(WebSocketMessage::class.java))
    }

    @Test
    fun `heartbeat message contains type and version fields`() {
        val message = TextMessage("""{"type":"heartbeat","version":"1.2.3"}""")
        assertEquals("""{"type":"heartbeat","version":"1.2.3"}""", message.payload)
    }
}
