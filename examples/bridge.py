"""Minimal non-JS host: one plain frame, no terminal/input ownership.

python examples/bridge.py [--bridge /installed/path/retrieviewer-stdio.mjs]
Use request(op='tick', dt=elapsed_seconds, columns=..., rows=...) in your TUI loop.
Node >=20 is required. Only Python's standard library is used.
"""
import argparse
import json
from pathlib import Path
import subprocess
import sys


class PetBridge:
    def __init__(self, bridge):
        self.process = subprocess.Popen(
            ["node", str(bridge)], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            text=True, encoding="utf-8", bufsize=1,
        )
        self.serial = 0
        try:
            ready = json.loads(self.process.stdout.readline())
            if ready != {"event": "ready", "protocol": 1}:
                raise RuntimeError("Unsupported pet protocol")
        except BaseException:
            self.close()
            raise

    def request(self, **request):
        self.serial += 1
        request["id"] = self.serial
        self.process.stdin.write(json.dumps(request) + "\n")
        self.process.stdin.flush()
        response = json.loads(self.process.stdout.readline())
        if response.get("id") != self.serial or not response.get("ok"):
            raise RuntimeError(response.get("error", "Pet protocol mismatch"))
        return response

    def close(self):
        if self.process.stdin and not self.process.stdin.closed:
            self.process.stdin.close()  # EOF releases pet even after host errors.
        try:
            self.process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            self.process.terminate()
            self.process.wait(timeout=5)
        finally:
            self.process.stdout.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bridge", type=Path,
                        default=Path(__file__).resolve().parents[1] / "retrieviewer-stdio.mjs")
    args = parser.parse_args()
    pet = PetBridge(args.bridge)
    try:
        frame = pet.request(op="tick", dt=1 / 30, columns=48, rows=14)
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stdout.write(frame["text"] + "\n")
    finally:
        pet.close()
