package com.battleship.backend

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.test.web.server.LocalServerPort
import org.springframework.web.socket.TextMessage
import org.springframework.web.socket.WebSocketHttpHeaders
import org.springframework.web.socket.WebSocketSession
import org.springframework.web.socket.client.standard.StandardWebSocketClient
import org.springframework.web.socket.handler.TextWebSocketHandler
import java.net.URI
import java.util.concurrent.ArrayBlockingQueue
import java.util.concurrent.TimeUnit

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = ["app.heartbeat-interval=1000"]
)
class HealthWebSocketFeatureTest {

    @LocalServerPort
    private var port: Int = 0

    @Test
    fun `client receives heartbeat within 6 seconds`() {
        val messages = ArrayBlockingQueue<String>(10)
        val client = StandardWebSocketClient()
        val headers = WebSocketHttpHeaders()
        headers["Origin"] = listOf("http://localhost:5173")

        val handler = object : TextWebSocketHandler() {
            override fun handleTextMessage(session: WebSocketSession, message: TextMessage) {
                messages.add(message.payload)
            }
        }

        val session = client.execute(
            handler,
            headers,
            URI("ws://127.0.0.1:$port/ws/health")
        ).get(5, TimeUnit.SECONDS)

        val message = messages.poll(2, TimeUnit.SECONDS)
        assertNotNull(message, "Should receive a heartbeat within 2 seconds")
        assertTrue(message!!.contains("\"type\":\"heartbeat\""), "Message should have type heartbeat")
        assertTrue(message.contains("\"version\""), "Message should contain version field")

        session.close()
    }

    @Test
    fun `health endpoint does not require auth token`() {
        val client = StandardWebSocketClient()
        val headers = WebSocketHttpHeaders()
        headers["Origin"] = listOf("http://localhost:5173")

        val session = client.execute(
            object : TextWebSocketHandler() {},
            headers,
            URI("ws://127.0.0.1:$port/ws/health")
        ).get(5, TimeUnit.SECONDS)

        assertTrue(session.isOpen, "Connection should succeed without a token")
        session.close()
    }
}
