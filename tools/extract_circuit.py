"""
Extract a targeted sensorimotor circuit from the FlyWire FAFB v783 connectome.

Pulls the public (no-login) Codex snapshot, selects the neurons that make up the
fly target-pursuit, goal-navigation and looming-escape pathways, and writes a
compact binary the browser can load in one fetch.

Data: FlyWire FAFB v783, CC BY-NC 4.0.
  Dorkenwald et al. 2024 Nature; Schlegel et al. 2024 Nature.
LIF parameters: Shiu et al. 2024 Nature.
"""
import csv
import gzip
import json
import math
import os
import struct
import sys
import urllib.request
from collections import Counter, defaultdict

BUCKET = "https://storage.googleapis.com/flywire-data/codex/data/fafb/783"
FILES = ["connections", "classification", "coordinates", "consolidated_cell_types"]

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, "data", "raw")
OUT = os.path.join(ROOT, "public", "data")

# Seed cell types, each mapped to a role tag used for colouring and readout.
# Every one of these was verified present in v783.
SEED_TYPES = {
    # visual: small-object (pursuit) and looming (escape) detectors
    "LC10a": "lc10a", "LC18": "vis", "LPLC2": "lplc2",
    # anterior optic tubercle - the pursuit relay onto the steering DNs
    "AOTU019": "aotu", "AOTU025": "aotu",
    # central complex - heading ring attractor and goal comparison
    "EPG": "cx", "Delta7": "cx", "PFL3": "cx", "PFL2": "cx",
    "ER4d": "cx", "PEN1": "cx", "PEN2": "cx",
    # descending neurons - the motor output
    "DNa02": "dn", "DNa03": "dn", "DNa04": "dn",
    "DNp01": "dn", "DNp09": "dn",
}

MIN_SYN = 5           # minimum synapse count for an edge to be included
NEIGHBOR_CAP = 4000   # strongest 1-hop partners to pull in around the seeds
MV_PER_SYN = 0.275    # Shiu et al. 2024

# In Drosophila, glutamate is typically inhibitory (GluCl-alpha).
INHIBITORY = {"GABA", "GLUT"}


def log(msg):
    print(msg, flush=True)


def fetch():
    os.makedirs(RAW, exist_ok=True)
    for name in FILES:
        path = os.path.join(RAW, name + ".csv.gz")
        if os.path.exists(path) and os.path.getsize(path) > 1000:
            continue
        log("  downloading %s.csv.gz ..." % name)
        urllib.request.urlretrieve("%s/%s.csv.gz" % (BUCKET, name), path)
    log("  raw data ready")


def read_gz(name):
    path = os.path.join(RAW, name + ".csv.gz")
    with gzip.open(path, "rt", newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            yield row


def main():
    log("[1/6] fetching FlyWire v783 (public snapshot)")
    fetch()

    log("[2/6] reading annotations")
    cell_type = {}
    for r in read_gz("consolidated_cell_types"):
        t = r["primary_type"]
        if t:
            cell_type[r["root_id"]] = t

    side = {}
    superclass = {}
    for r in read_gz("classification"):
        side[r["root_id"]] = r["side"] or "center"
        superclass[r["root_id"]] = r["super_class"] or "unknown"

    pos = {}
    for r in read_gz("coordinates"):
        rid = r["root_id"]
        if rid in pos:
            continue  # first coordinate per neuron is enough
        p = r["position"].strip("[]").split()
        pos[rid] = (int(p[0]), int(p[1]), int(p[2]))  # nanometres
    log("  %d typed neurons, %d with coordinates" % (len(cell_type), len(pos)))

    seeds = set(rid for rid, t in cell_type.items() if t in SEED_TYPES)
    log("  %d seed neurons across %d types" % (len(seeds), len(SEED_TYPES)))

    log("[3/6] streaming connections")
    edges = []
    nt_votes = defaultdict(Counter)
    for r in read_gz("connections"):
        syn = int(r["syn_count"])
        if syn < MIN_SYN:
            continue
        pre = r["pre_root_id"]
        post = r["post_root_id"]
        edges.append((pre, post, syn))
        nt_votes[pre][r["nt_type"]] += syn
    log("  %d edges with >= %d synapses" % (len(edges), MIN_SYN))

    log("[4/6] selecting circuit")
    strength = Counter()
    for pre, post, syn in edges:
        a = pre in seeds
        b = post in seeds
        if a and not b:
            strength[post] += syn
        elif b and not a:
            strength[pre] += syn
    extra = set(n for n, _ in strength.most_common(NEIGHBOR_CAP))
    selected = seeds | extra
    # a neuron without coordinates cannot be drawn, so drop it
    selected = set(n for n in selected if n in pos)

    order = sorted(selected, key=lambda n: (SEED_TYPES.get(cell_type.get(n, ""), "zz"),
                                            cell_type.get(n, ""), n))
    index = dict((rid, i) for i, rid in enumerate(order))
    n_neurons = len(order)

    # Dale's law: one neurotransmitter per neuron, by synapse-weighted majority
    sign = {}
    nt_of = {}
    for rid in order:
        votes = nt_votes.get(rid)
        nt = votes.most_common(1)[0][0] if votes else "ACH"
        nt_of[rid] = nt
        sign[rid] = -1.0 if nt in INHIBITORY else 1.0

    kept = [(index[a], index[b], s) for a, b, s in edges
            if a in index and b in index]
    log("  %d neurons, %d internal edges" % (n_neurons, len(kept)))

    log("[5/6] building CSR")
    out_deg = [0] * n_neurons
    for a, _b, _s in kept:
        out_deg[a] += 1
    indptr = [0] * (n_neurons + 1)
    for i in range(n_neurons):
        indptr[i + 1] = indptr[i] + out_deg[i]
    cursor = list(indptr[:-1])
    n_edges = len(kept)
    indices = [0] * n_edges
    weights = [0.0] * n_edges
    for a, b, s in kept:
        c = cursor[a]
        indices[c] = b
        weights[c] = s * sign[order[a]] * MV_PER_SYN
        cursor[a] = c + 1

    # normalise coordinates to a unit box centred on the whole brain
    allx = [p[0] for p in pos.values()]
    ally = [p[1] for p in pos.values()]
    allz = [p[2] for p in pos.values()]
    cx = (min(allx) + max(allx)) / 2.0
    cy = (min(ally) + max(ally)) / 2.0
    cz = (min(allz) + max(allz)) / 2.0
    scale = max(max(allx) - min(allx), max(ally) - min(ally), max(allz) - min(allz)) / 2.0

    xs = [pos[r][0] for r in order]
    ys = [pos[r][1] for r in order]
    zs = [pos[r][2] for r in order]

    os.makedirs(OUT, exist_ok=True)
    circuit_bin = os.path.join(OUT, "circuit.bin")
    with open(circuit_bin, "wb") as f:
        f.write(b"FLYC")
        f.write(struct.pack("<III", 1, n_neurons, n_edges))
        f.write(struct.pack("<%di" % (n_neurons + 1), *indptr))
        f.write(struct.pack("<%di" % n_edges, *indices))
        f.write(struct.pack("<%df" % n_edges, *weights))
        flat = []
        for i in range(n_neurons):
            flat.append((xs[i] - cx) / scale)
            flat.append((ys[i] - cy) / scale)
            flat.append((zs[i] - cz) / scale)
        f.write(struct.pack("<%df" % len(flat), *flat))
    log("  wrote circuit.bin (%.2f MB)" % (os.path.getsize(circuit_bin) / 1e6))

    log("[6/6] groups, retinotopy, metadata")
    types = [cell_type.get(r, "unknown") for r in order]
    sides = [side.get(r, "center") for r in order]

    groups = defaultdict(list)
    for i, rid in enumerate(order):
        t = types[i]
        if t in SEED_TYPES:
            s = sides[i]
            suffix = "_L" if s == "left" else ("_R" if s == "right" else "")
            groups[t + suffix].append(i)
            if suffix:
                groups[t].append(i)

    # LC10a retinotopy proxy: relative drive onto AOTU019 (central) vs AOTU025
    # (peripheral) gives each LC10a cell a position in the visual field.
    aotu19 = set(i for i in range(n_neurons) if types[i] == "AOTU019")
    aotu25 = set(i for i in range(n_neurons) if types[i] == "AOTU025")
    to19 = Counter()
    to25 = Counter()
    for a, b, s in kept:
        if b in aotu19:
            to19[a] += s
        elif b in aotu25:
            to25[a] += s
    retino = [0.5] * n_neurons
    for i in range(n_neurons):
        if types[i] == "LC10a":
            a = to19.get(i, 0)
            b = to25.get(i, 0)
            retino[i] = (b / float(a + b)) if (a + b) else 0.5  # 0 central, 1 peripheral

    # EPG ring order: angle around the ellipsoid-body centroid, from real anatomy
    epg = [i for i in range(n_neurons) if types[i] == "EPG"]
    ring = [0.0] * n_neurons
    if epg:
        mx = sum(xs[i] for i in epg) / float(len(epg))
        mz = sum(zs[i] for i in epg) / float(len(epg))
        for i in epg:
            ring[i] = (math.atan2(zs[i] - mz, xs[i] - mx) + math.pi) / (2 * math.pi)

    roles = [SEED_TYPES.get(types[i], "other") for i in range(n_neurons)]

    meta = {
        "source": "FlyWire FAFB v783 (CC BY-NC 4.0)",
        "nNeurons": n_neurons,
        "nEdges": n_edges,
        "minSyn": MIN_SYN,
        "mvPerSyn": MV_PER_SYN,
        "types": types,
        "sides": sides,
        "roles": roles,
        "nt": [nt_of[r] for r in order],
        "retino": [round(v, 4) for v in retino],
        "ring": [round(v, 4) for v in ring],
        "groups": dict((k, v) for k, v in sorted(groups.items())),
    }
    meta_path = os.path.join(OUT, "circuit.json")
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, separators=(",", ":"))
    log("  wrote circuit.json (%.2f MB)" % (os.path.getsize(meta_path) / 1e6))

    # background point cloud: every neuron in the brain
    cloud_ids = sorted(pos.keys())
    sc_names = sorted(set(superclass.get(r, "unknown") for r in cloud_ids))
    sc_idx = dict((n, i) for i, n in enumerate(sc_names))
    cloud_bin = os.path.join(OUT, "cloud.bin")
    with open(cloud_bin, "wb") as f:
        f.write(b"FLYP")
        f.write(struct.pack("<III", 1, len(cloud_ids), 0))
        flat = []
        for r in cloud_ids:
            p = pos[r]
            flat.append((p[0] - cx) / scale)
            flat.append((p[1] - cy) / scale)
            flat.append((p[2] - cz) / scale)
        f.write(struct.pack("<%df" % len(flat), *flat))
        f.write(bytes(sc_idx.get(superclass.get(r, "unknown"), 0) for r in cloud_ids))
    with open(os.path.join(OUT, "cloud.json"), "w", encoding="utf-8") as f:
        json.dump({"nPoints": len(cloud_ids), "superClasses": sc_names}, f)
    log("  wrote cloud.bin (%.2f MB, %d neurons)" % (
        os.path.getsize(cloud_bin) / 1e6, len(cloud_ids)))

    log("")
    log("circuit summary")
    for name in sorted(groups):
        log("  %-14s %5d" % (name, len(groups[name])))
    return 0


if __name__ == "__main__":
    sys.exit(main())
