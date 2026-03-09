plugins {
    id("org.gradle.toolchains.foojay-resolver-convention") version "1.0.0"
}

rootProject.name = "battleship"
include("components:signaling-protocol", "applications:signaling-server")
