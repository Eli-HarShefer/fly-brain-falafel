"""
Regression test for the extracted circuit.

Reads public/data/circuit.bin + circuit.json and asserts that the pathways the
controller depends on are actually present, with roughly the synapse counts
measured from FlyWire v783. If FlyWire ships a new snapshot, or the extraction
breaks, this fails loudly instead of silently producing a fly that cannot steer.
"""
import json
import os
import struct
import sys
from collections import Counter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "data")

# (pre_type, post_type, expected_synapses, expected_sign)
# Measured directly from FlyWire v783 with a >= 5 synapse edge filter.
EXPECTED = [
    ("LC10a",   "AOTU019", 2858, +1),
    ("LC10a",   "AOTU025", 2772, +1),
    ("AOTU019", "DNa02",    337, -1),
    ("AOTU025", "DNa02",    321, +1),
    ("EPG",     "Delta7",  2376, +1),
    ("Delta7",  "PFL3",    2196, -1),
    ("PFL3",    "DNa02",    496, +1),
    ("PFL3",    "DNa03",    452, +1),
    ("PFL3",    "AOTU019", 1556, +1),
    ("DNa03",   "DNa02",    514, +1),
    # The raw per-edge NT prediction labels these synapses GLUT, which would make
    # looming *inhibit* the Giant Fiber and silence the escape reflex. Enforcing
    # Dale's law over each neuron's whole output recovers the correct answer:
    # LPLC2 is cholinergic and excites DNp01. Sign is +1 on purpose.
    ("LPLC2",   "DNp01",    844, +1),
    ("ER4d",    "EPG",     2636, -1),
]

TOLERANCE = 0.12  # synapse counts may shift slightly with the edge filter


def load():
    with open(os.path.join(OUT, "circuit.json"), encoding="utf-8") as f:
        meta = json.load(f)
    with open(os.path.join(OUT, "circuit.bin"), "rb") as f:
        blob = f.read()
    assert blob[:4] == b"FLYC", "bad magic in circuit.bin"
    ver, n, e = struct.unpack_from("<III", blob, 4)
    off = 16
    indptr = struct.unpack_from("<%di" % (n + 1), blob, off)
    off += 4 * (n + 1)
    indices = struct.unpack_from("<%di" % e, blob, off)
    off += 4 * e
    weights = struct.unpack_from("<%df" % e, blob, off)
    off += 4 * e
    pos = struct.unpack_from("<%df" % (n * 3), blob, off)
    return meta, indptr, indices, weights, pos


def main():
    meta, indptr, indices, weights, pos = load()
    n = meta["nNeurons"]
    types = meta["types"]
    mv = meta["mvPerSyn"]
    failures = []

    print("circuit: %d neurons, %d edges" % (n, meta["nEdges"]))
    print("")
    print("%-9s -> %-9s %8s %8s  %s" % ("pre", "post", "found", "expect", "sign"))

    syn = Counter()
    sgn = {}
    for a in range(n):
        ta = types[a]
        for k in range(indptr[a], indptr[a + 1]):
            b = indices[k]
            key = (ta, types[b])
            syn[key] += abs(weights[k]) / mv
            sgn[key] = -1 if weights[k] < 0 else +1

    for pre, post, expect, esign in EXPECTED:
        got = int(round(syn.get((pre, post), 0)))
        gs = sgn.get((pre, post), 0)
        ok = got > 0 and abs(got - expect) <= max(8, expect * TOLERANCE) and gs == esign
        mark = "ok " if ok else "FAIL"
        print("%-9s -> %-9s %8d %8d  %+d %s" % (pre, post, got, expect, gs, mark))
        if not ok:
            failures.append("%s->%s got %d (%+d), expected %d (%+d)"
                            % (pre, post, got, gs, expect, esign))

    # structural sanity
    groups = meta["groups"]
    for g in ("LC10a_L", "LC10a_R", "LPLC2_L", "LPLC2_R", "DNa02_L", "DNa02_R",
              "DNa03_L", "DNa03_R", "DNp01_L", "DNp01_R", "AOTU019_L", "AOTU019_R",
              "EPG", "PFL3_L", "PFL3_R"):
        if not groups.get(g):
            failures.append("missing group %s" % g)

    # every neuron must have a finite position
    bad = sum(1 for v in pos if v != v or abs(v) > 4)
    if bad:
        failures.append("%d out-of-range coordinates" % bad)

    # inhibitory fraction should be biologically plausible (roughly a third)
    inh = sum(1 for w in weights if w < 0) / float(len(weights))
    print("")
    print("inhibitory edges: %.1f%%" % (inh * 100))
    if not (0.15 < inh < 0.6):
        failures.append("implausible inhibitory fraction %.2f" % inh)

    print("")
    if failures:
        print("FAILED (%d)" % len(failures))
        for f in failures:
            print("  - " + f)
        return 1
    print("all checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
