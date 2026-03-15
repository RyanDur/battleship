package com.battleship.backend.signaling

import com.battleship.backend.health.HealthHandler
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Configuration
import org.springframework.http.server.ServerHttpRequest
import org.springframework.http.server.ServerHttpResponse
import org.springframework.http.server.ServletServerHttpRequest
import org.springframework.web.socket.WebSocketHandler
import org.springframework.web.socket.config.annotation.EnableWebSocket
import org.springframework.web.socket.config.annotation.WebSocketConfigurer
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry
import org.springframework.web.socket.server.HandshakeInterceptor

@Configuration
@EnableWebSocket
class WebSocketConfig(
    private val healthHandler: HealthHandler,
    private val signalingHandler: SignalingHandler,
    @Value("\${app.allowed-origins}") private val allowedOrigins: String
) : WebSocketConfigurer {

    override fun registerWebSocketHandlers(registry: WebSocketHandlerRegistry) {
        val origins = allowedOrigins.split(",").toTypedArray()
        registry.addHandler(healthHandler, "/ws/health")
            .setAllowedOrigins(*origins)
        registry.addHandler(signalingHandler, "/ws/signaling")
            .setAllowedOrigins(*origins)
            .addInterceptors(PeerIdHandshakeInterceptor())
    }
}

class PeerIdHandshakeInterceptor : HandshakeInterceptor {
    override fun beforeHandshake(
        request: ServerHttpRequest,
        response: ServerHttpResponse,
        wsHandler: WebSocketHandler,
        attributes: MutableMap<String, Any>
    ): Boolean {
        val servletRequest = (request as? ServletServerHttpRequest)?.servletRequest
        val peerId = servletRequest?.cookies?.firstOrNull { it.name == "peerId" }?.value
        if (peerId != null) attributes["peerId"] = peerId
        return true
    }

    override fun afterHandshake(
        request: ServerHttpRequest,
        response: ServerHttpResponse,
        wsHandler: WebSocketHandler,
        exception: Exception?
    ) = Unit
}
