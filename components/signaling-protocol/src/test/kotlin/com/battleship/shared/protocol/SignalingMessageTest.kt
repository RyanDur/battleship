package com.battleship.shared.protocol

import kotlinx.serialization.json.Json
import kotlin.test.Test
import kotlin.test.assertEquals

class SignalingMessageTest {

    private val json = Json { classDiscriminator = "type" }

    @Test
    fun `serialize and deserialize Offer`() {
        val offer = SignalingMessage.Offer(sdp = "v=0\r\no=- 123 456 IN IP4 127.0.0.1")
        val encoded = json.encodeToString(SignalingMessage.serializer(), offer)
        val decoded = json.decodeFromString(SignalingMessage.serializer(), encoded)
        assertEquals(offer, decoded)
    }

    @Test
    fun `serialize and deserialize Answer`() {
        val answer = SignalingMessage.Answer(sdp = "v=0\r\no=- 789 012 IN IP4 127.0.0.1")
        val encoded = json.encodeToString(SignalingMessage.serializer(), answer)
        val decoded = json.decodeFromString(SignalingMessage.serializer(), encoded)
        assertEquals(answer, decoded)
    }

    @Test
    fun `serialize and deserialize IceCandidate`() {
        val candidate = SignalingMessage.IceCandidate(candidate = "candidate:1 1 UDP 2130706431 192.168.1.1 5000 typ host")
        val encoded = json.encodeToString(SignalingMessage.serializer(), candidate)
        val decoded = json.decodeFromString(SignalingMessage.serializer(), encoded)
        assertEquals(candidate, decoded)
    }

    @Test
    fun `serialize and deserialize Error`() {
        val error = SignalingMessage.Error(message = "connection refused")
        val encoded = json.encodeToString(SignalingMessage.serializer(), error)
        val decoded = json.decodeFromString(SignalingMessage.serializer(), encoded)
        assertEquals(error, decoded)
    }

    @Test
    fun `Offer serializes with correct type discriminator`() {
        val offer = SignalingMessage.Offer(sdp = "test-sdp")
        val encoded = json.encodeToString(SignalingMessage.serializer(), offer)
        assert(encoded.contains("\"type\":\"OFFER\"")) { "Expected type discriminator OFFER in: $encoded" }
        assert(encoded.contains("\"sdp\":\"test-sdp\"")) { "Expected sdp field in: $encoded" }
    }

    @Test
    fun `Answer serializes with correct type discriminator`() {
        val answer = SignalingMessage.Answer(sdp = "test-sdp")
        val encoded = json.encodeToString(SignalingMessage.serializer(), answer)
        assert(encoded.contains("\"type\":\"ANSWER\"")) { "Expected type discriminator ANSWER in: $encoded" }
    }

    @Test
    fun `IceCandidate serializes with correct type discriminator`() {
        val candidate = SignalingMessage.IceCandidate(candidate = "test-candidate")
        val encoded = json.encodeToString(SignalingMessage.serializer(), candidate)
        assert(encoded.contains("\"type\":\"ICE_CANDIDATE\"")) { "Expected type discriminator ICE_CANDIDATE in: $encoded" }
    }

    @Test
    fun `Error serializes with correct type discriminator`() {
        val error = SignalingMessage.Error(message = "something broke")
        val encoded = json.encodeToString(SignalingMessage.serializer(), error)
        assert(encoded.contains("\"type\":\"ERROR\"")) { "Expected type discriminator ERROR in: $encoded" }
    }

    @Test
    fun `PeerConnected serializes with correct type discriminator`() {
        val encoded = json.encodeToString(SignalingMessage.serializer(), SignalingMessage.PeerConnected)
        assert(encoded.contains("\"type\":\"PEER_CONNECTED\"")) { "Expected type discriminator PEER_CONNECTED in: $encoded" }
    }

    @Test
    fun `serialize and deserialize PeerConnected`() {
        val encoded = json.encodeToString(SignalingMessage.serializer(), SignalingMessage.PeerConnected)
        val decoded = json.decodeFromString(SignalingMessage.serializer(), encoded)
        assertEquals(SignalingMessage.PeerConnected, decoded)
    }
}
