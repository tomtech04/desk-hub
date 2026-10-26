// Makes the Mac app icon from the iPhone one: the same full-bleed artwork, cut to the Mac's
// rounded-square shape on Apple's icon grid (an 824 px body in a 1024 px canvas) with the soft
// shadow Mac icons have. iOS rounds its icon itself; macOS needs the shape in the file.
//   swift scripts/make-mac-icon.swift ios/DeskHub/Assets.xcassets/AppIcon.appiconset/icon-1024.png scripts/mac-app-icon.png
import AppKit
import SwiftUI

let args = CommandLine.arguments
guard args.count == 3, let art = NSImage(contentsOfFile: args[1]) else {
    print("usage: swift make-mac-icon.swift <ios-icon-1024.png> <out.png>")
    exit(1)
}

let size = 1024.0, inset = 100.0
let body = CGRect(x: inset, y: inset, width: size - 2 * inset, height: size - 2 * inset)

/// Apple's icon shape: a rounded square with continuous corners (radius 185 on the 824 px body),
/// the same curve SwiftUI draws for `.continuous`.
func squircle(in r: CGRect) -> CGPath {
    RoundedRectangle(cornerRadius: r.width * 185 / 824, style: .continuous).path(in: r).cgPath
}

let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(size), pixelsHigh: Int(size), bitsPerSample: 8,
                           samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB,
                           bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
let context = NSGraphicsContext(bitmapImageRep: rep)!
NSGraphicsContext.current = context
let cg = context.cgContext
let shape = squircle(in: body)

// The shadow under the tile.
cg.saveGState()
cg.setShadow(offset: CGSize(width: 0, height: -10), blur: 24, color: NSColor.black.withAlphaComponent(0.32).cgColor)
cg.addPath(shape)
cg.setFillColor(NSColor(srgbRed: 0.15, green: 0.35, blue: 0.75, alpha: 1).cgColor)
cg.fillPath()
cg.restoreGState()

// The artwork, filling the tile edge to edge.
cg.saveGState()
cg.addPath(shape)
cg.clip()
art.draw(in: body, from: .zero, operation: .sourceOver, fraction: 1)
cg.restoreGState()

// A hairline on the edge so it holds its shape on light and dark backgrounds.
cg.addPath(shape)
cg.setStrokeColor(NSColor.white.withAlphaComponent(0.12).cgColor)
cg.setLineWidth(2)
cg.strokePath()

NSGraphicsContext.restoreGraphicsState()
try! rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: args[2]))
print("Wrote \(args[2])")
