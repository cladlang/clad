from collections import Counter
w, n = Counter("a b c a b a d c a b".split()).most_common(1)[0]
print(w, n)
