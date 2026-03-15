package com.battleship.backend.signaling

import jakarta.servlet.http.Cookie
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RestController
import java.util.UUID

@RestController
class SessionController {

    @GetMapping("/session")
    fun session(request: HttpServletRequest, response: HttpServletResponse) {
        val existing = request.cookies?.firstOrNull { it.name == "peerId" }
        val peerId = existing?.value ?: UUID.randomUUID().toString()

        val cookie = Cookie("peerId", peerId).apply {
            isHttpOnly = true
            secure = true
            setAttribute("SameSite", "None")
            maxAge = 60 * 60 * 24 * 365
            path = "/"
        }
        response.addCookie(cookie)
    }
}
