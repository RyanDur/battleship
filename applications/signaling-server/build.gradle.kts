plugins {
    kotlin("jvm")
    kotlin("plugin.spring")
    id("org.springframework.boot") version "3.4.1"
    id("io.spring.dependency-management") version "1.1.7"
    id("org.beryx.runtime") version "1.13.1"
}

dependencies {
    implementation(project(":components:signaling-protocol"))
    implementation("org.springframework.boot:spring-boot-starter-websocket")
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin")
    implementation("org.jetbrains.kotlin:kotlin-reflect")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.test {
    useJUnitPlatform()
}

application {
    mainClass.set("com.battleship.backend.BattleshipApplicationKt")
}

runtime {
    options.set(listOf("--strip-debug", "--compress", "zip-6", "--no-header-files", "--no-man-pages"))

    jpackage {
        val os = System.getProperty("os.name").lowercase()
        installerType = when {
            os.contains("mac") -> "dmg"
            os.contains("win") -> "msi"
            else -> "deb"
        }
        imageName = "Battleship"
        installerName = "Battleship"
        appVersion = project.version.toString()
    }
}
