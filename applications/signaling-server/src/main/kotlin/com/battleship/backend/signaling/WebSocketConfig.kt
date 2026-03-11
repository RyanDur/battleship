package com.battleship.backend.signaling

import com.battleship.shared.Result
import com.battleship.shared.asFailure
import com.battleship.shared.asSuccess
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpStatus
import org.springframework.http.server.ServerHttpRequest
import org.springframework.http.server.ServerHttpResponse
import org.springframework.web.socket.WebSocketHandler
import org.springframework.web.socket.config.annotation.EnableWebSocket
import org.springframework.web.socket.config.annotation.WebSocketConfigurer
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry
import org.springframework.web.socket.server.HandshakeInterceptor

sealed class HandshakeError(val status: HttpStatus) {
    data object MissingToken : HandshakeError(HttpStatus.UNAUTHORIZED)
    data object RegistryFull : HandshakeError(HttpStatus.SERVICE_UNAVAILABLE)
}

@Configuration
@EnableWebSocket
class WebSocketConfig(
    private val signalingHandler: SignalingHandler,
    private val healthHandler: com.battleship.backend.health.HealthHandler,
    private val sessionRegistry: SessionRegistry,
    @Value("\${app.allowed-origins}") private val allowedOrigins: String
) : WebSocketConfigurer {

    override fun registerWebSocketHandlers(registry: WebSocketHandlerRegistry) {
        val origins = allowedOrigins.split(",").toTypedArray()
        registry.addHandler(signalingHandler, "/ws/signaling")
            .addInterceptors(AuthHandshakeInterceptor(sessionRegistry))
            .setAllowedOrigins(*origins)
        registry.addHandler(healthHandler, "/ws/health")
            .setAllowedOrigins(*origins)
    }
}

class AuthHandshakeInterceptor(private val sessionRegistry: SessionRegistry) : HandshakeInterceptor {

    override fun beforeHandshake(
        request: ServerHttpRequest,
        response: ServerHttpResponse,
        wsHandler: WebSocketHandler,
        attributes: MutableMap<String, Any>
    ): Boolean = validateToken(request)
        .flatMap { token -> validateCapacity(token) }
        .mapEither(
            onSuccess = { token -> attributes["token"] = token; true },
            onFailure = { error -> response.setStatusCode(error.status); false }
        )

    private fun validateToken(request: ServerHttpRequest): Result<String, HandshakeError> {
        val token = request.uri.query
            ?.split("&")
            ?.map { it.split("=") }
            ?.firstOrNull { it.size == 2 && it[0] == "token" }
            ?.get(1)
        return if (token.isNullOrBlank()) HandshakeError.MissingToken.asFailure()
        else token.asSuccess()
    }

    private fun validateCapacity(token: String): Result<String, HandshakeError> =
        if (sessionRegistry.isFull()) HandshakeError.RegistryFull.asFailure()
        else token.asSuccess()

    override fun afterHandshake(
        request: ServerHttpRequest,
        response: ServerHttpResponse,
        wsHandler: WebSocketHandler,
        exception: Exception?
    ) {}
}
