package com.battleship.backend

import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService
import java.util.concurrent.TimeUnit
import org.springframework.boot.context.event.ApplicationReadyEvent
import org.springframework.context.ConfigurableApplicationContext
import org.springframework.context.event.EventListener
import org.springframework.stereotype.Component

@Component
class AppBundleWatcher(private val appContext: ConfigurableApplicationContext) {

    private val scheduler: ScheduledExecutorService = Executors.newSingleThreadScheduledExecutor()

    @EventListener(ApplicationReadyEvent::class)
    fun onApplicationReady() {
        val jarPath = AppBundleWatcher::class.java.protectionDomain?.codeSource?.location?.toURI()?.path
            ?: return
        startWatching(jarPath)
    }

    internal fun startWatching(jarPath: String): Boolean {
        val bundlePath = resolveBundlePath(jarPath) ?: return false
        scheduler.scheduleAtFixedRate({ checkBundle(bundlePath) }, 5, 5, TimeUnit.SECONDS)
        return true
    }

    internal fun resolveBundlePath(jarPath: String): String? {
        val marker = ".app/Contents/app/"
        val markerIndex = jarPath.indexOf(marker)
        if (markerIndex == -1) return null
        val bundleEnd = markerIndex + ".app".length
        return jarPath.substring(0, bundleEnd)
    }

    internal fun checkBundle(bundlePath: String) {
        if (!File(bundlePath).exists()) {
            appContext.close()
        }
    }
}
