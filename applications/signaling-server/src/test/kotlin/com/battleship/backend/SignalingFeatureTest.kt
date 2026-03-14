package com.battleship.backend

import org.junit.jupiter.api.Test
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
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class SignalingFeatureTest {

    @LocalServerPort
    private var port: Int = 0

    private fun connectClient(
        token: String = "test-token",
        origin: String = "http://localhost:5173"
    ): Pair<WebSocketSession, ArrayBlockingQueue<String>> {
        val messages = ArrayBlockingQueue<String>(10)
        val client = StandardWebSocketClient()
        val headers = WebSocketHttpHeaders()
        headers["Origin"] = listOf(origin)

        val handler = object : TextWebSocketHandler() {
            override fun handleTextMessage(session: WebSocketSession, message: TextMessage) {
                messages.add(message.payload)
            }
        }

        val session = client.execute(
            handler,
            headers,
            URI("ws://127.0.0.1:$port/ws/signaling?token=$token")
        ).get(5, TimeUnit.SECONDS)

        return Pair(session, messages)
    }

    @Test
    fun `notifies first peer when second peer connects`() {
        val (sessionA, messagesA) = connectClient()
        val (sessionB, _) = connectClient()

        val notification = messagesA.poll(5, TimeUnit.SECONDS)
        assertNotNull(notification, "First peer should be notified when second peer connects")
        assertTrue(notification.contains("PEER_CONNECTED"), "Notification should be PEER_CONNECTED, got: $notification")

        sessionA.close()
        sessionB.close()
    }

    @Test
    fun `two peers can exchange signaling messages`() {
        val (sessionA, messagesA) = connectClient()
        val (sessionB, messagesB) = connectClient()

        // Wait until A is notified that B is ready — both are now registered
        assertNotNull(messagesA.poll(5, TimeUnit.SECONDS), "A should receive PEER_CONNECTED before exchange begins")

        // Player A sends an offer
        sessionA.sendMessage(TextMessage("""{"type":"OFFER","sdp":"offer-from-A"}"""))
        val receivedByB = messagesB.poll(5, TimeUnit.SECONDS)
        assertNotNull(receivedByB, "Player B should receive the offer")
        assertTrue(receivedByB.contains("offer-from-A"), "Player B should receive A's SDP")

        // Player B sends an answer
        sessionB.sendMessage(TextMessage("""{"type":"ANSWER","sdp":"answer-from-B"}"""))
        val receivedByA = messagesA.poll(5, TimeUnit.SECONDS)
        assertNotNull(receivedByA, "Player A should receive the answer")
        assertTrue(receivedByA.contains("answer-from-B"), "Player A should receive B's SDP")

        // ICE candidates relay
        sessionA.sendMessage(TextMessage("""{"type":"ICE_CANDIDATE","candidate":"candidate-from-A"}"""))
        val iceReceivedByB = messagesB.poll(5, TimeUnit.SECONDS)
        assertNotNull(iceReceivedByB, "Player B should receive ICE candidate")
        assertTrue(iceReceivedByB.contains("candidate-from-A"))

        sessionA.close()
        sessionB.close()
    }

    @Test
    fun `rejects connection with invalid token`() {
        try {
            connectClient(token = "")
            // If connection succeeds with empty token, that's a failure
            throw AssertionError("Should have rejected empty token")
        } catch (e: Exception) {
            // Expected — connection rejected
            if (e is AssertionError) throw e
        }
    }

    @Test
    fun `rejects connection from unauthorized origin`() {
        try {
            connectClient(origin = "https://evil.com")
            throw AssertionError("Should have rejected unauthorized origin")
        } catch (_: Exception) {
            // Expected — connection rejected
        }
    }

    @Test
    fun `rejects third connection when two peers are already connected`() {
        val (sessionA, _) = connectClient()
        val (sessionB, _) = connectClient()

        try {
            connectClient()
            throw AssertionError("Should have rejected third connection")
        } catch (_: Exception) {
            // Expected — connection rejected
        } finally {
            sessionA.close()
            sessionB.close()
        }
    }
}
