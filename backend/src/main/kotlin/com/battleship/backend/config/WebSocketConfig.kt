package com.battleship.backend.config

import com.battleship.backend.signaling.SessionRegistry
import com.battleship.backend.signaling.SignalingHandler
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpStatus
import org.springframework.http.server.ServerHttpRequest
import org.springframework.http.server.ServerHttpResponse
import org.springframework.web.socket.WebSocketHandler
import org.springframework.web.socket.config.annotation.EnableWebSocket
import org.springframework.web.socket.config.annotation.WebSocketConfigurer
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry
import org.springframework.web.socket.server.HandshakeInterceptor

@Configuration
@EnableWebSocket
class WebSocketConfig(
    private val signalingHandler: SignalingHandler,
    private val sessionRegistry: SessionRegistry
) : WebSocketConfigurer {

    companion object {
        val ALLOWED_ORIGINS = setOf(
            "http://localhost:5173",
            "https://ryandur.github.io"
        )
    }

    override fun registerWebSocketHandlers(registry: WebSocketHandlerRegistry) {
        registry.addHandler(signalingHandler, "/ws/signaling")
            .addInterceptors(AuthHandshakeInterceptor(sessionRegistry))
            .setAllowedOrigins(*ALLOWED_ORIGINS.toTypedArray())
    }
}

class AuthHandshakeInterceptor(private val sessionRegistry: SessionRegistry) : HandshakeInterceptor {

    override fun beforeHandshake(
        request: ServerHttpRequest,
        response: ServerHttpResponse,
        wsHandler: WebSocketHandler,
        attributes: MutableMap<String, Any>
    ): Boolean {
        val token = request.uri.query
            ?.split("&")
            ?.map { it.split("=") }
            ?.firstOrNull { it.size == 2 && it[0] == "token" }
            ?.get(1)

        if (token.isNullOrBlank()) {
            response.setStatusCode(HttpStatus.UNAUTHORIZED)
            return false
        }

        if (sessionRegistry.isFull()) {
            response.setStatusCode(HttpStatus.SERVICE_UNAVAILABLE)
            return false
        }

        attributes["token"] = token
        return true
    }

    override fun afterHandshake(
        request: ServerHttpRequest,
        response: ServerHttpResponse,
        wsHandler: WebSocketHandler,
        exception: Exception?
    ) {}
}
