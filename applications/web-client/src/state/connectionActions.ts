import type {OnlinePeer, PreviousPeer, GameState, Shot, GamePhase, P2pGame, P2pGamePhase} from './connections';
import type {Board} from '../game/board';

export const createOffer = (passphrase: string) => ({type: 'CREATE_OFFER' as const, passphrase});
export const offerSdpReady = (peerId: string, sdp: string) => ({type: 'OFFER_SDP_READY' as const, peerId, sdp});
export const offerEncoded = (peerId: string, code: string) => ({type: 'OFFER_ENCODED' as const, peerId, code});
export const joinOffer = (code: string, passphrase: string) => ({type: 'JOIN_OFFER' as const, code, passphrase});
export const answerSdpReady = (sdp: string) => ({type: 'ANSWER_SDP_READY' as const, sdp});
export const answerEncoded = (code: string) => ({type: 'ANSWER_ENCODED' as const, code});
export const decodeFailed = () => ({type: 'DECODE_FAILED' as const});
export const offerFailed = () => ({type: 'OFFER_FAILED' as const});
export const cancelOffer = () => ({type: 'CANCEL_OFFER' as const});

export const peerConnected = (peerId: string) => ({type: 'PEER_CONNECTED' as const, peerId});
export const peerDisconnected = (peerId: string) => ({type: 'PEER_DISCONNECTED' as const, peerId});
export const peerNamed = (peerId: string, name: string) => ({type: 'PEER_NAMED' as const, peerId, name});
export const grantTrust = (peerId: string) => ({type: 'GRANT_TRUST' as const, peerId});
export const revokeTrust = (peerId: string) => ({type: 'REVOKE_TRUST' as const, peerId});
export const peerTrustUpdated = (peerId: string, trusts: boolean) => ({type: 'PEER_TRUST_UPDATED' as const, peerId, trusts});
export const disconnect = (peerId: string) => ({type: 'DISCONNECT' as const, peerId});
export const forgetPeer = (peerId: string) => ({type: 'FORGET_PEER' as const, peerId});

export const introductionReceived = (introId: string, from: string, peer: string) => ({type: 'INTRODUCTION_RECEIVED' as const, introId, from, peer});
export const introductionResolved = (introId: string) => ({type: 'INTRODUCTION_RESOLVED' as const, introId});
export const acceptIntroduction = (introId: string) => ({type: 'ACCEPT_INTRODUCTION' as const, introId});
export const declineIntroduction = (introId: string) => ({type: 'DECLINE_INTRODUCTION' as const, introId});
export const introducePeers = (peerId1: string, peerId2: string) => ({type: 'INTRODUCE_PEERS' as const, peerId1, peerId2});

export const onlinePeersUpdated = (peers: OnlinePeer[]) => ({type: 'ONLINE_PEERS_UPDATED' as const, peers});
export const onlinePeerJoined = (peerId: string, name: string) => ({type: 'ONLINE_PEER_JOINED' as const, peerId, name});
export const onlinePeerLeft = (peerId: string) => ({type: 'ONLINE_PEER_LEFT' as const, peerId});

export const previousPeersReceived = (peers: PreviousPeer[]) => ({type: 'PREVIOUS_PEERS_RECEIVED' as const, peers});
export const previousPeerConnected = (signalingPeerId: string) => ({type: 'PREVIOUS_PEER_CONNECTED' as const, signalingPeerId});

export const serverOfferReceived = (signalingPeerId: string, name: string, sdp: string) => ({type: 'SERVER_OFFER_RECEIVED' as const, signalingPeerId, name, sdp});
export const serverAnswerReceived = (signalingPeerId: string, sdp: string) => ({type: 'SERVER_ANSWER_RECEIVED' as const, signalingPeerId, sdp});
export const relayOffer = (targetPeerId: string, sdp: string) => ({type: 'RELAY_OFFER' as const, targetPeerId, sdp});
export const relayAnswer = (targetPeerId: string, sdp: string) => ({type: 'RELAY_ANSWER' as const, targetPeerId, sdp});
export const acceptOffer = (sdp: string) => ({type: 'ACCEPT_OFFER' as const, sdp});
export const acceptAnswer = (peerId: string, sdp: string) => ({type: 'ACCEPT_ANSWER' as const, peerId, sdp});
export const acceptAnswerCode = (responseCode: string) => ({type: 'ACCEPT_ANSWER_CODE' as const, responseCode});
export const connectViaServer = (signalingPeerId: string, name: string) => ({type: 'CONNECT_VIA_SERVER' as const, signalingPeerId, name});
export const reconnectViaServer = (signalingPeerId: string, name: string) => ({type: 'RECONNECT_VIA_SERVER' as const, signalingPeerId, name});

export const startSignaling = () => ({type: 'START_SIGNALING' as const});
export const stopSignaling = () => ({type: 'STOP_SIGNALING' as const});

export const peerConnectionUnstable = (peerId: string) => ({type: 'PEER_CONNECTION_UNSTABLE' as const, peerId});
export const peerConnectionRestored = (peerId: string) => ({type: 'PEER_CONNECTION_RESTORED' as const, peerId});

export const relayIceRestart = (targetPeerId: string, sdp: string) => ({type: 'RELAY_ICE_RESTART' as const, targetPeerId, sdp});
export const relayIceRestartAnswer = (targetPeerId: string, sdp: string) => ({type: 'RELAY_ICE_RESTART_ANSWER' as const, targetPeerId, sdp});
export const iceRestartReceived = (signalingPeerId: string, sdp: string) => ({type: 'ICE_RESTART_RECEIVED' as const, signalingPeerId, sdp});
export const iceRestartAnswerReceived = (signalingPeerId: string, sdp: string) => ({type: 'ICE_RESTART_ANSWER_RECEIVED' as const, signalingPeerId, sdp});
export const iceRestartAttempted = (peerId: string) => ({type: 'ICE_RESTART_ATTEMPTED' as const, peerId});

export const signalingPeerRegistered = (localPeerId: string, signalingPeerId: string, isOfferer: boolean) => ({type: 'SIGNALING_PEER_REGISTERED' as const, localPeerId, signalingPeerId, isOfferer});
export const introChannelRegistered = (introId: string, relayPeerId: string) => ({type: 'INTRO_CHANNEL_REGISTERED' as const, introId, relayPeerId});
export const introConnectionRegistered = (introId: string, newPeerId: string) => ({type: 'INTRO_CONNECTION_REGISTERED' as const, introId, newPeerId});
export const introConnectionCleared = (introId: string) => ({type: 'INTRO_CONNECTION_CLEARED' as const, introId});

export const emailSharedReceived = (fromPeerId: string, email: string) => ({type: 'EMAIL_SHARED_RECEIVED' as const, fromPeerId, email});
export const emailRevokedReceived = (fromPeerId: string) => ({type: 'EMAIL_REVOKED_RECEIVED' as const, fromPeerId});
export const shareEmail = (targetPeerId: string) => ({type: 'SHARE_EMAIL' as const, targetPeerId});
export const stopSharingEmail = (targetPeerId: string) => ({type: 'STOP_SHARING_EMAIL' as const, targetPeerId});
export const updateEmail = (email: string) => ({type: 'UPDATE_EMAIL' as const, email});
export const savePeerEmail = (peerId: string, email: string) => ({type: 'SAVE_PEER_EMAIL' as const, peerId, email});

export const messageReceived = (peerId: string, text: string) => ({type: 'MESSAGE_RECEIVED' as const, peerId, text});
export const sendMessage = (peerId: string, text: string) => ({type: 'SEND_MESSAGE' as const, peerId, text});

export const saveBoard = (board: Board) => ({type: 'SAVE_BOARD' as const, board});
export const boardSaved = () => ({type: 'BOARD_SAVED' as const});
export const loadBoard = () => ({type: 'LOAD_BOARD' as const});
export const boardLoaded = (board: Board) => ({type: 'BOARD_LOADED' as const, board});
export const boardNotFound = () => ({type: 'BOARD_NOT_FOUND' as const});

export const startGame = () => ({type: 'START_GAME' as const});
export const gameStarted = (gameState: GameState) => ({type: 'GAME_STARTED' as const, gameState});
export const fireShot = (row: number, col: number) => ({type: 'FIRE_SHOT' as const, row, col});
export const fireResult = (playerShot: Shot, aiShot: Shot | null, phase: GamePhase) =>
  ({type: 'FIRE_RESULT' as const, playerShot, aiShot, phase});
export const loadGame = () => ({type: 'LOAD_GAME' as const});
export const gameStateReceived = (gameState: GameState) => ({type: 'GAME_STATE' as const, gameState});
export const gameNotFound = () => ({type: 'GAME_NOT_FOUND' as const});

export const challengePeer = (opponentId: string) => ({type: 'CHALLENGE_PEER' as const, opponentId});
export const challengeReceived = (opponentId: string) => ({type: 'CHALLENGE_RECEIVED' as const, opponentId});
export const acceptChallenge = () => ({type: 'ACCEPT_CHALLENGE' as const});
export const declineChallenge = () => ({type: 'DECLINE_CHALLENGE' as const});
export const cancelChallenge = () => ({type: 'CANCEL_CHALLENGE' as const});
export const p2pBoardReady = (boardHash: string) => ({type: 'P2P_BOARD_READY' as const, boardHash});
export const opponentBoardReady = (boardHash: string) => ({type: 'OPPONENT_BOARD_READY' as const, boardHash});
export const claimFirstTurn = () => ({type: 'CLAIM_FIRST_TURN' as const});
export const takeFirstTurn = () => ({type: 'TAKE_FIRST_TURN' as const});
export const coinFlipCommit = (hash: string) => ({type: 'COIN_FLIP_COMMIT' as const, hash});
export const coinFlipReveal = (value: number) => ({type: 'COIN_FLIP_REVEAL' as const, value});
export const turnOrderDecided = (iGoFirst: boolean) => ({type: 'TURN_ORDER_DECIDED' as const, iGoFirst});
export const p2pFire = (row: number, col: number) => ({type: 'P2P_FIRE' as const, row, col});
export const p2pFireResult = (shot: Shot) => ({type: 'P2P_FIRE_RESULT' as const, shot});
export const opponentFired = (shot: Shot) => ({type: 'OPPONENT_FIRED' as const, shot});
export const p2pGameOver = (winner: 'me' | 'opponent') => ({type: 'P2P_GAME_OVER' as const, winner});
export const forfeitGame = () => ({type: 'FORFEIT_GAME' as const});
export const opponentForfeited = () => ({type: 'OPPONENT_FORFEITED' as const});
export const saveP2pGame = () => ({type: 'SAVE_P2P_GAME' as const});
export const loadP2pGame = (opponentId: string) => ({type: 'LOAD_P2P_GAME' as const, opponentId});
export const p2pGameLoaded = (gameState: P2pGame) => ({type: 'P2P_GAME_LOADED' as const, gameState});
export const p2pStateSync = (opponentId: string, myShots: Shot[], opponentShots: Shot[], phase: P2pGamePhase) =>
  ({type: 'P2P_STATE_SYNC' as const, opponentId, myShots, opponentShots, phase});
export const p2pStateMismatch = () => ({type: 'P2P_STATE_MISMATCH' as const});
export const clearP2pGame = () => ({type: 'CLEAR_P2P_GAME' as const});
export const opponentBoardRevealed = (board: Board, verified: boolean) => ({type: 'OPPONENT_BOARD_REVEALED' as const, board, verified});
