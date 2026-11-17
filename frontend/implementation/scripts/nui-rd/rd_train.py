#!/usr/bin/env python3
"""RD-04: offline pilot classifier on MediaPipe landmark features (numpy only, no framework, no GPU).

  python3 -I scripts/nui-rd/rd_train.py <data_dir> <out_dir>

Inputs  : feat_{train,val,test}.json written by rd_features.ts (derived from HaGRIDv2 auto-landmarks, CC BY-SA 4.0).
Models  : multinomial logistic regression, and a small MLP (ReLU). Both export to plain JSON that a few lines of JS can run.
Protocol: fit on TRAIN, choose hyper-parameters and the epoch on VAL (macro-F1), score TEST once per chosen model.
          Subjects are disjoint across the three splits (checked below); seeds are fixed.
Outputs : model_lr.json, model_mlp.json, metrics.json, parity_test_rows.json (a few rows with the Python probabilities,
          so the TypeScript inference can be checked bit-for-bit within float tolerance).
Nothing here installs a model anywhere: the artifacts are research outputs.
"""
import hashlib
import json
import os
import sys
import time

import numpy as np

LABELS = ["FIVE", "FOUR", "THREE", "TWO", "ONE", "FIST", "THUMB_UP", "PINCH_LIKE", "OTHER"]
L = {l: i for i, l in enumerate(LABELS)}
SEED = 20260517


def load(d, split):
    f = json.load(open(os.path.join(d, f"feat_{split}.json")))
    X = np.asarray(f["X"], dtype=np.float32)
    y = np.asarray([L[l] for l in f["label"]], dtype=np.int64)
    return f, X, y


def confusion(y, p, k=len(LABELS)):
    c = np.zeros((k, k), dtype=np.int64)
    np.add.at(c, (y, p), 1)
    return c


def prf(c):
    tp = np.diag(c).astype(float)
    sup = c.sum(1).astype(float)
    pred = c.sum(0).astype(float)
    prec = np.divide(tp, pred, out=np.full_like(tp, np.nan), where=pred > 0)
    rec = np.divide(tp, sup, out=np.full_like(tp, np.nan), where=sup > 0)
    f1 = np.where((prec + rec) > 0, 2 * prec * rec / (prec + rec), 0.0)
    f1[sup == 0] = np.nan
    return prec, rec, f1, sup


def macro(c, keep=None):
    _, _, f1, sup = prf(c)
    idx = [i for i in range(len(LABELS)) if sup[i] > 0 and (keep is None or LABELS[i] in keep)]
    return float(np.nanmean(f1[idx]))


SEVEN = {"FIVE", "FOUR", "THREE", "TWO", "ONE", "PINCH_LIKE", "OTHER"}


def softmax(z):
    z = z - z.max(1, keepdims=True)
    e = np.exp(z)
    return e / e.sum(1, keepdims=True)


class Net:
    """Dense net. hidden=[] is multinomial logistic regression."""

    def __init__(self, d_in, hidden, k, rng):
        dims = [d_in] + list(hidden) + [k]
        self.W = [rng.normal(0, np.sqrt(2.0 / dims[i]), (dims[i], dims[i + 1])).astype(np.float32) for i in range(len(dims) - 1)]
        self.b = [np.zeros(dims[i + 1], dtype=np.float32) for i in range(len(dims) - 1)]

    def forward(self, X, keep=False):
        acts = [X]
        h = X
        for i, (W, b) in enumerate(zip(self.W, self.b)):
            h = h @ W + b
            if i < len(self.W) - 1:
                h = np.maximum(h, 0)
            acts.append(h)
        return (acts if keep else None), h

    def proba(self, X):
        return softmax(self.forward(X)[1])

    def params(self):
        return self.W + self.b


def fit(Xtr, ytr, Xva, yva, hidden, l2, lr, epochs, seed, cw):
    rng = np.random.default_rng(seed)
    net = Net(Xtr.shape[1], hidden, len(LABELS), rng)
    m = [np.zeros_like(p) for p in net.params()]
    v = [np.zeros_like(p) for p in net.params()]
    t = 0
    best = (-1.0, None, 0)
    n = len(Xtr)
    bs = 512
    for ep in range(1, epochs + 1):
        order = rng.permutation(n)
        for s in range(0, n, bs):
            idx = order[s : s + bs]
            xb, yb = Xtr[idx], ytr[idx]
            acts, z = net.forward(xb, keep=True)
            p = softmax(z)
            g = p.copy()
            g[np.arange(len(yb)), yb] -= 1
            g *= (cw[yb] / len(yb))[:, None]
            gW, gb = [None] * len(net.W), [None] * len(net.W)
            for i in reversed(range(len(net.W))):
                gW[i] = acts[i].T @ g + l2 * net.W[i]
                gb[i] = g.sum(0)
                if i > 0:
                    g = (g @ net.W[i].T) * (acts[i] > 0)
            t += 1
            grads = gW + gb
            for j, (p_, g_) in enumerate(zip(net.params(), grads)):
                m[j] = 0.9 * m[j] + 0.1 * g_
                v[j] = 0.999 * v[j] + 0.001 * g_ * g_
                mh = m[j] / (1 - 0.9**t)
                vh = v[j] / (1 - 0.999**t)
                p_ -= lr * mh / (np.sqrt(vh) + 1e-8)
        score = macro(confusion(yva, net.proba(Xva).argmax(1)))
        if score > best[0]:
            best = (score, [p.copy() for p in net.params()], ep)
    k = len(net.W)
    net.W, net.b = best[1][:k], best[1][k:]
    return net, best[0], best[2]


def export(path, net, mu, sd, name, meta):
    doc = {
        "name": name,
        "labels": LABELS,
        "feature_names": meta["feature_names"],
        "mean": [float(x) for x in mu],
        "std": [float(x) for x in sd],
        "layers": [{"W": W.astype(np.float32).tolist(), "b": b.astype(np.float32).tolist()} for W, b in zip(net.W, net.b)],
        "activation": "relu",
        "meta": meta,
    }
    s = json.dumps(doc, separators=(",", ":"))
    open(path, "w").write(s)
    return hashlib.sha256(s.encode()).hexdigest(), len(s)


def main(d, out):
    os.makedirs(out, exist_ok=True)
    ftr, Xtr, ytr = load(d, "train")
    fva, Xva, yva = load(d, "val")
    fte, Xte, yte = load(d, "test")
    ut, uv, ue = set(ftr["user"]), set(fva["user"]), set(fte["user"])
    overlap = {"train&val": len(ut & uv), "train&test": len(ut & ue), "val&test": len(uv & ue)}
    assert sum(overlap.values()) == 0, f"subjects leak across splits: {overlap}"
    mu, sd = Xtr.mean(0), Xtr.std(0) + 1e-6
    Ztr, Zva, Zte = [(x - mu) / sd for x in (Xtr, Xva, Xte)]
    counts = np.bincount(ytr, minlength=len(LABELS)).astype(float)
    cw = (counts.sum() / (len(LABELS) * np.maximum(counts, 1))) ** 0.5
    print("train rows", len(Ztr), "val", len(Zva), "test", len(Zte), "overlap", overlap)
    print("train class counts", dict(zip(LABELS, counts.astype(int))))

    grid = [
        ("lr", [], 1e-4, 3e-3, 40),
        ("lr", [], 1e-3, 3e-3, 40),
        ("mlp", [32], 1e-4, 3e-3, 40),
        ("mlp", [64, 32], 1e-4, 3e-3, 40),
        ("mlp", [64, 32], 1e-3, 3e-3, 40),
    ]
    chosen = {}
    log = []
    for kind, hidden, l2, lr, epochs in grid:
        t0 = time.time()
        net, vs, ep = fit(Ztr, ytr, Zva, yva, hidden, l2, lr, epochs, SEED, cw)
        log.append({"kind": kind, "hidden": hidden, "l2": l2, "lr": lr, "val_macroF1": round(vs, 4), "best_epoch": ep, "seconds": round(time.time() - t0, 1)})
        print(log[-1], flush=True)
        if kind not in chosen or vs > chosen[kind][1]:
            chosen[kind] = (net, vs, ep, hidden, l2, lr)

    metrics = {"subject_overlap": overlap, "grid": log, "seed": SEED, "models": {}}
    cls_arr = np.asarray(fte["cls"])
    artifacts = {}
    for kind, (net, vs, ep, hidden, l2, lr) in chosen.items():
        pva = net.proba(Zva).argmax(1)
        pte_p = net.proba(Zte)
        pte = pte_p.argmax(1)
        cv, ct = confusion(yva, pva), confusion(yte, pte)
        prec, rec, f1, sup = prf(ct)
        five = L["FIVE"]
        false_hapus = {}
        for c in sorted(set(fte["cls"])):
            mask = cls_arr == c
            false_hapus[c] = round(float((pte[mask] == five).mean()) * 100, 1)
        non_five = yte != five
        metrics["models"][kind] = {
            "hidden": hidden, "l2": l2, "lr": lr, "best_epoch": ep,
            "val": {"macroF1_9": round(macro(cv), 4), "macroF1_7": round(macro(cv, SEVEN), 4), "acc": round(float(np.trace(cv) / cv.sum()), 4)},
            "test": {
                "macroF1_9": round(macro(ct), 4), "macroF1_7": round(macro(ct, SEVEN), 4), "acc": round(float(np.trace(ct) / ct.sum()), 4),
                "perClass": [{"label": LABELS[i], "support": int(sup[i]), "precision": None if np.isnan(prec[i]) else round(float(prec[i]), 4), "recall": None if np.isnan(rec[i]) else round(float(rec[i]), 4), "f1": None if np.isnan(f1[i]) else round(float(f1[i]), 4)} for i in range(len(LABELS))],
                "confusion": ct.tolist(),
                "predictedFivePctBySourceClass": false_hapus,
                "falseHapusRatePct": round(float((pte[non_five] == five).mean()) * 100, 2),
                "fiveRecallPct": round(float((pte[~non_five] == five).mean()) * 100, 2),
            },
            "n_params": int(sum(p.size for p in net.params())),
        }
        meta = {"feature_names": fte["names"], "trained_on": "HaGRIDv2 auto-landmarks (CC BY-SA 4.0), train split, subject-disjoint from val/test", "seed": SEED, "hidden": hidden, "l2": l2, "aspect_assumed": 16 / 9, "status": "RESEARCH ARTIFACT, NOT INSTALLED"}
        sha, size = export(os.path.join(out, f"model_{kind}.json"), net, mu, sd, f"landmark-{kind}-pilot", meta)
        artifacts[kind] = {"file": f"model_{kind}.json", "sha256": sha, "bytes": size}
        if kind == "mlp":
            rows = np.random.default_rng(1).choice(len(Xte), 200, replace=False)
            json.dump({"X": Xte[rows].tolist(), "proba": net.proba(Zte[rows]).tolist()}, open(os.path.join(out, "parity_mlp.json"), "w"))
        else:
            rows = np.random.default_rng(1).choice(len(Xte), 200, replace=False)
            json.dump({"X": Xte[rows].tolist(), "proba": net.proba(Zte[rows]).tolist()}, open(os.path.join(out, "parity_lr.json"), "w"))
        np.save(os.path.join(out, f"test_pred_{kind}.npy"), pte)
    metrics["artifacts"] = artifacts
    json.dump(metrics, open(os.path.join(out, "metrics.json"), "w"), indent=1)
    for k, m in metrics["models"].items():
        print(k, "VAL", m["val"], "TEST", {x: m["test"][x] for x in ("macroF1_9", "macroF1_7", "acc", "falseHapusRatePct", "fiveRecallPct")})


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
