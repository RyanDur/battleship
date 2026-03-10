package com.battleship.backend.health

import org.springframework.beans.factory.annotation.Value
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController

@RestController
class HealthController(@Value("\${app.version}") private val version: String) {

    @GetMapping("/health")
    fun health(): Map<String, String> = mapOf("status" to "up", "version" to version)
}
