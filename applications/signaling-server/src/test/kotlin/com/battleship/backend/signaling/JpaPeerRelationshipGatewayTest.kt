package com.battleship.backend.signaling

import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest
import org.springframework.test.annotation.Commit
import org.springframework.test.context.transaction.TestTransaction
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional

@DataJpaTest
class JpaPeerRelationshipGatewayTest {

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

    @Autowired
    lateinit var savedPeerEmailRepo: SavedPeerEmailJpaRepository

    @Test
    fun `saved relationship is findable from either peer's perspective`() {
        val gateway = JpaPeerRelationshipGateway(jpaRepo, nameRepo, forgottenRepo, emailRepo, sharingRepo, savedPeerEmailRepo)

        gateway.save("alice", "bob")

        assertEquals(setOf("bob"), gateway.findRelated("alice"))
        assertEquals(setOf("alice"), gateway.findRelated("bob"))
    }

    @Test
    fun `saving the same relationship twice does not create duplicates`() {
        val gateway = JpaPeerRelationshipGateway(jpaRepo, nameRepo, forgottenRepo, emailRepo, sharingRepo, savedPeerEmailRepo)

        gateway.save("alice", "bob")
        gateway.save("alice", "bob")

        assertEquals(setOf("bob"), gateway.findRelated("alice"))
    }

    @Test
    fun `saving reverse order does not create duplicate`() {
        val gateway = JpaPeerRelationshipGateway(jpaRepo, nameRepo, forgottenRepo, emailRepo, sharingRepo, savedPeerEmailRepo)

        gateway.save("alice", "bob")
        gateway.save("bob", "alice")

        assertEquals(setOf("bob"), gateway.findRelated("alice"))
        assertEquals(setOf("alice"), gateway.findRelated("bob"))
    }

    @Test
    fun `findRelated returns empty when no relationships`() {
        val gateway = JpaPeerRelationshipGateway(jpaRepo, nameRepo, forgottenRepo, emailRepo, sharingRepo, savedPeerEmailRepo)

        val result = gateway.findRelated("alice")

        assertTrue(result.isEmpty())
    }

    @Test
    fun `saved name is findable`() {
        val gateway = JpaPeerRelationshipGateway(jpaRepo, nameRepo, forgottenRepo, emailRepo, sharingRepo, savedPeerEmailRepo)

        gateway.saveName("alice", "Alice")

        assertEquals("Alice", gateway.findName("alice"))
    }

    @Test
    fun `findName returns null when name not saved`() {
        val gateway = JpaPeerRelationshipGateway(jpaRepo, nameRepo, forgottenRepo, emailRepo, sharingRepo, savedPeerEmailRepo)

        assertNull(gateway.findName("unknown"))
    }

    @Test
    fun `saveName overwrites previous name`() {
        val gateway = JpaPeerRelationshipGateway(jpaRepo, nameRepo, forgottenRepo, emailRepo, sharingRepo, savedPeerEmailRepo)

        gateway.saveName("alice", "Alice")
        gateway.saveName("alice", "Alicia")

        assertEquals("Alicia", gateway.findName("alice"))
    }

    @Test
    @Commit
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    fun `saveName is idempotent when the same peer reconnects in a separate session`() {
        val gateway = JpaPeerRelationshipGateway(jpaRepo, nameRepo, forgottenRepo, emailRepo, sharingRepo, savedPeerEmailRepo)

        // First session: peer registers (e.g., via the installed app)
        gateway.saveName("reconnecting-peer", "Player")

        // Second session: same browser UUID reconnects to the dev server
        gateway.saveName("reconnecting-peer", "Player")

        assertEquals("Player", gateway.findName("reconnecting-peer"))

        // Cleanup since @Commit is needed to create separate transactions
        nameRepo.deleteById("reconnecting-peer")
    }

    @Test
    fun `forget removes peer from findRelated results`() {
        val gateway = JpaPeerRelationshipGateway(jpaRepo, nameRepo, forgottenRepo, emailRepo, sharingRepo, savedPeerEmailRepo)

        gateway.save("alice", "bob")
        gateway.forget("alice", "bob")

        assertTrue(gateway.findRelated("alice").isEmpty())
    }

    @Test
    fun `forget is symmetric - forgotten peer also cannot find forgetful peer`() {
        val gateway = JpaPeerRelationshipGateway(jpaRepo, nameRepo, forgottenRepo, emailRepo, sharingRepo, savedPeerEmailRepo)

        gateway.save("alice", "bob")
        gateway.forget("alice", "bob")

        assertTrue(gateway.findRelated("bob").isEmpty())
    }

    @Test
    fun `saved email is findable`() {
        val gateway = JpaPeerRelationshipGateway(jpaRepo, nameRepo, forgottenRepo, emailRepo, sharingRepo, savedPeerEmailRepo)

        gateway.saveEmail("alice", "alice@example.com")

        assertEquals("alice@example.com", gateway.findEmail("alice"))
    }

    @Test
    fun `findEmail returns null when not saved`() {
        val gateway = JpaPeerRelationshipGateway(jpaRepo, nameRepo, forgottenRepo, emailRepo, sharingRepo, savedPeerEmailRepo)

        assertNull(gateway.findEmail("unknown"))
    }

    @Test
    fun `saveEmail overwrites previous email`() {
        val gateway = JpaPeerRelationshipGateway(jpaRepo, nameRepo, forgottenRepo, emailRepo, sharingRepo, savedPeerEmailRepo)

        gateway.saveEmail("alice", "old@example.com")
        gateway.saveEmail("alice", "new@example.com")

        assertEquals("new@example.com", gateway.findEmail("alice"))
    }

    @Test
    fun `addSharing makes hasSharing return true`() {
        val gateway = JpaPeerRelationshipGateway(jpaRepo, nameRepo, forgottenRepo, emailRepo, sharingRepo, savedPeerEmailRepo)

        gateway.addSharing("alice", "bob")

        assertTrue(gateway.hasSharing("alice", "bob"))
    }

    @Test
    fun `hasSharing returns false when not added`() {
        val gateway = JpaPeerRelationshipGateway(jpaRepo, nameRepo, forgottenRepo, emailRepo, sharingRepo, savedPeerEmailRepo)

        assertTrue(!gateway.hasSharing("alice", "bob"))
    }

    @Test
    fun `removeSharing makes hasSharing return false`() {
        val gateway = JpaPeerRelationshipGateway(jpaRepo, nameRepo, forgottenRepo, emailRepo, sharingRepo, savedPeerEmailRepo)

        gateway.addSharing("alice", "bob")
        gateway.removeSharing("alice", "bob")

        assertTrue(!gateway.hasSharing("alice", "bob"))
    }

    @Test
    fun `sharing is directional - alice sharing with bob does not mean bob sharing with alice`() {
        val gateway = JpaPeerRelationshipGateway(jpaRepo, nameRepo, forgottenRepo, emailRepo, sharingRepo, savedPeerEmailRepo)

        gateway.addSharing("alice", "bob")

        assertTrue(!gateway.hasSharing("bob", "alice"))
    }

    @Test
    fun `savePeerEmail makes findPeerEmail return the saved email`() {
        val gateway = JpaPeerRelationshipGateway(jpaRepo, nameRepo, forgottenRepo, emailRepo, sharingRepo, savedPeerEmailRepo)

        gateway.savePeerEmail("alice", "bob", "bob@example.com")

        assertEquals("bob@example.com", gateway.findPeerEmail("alice", "bob"))
    }

    @Test
    fun `findPeerEmail returns null when not saved`() {
        val gateway = JpaPeerRelationshipGateway(jpaRepo, nameRepo, forgottenRepo, emailRepo, sharingRepo, savedPeerEmailRepo)

        assertNull(gateway.findPeerEmail("alice", "bob"))
    }

    @Test
    fun `savePeerEmail overwrites previous saved email`() {
        val gateway = JpaPeerRelationshipGateway(jpaRepo, nameRepo, forgottenRepo, emailRepo, sharingRepo, savedPeerEmailRepo)

        gateway.savePeerEmail("alice", "bob", "old@example.com")
        gateway.savePeerEmail("alice", "bob", "new@example.com")

        assertEquals("new@example.com", gateway.findPeerEmail("alice", "bob"))
    }

    @Test
    fun `savePeerEmail is directional - alice saving bob's email does not affect bob's view of alice`() {
        val gateway = JpaPeerRelationshipGateway(jpaRepo, nameRepo, forgottenRepo, emailRepo, sharingRepo, savedPeerEmailRepo)

        gateway.savePeerEmail("alice", "bob", "bob@example.com")

        assertNull(gateway.findPeerEmail("bob", "alice"))
    }

    @Test
    fun `findSharingReceivers returns all peers the sharer is sharing with`() {
        val gateway = JpaPeerRelationshipGateway(jpaRepo, nameRepo, forgottenRepo, emailRepo, sharingRepo, savedPeerEmailRepo)

        gateway.addSharing("alice", "bob")
        gateway.addSharing("alice", "carol")

        assertEquals(setOf("bob", "carol"), gateway.findSharingReceivers("alice").toSet())
    }

    @Test
    fun `findSharingReceivers returns empty when sharer has no active sharing`() {
        val gateway = JpaPeerRelationshipGateway(jpaRepo, nameRepo, forgottenRepo, emailRepo, sharingRepo, savedPeerEmailRepo)

        assertEquals(emptyList<String>(), gateway.findSharingReceivers("alice"))
    }

    @Test
    fun `findSharingReceivers does not include peers who share with the sharer`() {
        val gateway = JpaPeerRelationshipGateway(jpaRepo, nameRepo, forgottenRepo, emailRepo, sharingRepo, savedPeerEmailRepo)

        gateway.addSharing("bob", "alice")

        assertEquals(emptyList<String>(), gateway.findSharingReceivers("alice"))
    }
}
