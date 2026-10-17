import CoreBluetooth
import Foundation
import RingKit

struct FoundRing: Identifiable, Equatable {
    let id: UUID
    var name: String
    var rssi: Int
    /// False for a ring in recovery or factory-test firmware, which can't pair.
    var pairable: Bool
}

/// Finds a nearby Index 01 and gets iOS to bond with it. Writing to the ring's encrypted
/// characteristic is what makes iOS show its pairing prompt (the Pebble app does the same).
final class RingPairer: NSObject, ObservableObject {
    enum Phase: Equatable {
        case idle, waitingForBluetooth, scanning, pairing(String), failed(String), paired
    }

    static let service = CBUUID(string: "607B5C9B-3700-4E94-F44A-2DF900BCB0C3")
    static let bondCharacteristic = CBUUID(string: "DAAD3D52-237C-90A7-B54B-8854A134D801")

    @Published private(set) var phase: Phase = .idle
    @Published private(set) var rings: [FoundRing] = []
    var onPaired: ((String) -> Void)?

    private var central: CBCentralManager?
    private var peripherals: [UUID: CBPeripheral] = [:]
    private var target: CBPeripheral?
    private var timer: DispatchWorkItem?

    var isBusy: Bool { pairingName != nil || phase == .paired }

    var pairingName: String? {
        if case .pairing(let name) = phase { return name }
        return nil
    }

    var failure: String? {
        if case .failed(let message) = phase { return message }
        return nil
    }

    func startScan() {
        rings = []
        peripherals = [:]
        guard let central else {
            phase = .waitingForBluetooth
            central = CBCentralManager(delegate: self, queue: .main)
            return
        }
        if central.state == .poweredOn { beginScan() } else { phase = .waitingForBluetooth }
    }

    func stopScan() {
        central?.stopScan()
        if phase == .scanning { phase = .idle }
        if case .pairing = phase {} else { timer?.cancel() }
    }

    func pair(_ ring: FoundRing) {
        guard let central, let peripheral = peripherals[ring.id] else { return }
        central.stopScan()
        target = peripheral
        peripheral.delegate = self
        phase = .pairing(ring.name)
        central.connect(peripheral)
        after(45) { [weak self] in self?.fail("The ring stopped answering. Click its button and try again.") }
    }

    private func beginScan() {
        phase = .scanning
        central?.scanForPeripherals(withServices: [Self.service], options: [CBCentralManagerScanOptionAllowDuplicatesKey: true])
        after(60) { [weak self] in self?.stopScan() }
    }

    private func after(_ seconds: Double, _ work: @escaping () -> Void) {
        timer?.cancel()
        let item = DispatchWorkItem(block: work)
        timer = item
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: item)
    }

    private func succeed(_ peripheral: CBPeripheral) {
        timer?.cancel()
        phase = .paired
        central?.cancelPeripheralConnection(peripheral)
        target = nil
        onPaired?(peripheral.identifier.uuidString)
    }

    private func fail(_ message: String) {
        timer?.cancel()
        if let target { central?.cancelPeripheralConnection(target) }
        target = nil
        phase = .failed(message)
    }

    private static func describe(_ error: Error) -> String {
        let forget = "In Settings > Bluetooth, tap ⓘ next to the ring, choose Forget This Device, then try again."
        if let att = error as? CBATTError, att.code == .insufficientAuthentication || att.code == .insufficientEncryption {
            return "Pairing didn't go through (it was cancelled, or this iPhone remembers an old pairing). \(forget)"
        }
        if let cb = error as? CBError, cb.code == .peerRemovedPairingInformation {
            return "The ring forgot its pairing with this iPhone. \(forget)"
        }
        return error.localizedDescription
    }
}

extension RingPairer: CBCentralManagerDelegate {
    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        switch central.state {
        case .poweredOn:
            if phase == .waitingForBluetooth { beginScan() }
        case .unauthorized:
            phase = .failed("Bluetooth access is off for Desk Hub. Turn it on in Settings > Desk Hub.")
        case .poweredOff:
            phase = .failed("Bluetooth is off. Turn it on in Control Center.")
        default:
            break
        }
    }

    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String: Any], rssi RSSI: NSNumber) {
        let data = advertisementData[CBAdvertisementDataManufacturerDataKey] as? Data
        let ring = FoundRing(
            id: peripheral.identifier,
            name: advertisementData[CBAdvertisementDataLocalNameKey] as? String ?? peripheral.name ?? "Index 01",
            rssi: RSSI.intValue,
            pairable: data.map { IndexRingKt.isPairableRing(manufacturerData: $0) } ?? false
        )
        peripherals[peripheral.identifier] = peripheral
        if let i = rings.firstIndex(where: { $0.id == ring.id }) { rings[i] = ring } else { rings.append(ring) }
    }

    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        peripheral.discoverServices([Self.service])
    }

    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) {
        fail("Couldn't connect to the ring: \(error.map(Self.describe) ?? "no reason given").")
    }

    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        if case .pairing = phase { fail("The ring disconnected before pairing finished. Click its button and try again.") }
    }
}

extension RingPairer: CBPeripheralDelegate {
    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard let service = peripheral.services?.first(where: { $0.uuid == Self.service }) else {
            return fail("That doesn't look like an Index 01 (its ring service is missing).")
        }
        peripheral.discoverCharacteristics([Self.bondCharacteristic], for: service)
    }

    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        guard let characteristic = service.characteristics?.first(where: { $0.uuid == Self.bondCharacteristic }) else {
            return fail("The ring didn't offer its pairing channel. Is it on its normal firmware?")
        }
        peripheral.writeValue(Data([0]), for: characteristic, type: .withResponse)
    }

    func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) {
        if let error { fail(Self.describe(error)) } else { succeed(peripheral) }
    }
}
