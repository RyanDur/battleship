package com.battleship.shared.protocol

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
sealed class SignalingMessage {

    @Serializable
    @SerialName("OFFER")
    data class Offer(val sdp: String) : SignalingMessage()

    @Serializable
    @SerialName("ANSWER")
    data class Answer(val sdp: String) : SignalingMessage()

    @Serializable
    @SerialName("ICE_CANDIDATE")
    data class IceCandidate(val candidate: String) : SignalingMessage()

    @Serializable
    @SerialName("ERROR")
    data class Error(val message: String) : SignalingMessage()

    @Serializable
    @SerialName("PEER_CONNECTED")
    data object PeerConnected : SignalingMessage()
}
