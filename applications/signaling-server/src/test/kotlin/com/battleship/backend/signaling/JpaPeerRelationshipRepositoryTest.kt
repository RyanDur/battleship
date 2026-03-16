package com.battleship.backend.signaling

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest

@DataJpaTest
class JpaPeerRelationshipRepositoryTest {

    @Autowired
    lateinit var jpaRepo: PeerRelationshipJpaRepository

    @Autowired
    lateinit var nameRepo: PeerNameJpaRepository

    @Autowired
    lateinit var forgottenRepo: ForgottenPairJpaRepository

    @Test
    fun `saved relationship is findable from either peer's perspective`() {
        val repo = JpaPeerRelationshipRepository(jpaRepo, nameRepo, forgottenRepo)

        repo.save("alice", "bob")

        assertEquals(setOf("bob"), repo.findRelated("alice"))
        assertEquals(setOf("alice"), repo.findRelated("bob"))
    }

    @Test
    fun `saving the same relationship twice does not create duplicates`() {
        val repo = JpaPeerRelationshipRepository(jpaRepo, nameRepo, forgottenRepo)

        repo.save("alice", "bob")
        repo.save("alice", "bob")

        assertEquals(setOf("bob"), repo.findRelated("alice"))
    }

    @Test
    fun `saving reverse order does not create duplicate`() {
        val repo = JpaPeerRelationshipRepository(jpaRepo, nameRepo, forgottenRepo)

        repo.save("alice", "bob")
        repo.save("bob", "alice")

        assertEquals(setOf("bob"), repo.findRelated("alice"))
        assertEquals(setOf("alice"), repo.findRelated("bob"))
    }

    @Test
    fun `findRelated returns empty when no relationships`() {
        val repo = JpaPeerRelationshipRepository(jpaRepo, nameRepo, forgottenRepo)

        val result = repo.findRelated("alice")

        assertTrue(result.isEmpty())
    }

    @Test
    fun `saved name is findable`() {
        val repo = JpaPeerRelationshipRepository(jpaRepo, nameRepo, forgottenRepo)

        repo.saveName("alice", "Alice")

        assertEquals("Alice", repo.findName("alice"))
    }

    @Test
    fun `findName returns null when name not saved`() {
        val repo = JpaPeerRelationshipRepository(jpaRepo, nameRepo, forgottenRepo)

        assertNull(repo.findName("unknown"))
    }

    @Test
    fun `saveName overwrites previous name`() {
        val repo = JpaPeerRelationshipRepository(jpaRepo, nameRepo, forgottenRepo)

        repo.saveName("alice", "Alice")
        repo.saveName("alice", "Alicia")

        assertEquals("Alicia", repo.findName("alice"))
    }

    @Test
    fun `forget removes peer from findRelated results`() {
        val repo = JpaPeerRelationshipRepository(jpaRepo, nameRepo, forgottenRepo)

        repo.save("alice", "bob")
        repo.forget("alice", "bob")

        assertTrue(repo.findRelated("alice").isEmpty())
    }

    @Test
    fun `forget is symmetric - forgotten peer also cannot find forgetful peer`() {
        val repo = JpaPeerRelationshipRepository(jpaRepo, nameRepo, forgottenRepo)

        repo.save("alice", "bob")
        repo.forget("alice", "bob")

        assertTrue(repo.findRelated("bob").isEmpty())
    }
}
