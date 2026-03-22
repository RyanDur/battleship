package com.battleship.backend

import com.battleship.backend.signaling.GameBoardGateway
import jakarta.servlet.http.Cookie
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.assertEquals
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post

@SpringBootTest(properties = ["spring.datasource.url=jdbc:h2:mem:testdb;DB_CLOSE_DELAY=-1"])
@AutoConfigureMockMvc
class BoardFeatureTest {

    @Autowired
    lateinit var mockMvc: MockMvc

    @Autowired
    lateinit var gateway: GameBoardGateway

    private val boardJson = """{"placed":[{"ship":{"name":"Carrier","size":5},"position":{"row":1,"col":1},"orientation":"horizontal"}]}"""

    @Test
    fun `POST board saves the board for the peer`() {
        mockMvc.post("/board") {
            contentType = MediaType.TEXT_PLAIN
            content = boardJson
            cookie(Cookie("peerId", "alice"))
        }.andExpect {
            status { isOk() }
        }

        assertEquals(boardJson, gateway.find("alice"))
    }

    @Test
    fun `GET board returns 404 when no board saved`() {
        mockMvc.get("/board") {
            cookie(Cookie("peerId", "no-board-peer"))
        }.andExpect {
            status { isNotFound() }
        }
    }

    @Test
    fun `GET board returns the saved board data`() {
        gateway.save("bob", boardJson)

        val result = mockMvc.get("/board") {
            cookie(Cookie("peerId", "bob"))
        }.andExpect {
            status { isOk() }
        }.andReturn()

        assertEquals(boardJson, result.response.contentAsString)
    }

    @Test
    fun `GET board returns 401 when no peerId cookie`() {
        mockMvc.get("/board").andExpect {
            status { isUnauthorized() }
        }
    }

    @Test
    fun `POST board returns 401 when no peerId cookie`() {
        mockMvc.post("/board") {
            contentType = MediaType.TEXT_PLAIN
            content = boardJson
        }.andExpect {
            status { isUnauthorized() }
        }
    }
}
