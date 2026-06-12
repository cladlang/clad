from itertools import groupby
print("".join(c + str(len(list(g))) for c, g in groupby("aaabccccd")))
