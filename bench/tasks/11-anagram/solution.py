def ana(a, b):
    return "yes" if sorted(a) == sorted(b) else "no"
print(ana("listen", "silent"))
print(ana("hello", "world"))
