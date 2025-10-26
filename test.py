import base64

BLOCK = 16


def forge_cookie(cookie_b64: str, name_len: int) -> str:
    raw = bytearray(base64.b64decode(cookie_b64))
    iv, ct = raw[:BLOCK], raw[BLOCK:]
    blocks = [bytearray(ct[i : i + BLOCK]) for i in range(0, len(ct), BLOCK)]

    # где начинается 'false'
    offset_false = 5 + name_len + 7  # "user=" + name + ";admin="
    block_idx, pos = divmod(offset_false, BLOCK)

    orig = b"false"
    want = b"true;"

    # выбираем «предыдущий шифроблок»
    if block_idx == 0:
        prev = iv
    else:
        prev = blocks[block_idx - 1]
    # флипим нужные позиции
    for i in range(len(want)):
        prev[pos + i] ^= orig[i] ^ want[i]

    # собираем обратно
    if block_idx == 0:
        forged = bytes(prev) + b"".join(bytes(b) for b in blocks)
    else:
        blocks[block_idx - 1] = prev
        forged = bytes(iv) + b"".join(bytes(b) for b in blocks)

    return base64.b64encode(forged).decode()


print(
    forge_cookie(
        "NVBpIlx8Rhm2C6NV432Q1Kq5rsIYBy0ZKx9VeEAP+cBLXcYQsl8/HNTxV1DIKv1RaUAri6j0YkYPVAaXSZqL90ldsawC+upv68dx2Fa7uV4=",
        15,
    )
)
