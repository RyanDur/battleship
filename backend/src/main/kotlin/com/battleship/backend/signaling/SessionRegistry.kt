package com.battleship.backend.signaling

import org.springframework.stereotype.Component
import org.springframework.web.socket.WebSocketSession
import java.util.concurrent.CopyOnWriteArrayList

@Component
class SessionRegistry {

    private val sessions = CopyOnWriteArrayList<WebSocketSession>()

    fun register(session: WebSocketSession): Boolean {
        if (sessions.size >= 2) return false
        sessions.add(session)
        return true
    }

    fun unregister(session: WebSocketSession) {
        sessions.remove(session)
    }

    fun getOther(session: WebSocketSession): WebSocketSession? =
        sessions.firstOrNull { it.id != session.id }

    fun isFull(): Boolean = sessions.size >= 2
}
