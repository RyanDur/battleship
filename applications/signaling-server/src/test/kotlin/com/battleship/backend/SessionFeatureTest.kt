package com.battleship.backend

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertEquals
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get

@SpringBootTest
@AutoConfigureMockMvc
class SessionFeatureTest {

    @Autowired
    lateinit var mockMvc: MockMvc

    @Test
    fun `GET session sets a peerId cookie`() {
        val result = mockMvc.get("/session").andExpect {
            status { isOk() }
            cookie { exists("peerId") }
        }.andReturn()

        val cookie = result.response.getCookie("peerId")
        assertNotNull(cookie)
        assertNotNull(cookie!!.value)
    }

    @Test
    fun `GET session preserves existing peerId cookie`() {
        val firstResult = mockMvc.get("/session").andReturn()
        val peerId = firstResult.response.getCookie("peerId")!!.value

        mockMvc.get("/session") {
            cookie(jakarta.servlet.http.Cookie("peerId", peerId))
        }.andExpect {
            status { isOk() }
            cookie { value("peerId", peerId) }
        }
    }
}
