package com.battleship.backend

import java.awt.GraphicsEnvironment
import java.net.BindException
import javax.swing.JOptionPane
import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication
import org.springframework.scheduling.annotation.EnableScheduling

@SpringBootApplication
@EnableScheduling
class BattleshipApplication

fun main(args: Array<String>) {
    try {
        runApplication<BattleshipApplication>(*args)
    } catch (ex: Exception) {
        showStartupError(ex)
    }
}

internal fun startupErrorMessage(ex: Exception): String {
    var cause: Throwable? = ex
    while (cause != null) {
        if (cause is BindException) {
            return "Battleship is already running or another application is using port 8080."
        }
        cause = cause.cause
    }
    return "Battleship failed to start: ${ex.message}"
}

private fun showStartupError(ex: Exception) {
    if (GraphicsEnvironment.isHeadless()) {
        throw ex
    }
    val message = startupErrorMessage(ex)
    JOptionPane.showMessageDialog(null, message, "Battleship", JOptionPane.ERROR_MESSAGE)
    System.exit(1)
}
