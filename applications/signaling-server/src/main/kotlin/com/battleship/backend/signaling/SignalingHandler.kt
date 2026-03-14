package com.battleship.backend.signaling

import com.battleship.shared.protocol.SignalingMessage
import kotlinx.serialization.json.Json
import org.springframework.stereotype.Component
import org.springframework.web.socket.CloseStatus
import org.springframework.web.socket.TextMessage
import org.springframework.web.socket.WebSocketSession
import org.springframework.web.socket.handler.TextWebSocketHandler

@Component
class SignalingHandler(private val registry: SessionRegistry) : TextWebSocketHandler() {

    private val json = Json { classDiscriminator = "type" }

    override fun afterConnectionEstablished(session: WebSocketSession) {
        registry.register(session).mapEither(
            onSuccess = {
                registry.peer(session)
                    ?.takeIf { it.isOpen }
                    ?.sendMessage(TextMessage(json.encodeToString(SignalingMessage.serializer(), SignalingMessage.PeerConnected)))
            },
            onFailure = { session.close(CloseStatus.SERVICE_OVERLOAD) }
        )
    }

    override fun handleTextMessage(session: WebSocketSession, message: TextMessage) {
        registry.peer(session)
            ?.takeIf { it.isOpen }
            ?.sendMessage(message)
    }

    override fun afterConnectionClosed(session: WebSocketSession, status: CloseStatus) {
        registry.unregister(session)
    }
}
