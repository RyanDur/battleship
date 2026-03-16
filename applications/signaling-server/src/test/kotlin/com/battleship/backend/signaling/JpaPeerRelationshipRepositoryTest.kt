package com.battleship.backend.signaling

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest

@DataJpaTest
class JpaPeerRelationshipRepositoryTest {

    @Autowired
    lateinit var jpaRepo: PeerRelationshipJpaRepository

    @Test
    fun `saved relationship is findable from either peer's perspective`() {
        val repo = JpaPeerRelationshipRepository(jpaRepo)

        repo.save("alice", "bob")

        assertEquals(setOf("bob"), repo.findRelated("alice"))
        assertEquals(setOf("alice"), repo.findRelated("bob"))
    }

    @Test
    fun `saving the same relationship twice does not create duplicates`() {
        val repo = JpaPeerRelationshipRepository(jpaRepo)

        repo.save("alice", "bob")
        repo.save("alice", "bob")

        assertEquals(setOf("bob"), repo.findRelated("alice"))
    }

    @Test
    fun `saving reverse order does not create duplicate`() {
        val repo = JpaPeerRelationshipRepository(jpaRepo)

        repo.save("alice", "bob")
        repo.save("bob", "alice")

        assertEquals(setOf("bob"), repo.findRelated("alice"))
        assertEquals(setOf("alice"), repo.findRelated("bob"))
    }

    @Test
    fun `findRelated returns empty when no relationships`() {
        val repo = JpaPeerRelationshipRepository(jpaRepo)

        val result = repo.findRelated("alice")

        assertTrue(result.isEmpty())
    }
}