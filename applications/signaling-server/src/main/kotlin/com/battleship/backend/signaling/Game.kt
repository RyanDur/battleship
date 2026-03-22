package com.battleship.backend.signaling

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.annotation.JsonProperty
import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.Id
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository

// --- Board domain model ---

@JsonIgnoreProperties(ignoreUnknown = true)
data class Cell(val row: Int = 0, val col: Int = 0)

@JsonIgnoreProperties(ignoreUnknown = true)
data class Ship(val name: String = "", val size: Int = 0)

@JsonIgnoreProperties(ignoreUnknown = true)
data class PlacedShip(
    val ship: Ship = Ship(),
    val position: Cell = Cell(),
    val orientation: String = "horizontal",
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class Board(val placed: List<PlacedShip> = emptyList())

fun occupiedCells(placed: PlacedShip): List<Cell> =
    (0 until placed.ship.size).map { i ->
        if (placed.orientation == "horizontal")
            Cell(placed.position.row, placed.position.col + i)
        else
            Cell(placed.position.row + i, placed.position.col)
    }

fun isCellOccupied(board: Board, cell: Cell): Boolean =
    board.placed.any { p -> occupiedCells(p).any { it == cell } }

fun canPlace(board: Board, ship: Ship, position: Cell, orientation: String): Boolean {
    val candidate = PlacedShip(ship, position, orientation)
    val cells = occupiedCells(candidate)
    if (cells.any { it.row < 1 || it.row > 10 || it.col < 1 || it.col > 10 }) return false
    val taken = board.placed.flatMap { occupiedCells(it) }
    return cells.none { taken.contains(it) }
}

// --- Game engine ---

enum class ShotResult {
    @JsonProperty("hit") HIT,
    @JsonProperty("miss") MISS,
    @JsonProperty("sunk") SUNK,
}

data class Shot(val cell: Cell, val result: ShotResult, val ship: Ship? = null)

enum class GamePhase { PLAYER_TURN, COMPUTER_TURN, PLAYER_WON, COMPUTER_WON }

data class GameState(
    val playerBoard: Board = Board(),
    val aiBoard: Board = Board(),
    val playerShots: List<Shot> = emptyList(),
    val aiShots: List<Shot> = emptyList(),
    val phase: GamePhase = GamePhase.PLAYER_TURN,
)

private fun resolveSunk(board: Board, shots: List<Shot>, cell: Cell): Ship? {
    val placedShip = board.placed.firstOrNull { p -> occupiedCells(p).any { it == cell } }
        ?: return null
    val hitCells = shots.map { it.cell } + cell
    return if (occupiedCells(placedShip).all { hitCells.contains(it) }) placedShip.ship else null
}

private fun allShipsSunk(board: Board, shots: List<Shot>): Boolean =
    board.placed.all { p -> occupiedCells(p).all { c -> shots.any { it.cell == c } } }

fun fireAt(state: GameState, cell: Cell): GameState {
    val hit = isCellOccupied(state.aiBoard, cell)
    val sunkShip = if (hit) resolveSunk(state.aiBoard, state.playerShots, cell) else null
    val result = if (sunkShip != null) ShotResult.SUNK else if (hit) ShotResult.HIT else ShotResult.MISS
    val shot = Shot(cell, result, sunkShip)
    val playerShots = state.playerShots + shot
    val phase = if (allShipsSunk(state.aiBoard, playerShots)) GamePhase.PLAYER_WON else GamePhase.COMPUTER_TURN
    return state.copy(playerShots = playerShots, phase = phase)
}

fun aiFireAt(state: GameState, cell: Cell): GameState {
    val hit = isCellOccupied(state.playerBoard, cell)
    val sunkShip = if (hit) resolveSunk(state.playerBoard, state.aiShots, cell) else null
    val result = if (sunkShip != null) ShotResult.SUNK else if (hit) ShotResult.HIT else ShotResult.MISS
    val shot = Shot(cell, result, sunkShip)
    val aiShots = state.aiShots + shot
    val phase = if (allShipsSunk(state.playerBoard, aiShots)) GamePhase.COMPUTER_WON else GamePhase.PLAYER_TURN
    return state.copy(aiShots = aiShots, phase = phase)
}

// --- AI ---

private val ALL_CELLS = (1..10).flatMap { row -> (1..10).map { col -> Cell(row, col) } }

fun nextAiShot(firedCells: List<Cell>): Cell =
    ALL_CELLS.filter { !firedCells.contains(it) }.random()

// --- Random board generation ---

private val SHIPS_TO_PLACE = listOf(
    Ship("Carrier", 5),
    Ship("Battleship", 4),
    Ship("Cruiser", 3),
    Ship("Submarine", 3),
    Ship("Destroyer", 2),
)

fun createRandomBoard(): Board {
    var board = Board()
    for (ship in SHIPS_TO_PLACE) {
        var placed = false
        while (!placed) {
            val row = (1..10).random()
            val col = (1..10).random()
            val orientation = if (listOf(true, false).random()) "horizontal" else "vertical"
            if (canPlace(board, ship, Cell(row, col), orientation)) {
                board = board.copy(placed = board.placed + PlacedShip(ship, Cell(row, col), orientation))
                placed = true
            }
        }
    }
    return board
}

// --- Persistence ---

@Entity
class GameSession(
    @Id
    var peerId: String = "",
    @Column(columnDefinition = "TEXT")
    var gameData: String = "",
)

@Repository
interface GameSessionJpaRepository : JpaRepository<GameSession, String>

interface GameSessionGateway {
    fun save(peerId: String, state: GameState)
    fun find(peerId: String): GameState?
    fun delete(peerId: String)
}

// --- Response helpers ---

fun GamePhase.toApiString(): String = when (this) {
    GamePhase.PLAYER_TURN -> "player-turn"
    GamePhase.COMPUTER_TURN -> "computer-turn"
    GamePhase.PLAYER_WON -> "player-won"
    GamePhase.COMPUTER_WON -> "computer-won"
}

fun GameState.toResponse(type: String): Map<String, Any> = mapOf(
    "type" to type,
    "playerShots" to playerShots,
    "aiShots" to aiShots,
    "phase" to phase.toApiString(),
)
