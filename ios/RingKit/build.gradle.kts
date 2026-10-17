import org.jetbrains.kotlin.gradle.plugin.mpp.apple.XCFramework

plugins {
    kotlin("multiplatform") version "2.4.10"
}

// The ring's Bluetooth library ships a Swift static library, so linking needs Xcode's
// Swift runtime folder (the same flags the Pebble app uses).
val xcodeDir: String? = runCatching {
    providers.exec { commandLine("xcode-select", "-p") }.standardOutput.asText.get().trim()
}.getOrNull()?.takeIf { it.isNotEmpty() }

kotlin {
    val xcf = XCFramework("RingKit")
    listOf(iosArm64(), iosSimulatorArm64()).forEach { target ->
        target.binaries.framework {
            baseName = "RingKit"
            xcf.add(this)
            val sdk = if (target.konanTarget.name.contains("simulator")) "iphonesimulator" else "iphoneos"
            if (xcodeDir != null) {
                linkerOpts("-weak_framework", "CoreML", "-L$xcodeDir/Toolchains/XcodeDefault.xctoolchain/usr/lib/swift/$sdk")
            }
        }
    }

    sourceSets {
        all {
            languageSettings {
                optIn("kotlinx.cinterop.ExperimentalForeignApi")
                optIn("kotlinx.cinterop.BetaInteropApi")
                optIn("kotlin.time.ExperimentalTime")
            }
        }
        iosMain.dependencies {
            // Core Devices' Index 01 library (Apache 2.0): Bluetooth, transfers, decoding.
            implementation("io.github.coredevices.haversine:haversine:2541a33")
            implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.10.2")
        }
    }
}
