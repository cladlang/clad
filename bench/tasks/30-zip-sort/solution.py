for name, score in sorted(zip(["a", "b", "c"], [3, 1, 2]), key=lambda p: -p[1]):
    print(name, score)
