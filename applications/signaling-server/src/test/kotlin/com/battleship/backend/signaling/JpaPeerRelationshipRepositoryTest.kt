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

    @Autowired
    lateinit var emailRepo: PeerEmailJpaRepository

    @Autowired
    lateinit var sharingRepo: SharedEmailPermissionJpaRepository

    @Test
    fun `saved relationship is findable from either peer's perspective`() {
        val repo = JpaPeerRelationshipRepository(jpaRepo, nameRepo, forgottenRepo, emailRepo, sharingRepo)

        repo.save("alice", "bob")

        assertEquals(setOf("bob"), repo.findRelated("alice"))
        assertEquals(setOf("alice"), repo.findRelated("bob"))
    }

    @Test
    fun `saving the same relationship twice does not create duplicates`() {
        val repo = JpaPeerRelationshipRepository(jpaRepo, nameRepo, forgottenRepo, emailRepo, sharingRepo)

        repo.save("alice", "bob")
        repo.save("alice", "bob")

        assertEquals(setOf("bob"), repo.findRelated("alice"))
    }

    @Test
    fun `saving reverse order does not create duplicate`() {
        val repo = JpaPeerRelationshipRepository(jpaRepo, nameRepo, forgottenRepo, emailRepo, sharingRepo)

        repo.save("alice", "bob")
        repo.save("bob", "alice")

        assertEquals(setOf("bob"), repo.findRelated("alice"))
        assertEquals(setOf("alice"), repo.findRelated("bob"))
    }

    @Test
    fun `findRelated returns empty when no relationships`() {
        val repo = JpaPeerRelationshipRepository(jpaRepo, nameRepo, forgottenRepo, emailRepo, sharingRepo)

        val result = repo.findRelated("alice")

        assertTrue(result.isEmpty())
    }

    @Test
    fun `saved name is findable`() {
        val repo = JpaPeerRelationshipRepository(jpaRepo, nameRepo, forgottenRepo, emailRepo, sharingRepo)

        repo.saveName("alice", "Alice")

        assertEquals("Alice", repo.findName("alice"))
    }

    @Test
    fun `findName returns null when name not saved`() {
        val repo = JpaPeerRelationshipRepository(jpaRepo, nameRepo, forgottenRepo, emailRepo, sharingRepo)

        assertNull(repo.findName("unknown"))
    }

    @Test
    fun `saveName overwrites previous name`() {
        val repo = JpaPeerRelationshipRepository(jpaRepo, nameRepo, forgottenRepo, emailRepo, sharingRepo)

        repo.saveName("alice", "Alice")
        repo.saveName("alice", "Alicia")

        assertEquals("Alicia", repo.findName("alice"))
    }

    @Test
    fun `forget removes peer from findRelated results`() {
        val repo = JpaPeerRelationshipRepository(jpaRepo, nameRepo, forgottenRepo, emailRepo, sharingRepo)

        repo.save("alice", "bob")
        repo.forget("alice", "bob")

        assertTrue(repo.findRelated("alice").isEmpty())
    }

    @Test
    fun `forget is symmetric - forgotten peer also cannot find forgetful peer`() {
        val repo = JpaPeerRelationshipRepository(jpaRepo, nameRepo, forgottenRepo, emailRepo, sharingRepo)

        repo.save("alice", "bob")
        repo.forget("alice", "bob")

        assertTrue(repo.findRelated("bob").isEmpty())
    }

    @Test
    fun `saved email is findable`() {
        val repo = JpaPeerRelationshipRepository(jpaRepo, nameRepo, forgottenRepo, emailRepo, sharingRepo)

        repo.saveEmail("alice", "alice@example.com")

        assertEquals("alice@example.com", repo.findEmail("alice"))
    }

    @Test
    fun `findEmail returns null when not saved`() {
        val repo = JpaPeerRelationshipRepository(jpaRepo, nameRepo, forgottenRepo, emailRepo, sharingRepo)

        assertNull(repo.findEmail("unknown"))
    }

    @Test
    fun `saveEmail overwrites previous email`() {
        val repo = JpaPeerRelationshipRepository(jpaRepo, nameRepo, forgottenRepo, emailRepo, sharingRepo)

        repo.saveEmail("alice", "old@example.com")
        repo.saveEmail("alice", "new@example.com")

        assertEquals("new@example.com", repo.findEmail("alice"))
    }

    @Test
    fun `addSharing makes hasSharing return true`() {
        val repo = JpaPeerRelationshipRepository(jpaRepo, nameRepo, forgottenRepo, emailRepo, sharingRepo)

        repo.addSharing("alice", "bob")

        assertTrue(repo.hasSharing("alice", "bob"))
    }

    @Test
    fun `hasSharing returns false when not added`() {
        val repo = JpaPeerRelationshipRepository(jpaRepo, nameRepo, forgottenRepo, emailRepo, sharingRepo)

        assertTrue(!repo.hasSharing("alice", "bob"))
    }

    @Test
    fun `removeSharing makes hasSharing return false`() {
        val repo = JpaPeerRelationshipRepository(jpaRepo, nameRepo, forgottenRepo, emailRepo, sharingRepo)

        repo.addSharing("alice", "bob")
        repo.removeSharing("alice", "bob")

        assertTrue(!repo.hasSharing("alice", "bob"))
    }

    @Test
    fun `sharing is directional - alice sharing with bob does not mean bob sharing with alice`() {
        val repo = JpaPeerRelationshipRepository(jpaRepo, nameRepo, forgottenRepo, emailRepo, sharingRepo)

        repo.addSharing("alice", "bob")

        assertTrue(!repo.hasSharing("bob", "alice"))
    }
}
