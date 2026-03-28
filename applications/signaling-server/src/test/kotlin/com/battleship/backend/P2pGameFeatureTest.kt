package com.battleship.backend

import com.battleship.backend.signaling.P2pGameGateway
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
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
import java.util.concurrent.TimeoutException

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = ["spring.datasource.url=jdbc:h2:mem:p2pgametest;DB_CLOSE_DELAY=-1"],
)
class P2pGameFeatureTest {

    @LocalServerPort
    private var port: Int = 0

    @Autowired
    lateinit var gateway: P2pGameGateway

    private val mapper = jacksonObjectMapper()
    private val gameStateJson = """{"phase":"my-turn","myShots":[],"opponentShots":[]}"""

    private fun <T> waitFor(timeoutMs: Long = 2000, intervalMs: Long = 20, condition: () -> T?): T {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            condition()?.let { return it }
            Thread.sleep(intervalMs)
        }
        throw TimeoutException("Condition not met within ${timeoutMs}ms")
    }

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
    fun `SAVE_P2P_GAME persists game state keyed by player-then-opponent`() {
        val (session, _) = connect("p2p-alice")

        send(session, mapOf("type" to "SAVE_P2P_GAME", "opponentId" to "p2p-bob", "gameState" to gameStateJson))

        // Each player saves their own perspective under their own key
        waitFor { gateway.find("p2p-alice", "p2p-bob") }
        assertEquals(gameStateJson, gateway.find("p2p-alice", "p2p-bob"))
        assertNull(gateway.find("p2p-bob", "p2p-alice"))

        session.close()
    }

    @Test
    fun `LOAD_P2P_GAME returns P2P_GAME_LOADED when game exists`() {
        gateway.save("p2p-carol", "p2p-dave", gameStateJson)
        val (session, messages) = connect("p2p-carol")
        // drain REGISTERED, PEERS, PREVIOUS_PEERS
        messages.poll(2, TimeUnit.SECONDS)
        messages.poll(2, TimeUnit.SECONDS)
        messages.poll(2, TimeUnit.SECONDS)

        send(session, mapOf("type" to "LOAD_P2P_GAME", "opponentId" to "p2p-dave"))

        val response = messages.poll(2, TimeUnit.SECONDS)
        assertEquals("P2P_GAME_LOADED", response?.get("type"))
        assertEquals(gameStateJson, response?.get("gameState"))

        session.close()
    }

    @Test
    fun `LOAD_P2P_GAME returns P2P_GAME_NOT_FOUND when no game exists`() {
        val (session, messages) = connect("p2p-eve")
        messages.poll(2, TimeUnit.SECONDS)
        messages.poll(2, TimeUnit.SECONDS)
        messages.poll(2, TimeUnit.SECONDS)

        send(session, mapOf("type" to "LOAD_P2P_GAME", "opponentId" to "p2p-nobody"))

        val response = messages.poll(2, TimeUnit.SECONDS)
        assertEquals("P2P_GAME_NOT_FOUND", response?.get("type"))

        session.close()
    }

    @Test
    fun `LOAD_P2P_GAME returns only the requesting player's own saved perspective`() {
        gateway.save("p2p-frank", "p2p-grace", gameStateJson)
        val (session, messages) = connect("p2p-grace")
        messages.poll(2, TimeUnit.SECONDS)
        messages.poll(2, TimeUnit.SECONDS)
        messages.poll(2, TimeUnit.SECONDS)

        send(session, mapOf("type" to "LOAD_P2P_GAME", "opponentId" to "p2p-frank"))

        // Grace has no saved game — only frank saved; grace gets NOT_FOUND
        val response = messages.poll(2, TimeUnit.SECONDS)
        assertEquals("P2P_GAME_NOT_FOUND", response?.get("type"))

        session.close()
    }

    @Test
    fun `P2pGameGateway returns null for unknown pair`() {
        assertNull(gateway.find("p2p-unknown1", "p2p-unknown2"))
    }
}
