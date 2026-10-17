package deskhub.ringkit

import coredevices.haversine.CollectionIndexStorage
import coredevices.haversine.KMPHaversineAdvertisement
import coredevices.haversine.KMPHaversineDebugDelegate
import coredevices.haversine.KMPHaversineDebugInfo
import coredevices.haversine.KMPHaversineHacksDelegate
import coredevices.haversine.KMPHaversineSatellite
import coredevices.haversine.KMPHaversineSatelliteManager
import coredevices.haversine.SatelliteStatus
import coredevices.haversine.TransferStatus
import coredevices.haversine.fingerprintMatchesFailsafe
import coredevices.haversine.fingerprintMatchesPTF
import coredevices.haversine.removeDCBias
import kotlinx.cinterop.addressOf
import kotlinx.cinterop.convert
import kotlinx.cinterop.usePinned
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import platform.Foundation.NSData
import platform.Foundation.NSUUID
import platform.Foundation.NSUserDefaults
import platform.Foundation.create
import platform.posix.memcpy
import kotlin.time.Duration.Companion.seconds

/**
 * What the app hears from the ring. Called on a background thread.
 */
interface IndexRingListener {
    /** A one-line, human-readable state: "Listening for your ring", "Receiving a recording"... */
    fun onStatus(text: String)

    /**
     * A finished recording: 16-bit little-endian mono PCM at [sampleRate].
     * [clipId] identifies the recording, so a clip delivered twice can be ignored.
     */
    fun onRecording(clipId: String, pcm: NSData, sampleRate: Int, recordedAtMs: Long)

    /** Firmware version and battery voltage, whenever the ring reports them (either may be null). */
    fun onRingInfo(firmware: String?, batteryMilliVolts: Int)

    /** Diagnostic lines for the in-app log. */
    fun onLog(line: String)
}

/**
 * The Index 01, without the Pebble app: keeps the ring's recordings flowing to the phone
 * using Core Devices' own Bluetooth library (the same one the Pebble app uses).
 *
 * Pairing itself (the iOS Bluetooth prompt) happens in Swift; once the ring is bonded the app
 * hands its identifier to [setPairedRing] and this takes it from there.
 */
class IndexRing(private val listener: IndexRingListener) {
    private val defaults = NSUserDefaults.standardUserDefaults
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val paired = MutableStateFlow(defaults.stringForKey(KEY_PAIRED))
    private val lastIndex = MutableStateFlow(
        if (defaults.objectForKey(KEY_INDEX) != null) defaults.integerForKey(KEY_INDEX).toInt() else null
    )
    private var syncJob: Job? = null

    /** Which recordings have already been pulled off the ring; the library reads and advances it. */
    private val indexStorage = object : CollectionIndexStorage {
        override val lastSuccessfulCollectionIndex: StateFlow<Int?> = lastIndex
        override fun setLastSuccessfulCollectionIndex(index: Int?) {
            lastIndex.value = index
            if (index == null) defaults.removeObjectForKey(KEY_INDEX) else defaults.setInteger(index.convert(), KEY_INDEX)
        }
    }

    /** Like the Pebble app, clear the ring's old recordings the first time a newly paired ring syncs. */
    private val hacks = object : KMPHaversineHacksDelegate {
        override fun shouldWipeCollectionsBeforeTransfer(satellite: KMPHaversineSatellite): Boolean =
            satellite.id.equals(paired.value, ignoreCase = true) &&
                !satellite.id.equals(defaults.stringForKey(KEY_WIPED), ignoreCase = true)

        override fun wipedCollectionsBeforeTransfer(satellite: KMPHaversineSatellite) {
            log("Cleared old recordings on the ring before the first sync")
            defaults.setObject(satellite.id, KEY_WIPED)
            indexStorage.setLastSuccessfulCollectionIndex(null)
        }
    }

    private val debug = object : KMPHaversineDebugDelegate {
        override fun handleHaversineDebugInfo(info: KMPHaversineDebugInfo) {
            log("Ring debug info: ${info.satelliteName} ${info.satelliteVersion}")
        }
        override fun shouldReadRxRSSI(satellite: KMPHaversineSatellite): Boolean = false
        override fun handleRxRSSI(rssi: Float, satellite: KMPHaversineSatellite) {}
    }

    private val manager: KMPHaversineSatelliteManager by lazy {
        KMPHaversineSatelliteManager(
            pairedSatelliteIdProvider = { paired.value },
            debugDelegate = debug,
            hacksDelegate = hacks,
            collectionIndexStorage = indexStorage,
            hwVersion = HW_VERSION,
            scope = scope,
            // Firmware updates come from Core Devices' service, which needs a Pebble account.
            updateJsonProvider = { null },
        )
    }

    /** The bonded ring's iOS identifier, or null. */
    val pairedRingId: String? get() = paired.value

    /** Starts (or keeps) the background sync loop. Safe to call more than once. */
    fun start() {
        if (syncJob?.isActive == true) return
        syncJob = scope.launch {
            paired.collectLatest { id ->
                if (id == null) {
                    listener.onStatus("No ring paired")
                    return@collectLatest
                }
                while (isActive) {
                    try {
                        listener.onStatus("Waiting for Bluetooth")
                        manager.awaitBluetoothReady()
                        listener.onStatus("Listening for your ring")
                        manager.startScanning().collect { handle(it) }
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: Throwable) {
                        log("Sync loop error: ${e.message ?: e::class.simpleName}")
                    }
                    delay(3.seconds)
                }
            }
        }
    }

    /** Stops listening to the ring (it keeps its recordings until the next sync). */
    fun stop() {
        syncJob?.cancel()
        syncJob = null
    }

    /**
     * Records a newly bonded ring (or forgets it with null). Recordings start flowing on the next
     * click of the ring's button.
     */
    fun setPairedRing(id: String?) {
        if (id == null) defaults.removeObjectForKey(KEY_PAIRED) else defaults.setObject(id, KEY_PAIRED)
        indexStorage.setLastSuccessfulCollectionIndex(null)
        paired.value = id
        scope.launch {
            try {
                manager.notifyPairedSatelliteChanged()
            } catch (e: CancellationException) {
                throw e
            } catch (e: Throwable) {
                log("Couldn't tell the ring library about the new ring: ${e.message}")
            }
            if (id != null) programUserIdIfNeeded(id)
        }
    }

    /** Older ring firmware only hands recordings to a phone that has written a user ID to it. */
    private suspend fun programUserIdIfNeeded(id: String) {
        val ring = withTimeoutOrNull(60.seconds) {
            manager.lastRing.first { it != null && it.id.equals(id, ignoreCase = true) && it.state.value != null }
        }
        val version = ring?.state?.value?.firmwareVersion
        if (version != null && versionAtLeast(version, FW_NO_USER_ID)) {
            log("Ring firmware $version doesn't need a user ID")
            return
        }
        log("Ring firmware ${version ?: "unknown"}: writing a user ID so it will send recordings")
        val userId = defaults.stringForKey(KEY_USER) ?: NSUUID().UUIDString.also { defaults.setObject(it, KEY_USER) }
        manager.programSatelliteWithUserID(id, userId)
            .onSuccess { log("User ID written") }
            .onFailure { log("Couldn't write the user ID: ${it.message}") }
    }

    private fun handle(status: SatelliteStatus) {
        when (status) {
            is SatelliteStatus.Transferring -> when (val t = status.transferStatus) {
                is TransferStatus.TransferStarted -> listener.onStatus("Receiving a recording")
                is TransferStatus.TransferTypeDetermined -> {
                    listener.onRingInfo(status.satellite.state.value?.firmwareVersion, t.batteryVoltageMilliV?.toInt() ?: -1)
                    if (!t.isAudio) log("Ring button ${t.buttonSequence ?: "press"} (no audio)")
                }
                is TransferStatus.TransferComplete -> deliver(t)
                is TransferStatus.TransferFailed -> {
                    log("Transfer of recording ${t.collectionIndex} failed: ${t.exception?.message}")
                    listener.onStatus("A transfer failed; it will retry")
                }
                is TransferStatus.IrrecoverableDataDetected ->
                    log("The ring sent a recording that couldn't be decoded: ${t.exception?.message}")
                else -> {}
            }
            is SatelliteStatus.BluetoothFailure -> {
                log("Bluetooth problem: ${status.reason}")
                listener.onStatus("Bluetooth problem: ${status.reason.name}. Try forgetting the ring in Settings > Bluetooth and pairing again.")
            }
            else -> log("Ring status: ${status::class.simpleName}")
        }
    }

    private fun deliver(t: TransferStatus.TransferComplete) {
        val samples = t.samples
        val seconds = samples.size / t.sampleRate.toDouble()
        listener.onStatus("Listening for your ring")
        if (seconds < MIN_SECONDS) {
            log("Skipped a ${(seconds * 10).toInt() / 10.0}s recording (too short)")
            return
        }
        removeDCBias(samples)
        val releasedAt = (t.buttonReleaseTimestamp ?: t.transferCompleteTimestamp).toEpochMilliseconds()
        val pressedAt = releasedAt - (seconds * 1000).toLong()
        log("Got a ${(seconds * 10).toInt() / 10.0}s recording (#${t.collectionIndex})")
        // Indices restart when a ring is re-paired, so the time keeps a new recording from looking like an old one.
        listener.onRecording("${t.satellite.id}-${t.collectionIndex}-${pressedAt / 1000}", samples.toNSData(), t.sampleRate.toInt(), pressedAt)
    }

    private fun log(line: String) = listener.onLog(line)

    companion object {
        private const val KEY_PAIRED = "ring.paired"
        private const val KEY_INDEX = "ring.lastCollectionIndex"
        private const val KEY_WIPED = "ring.lastWiped"
        private const val KEY_USER = "ring.userId"
        private const val FW_NO_USER_ID = "3.62.0"
        private const val MIN_SECONDS = 1.0
        private val HW_VERSION = Pair(11, 0)

        internal fun versionAtLeast(version: String, min: String): Boolean {
            val a = version.trimStart('v').split('.', '-').map { it.toIntOrNull() ?: 0 }
            val b = min.split('.').map { it.toInt() }
            for (i in 0 until maxOf(a.size, b.size)) {
                val x = a.getOrElse(i) { 0 }
                val y = b.getOrElse(i) { 0 }
                if (x != y) return x > y
            }
            return true
        }
    }
}

/**
 * Whether an advertisement's manufacturer data is a ring running its normal firmware
 * (not recovery or factory-test firmware, which can't pair).
 */
fun isPairableRing(manufacturerData: NSData): Boolean {
    val fingerprint = KMPHaversineAdvertisement.parseToStateFingerprint(manufacturerData.toByteArray()) ?: return false
    return !fingerprintMatchesFailsafe(fingerprint) && !fingerprintMatchesPTF(fingerprint)
}

private fun ShortArray.toNSData(): NSData = usePinned {
    NSData.create(bytes = it.addressOf(0), length = (size * Short.SIZE_BYTES).convert())
}

private fun NSData.toByteArray(): ByteArray {
    val out = ByteArray(length.toInt())
    if (out.isNotEmpty()) out.usePinned { memcpy(it.addressOf(0), bytes, length) }
    return out
}
