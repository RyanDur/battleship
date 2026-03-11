package com.battleship.backend.health

import org.springframework.beans.factory.annotation.Value
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component
import org.springframework.web.socket.CloseStatus
import org.springframework.web.socket.TextMessage
import org.springframework.web.socket.WebSocketSession
import org.springframework.web.socket.handler.TextWebSocketHandler
import java.util.concurrent.CopyOnWriteArrayList

@Component
class HealthHandler(@Value("\${app.version}") private val version: String) : TextWebSocketHandler() {

    private val sessions = CopyOnWriteArrayList<WebSocketSession>()

    override fun afterConnectionEstablished(session: WebSocketSession) {
        sessions.add(session)
    }

    override fun afterConnectionClosed(session: WebSocketSession, status: CloseStatus) {
        sessions.remove(session)
    }

    @Scheduled(fixedRateString = "\${app.heartbeat-interval}")
    fun sendHeartbeat() {
        val message = TextMessage("""{"type":"heartbeat","version":"$version"}""")
        sessions.filter { it.isOpen }.forEach { it.sendMessage(message) }
    }
}
