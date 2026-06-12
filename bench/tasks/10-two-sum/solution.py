def two_sum(xs, target):
    seen = {}
    for i, x in enumerate(xs):
        if target - x in seen:
            return [seen[target - x], i]
        seen[x] = i
    return []

r = two_sum([2, 7, 11, 15], 26)
print(r[0], r[1])
