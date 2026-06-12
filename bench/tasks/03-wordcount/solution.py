words = "the quick brown fox jumps over the lazy dog the end".split(" ")
counts = {}
for w in words:
    if w in counts:
        counts[w] += 1
    else:
        counts[w] = 1
print(counts["the"])
print(len(counts))
