package com.battleship.backend

import java.nio.file.Files
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.never
import org.mockito.Mockito.verify
import org.springframework.context.ConfigurableApplicationContext

class AppBundleWatcherTest {

    @Test
    fun `resolveBundlePath returns null when JAR path does not contain app bundle marker`() {
        val ctx = mock(ConfigurableApplicationContext::class.java)
        val watcher = AppBundleWatcher(ctx)

        val result = watcher.resolveBundlePath("/home/user/.gradle/caches/signaling-server-1.0.0.jar")

        assertNull(result)
    }

    @Test
    fun `resolveBundlePath returns the app bundle path when JAR is inside a bundle`() {
        val ctx = mock(ConfigurableApplicationContext::class.java)
        val watcher = AppBundleWatcher(ctx)

        val result = watcher.resolveBundlePath(
            "/Applications/Battleship.app/Contents/app/signaling-server-1.0.0.jar"
        )

        assertTrue(result?.endsWith(".app") == true)
        assertTrue(result?.contains("Battleship.app") == true)
    }

    @Test
    fun `checkBundle does nothing when bundle path exists`() {
        val ctx = mock(ConfigurableApplicationContext::class.java)
        val watcher = AppBundleWatcher(ctx)
        val tempDir = Files.createTempDirectory("Battleship.app").toFile()
        tempDir.deleteOnExit()

        watcher.checkBundle(tempDir.absolutePath)

        verify(ctx, never()).close()
        tempDir.delete()
    }

    @Test
    fun `checkBundle closes context when bundle path no longer exists`() {
        val ctx = mock(ConfigurableApplicationContext::class.java)
        val watcher = AppBundleWatcher(ctx)

        watcher.checkBundle("/nonexistent/Battleship.app")

        verify(ctx).close()
    }

    @Test
    fun `startWatching returns false when not running inside an app bundle`() {
        val ctx = mock(ConfigurableApplicationContext::class.java)
        val watcher = AppBundleWatcher(ctx)

        val started = watcher.startWatching("/home/user/.gradle/caches/signaling-server-1.0.0.jar")

        assertFalse(started)
    }
}
