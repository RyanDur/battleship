package com.battleship.backend

import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get

@SpringBootTest
@AutoConfigureMockMvc
class HealthEndpointFeatureTest {

    @Autowired
    lateinit var mockMvc: MockMvc

    @Test
    fun `local service responds to health check with status and version`() {
        mockMvc.get("/health")
            .andExpect {
                status { isOk() }
                content { json("""{"status":"up","version":"0.0.0-dev"}""") }
            }
    }
}
