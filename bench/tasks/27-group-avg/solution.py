ws = "eng 100 eng 200 ops 150 ops 250 ops 200".split()
g = {}
for d, s in zip(ws[::2], ws[1::2]):
    g.setdefault(d, []).append(int(s))
for d in sorted(g):
    print(d, sum(g[d]) // len(g[d]))
