package com.battleship.backend.signaling

import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RestController

@RestController
class BoardController(private val gateway: GameBoardGateway) {

    @GetMapping("/board")
    fun getBoard(request: HttpServletRequest, response: HttpServletResponse) {
        val peerId = request.cookies?.firstOrNull { it.name == "peerId" }?.value
            ?: run { response.status = 401; return }
        val boardData = gateway.find(peerId)
            ?: run { response.status = 404; return }
        response.contentType = "text/plain"
        response.writer.write(boardData)
    }

    @PostMapping("/board")
    fun saveBoard(request: HttpServletRequest, response: HttpServletResponse) {
        val peerId = request.cookies?.firstOrNull { it.name == "peerId" }?.value
            ?: run { response.status = 401; return }
        gateway.save(peerId, request.reader.readText())
    }
}