package com.battleship.backend.signaling

import com.fasterxml.jackson.module.kotlin.jacksonObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import org.springframework.stereotype.Component
import org.springframework.web.socket.CloseStatus
import org.springframework.web.socket.TextMessage
import org.springframework.web.socket.WebSocketSession
import org.springframework.web.socket.handler.TextWebSocketHandler
import java.util.concurrent.ConcurrentHashMap

@Component
class SignalingHandler(private val registry: PeerRegistry) : TextWebSocketHandler() {

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
        }
    }

    private fun handleRegister(session: WebSocketSession, payload: Map<String, Any>) {
        val peerId = session.attributes["peerId"] as? String ?: return
        val name = payload["name"] as? String ?: return

        registry.register(peerId, name)
        sessionToPeer[session.id] = peerId
        peerToSession[peerId] = session

        send(session, mapOf("type" to "REGISTERED", "peerId" to peerId, "name" to name))

        val peers = registry.getPeersExcluding(peerId).map { mapOf("peerId" to it.peerId, "name" to it.name) }
        send(session, mapOf("type" to "PEERS", "peers" to peers))

        broadcast(mapOf("type" to "PEER_JOINED", "peerId" to peerId, "name" to name), excludePeerId = peerId)
    }

    private fun send(session: WebSocketSession, payload: Map<String, Any>) {
        if (session.isOpen) {
            session.sendMessage(TextMessage(mapper.writeValueAsString(payload)))
        }
    }

    private fun broadcast(payload: Map<String, Any>, excludePeerId: String) {
        val msg = TextMessage(mapper.writeValueAsString(payload))
        peerToSession.entries
            .filter { it.key != excludePeerId && it.value.isOpen }
            .forEach { it.value.sendMessage(msg) }
    }
}
