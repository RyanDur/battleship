package com.battleship.backend.signaling

import com.battleship.shared.tryCatch
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import org.springframework.stereotype.Component
import org.springframework.web.socket.CloseStatus
import org.springframework.web.socket.TextMessage
import org.springframework.web.socket.WebSocketSession
import org.springframework.web.socket.handler.TextWebSocketHandler
import java.util.concurrent.ConcurrentHashMap

@Component
class SignalingHandler(
    private val registry: PeerRegistry,
    private val boardGateway: GameBoardGateway,
    private val gameGateway: GameSessionGateway,
    private val objectMapper: ObjectMapper,
) : TextWebSocketHandler() {

    private val mapper = jacksonObjectMapper()
    private val sessionToPeer = ConcurrentHashMap<String, String>()
    private val peerToSession = ConcurrentHashMap<String, WebSocketSession>()

    override fun afterConnectionClosed(session: WebSocketSession, status: CloseStatus) {
        val peerId = sessionToPeer.remove(session.id) ?: return
        peerToSession.remove(peerId)
        registry.unregister(peerId)
        broadcast(mapOf("type" to "PEER_LEFT", "peerId" to peerId), excludePeerId = peerId)
    }

    override fun handleTextMessage(session: WebSocketSession, message: TextMessage) {
        val payload: Map<String, Any> = mapper.readValue(message.payload)
        when (payload["type"]) {
            "REGISTER" -> handleRegister(session, payload)
            "RELAY_OFFER" -> handleRelayOffer(session, payload)
            "RELAY_ANSWER" -> handleRelayAnswer(session, payload)
            "FORGET_PEER" -> handleForgetPeer(session, payload)
            "RELAY_ICE_RESTART" -> handleRelayIceRestart(session, payload)
            "RELAY_ICE_RESTART_ANSWER" -> handleRelayIceRestartAnswer(session, payload)
            "SHARE_EMAIL" -> handleShareEmail(session, payload)
            "STOP_SHARING_EMAIL" -> handleStopSharingEmail(session, payload)
            "UPDATE_EMAIL" -> handleUpdateEmail(session, payload)
            "SAVE_PEER_EMAIL" -> handleSavePeerEmail(session, payload)
            "SAVE_BOARD" -> handleSaveBoard(session, payload)
            "LOAD_BOARD" -> handleLoadBoard(session)
            "START_GAME" -> handleStartGame(session)
            "FIRE" -> handleFire(session, payload)
            "LOAD_GAME" -> handleLoadGame(session)
        }
    }

    private fun handleRegister(session: WebSocketSession, payload: Map<String, Any>) {
        val peerId = session.attributes["peerId"] as? String ?: return
        val name = payload["name"] as? String ?: return

        registry.register(peerId, name)
        (payload["email"] as? String)?.let { registry.saveEmail(peerId, it) }
        sessionToPeer[session.id] = peerId

        send(session, mapOf("type" to "REGISTERED", "peerId" to peerId, "name" to name))

        val peers = registry.getPeersExcluding(peerId).map { mapOf("peerId" to it.peerId, "name" to it.name) }
        send(session, mapOf("type" to "PEERS", "peers" to peers))

        val previousPeers = registry.getPreviousPeers(peerId).map {
            buildMap {
                put("peerId", it.peerId)
                put("name", it.name)
                put("online", it.online)
                if (it.email != null) put("email", it.email)
            }
        }
        send(session, mapOf("type" to "PREVIOUS_PEERS", "peers" to previousPeers))

        peerToSession[peerId] = session
        broadcast(mapOf("type" to "PEER_JOINED", "peerId" to peerId, "name" to name), excludePeerId = peerId)
    }

    private fun handleRelayOffer(session: WebSocketSession, payload: Map<String, Any>) {
        val fromPeerId = sessionToPeer[session.id] ?: return
        val targetPeerId = payload["targetPeerId"] as? String ?: return
        val sdp = payload["sdp"] as? String ?: return
        val name = registry.getPeers().find { it.peerId == fromPeerId }?.name ?: return
        val target = peerToSession[targetPeerId] ?: return
        send(target, mapOf("type" to "OFFER_RECEIVED", "fromPeerId" to fromPeerId, "name" to name, "sdp" to sdp))
    }

    private fun handleRelayAnswer(session: WebSocketSession, payload: Map<String, Any>) {
        val fromPeerId = sessionToPeer[session.id] ?: return
        val targetPeerId = payload["targetPeerId"] as? String ?: return
        val sdp = payload["sdp"] as? String ?: return
        val target = peerToSession[targetPeerId] ?: return
        registry.recordRelationship(fromPeerId, targetPeerId)
        send(target, mapOf("type" to "ANSWER_RECEIVED", "fromPeerId" to fromPeerId, "sdp" to sdp))
    }

    private fun handleRelayIceRestart(session: WebSocketSession, payload: Map<String, Any>) {
        val fromPeerId = sessionToPeer[session.id] ?: return
        val targetPeerId = payload["targetPeerId"] as? String ?: return
        val sdp = payload["sdp"] as? String ?: return
        val target = peerToSession[targetPeerId] ?: return
        send(target, mapOf("type" to "ICE_RESTART_RECEIVED", "fromPeerId" to fromPeerId, "sdp" to sdp))
    }

    private fun handleRelayIceRestartAnswer(session: WebSocketSession, payload: Map<String, Any>) {
        val fromPeerId = sessionToPeer[session.id] ?: return
        val targetPeerId = payload["targetPeerId"] as? String ?: return
        val sdp = payload["sdp"] as? String ?: return
        val target = peerToSession[targetPeerId] ?: return
        send(target, mapOf("type" to "ICE_RESTART_ANSWER_RECEIVED", "fromPeerId" to fromPeerId, "sdp" to sdp))
    }

    private fun handleForgetPeer(session: WebSocketSession, payload: Map<String, Any>) {
        val peerId = sessionToPeer[session.id] ?: return
        val targetPeerId = payload["targetPeerId"] as? String ?: return
        registry.forgetRelationship(peerId, targetPeerId)
    }

    private fun handleShareEmail(session: WebSocketSession, payload: Map<String, Any>) {
        val peerId = sessionToPeer[session.id] ?: return
        val targetPeerId = payload["targetPeerId"] as? String ?: return
        registry.shareEmail(peerId, targetPeerId)
        val email = registry.getSharedEmail(peerId, targetPeerId) ?: return
        val target = peerToSession[targetPeerId] ?: return
        send(target, mapOf("type" to "EMAIL_SHARED", "fromPeerId" to peerId, "email" to email))
    }

    private fun handleStopSharingEmail(session: WebSocketSession, payload: Map<String, Any>) {
        val peerId = sessionToPeer[session.id] ?: return
        val targetPeerId = payload["targetPeerId"] as? String ?: return
        registry.stopSharingEmail(peerId, targetPeerId)
        val target = peerToSession[targetPeerId] ?: return
        send(target, mapOf("type" to "EMAIL_REVOKED", "fromPeerId" to peerId))
    }

    private fun handleUpdateEmail(session: WebSocketSession, payload: Map<String, Any>) {
        val peerId = sessionToPeer[session.id] ?: return
        val email = payload["email"] as? String ?: return
        registry.saveEmail(peerId, email)
        registry.getSharingReceivers(peerId).forEach { receiverPeerId ->
            val target = peerToSession[receiverPeerId] ?: return@forEach
            send(target, mapOf("type" to "EMAIL_SHARED", "fromPeerId" to peerId, "email" to email))
        }
    }

    private fun handleSavePeerEmail(session: WebSocketSession, payload: Map<String, Any>) {
        val peerId = sessionToPeer[session.id] ?: return
        val targetPeerId = payload["targetPeerId"] as? String ?: return
        val email = payload["email"] as? String ?: return
        registry.savePeerEmail(peerId, targetPeerId, email)
    }

    private fun handleSaveBoard(session: WebSocketSession, payload: Map<String, Any>) {
        val peerId = peerId(session) ?: return
        val board = payload["board"] as? String ?: return
        boardGateway.save(peerId, board)
        send(session, mapOf("type" to "BOARD_SAVED"))
    }

    private fun handleLoadBoard(session: WebSocketSession) {
        val peerId = peerId(session) ?: return
        val board = boardGateway.find(peerId)
        if (board != null) {
            send(session, mapOf("type" to "BOARD_LOADED", "board" to board))
        } else {
            send(session, mapOf("type" to "BOARD_NOT_FOUND"))
        }
    }

    private fun handleStartGame(session: WebSocketSession) {
        val peerId = peerId(session) ?: return
        val boardJson = boardGateway.find(peerId)
        if (boardJson == null) {
            send(session, mapOf("type" to "GAME_ERROR", "reason" to "no board saved"))
            return
        }
        val playerBoard = objectMapper.readValue(boardJson, Board::class.java)
        val state = GameState(playerBoard = playerBoard, aiBoard = createRandomBoard())
        gameGateway.save(peerId, state)
        send(session, state.toResponse("GAME_STARTED"))
    }

    private fun handleFire(session: WebSocketSession, payload: Map<String, Any>) {
        val peerId = peerId(session) ?: return
        val state = gameGateway.find(peerId)
        if (state == null) {
            send(session, mapOf("type" to "GAME_ERROR", "reason" to "no game in progress"))
            return
        }
        if (state.phase != GamePhase.PLAYER_TURN) {
            send(session, mapOf("type" to "GAME_ERROR", "reason" to "not player turn"))
            return
        }
        val row = (payload["row"] as? Int) ?: return
        val col = (payload["col"] as? Int) ?: return
        val cell = Cell(row, col)
        val afterPlayer = fireAt(state, cell)
        val playerShot = afterPlayer.playerShots.last()
        val afterAi = if (afterPlayer.phase == GamePhase.COMPUTER_TURN) {
            val aiCell = nextAiShot(afterPlayer.aiShots.map { it.cell })
            aiFireAt(afterPlayer, aiCell)
        } else afterPlayer
        gameGateway.save(peerId, afterAi)
        val aiShot = if (afterAi.aiShots.size > state.aiShots.size) afterAi.aiShots.last() else null
        val result = mutableMapOf<String, Any>(
            "type" to "FIRE_RESULT",
            "playerShot" to objectMapper.convertValue(playerShot, Map::class.java),
            "phase" to afterAi.phase.toApiString(),
        )
        aiShot?.let { result["aiShot"] = objectMapper.convertValue(it, Map::class.java) }
        send(session, result)
    }

    private fun handleLoadGame(session: WebSocketSession) {
        val peerId = peerId(session) ?: return
        val state = gameGateway.find(peerId)
        if (state != null) {
            send(session, state.toResponse("GAME_STATE"))
        } else {
            send(session, mapOf("type" to "GAME_NOT_FOUND"))
        }
    }

    private fun peerId(session: WebSocketSession): String? =
        session.attributes["peerId"] as? String

    private fun send(session: WebSocketSession, payload: Map<String, Any>) =
        tryCatch({ if (session.isOpen) session.sendMessage(TextMessage(mapper.writeValueAsString(payload))) }) { it }

    private fun broadcast(payload: Map<String, Any>, excludePeerId: String) {
        val msg = TextMessage(mapper.writeValueAsString(payload))
        peerToSession.entries
            .filter { it.key != excludePeerId }
            .forEach { tryCatch({ if (it.value.isOpen) it.value.sendMessage(msg) }) { it } }
    }
}
