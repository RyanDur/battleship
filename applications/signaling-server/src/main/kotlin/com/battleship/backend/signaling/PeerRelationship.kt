package com.battleship.backend.signaling

import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.stereotype.Repository

@Entity
class PeerRelationship(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,
    var peerId1: String = "",
    var peerId2: String = "",
)

@Entity
class PeerName(
    @Id
    var peerId: String = "",
    var name: String = "",
)

@Repository
interface PeerRelationshipJpaRepository : JpaRepository<PeerRelationship, Long> {
    @Query("SELECT r FROM PeerRelationship r WHERE r.peerId1 = :peerId OR r.peerId2 = :peerId")
    fun findAllByPeerId(peerId: String): List<PeerRelationship>
}

@Repository
interface PeerNameJpaRepository : JpaRepository<PeerName, String>

@Entity
class ForgottenPair(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,
    var forgetter: String = "",
    var forgotten: String = "",
)

@Repository
interface ForgottenPairJpaRepository : JpaRepository<ForgottenPair, Long> {
    @Query("SELECT f FROM ForgottenPair f WHERE (f.forgetter = :peerId1 AND f.forgotten = :peerId2) OR (f.forgetter = :peerId2 AND f.forgotten = :peerId1)")
    fun findByEitherPeer(peerId1: String, peerId2: String): List<ForgottenPair>
}

@Entity
class PeerEmail(
    @Id
    var peerId: String = "",
    var email: String = "",
)

@Repository
interface PeerEmailJpaRepository : JpaRepository<PeerEmail, String>

@Entity
class SharedEmailPermission(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,
    var sharerPeerId: String = "",
    var receiverPeerId: String = "",
)

@Repository
interface SharedEmailPermissionJpaRepository : JpaRepository<SharedEmailPermission, Long> {
    fun findBySharerPeerIdAndReceiverPeerId(sharerPeerId: String, receiverPeerId: String): SharedEmailPermission?
    fun findBySharerPeerId(sharerPeerId: String): List<SharedEmailPermission>
}

@Entity
class SavedPeerEmail(
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long = 0,
    var saverId: String = "",
    var targetPeerId: String = "",
    var email: String = "",
)

@Repository
interface SavedPeerEmailJpaRepository : JpaRepository<SavedPeerEmail, Long> {
    fun findBySaverIdAndTargetPeerId(saverId: String, targetPeerId: String): SavedPeerEmail?
}

class JpaPeerRelationshipGateway(
    private val jpaRepo: PeerRelationshipJpaRepository,
    private val nameRepo: PeerNameJpaRepository,
    private val forgottenRepo: ForgottenPairJpaRepository,
    private val emailRepo: PeerEmailJpaRepository,
    private val sharingRepo: SharedEmailPermissionJpaRepository,
    private val savedPeerEmailRepo: SavedPeerEmailJpaRepository,
) : PeerRelationshipGateway {

    override fun save(peerId1: String, peerId2: String) {
        val exists = jpaRepo.findAllByPeerId(peerId1).any {
            (it.peerId1 == peerId1 && it.peerId2 == peerId2) ||
            (it.peerId1 == peerId2 && it.peerId2 == peerId1)
        }
        if (!exists) {
            jpaRepo.save(PeerRelationship(peerId1 = peerId1, peerId2 = peerId2))
        }
    }

    override fun findRelated(peerId: String): Set<String> =
        jpaRepo.findAllByPeerId(peerId).map { rel ->
            if (rel.peerId1 == peerId) rel.peerId2 else rel.peerId1
        }.filter { related ->
            forgottenRepo.findByEitherPeer(peerId, related).isEmpty()
        }.toSet()

    override fun saveName(peerId: String, name: String) {
        val existing = nameRepo.findById(peerId).orElse(null)
        if (existing != null) {
            existing.name = name
            nameRepo.save(existing)
        } else {
            nameRepo.save(PeerName(peerId = peerId, name = name))
        }
    }

    override fun findName(peerId: String): String? =
        nameRepo.findById(peerId).orElse(null)?.name

    override fun forget(peerId: String, targetPeerId: String) {
        if (forgottenRepo.findByEitherPeer(peerId, targetPeerId).isEmpty()) {
            forgottenRepo.save(ForgottenPair(forgetter = peerId, forgotten = targetPeerId))
        }
    }

    override fun saveEmail(peerId: String, email: String) {
        val existing = emailRepo.findById(peerId).orElse(null)
        if (existing != null) {
            existing.email = email
            emailRepo.save(existing)
        } else {
            emailRepo.save(PeerEmail(peerId = peerId, email = email))
        }
    }

    override fun findEmail(peerId: String): String? =
        emailRepo.findById(peerId).orElse(null)?.email

    override fun addSharing(sharerPeerId: String, receiverPeerId: String) {
        if (sharingRepo.findBySharerPeerIdAndReceiverPeerId(sharerPeerId, receiverPeerId) == null) {
            sharingRepo.save(SharedEmailPermission(sharerPeerId = sharerPeerId, receiverPeerId = receiverPeerId))
        }
    }

    override fun removeSharing(sharerPeerId: String, receiverPeerId: String) {
        sharingRepo.findBySharerPeerIdAndReceiverPeerId(sharerPeerId, receiverPeerId)?.let {
            sharingRepo.delete(it)
        }
    }

    override fun hasSharing(sharerPeerId: String, receiverPeerId: String): Boolean =
        sharingRepo.findBySharerPeerIdAndReceiverPeerId(sharerPeerId, receiverPeerId) != null

    override fun findSharingReceivers(sharerPeerId: String): List<String> =
        sharingRepo.findBySharerPeerId(sharerPeerId).map { it.receiverPeerId }

    override fun savePeerEmail(saverId: String, targetPeerId: String, email: String) {
        val existing = savedPeerEmailRepo.findBySaverIdAndTargetPeerId(saverId, targetPeerId)
        if (existing != null) {
            existing.email = email
            savedPeerEmailRepo.save(existing)
        } else {
            savedPeerEmailRepo.save(SavedPeerEmail(saverId = saverId, targetPeerId = targetPeerId, email = email))
        }
    }

    override fun findPeerEmail(saverId: String, targetPeerId: String): String? =
        savedPeerEmailRepo.findBySaverIdAndTargetPeerId(saverId, targetPeerId)?.email
}
