package com.battleship.backend

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
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
    properties = ["spring.datasource.url=jdbc:h2:mem:testdb;DB_CLOSE_DELAY=-1"],
)
class SignalingFeatureTest {

    @LocalServerPort
    private var port: Int = 0

    private val mapper = jacksonObjectMapper()

    private fun connect(peerId: String): Pair<WebSocketSession, ArrayBlockingQueue<Map<String, Any>>> {
        val messages = ArrayBlockingQueue<Map<String, Any>>(20)
        val headers = WebSocketHttpHeaders().apply {
            set("Origin", "http://localhost:5173")
            set("Cookie", "peerId=$peerId")
        }
        val session = StandardWebSocketClient().execute(
            object : TextWebSocketHandler() {
                override fun handleTextMessage(session: WebSocketSession, message: TextMessage) {
                    messages.add(mapper.readValue(message.payload))
                }
            },
            headers,
            URI("ws://127.0.0.1:$port/ws/signaling")
        ).get(5, TimeUnit.SECONDS)
        return session to messages
    }

    private fun send(session: WebSocketSession, payload: Map<String, Any>) =
        session.sendMessage(TextMessage(mapper.writeValueAsString(payload)))

    @Test
    fun `REGISTER receives REGISTERED then PEERS`() {
        val (session, messages) = connect("test-peer-1")

        send(session, mapOf("type" to "REGISTER", "name" to "Alice"))

        val registered = messages.poll(2, TimeUnit.SECONDS)
        assertEquals("REGISTERED", registered?.get("type"))
        assertEquals("test-peer-1", registered?.get("peerId"))
        assertEquals("Alice", registered?.get("name"))

        val peers = messages.poll(2, TimeUnit.SECONDS)
        assertEquals("PEERS", peers?.get("type"))

        session.close()
    }

    @Test
    fun `PEERS list does not include the registering peer`() {
        val (session, messages) = connect("test-peer-solo")

        send(session, mapOf("type" to "REGISTER", "name" to "Solo"))

        messages.poll(2, TimeUnit.SECONDS) // REGISTERED
        val peersMsg = messages.poll(2, TimeUnit.SECONDS)

        @Suppress("UNCHECKED_CAST")
        val peers = peersMsg?.get("peers") as? List<Map<String, Any>> ?: emptyList()
        assertTrue(peers.none { it["peerId"] == "test-peer-solo" })

        session.close()
    }

    @Test
    fun `second peer registering triggers PEER_JOINED for first peer`() {
        val (sessionA, messagesA) = connect("test-joined-a")
        val (sessionB, _) = connect("test-joined-b")

        send(sessionA, mapOf("type" to "REGISTER", "name" to "Alice"))
        messagesA.poll(2, TimeUnit.SECONDS) // REGISTERED
        messagesA.poll(2, TimeUnit.SECONDS) // PEERS
        messagesA.poll(2, TimeUnit.SECONDS) // PREVIOUS_PEERS

        send(sessionB, mapOf("type" to "REGISTER", "name" to "Bob"))

        val joined = messagesA.poll(2, TimeUnit.SECONDS)
        assertEquals("PEER_JOINED", joined?.get("type"))
        assertEquals("test-joined-b", joined?.get("peerId"))
        assertEquals("Bob", joined?.get("name"))

        sessionA.close()
        sessionB.close()
    }

    @Test
    fun `peer disconnecting triggers PEER_LEFT for remaining peers`() {
        val (sessionA, messagesA) = connect("test-left-a")
        val (sessionB, _) = connect("test-left-b")

        send(sessionA, mapOf("type" to "REGISTER", "name" to "Alice"))
        messagesA.poll(2, TimeUnit.SECONDS) // REGISTERED
        messagesA.poll(2, TimeUnit.SECONDS) // PEERS
        messagesA.poll(2, TimeUnit.SECONDS) // PREVIOUS_PEERS

        send(sessionB, mapOf("type" to "REGISTER", "name" to "Bob"))
        messagesA.poll(2, TimeUnit.SECONDS) // PEER_JOINED

        sessionB.close()

        val left = messagesA.poll(2, TimeUnit.SECONDS)
        assertEquals("PEER_LEFT", left?.get("type"))
        assertEquals("test-left-b", left?.get("peerId"))

        sessionA.close()
    }

    @Test
    fun `RELAY_OFFER is forwarded as OFFER_RECEIVED to the target peer`() {
        val (sessionA, messagesA) = connect("relay-offer-a")
        val (sessionB, messagesB) = connect("relay-offer-b")

        send(sessionA, mapOf("type" to "REGISTER", "name" to "Alice"))
        messagesA.poll(2, TimeUnit.SECONDS) // REGISTERED
        messagesA.poll(2, TimeUnit.SECONDS) // PEERS
        messagesA.poll(2, TimeUnit.SECONDS) // PREVIOUS_PEERS

        send(sessionB, mapOf("type" to "REGISTER", "name" to "Bob"))
        messagesB.poll(2, TimeUnit.SECONDS) // REGISTERED
        messagesB.poll(2, TimeUnit.SECONDS) // PEERS
        messagesB.poll(2, TimeUnit.SECONDS) // PREVIOUS_PEERS
        messagesB.poll(2, TimeUnit.SECONDS) // PEER_JOINED for Alice
        messagesA.poll(2, TimeUnit.SECONDS) // PEER_JOINED for Bob

        send(sessionA, mapOf("type" to "RELAY_OFFER", "targetPeerId" to "relay-offer-b", "sdp" to "fake-sdp-offer"))

        val received = messagesB.poll(2, TimeUnit.SECONDS)
        assertEquals("OFFER_RECEIVED", received?.get("type"))
        assertEquals("relay-offer-a", received?.get("fromPeerId"))
        assertEquals("Alice", received?.get("name"))
        assertEquals("fake-sdp-offer", received?.get("sdp"))

        sessionA.close()
        sessionB.close()
    }

    @Test
    fun `REGISTER receives PREVIOUS_PEERS after PEERS`() {
        val (session, messages) = connect("test-prev-peers-solo")

        send(session, mapOf("type" to "REGISTER", "name" to "Solo"))

        messages.poll(2, TimeUnit.SECONDS) // REGISTERED
        messages.poll(2, TimeUnit.SECONDS) // PEERS
        val previousPeers = messages.poll(2, TimeUnit.SECONDS)

        assertEquals("PREVIOUS_PEERS", previousPeers?.get("type"))

        session.close()
    }

    @Test
    fun `PREVIOUS_PEERS is empty when no relationships exist`() {
        val (session, messages) = connect("test-prev-empty")

        send(session, mapOf("type" to "REGISTER", "name" to "Solo"))

        messages.poll(2, TimeUnit.SECONDS) // REGISTERED
        messages.poll(2, TimeUnit.SECONDS) // PEERS
        val previousPeers = messages.poll(2, TimeUnit.SECONDS)

        @Suppress("UNCHECKED_CAST")
        val peers = previousPeers?.get("peers") as? List<*> ?: emptyList<Any>()
        assertEquals(0, peers.size)

        session.close()
    }

    @Test
    fun `PREVIOUS_PEERS includes peer who disconnected after SDP relay`() {
        val (sessionA, messagesA) = connect("prev-relayed-a")
        val (sessionB, messagesB) = connect("prev-relayed-b")

        send(sessionA, mapOf("type" to "REGISTER", "name" to "Alice"))
        messagesA.poll(2, TimeUnit.SECONDS) // REGISTERED
        messagesA.poll(2, TimeUnit.SECONDS) // PEERS
        messagesA.poll(2, TimeUnit.SECONDS) // PREVIOUS_PEERS

        send(sessionB, mapOf("type" to "REGISTER", "name" to "Bob"))
        messagesA.poll(2, TimeUnit.SECONDS) // PEER_JOINED
        messagesB.poll(2, TimeUnit.SECONDS) // REGISTERED
        messagesB.poll(2, TimeUnit.SECONDS) // PEERS
        messagesB.poll(2, TimeUnit.SECONDS) // PREVIOUS_PEERS

        // SDP relay to record relationship
        send(sessionA, mapOf("type" to "RELAY_OFFER", "targetPeerId" to "prev-relayed-b", "sdp" to "v=offer"))
        messagesB.poll(2, TimeUnit.SECONDS) // OFFER_RECEIVED
        send(sessionB, mapOf("type" to "RELAY_ANSWER", "targetPeerId" to "prev-relayed-a", "sdp" to "v=answer"))
        messagesA.poll(2, TimeUnit.SECONDS) // ANSWER_RECEIVED

        // Bob disconnects
        sessionB.close()
        messagesA.poll(2, TimeUnit.SECONDS) // PEER_LEFT

        // Alice reconnects, should see Bob as previous peer
        val (sessionA2, messagesA2) = connect("prev-relayed-a")
        send(sessionA2, mapOf("type" to "REGISTER", "name" to "Alice"))
        messagesA2.poll(2, TimeUnit.SECONDS) // REGISTERED
        messagesA2.poll(2, TimeUnit.SECONDS) // PEERS
        val previousPeers = messagesA2.poll(2, TimeUnit.SECONDS)

        @Suppress("UNCHECKED_CAST")
        val peers = previousPeers?.get("peers") as? List<Map<String, Any>> ?: emptyList()
        assertEquals(1, peers.size)
        assertEquals("prev-relayed-b", peers[0]["peerId"])
        assertEquals("Bob", peers[0]["name"])
        assertEquals(false, peers[0]["online"])

        sessionA.close()
        sessionA2.close()
    }

    @Test
    fun `RELAY_ANSWER is forwarded as ANSWER_RECEIVED to the target peer`() {
        val (sessionA, messagesA) = connect("relay-answer-a")
        val (sessionB, _) = connect("relay-answer-b")

        send(sessionA, mapOf("type" to "REGISTER", "name" to "Alice"))
        messagesA.poll(2, TimeUnit.SECONDS) // REGISTERED
        messagesA.poll(2, TimeUnit.SECONDS) // PEERS
        messagesA.poll(2, TimeUnit.SECONDS) // PREVIOUS_PEERS

        send(sessionB, mapOf("type" to "REGISTER", "name" to "Bob"))
        messagesA.poll(2, TimeUnit.SECONDS) // PEER_JOINED for Bob

        send(sessionB, mapOf("type" to "RELAY_ANSWER", "targetPeerId" to "relay-answer-a", "sdp" to "fake-sdp-answer"))

        val received = messagesA.poll(2, TimeUnit.SECONDS)
        assertEquals("ANSWER_RECEIVED", received?.get("type"))
        assertEquals("relay-answer-b", received?.get("fromPeerId"))
        assertEquals("fake-sdp-answer", received?.get("sdp"))

        sessionA.close()
        sessionB.close()
    }

    @Test
    fun `RELAY_ICE_RESTART is forwarded as ICE_RESTART_RECEIVED to the target peer`() {
        val (sessionA, messagesA) = connect("ice-restart-offer-a")
        val (sessionB, messagesB) = connect("ice-restart-offer-b")

        send(sessionA, mapOf("type" to "REGISTER", "name" to "Alice"))
        messagesA.poll(2, TimeUnit.SECONDS) // REGISTERED
        messagesA.poll(2, TimeUnit.SECONDS) // PEERS
        messagesA.poll(2, TimeUnit.SECONDS) // PREVIOUS_PEERS

        send(sessionB, mapOf("type" to "REGISTER", "name" to "Bob"))
        messagesB.poll(2, TimeUnit.SECONDS) // REGISTERED
        messagesB.poll(2, TimeUnit.SECONDS) // PEERS
        messagesB.poll(2, TimeUnit.SECONDS) // PREVIOUS_PEERS
        messagesB.poll(2, TimeUnit.SECONDS) // PEER_JOINED for Alice
        messagesA.poll(2, TimeUnit.SECONDS) // PEER_JOINED for Bob

        send(sessionA, mapOf("type" to "RELAY_ICE_RESTART", "targetPeerId" to "ice-restart-offer-b", "sdp" to "fake-restart-sdp"))

        val received = messagesB.poll(2, TimeUnit.SECONDS)
        assertEquals("ICE_RESTART_RECEIVED", received?.get("type"))
        assertEquals("ice-restart-offer-a", received?.get("fromPeerId"))
        assertEquals("fake-restart-sdp", received?.get("sdp"))

        sessionA.close()
        sessionB.close()
    }

    @Test
    fun `RELAY_ICE_RESTART_ANSWER is forwarded as ICE_RESTART_ANSWER_RECEIVED to the target peer`() {
        val (sessionA, messagesA) = connect("ice-restart-answer-a")
        val (sessionB, _) = connect("ice-restart-answer-b")

        send(sessionA, mapOf("type" to "REGISTER", "name" to "Alice"))
        messagesA.poll(2, TimeUnit.SECONDS) // REGISTERED
        messagesA.poll(2, TimeUnit.SECONDS) // PEERS
        messagesA.poll(2, TimeUnit.SECONDS) // PREVIOUS_PEERS

        send(sessionB, mapOf("type" to "REGISTER", "name" to "Bob"))
        messagesA.poll(2, TimeUnit.SECONDS) // PEER_JOINED for Bob

        send(sessionB, mapOf("type" to "RELAY_ICE_RESTART_ANSWER", "targetPeerId" to "ice-restart-answer-a", "sdp" to "fake-restart-answer-sdp"))

        val received = messagesA.poll(2, TimeUnit.SECONDS)
        assertEquals("ICE_RESTART_ANSWER_RECEIVED", received?.get("type"))
        assertEquals("ice-restart-answer-b", received?.get("fromPeerId"))
        assertEquals("fake-restart-answer-sdp", received?.get("sdp"))

        sessionA.close()
        sessionB.close()
    }

    @Test
    fun `FORGET_PEER removes peer from PREVIOUS_PEERS on next registration`() {
        val (sessionA, messagesA) = connect("forget-a")
        val (sessionB, messagesB) = connect("forget-b")

        send(sessionA, mapOf("type" to "REGISTER", "name" to "Alice"))
        messagesA.poll(2, TimeUnit.SECONDS) // REGISTERED
        messagesA.poll(2, TimeUnit.SECONDS) // PEERS
        messagesA.poll(2, TimeUnit.SECONDS) // PREVIOUS_PEERS

        send(sessionB, mapOf("type" to "REGISTER", "name" to "Bob"))
        messagesA.poll(2, TimeUnit.SECONDS) // PEER_JOINED
        messagesB.poll(2, TimeUnit.SECONDS) // REGISTERED
        messagesB.poll(2, TimeUnit.SECONDS) // PEERS
        messagesB.poll(2, TimeUnit.SECONDS) // PREVIOUS_PEERS

        // SDP relay to record relationship
        send(sessionA, mapOf("type" to "RELAY_OFFER", "targetPeerId" to "forget-b", "sdp" to "v=offer"))
        messagesB.poll(2, TimeUnit.SECONDS) // OFFER_RECEIVED
        send(sessionB, mapOf("type" to "RELAY_ANSWER", "targetPeerId" to "forget-a", "sdp" to "v=answer"))
        messagesA.poll(2, TimeUnit.SECONDS) // ANSWER_RECEIVED

        // Alice forgets Bob
        send(sessionA, mapOf("type" to "FORGET_PEER", "targetPeerId" to "forget-b"))

        // Alice reconnects — Bob should not appear in PREVIOUS_PEERS
        sessionA.close()
        val (sessionA2, messagesA2) = connect("forget-a")
        send(sessionA2, mapOf("type" to "REGISTER", "name" to "Alice"))
        messagesA2.poll(2, TimeUnit.SECONDS) // REGISTERED
        messagesA2.poll(2, TimeUnit.SECONDS) // PEERS
        val previousPeers = messagesA2.poll(2, TimeUnit.SECONDS)

        @Suppress("UNCHECKED_CAST")
        val peers = previousPeers?.get("peers") as? List<*> ?: emptyList<Any>()
        assertEquals(0, peers.size)

        sessionA2.close()
        sessionB.close()
    }

    @Test
    fun `SHARE_EMAIL sends EMAIL_SHARED with email to the target peer`() {
        val (sessionA, messagesA) = connect("share-email-a")
        val (sessionB, messagesB) = connect("share-email-b")

        send(sessionA, mapOf("type" to "REGISTER", "name" to "Alice", "email" to "alice@example.com"))
        messagesA.poll(2, TimeUnit.SECONDS) // REGISTERED
        messagesA.poll(2, TimeUnit.SECONDS) // PEERS
        messagesA.poll(2, TimeUnit.SECONDS) // PREVIOUS_PEERS

        send(sessionB, mapOf("type" to "REGISTER", "name" to "Bob"))
        messagesB.poll(2, TimeUnit.SECONDS) // REGISTERED
        messagesB.poll(2, TimeUnit.SECONDS) // PEERS
        messagesB.poll(2, TimeUnit.SECONDS) // PREVIOUS_PEERS
        messagesB.poll(2, TimeUnit.SECONDS) // PEER_JOINED for Alice
        messagesA.poll(2, TimeUnit.SECONDS) // PEER_JOINED for Bob

        send(sessionA, mapOf("type" to "SHARE_EMAIL", "targetPeerId" to "share-email-b"))

        val received = messagesB.poll(2, TimeUnit.SECONDS)
        assertEquals("EMAIL_SHARED", received?.get("type"))
        assertEquals("share-email-a", received?.get("fromPeerId"))
        assertEquals("alice@example.com", received?.get("email"))

        sessionA.close()
        sessionB.close()
    }

    @Test
    fun `STOP_SHARING_EMAIL sends EMAIL_REVOKED to the target peer`() {
        val (sessionA, messagesA) = connect("stop-share-a")
        val (sessionB, messagesB) = connect("stop-share-b")

        send(sessionA, mapOf("type" to "REGISTER", "name" to "Alice", "email" to "alice@example.com"))
        messagesA.poll(2, TimeUnit.SECONDS) // REGISTERED
        messagesA.poll(2, TimeUnit.SECONDS) // PEERS
        messagesA.poll(2, TimeUnit.SECONDS) // PREVIOUS_PEERS

        send(sessionB, mapOf("type" to "REGISTER", "name" to "Bob"))
        messagesB.poll(2, TimeUnit.SECONDS) // REGISTERED
        messagesB.poll(2, TimeUnit.SECONDS) // PEERS
        messagesB.poll(2, TimeUnit.SECONDS) // PREVIOUS_PEERS
        messagesB.poll(2, TimeUnit.SECONDS) // PEER_JOINED for Alice
        messagesA.poll(2, TimeUnit.SECONDS) // PEER_JOINED for Bob

        send(sessionA, mapOf("type" to "SHARE_EMAIL", "targetPeerId" to "stop-share-b"))
        messagesB.poll(2, TimeUnit.SECONDS) // EMAIL_SHARED

        send(sessionA, mapOf("type" to "STOP_SHARING_EMAIL", "targetPeerId" to "stop-share-b"))

        val received = messagesB.poll(2, TimeUnit.SECONDS)
        assertEquals("EMAIL_REVOKED", received?.get("type"))
        assertEquals("stop-share-a", received?.get("fromPeerId"))

        sessionA.close()
        sessionB.close()
    }

    @Test
    fun `PREVIOUS_PEERS includes email when peer had shared their email`() {
        val (sessionA, messagesA) = connect("prev-email-a")
        val (sessionB, messagesB) = connect("prev-email-b")

        send(sessionA, mapOf("type" to "REGISTER", "name" to "Alice", "email" to "alice@example.com"))
        messagesA.poll(2, TimeUnit.SECONDS) // REGISTERED
        messagesA.poll(2, TimeUnit.SECONDS) // PEERS
        messagesA.poll(2, TimeUnit.SECONDS) // PREVIOUS_PEERS

        send(sessionB, mapOf("type" to "REGISTER", "name" to "Bob"))
        messagesA.poll(2, TimeUnit.SECONDS) // PEER_JOINED
        messagesB.poll(2, TimeUnit.SECONDS) // REGISTERED
        messagesB.poll(2, TimeUnit.SECONDS) // PEERS
        messagesB.poll(2, TimeUnit.SECONDS) // PREVIOUS_PEERS

        // SDP relay to record relationship
        send(sessionA, mapOf("type" to "RELAY_OFFER", "targetPeerId" to "prev-email-b", "sdp" to "v=offer"))
        messagesB.poll(2, TimeUnit.SECONDS) // OFFER_RECEIVED
        send(sessionB, mapOf("type" to "RELAY_ANSWER", "targetPeerId" to "prev-email-a", "sdp" to "v=answer"))
        messagesA.poll(2, TimeUnit.SECONDS) // ANSWER_RECEIVED

        // Alice shares email with Bob
        send(sessionA, mapOf("type" to "SHARE_EMAIL", "targetPeerId" to "prev-email-b"))
        messagesB.poll(2, TimeUnit.SECONDS) // EMAIL_SHARED

        // Alice disconnects; Bob reconnects and sees Alice in PREVIOUS_PEERS with email
        sessionA.close()
        messagesB.poll(2, TimeUnit.SECONDS) // PEER_LEFT

        val (sessionB2, messagesB2) = connect("prev-email-b")
        send(sessionB2, mapOf("type" to "REGISTER", "name" to "Bob"))
        messagesB2.poll(2, TimeUnit.SECONDS) // REGISTERED
        messagesB2.poll(2, TimeUnit.SECONDS) // PEERS
        val previousPeers = messagesB2.poll(2, TimeUnit.SECONDS)

        @Suppress("UNCHECKED_CAST")
        val peers = previousPeers?.get("peers") as? List<Map<String, Any>> ?: emptyList()
        assertEquals(1, peers.size)
        assertEquals("alice@example.com", peers[0]["email"])

        sessionB2.close()
        sessionB.close()
    }

    @Test
    fun `PREVIOUS_PEERS does not include email when peer has not shared`() {
        val (sessionA, messagesA) = connect("no-share-a")
        val (sessionB, messagesB) = connect("no-share-b")

        send(sessionA, mapOf("type" to "REGISTER", "name" to "Alice", "email" to "alice@example.com"))
        messagesA.poll(2, TimeUnit.SECONDS) // REGISTERED
        messagesA.poll(2, TimeUnit.SECONDS) // PEERS
        messagesA.poll(2, TimeUnit.SECONDS) // PREVIOUS_PEERS

        send(sessionB, mapOf("type" to "REGISTER", "name" to "Bob"))
        messagesA.poll(2, TimeUnit.SECONDS) // PEER_JOINED
        messagesB.poll(2, TimeUnit.SECONDS) // REGISTERED
        messagesB.poll(2, TimeUnit.SECONDS) // PEERS
        messagesB.poll(2, TimeUnit.SECONDS) // PREVIOUS_PEERS

        send(sessionA, mapOf("type" to "RELAY_OFFER", "targetPeerId" to "no-share-b", "sdp" to "v=offer"))
        messagesB.poll(2, TimeUnit.SECONDS) // OFFER_RECEIVED
        send(sessionB, mapOf("type" to "RELAY_ANSWER", "targetPeerId" to "no-share-a", "sdp" to "v=answer"))
        messagesA.poll(2, TimeUnit.SECONDS) // ANSWER_RECEIVED

        sessionA.close()
        messagesB.poll(2, TimeUnit.SECONDS) // PEER_LEFT

        val (sessionB2, messagesB2) = connect("no-share-b")
        send(sessionB2, mapOf("type" to "REGISTER", "name" to "Bob"))
        messagesB2.poll(2, TimeUnit.SECONDS) // REGISTERED
        messagesB2.poll(2, TimeUnit.SECONDS) // PEERS
        val previousPeers = messagesB2.poll(2, TimeUnit.SECONDS)

        @Suppress("UNCHECKED_CAST")
        val peers = previousPeers?.get("peers") as? List<Map<String, Any>> ?: emptyList()
        assertEquals(1, peers.size)
        assertNull(peers[0]["email"])

        sessionB2.close()
        sessionB.close()
    }

    @Test
    fun `UPDATE_EMAIL changes the email sent in subsequent SHARE_EMAIL`() {
        val (sessionA, messagesA) = connect("update-email-a")
        val (sessionB, messagesB) = connect("update-email-b")

        send(sessionA, mapOf("type" to "REGISTER", "name" to "Alice", "email" to "old@example.com"))
        messagesA.poll(2, TimeUnit.SECONDS) // REGISTERED
        messagesA.poll(2, TimeUnit.SECONDS) // PEERS
        messagesA.poll(2, TimeUnit.SECONDS) // PREVIOUS_PEERS

        send(sessionB, mapOf("type" to "REGISTER", "name" to "Bob"))
        messagesB.poll(2, TimeUnit.SECONDS) // REGISTERED
        messagesB.poll(2, TimeUnit.SECONDS) // PEERS
        messagesB.poll(2, TimeUnit.SECONDS) // PREVIOUS_PEERS
        messagesB.poll(2, TimeUnit.SECONDS) // PEER_JOINED for Alice
        messagesA.poll(2, TimeUnit.SECONDS) // PEER_JOINED for Bob

        send(sessionA, mapOf("type" to "UPDATE_EMAIL", "email" to "new@example.com"))
        send(sessionA, mapOf("type" to "SHARE_EMAIL", "targetPeerId" to "update-email-b"))

        val received = messagesB.poll(2, TimeUnit.SECONDS)
        assertEquals("EMAIL_SHARED", received?.get("type"))
        assertEquals("new@example.com", received?.get("email"))

        sessionA.close()
        sessionB.close()
    }
}
