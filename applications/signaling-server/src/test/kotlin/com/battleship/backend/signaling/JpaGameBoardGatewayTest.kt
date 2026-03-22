package com.battleship.backend.signaling

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest

@DataJpaTest
class JpaGameBoardGatewayTest {

    @Autowired
    lateinit var repo: PlayerBoardJpaRepository

    @Test
    fun `saved board data is findable`() {
        val gateway = JpaGameBoardGateway(repo)

        gateway.save("alice", """{"placed":[]}""")

        assertEquals("""{"placed":[]}""", gateway.find("alice"))
    }

    @Test
    fun `find returns null when no board saved`() {
        val gateway = JpaGameBoardGateway(repo)

        assertNull(gateway.find("alice"))
    }

    @Test
    fun `saving board twice overwrites first`() {
        val gateway = JpaGameBoardGateway(repo)

        gateway.save("alice", """{"placed":[]}""")
        gateway.save("alice", """{"placed":[{"ship":"Carrier"}]}""")

        assertEquals("""{"placed":[{"ship":"Carrier"}]}""", gateway.find("alice"))
    }

    @Test
    fun `boards are stored per peer`() {
        val gateway = JpaGameBoardGateway(repo)

        gateway.save("alice", """{"placed":[]}""")
        gateway.save("bob", """{"placed":[{"ship":"Destroyer"}]}""")

        assertEquals("""{"placed":[]}""", gateway.find("alice"))
        assertEquals("""{"placed":[{"ship":"Destroyer"}]}""", gateway.find("bob"))
    }
}