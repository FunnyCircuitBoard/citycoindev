#!/usr/bin/env bash
# The citycoin_curve client IDL (CITYCOIN-CURVE-DESIGN.md 8.4 and 14.3).
#
# The deployed binary has no IDL instructions (`no-idl` is a default feature,
# so nobody can create the legacy on-chain IDL account), and the IDL JSON is
# published with the verified build instead: it is generated from the source
# with Anchor's `idl-build` feature (the same step `anchor build` runs) and
# committed at sdk/idl/citycoin_curve.json. It is the default build's IDL
# (mainnet ids of vicinity_rewards and the old vicinity_launchpad); the devnet
# build differs only in the values of the constants REWARDS_PROGRAM_ID,
# LEGACY_PROGRAM_ID, LEGACY_LAUNCHPAD and REWARDS_REGISTRY.
#
# Usage (from solana/):
#   npm run vcurve:idl         regenerate sdk/idl/citycoin_curve.json
#   npm run vcurve:idl:check   regenerate into target/idl/ and diff with the
#                              committed file (exit 1 on any difference)
# CI diffs the IDL that `anchor build` writes (target/idl/citycoin_curve.json)
# against the committed file, like the IDLs of the other two programs.
set -euo pipefail
cd "$(dirname "$0")/../.."
COMMITTED=sdk/idl/citycoin_curve.json
case "${1:-check}" in
  write)
    anchor idl build -p citycoin_curve -o "$COMMITTED"
    echo "wrote $COMMITTED"
    ;;
  check)
    mkdir -p target/idl
    anchor idl build -p citycoin_curve -o target/idl/citycoin_curve.check.json
    diff -u "$COMMITTED" target/idl/citycoin_curve.check.json
    echo "$COMMITTED matches the source"
    ;;
  *)
    echo "usage: $0 write|check" >&2
    exit 2
    ;;
esac
