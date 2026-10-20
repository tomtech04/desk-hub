#!/bin/bash
# Compiles the spoken check-in reader with its tests and runs them. Needs only Xcode's Swift.
#   bash ios/scripts/test-parser.sh
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="$(mktemp -d)"
swiftc -parse-as-library -o "$OUT/parser-tests" Tests/CheckInParserTests.swift DeskHub/CheckInParser.swift
"$OUT/parser-tests"
