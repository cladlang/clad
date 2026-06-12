g = {}
for w in "apple avocado banana blueberry cherry".split():
    g.setdefault(w[0], []).append(w)
for k in sorted(g):
    print(k + ": " + " ".join(g[k]))
