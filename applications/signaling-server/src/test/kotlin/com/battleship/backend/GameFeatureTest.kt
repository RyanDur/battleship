package com.battleship.backend

import com.battleship.backend.signaling.Board
import com.battleship.backend.signaling.Cell
import com.battleship.backend.signaling.GamePhase
import com.battleship.backend.signaling.GameSessionGateway
import com.battleship.backend.signaling.GameState
import com.battleship.backend.signaling.PlacedShip
import com.battleship.backend.signaling.Ship
import com.battleship.backend.signaling.GameBoardGateway
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
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
    properties = ["spring.datasource.url=jdbc:h2:mem:gametest;DB_CLOSE_DELAY=-1"],
)
class GameFeatureTest {

    @LocalServerPort
    private var port: Int = 0

    @Autowired
    lateinit var boardGateway: GameBoardGateway

    @Autowired
    lateinit var gameGateway: GameSessionGateway

    private val mapper = jacksonObjectMapper()
    private val peerId = "game-test-peer"

    private val fullBoard = """{"placed":[
        {"ship":{"name":"Carrier","size":5},"position":{"row":1,"col":1},"orientation":"horizontal"},
        {"ship":{"name":"Battleship","size":4},"position":{"row":2,"col":1},"orientation":"horizontal"},
        {"ship":{"name":"Cruiser","size":3},"position":{"row":3,"col":1},"orientation":"horizontal"},
        {"ship":{"name":"Submarine","size":3},"position":{"row":4,"col":1},"orientation":"horizontal"},
        {"ship":{"name":"Destroyer","size":2},"position":{"row":5,"col":1},"orientation":"horizontal"}
    ]}""".trimIndent()

    @BeforeEach
    fun setup() {
        boardGateway.save(peerId, fullBoard)
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
    fun `START_GAME creates a game and responds with GAME_STARTED`() {
        val (session, messages) = connect(peerId)

        send(session, mapOf("type" to "START_GAME"))

        val response = messages.poll(2, TimeUnit.SECONDS)
        assertEquals("GAME_STARTED", response?.get("type"))
        assertEquals("player-turn", response?.get("phase"))

        session.close()
    }

    @Test
    fun `START_GAME returns GAME_ERROR when no board saved`() {
        val (session, messages) = connect("no-board-peer")

        send(session, mapOf("type" to "START_GAME"))

        val response = messages.poll(2, TimeUnit.SECONDS)
        assertEquals("GAME_ERROR", response?.get("type"))

        session.close()
    }

    @Test
    fun `FIRE returns FIRE_RESULT with player shot`() {
        val (session, messages) = connect(peerId)
        send(session, mapOf("type" to "START_GAME"))
        messages.poll(2, TimeUnit.SECONDS) // consume GAME_STARTED

        send(session, mapOf("type" to "FIRE", "row" to 1, "col" to 1))

        val response = messages.poll(2, TimeUnit.SECONDS)
        assertEquals("FIRE_RESULT", response?.get("type"))
        assertNotNull(response?.get("playerShot"))
        assertNotNull(response?.get("aiShot"))

        session.close()
    }

    @Test
    fun `FIRE returns GAME_ERROR when no game in progress`() {
        val (session, messages) = connect("no-game-peer")

        send(session, mapOf("type" to "FIRE", "row" to 1, "col" to 1))

        val response = messages.poll(2, TimeUnit.SECONDS)
        assertEquals("GAME_ERROR", response?.get("type"))

        session.close()
    }

    @Test
    fun `FIRE returns player-won when all AI ships sunk`() {
        val playerBoard = Board(placed = listOf(
            PlacedShip(Ship("Carrier", 5), Cell(1, 1), "horizontal"),
            PlacedShip(Ship("Battleship", 4), Cell(2, 1), "horizontal"),
            PlacedShip(Ship("Cruiser", 3), Cell(3, 1), "horizontal"),
            PlacedShip(Ship("Submarine", 3), Cell(4, 1), "horizontal"),
            PlacedShip(Ship("Destroyer", 2), Cell(5, 1), "horizontal"),
        ))
        val aiBoard = Board(placed = listOf(
            PlacedShip(Ship("Destroyer", 2), Cell(10, 9), "horizontal"),
        ))
        gameGateway.save(peerId, GameState(playerBoard = playerBoard, aiBoard = aiBoard, phase = GamePhase.PLAYER_TURN))

        val (session, messages) = connect(peerId)

        send(session, mapOf("type" to "FIRE", "row" to 10, "col" to 9))
        messages.poll(2, TimeUnit.SECONDS) // first shot

        send(session, mapOf("type" to "FIRE", "row" to 10, "col" to 10))
        val response = messages.poll(2, TimeUnit.SECONDS)

        assertEquals("FIRE_RESULT", response?.get("type"))
        assertEquals("player-won", response?.get("phase"))

        session.close()
    }

    @Test
    fun `LOAD_GAME returns GAME_STATE for in-progress game`() {
        val (session1, messages1) = connect(peerId)
        send(session1, mapOf("type" to "START_GAME"))
        messages1.poll(2, TimeUnit.SECONDS) // consume GAME_STARTED
        session1.close()

        val (session2, messages2) = connect(peerId)
        send(session2, mapOf("type" to "LOAD_GAME"))

        val response = messages2.poll(2, TimeUnit.SECONDS)
        assertEquals("GAME_STATE", response?.get("type"))
        assertNotNull(response?.get("phase"))

        session2.close()
    }

    @Test
    fun `LOAD_GAME returns GAME_NOT_FOUND when no game`() {
        val (session, messages) = connect("no-game-peer2")

        send(session, mapOf("type" to "LOAD_GAME"))

        val response = messages.poll(2, TimeUnit.SECONDS)
        assertEquals("GAME_NOT_FOUND", response?.get("type"))

        session.close()
    }
}
