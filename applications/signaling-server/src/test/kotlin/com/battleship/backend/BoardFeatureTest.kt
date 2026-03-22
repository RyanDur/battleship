package com.battleship.backend

import com.battleship.backend.signaling.GameBoardGateway
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.assertEquals
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

@SpringBootTest(
    webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
    properties = ["spring.datasource.url=jdbc:h2:mem:boardtest;DB_CLOSE_DELAY=-1"],
)
class BoardFeatureTest {

    @LocalServerPort
    private var port: Int = 0

    @Autowired
    lateinit var gateway: GameBoardGateway

    private val mapper = jacksonObjectMapper()
    private val boardJson = """{"placed":[{"ship":{"name":"Carrier","size":5},"position":{"row":1,"col":1},"orientation":"horizontal"}]}"""

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
    fun `SAVE_BOARD persists board and responds with BOARD_SAVED`() {
        val (session, messages) = connect("board-alice")

        send(session, mapOf("type" to "SAVE_BOARD", "board" to boardJson))

        val response = messages.poll(2, TimeUnit.SECONDS)
        assertEquals("BOARD_SAVED", response?.get("type"))
        assertEquals(boardJson, gateway.find("board-alice"))

        session.close()
    }

    @Test
    fun `LOAD_BOARD returns BOARD_LOADED with saved board`() {
        gateway.save("board-bob", boardJson)
        val (session, messages) = connect("board-bob")

        send(session, mapOf("type" to "LOAD_BOARD"))

        val response = messages.poll(2, TimeUnit.SECONDS)
        assertEquals("BOARD_LOADED", response?.get("type"))
        assertEquals(boardJson, response?.get("board"))

        session.close()
    }

    @Test
    fun `LOAD_BOARD returns BOARD_NOT_FOUND when no board saved`() {
        val (session, messages) = connect("board-nobody")

        send(session, mapOf("type" to "LOAD_BOARD"))

        val response = messages.poll(2, TimeUnit.SECONDS)
        assertEquals("BOARD_NOT_FOUND", response?.get("type"))

        session.close()
    }
}
