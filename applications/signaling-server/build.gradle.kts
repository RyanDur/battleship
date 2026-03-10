plugins {
    kotlin("jvm")
    kotlin("plugin.spring")
    id("org.springframework.boot") version "3.4.1"
    id("io.spring.dependency-management") version "1.1.7"
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
    systemProperty("APP_VERSION", project.version.toString())
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
    val bootJar = tasks.named<org.springframework.boot.gradle.tasks.bundling.BootJar>("bootJar").get()
    val inputDir = bootJar.archiveFile.get().asFile.parentFile
    val jarName = bootJar.archiveFile.get().asFile.name
    val outputDir = layout.buildDirectory.dir("jpackage").get().asFile

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
        "--java-options", "-Xmx256m"
    )
}
