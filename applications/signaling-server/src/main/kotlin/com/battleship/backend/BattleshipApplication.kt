package com.battleship.backend

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication
import org.springframework.scheduling.annotation.EnableScheduling

@SpringBootApplication
@EnableScheduling
class BattleshipApplication

fun main(args: Array<String>) {
    runApplication<BattleshipApplication>(*args)
}
