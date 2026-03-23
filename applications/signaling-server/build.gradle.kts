plugins {
    kotlin("jvm")
    kotlin("plugin.spring")
    kotlin("plugin.jpa")
    id("org.springframework.boot") version "3.4.1"
    id("io.spring.dependency-management") version "1.1.7"
}

dependencies {
    implementation(project(":components:signaling-protocol"))
    implementation("org.springframework.boot:spring-boot-starter-websocket")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin")
    implementation("org.jetbrains.kotlin:kotlin-reflect")
    runtimeOnly("com.h2database:h2")

    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testRuntimeOnly("org.junit.platform:junit-platform-launcher")
}

tasks.named<Jar>("jar") {
    enabled = false
}

tasks.test {
    useJUnitPlatform()
    systemProperty("APP_VERSION", project.version.toString())
    testLogging {
        events = setOf(org.gradle.api.tasks.testing.logging.TestLogEvent.FAILED)
    }
}

tasks.processResources {
    filesMatching("application.yml") {
        filter { it.replace("@APP_VERSION@", project.version.toString()) }
    }
}

tasks.register<Exec>("jpackage") {
    dependsOn(tasks.named("bootJar"))

    val os = System.getProperty("os.name").lowercase()
    val installerType = when {
        os.contains("mac") -> "dmg"
        os.contains("win") -> "msi"
        else -> "deb"
    }
    val iconExt = when {
        os.contains("mac") -> "icns"
        os.contains("win") -> "ico"
        else -> "png"
    }
    val iconFile = when (iconExt) {
        "png" -> "icon_256.png"
        else -> "icon.$iconExt"
    }
    val bootJar = tasks.named<org.springframework.boot.gradle.tasks.bundling.BootJar>("bootJar").get()
    val inputDir = bootJar.archiveFile.get().asFile.parentFile
    val jarName = bootJar.archiveFile.get().asFile.name
    val outputDir = layout.buildDirectory.dir("jpackage").get().asFile
    val iconPath = project.file("src/main/resources/icon/$iconFile").absolutePath

    commandLine(
        "jpackage",
        "--input", inputDir.absolutePath,
        "--main-jar", jarName,
        "--main-class", "org.springframework.boot.loader.launch.JarLauncher",
        "--name", "Battleship",
        "--app-version", project.version.toString().let {
            val parts = it.split(".")
            val major = parts[0].toInt().coerceAtLeast(1)
            "$major.${parts.drop(1).joinToString(".")}"
        },
        "--type", installerType,
        "--dest", outputDir.absolutePath,
        "--icon", iconPath,
        "--java-options", "-Xmx256m",
        "--java-options", "-Djava.awt.headless=false"
    )
}
