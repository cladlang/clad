from collections import Counter
c = Counter("banana")
for k in sorted(c):
    print(f"{k}:{c[k]}")
