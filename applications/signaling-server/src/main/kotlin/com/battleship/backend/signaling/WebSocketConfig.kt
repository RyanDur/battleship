package com.battleship.backend.signaling

import com.battleship.backend.health.HealthHandler
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Configuration
import org.springframework.web.socket.config.annotation.EnableWebSocket
import org.springframework.web.socket.config.annotation.WebSocketConfigurer
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry

@Configuration
@EnableWebSocket
class WebSocketConfig(
    private val healthHandler: HealthHandler,
    @Value("\${app.allowed-origins}") private val allowedOrigins: String
) : WebSocketConfigurer {

    override fun registerWebSocketHandlers(registry: WebSocketHandlerRegistry) {
        val origins = allowedOrigins.split(",").toTypedArray()
        registry.addHandler(healthHandler, "/ws/health")
            .setAllowedOrigins(*origins)
    }
}
