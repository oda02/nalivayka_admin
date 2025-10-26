import base64
import os

from Crypto.Cipher import AES

BLOCK = 16
KEY = os.urandom(16)


def pkcs7_pad(data: bytes, block: int = BLOCK) -> bytes:
    pad_len = block - (len(data) % block)
    return data + bytes([pad_len]) * pad_len


def pkcs7_unpad(data: bytes, block: int = BLOCK) -> bytes:
    if not data or len(data) % block != 0:
        raise ValueError("bad padding")
    n = data[-1]
    if n == 0 or n > block or data[-n:] != bytes([n]) * n:
        raise ValueError("bad padding")
    return data[:-n]


def enc_session(name: str) -> str:
    kv = {"user": name, "admin": "false", "expires": "2099-12-31"}
    pt = build_kv_semicolons(kv)
    iv = os.urandom(BLOCK)
    ct = AES.new(KEY, AES.MODE_CBC, iv).encrypt(pkcs7_pad(pt))
    return base64.b64encode(iv + ct).decode()


def dec_session(token_b64: str) -> bytes:
    raw = base64.b64decode(token_b64)
    iv, ct = raw[:BLOCK], raw[BLOCK:]
    pt = pkcs7_unpad(AES.new(KEY, AES.MODE_CBC, iv).decrypt(ct))
    return pt


def parse_kv_semicolons(pt: bytes) -> dict[str, str]:
    """Parse a semicolon-separated key-value pair into a dictionary."""
    out: dict[str, str] = {}
    for chunk in pt.split(b";"):
        if not chunk:
            continue
        if b"=" in chunk:
            k, v = chunk.split(b"=", 1)
            out[k.decode(errors="ignore")] = v.decode(errors="ignore")
        else:
            out[chunk.decode(errors="ignore")] = ""
    return out


def build_kv_semicolons(kv: dict[str, str]) -> bytes:
    """
    Serialize a dict into semicolon-separated key/value bytes.

    Example: {"user": "alice", "admin": "false"} -> b"user=alice;admin=false"
    """
    parts: list[bytes] = []
    for key, value in kv.items():
        key_b = str(key).encode()
        if value == "":
            parts.append(key_b)
        else:
            parts.append(key_b + b"=" + str(value).encode())
    return b";".join(parts)
