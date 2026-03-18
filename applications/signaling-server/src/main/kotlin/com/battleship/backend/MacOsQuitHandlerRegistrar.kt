package com.battleship.backend

import java.awt.Desktop
import java.awt.desktop.QuitResponse
import org.springframework.boot.context.event.ApplicationReadyEvent
import org.springframework.context.ConfigurableApplicationContext
import org.springframework.context.event.EventListener
import org.springframework.stereotype.Component

@Component
class MacOsQuitHandlerRegistrar(private val appContext: ConfigurableApplicationContext) {

    @EventListener(ApplicationReadyEvent::class)
    fun registerQuitHandler() {
        if (!Desktop.isDesktopSupported()) return
        val desktop = Desktop.getDesktop()
        if (!desktop.isSupported(Desktop.Action.APP_QUIT_HANDLER)) return
        desktop.setQuitHandler { _, response -> handleQuit(response) }
    }

    internal fun handleQuit(response: QuitResponse) {
        appContext.close()
        response.performQuit()
    }
}
