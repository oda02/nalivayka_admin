# Minimal AES-CBC bit-flip demo for CTF-style testing
# Requires: pycryptodome (pip install pycryptodome)

import base64
import os

from Crypto.Cipher import AES


# ---- Helpers ----
def pkcs7_pad(data: bytes, block: int = 16) -> bytes:
    n = block - (len(data) % block)
    return data + bytes([n]) * n

def pkcs7_unpad(data: bytes, block: int = 16) -> bytes:
    if not data or len(data) % block != 0:
        raise ValueError("bad padding")
    n = data[-1]
    if n == 0 or n > block or data[-n:] != bytes([n]) * n:
        raise ValueError("bad padding")
    return data[:-n]

# ---- Service state ----
KEY = os.urandom(16)
PREFIX = b"uid=10;role=user;name="
SUFFIX = b";expires=2099-12-31"
TARGET = b";admin=true;"

# ---- Oracle-like API ----

def encrypt(name: str) -> str:
    # sanitize input as in classic challenge
    clean = name.replace(";", "").replace("=", "").encode()
    pt = PREFIX + clean + SUFFIX
    iv = os.urandom(16)
    cipher = AES.new(KEY, AES.MODE_CBC, iv)
    ct = cipher.encrypt(pkcs7_pad(pt))
    return base64.b64encode(iv + ct).decode()


def check(token_b64: str) -> str:
    raw = base64.b64decode(token_b64)
    iv, ct = raw[:16], raw[16:]
    cipher = AES.new(KEY, AES.MODE_CBC, iv)
    pt = pkcs7_unpad(cipher.decrypt(ct))
    return "OK" if TARGET in pt else "NO"

# ---- Attacker side (bit flipping) ----

def bitflip_attack() -> tuple[str, bytes]:
    # choose a name so that a whole block of 'A's starts exactly at a block boundary
    padA = (16 - (len(PREFIX) % 16)) % 16
    name = "A" * (padA + 16)  # one clean block of 'A' * 16 after filling the prefix remainder

    token = encrypt(name)
    raw = base64.b64decode(token)
    iv = bytearray(raw[:16])
    ct = bytearray(raw[16:])

    # Split ciphertext into 16-byte blocks
    blocks = [bytearray(ct[i:i+16]) for i in range(0, len(ct), 16)]

    # Index of the FULL 'A'*16 block in plaintext:
    # After PREFIX, we add padA A's to complete block1; the next block (index 2 here) is 'A'*16
    idx_fullA = (len(PREFIX) + padA) // 16

    # We want to modify plaintext block at idx_fullA.
    # In CBC, flipping bytes in the PREVIOUS ciphertext block affects this block.
    if idx_fullA == 0:
        prev = iv
    else:
        prev = blocks[idx_fullA - 1]

    # Inject TARGET at the START of that block by turning 'A'*len(TARGET) -> TARGET
    original = b"A" * len(TARGET)
    delta = bytes([a ^ b for a, b in zip(original, TARGET)])

    for i in range(len(delta)):
        prev[i] ^= delta[i]

    # Reassemble token
    if idx_fullA == 0:
        new_iv = bytes(iv)
    else:
        blocks[idx_fullA - 1] = prev
        new_iv = bytes(iv)
    new_ct = b"".join(blocks)

    forged = base64.b64encode(new_iv + new_ct).decode()
    return forged, TARGET


if __name__ == "__main__":
    print("[+] Generating honest token...")
    honest = encrypt("A" * 5)
    print("check(honest) =", check(honest))  # should be NO

    print("[+] Running bit-flip attack...")
    forged, target = bitflip_attack()
    res = check(forged)
    print("check(forged) =", res)  # should be OK
    assert res == "OK"
    print("[+] Success: injected", target)
