# Note of 24 October 2026: names changed after this record

This directory is the record of rehearsal D01 (23 October 2026), kept exactly as it ran. D01
rehearsed the draft program while it was called `vicinity_curve`. After the run, on 24 October 2026,
the program was renamed `citycoin_curve` for Citycoin.dev (crate `citycoin-curve`, math crate
`citycoin-curve-math`, IDL `sdk/idl/citycoin_curve.json`), its leaf tag became
`citycoin_curve/launch_leaf` and its metadata prefix `https://citycoin.dev/coin-meta/v1/`
(`CITYCOIN-CURVE-NOTES.md` entry 107).

Nothing in `driver/` or `record/` was changed: their names, paths, leaves, roots, URIs and hashes
are those of the build D01 measured (`devnet` build sha256
`d052b8fccf5ed0fc9bbb0ee56e4a77ae5a3ec99c6fa6c906119f51db71c18fa3`), which the rename superseded.
The driver points at files that no longer exist under those names (`vicinity_curve.so`,
`sdk/idl/vicinity_curve.json`). The renamed builds and their hashes are in `CITYCOIN-CURVE-AUDIT.md`
2.3; what a new run needs is in `CITYCOIN-CURVE-DEVNET.md` section 10.
