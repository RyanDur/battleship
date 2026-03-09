package com.battleship.backend.signaling

import org.springframework.stereotype.Component
import org.springframework.web.socket.CloseStatus
import org.springframework.web.socket.TextMessage
import org.springframework.web.socket.WebSocketSession
import org.springframework.web.socket.handler.TextWebSocketHandler

@Component
class SignalingHandler(private val registry: SessionRegistry) : TextWebSocketHandler() {

    override fun afterConnectionEstablished(session: WebSocketSession) {
        if (!registry.register(session)) {
            session.close(CloseStatus.SERVICE_OVERLOAD)
        }
    }

    override fun handleTextMessage(session: WebSocketSession, message: TextMessage) {
        registry.getOther(session)?.takeIf { it.isOpen }?.sendMessage(message)
    }

    override fun afterConnectionClosed(session: WebSocketSession, status: CloseStatus) {
        registry.unregister(session)
    }
}
