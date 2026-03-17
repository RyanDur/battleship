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
            "RELAY_OFFER" -> handleRelayOffer(session, payload)
            "RELAY_ANSWER" -> handleRelayAnswer(session, payload)
            "FORGET_PEER" -> handleForgetPeer(session, payload)
            "RELAY_ICE_RESTART" -> handleRelayIceRestart(session, payload)
            "RELAY_ICE_RESTART_ANSWER" -> handleRelayIceRestartAnswer(session, payload)
            "SHARE_EMAIL" -> handleShareEmail(session, payload)
            "STOP_SHARING_EMAIL" -> handleStopSharingEmail(session, payload)
            "UPDATE_EMAIL" -> handleUpdateEmail(session, payload)
            "SAVE_PEER_EMAIL" -> handleSavePeerEmail(session, payload)
        }
    }

    private fun handleRegister(session: WebSocketSession, payload: Map<String, Any>) {
        val peerId = session.attributes["peerId"] as? String ?: return
        val name = payload["name"] as? String ?: return

        registry.register(peerId, name)
        (payload["email"] as? String)?.let { registry.saveEmail(peerId, it) }
        sessionToPeer[session.id] = peerId
        peerToSession[peerId] = session

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
    }

    private fun handleSavePeerEmail(session: WebSocketSession, payload: Map<String, Any>) {
        val peerId = sessionToPeer[session.id] ?: return
        val targetPeerId = payload["targetPeerId"] as? String ?: return
        val email = payload["email"] as? String ?: return
        registry.savePeerEmail(peerId, targetPeerId, email)
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
