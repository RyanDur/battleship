package com.battleship.backend.signaling

import com.battleship.shared.Result
import com.battleship.shared.asFailure
import com.battleship.shared.asSuccess
import org.springframework.stereotype.Component
import org.springframework.web.socket.WebSocketSession
import java.util.concurrent.CopyOnWriteArrayList

sealed class RegistrationError {
    data object Full : RegistrationError()
}

@Component
class SessionRegistry {

    private val sessions = CopyOnWriteArrayList<WebSocketSession>()

    fun register(session: WebSocketSession): Result<WebSocketSession, RegistrationError> =
        if (sessions.size >= 2) RegistrationError.Full.asFailure()
        else session.also { sessions.add(it) }.asSuccess()

    fun unregister(session: WebSocketSession) {
        sessions.remove(session)
    }

    fun peer(session: WebSocketSession): WebSocketSession? =
        sessions.firstOrNull { it.id != session.id }

    fun isFull(): Boolean = sessions.size >= 2
}
