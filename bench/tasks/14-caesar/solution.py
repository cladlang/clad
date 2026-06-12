print("".join(c if c == " " else chr((ord(c) - 97 + 3) % 26 + 97) for c in "hello world"))
