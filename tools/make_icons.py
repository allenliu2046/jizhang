#!/usr/bin/env python3
"""生成 PWA 图标：翠绿渐变底 + 白色 ¥ 符号。纯标准库，无依赖。

用法: python3 tools/make_icons.py
输出: icons/icon-180.png, icons/icon-192.png, icons/icon-512.png
"""
import math
import os
import struct
import zlib

# ¥ 符号的笔画（单位坐标系，(0,0) 左上 → (1,1) 右下）
SEGMENTS = [
    ((0.320, 0.260), (0.500, 0.505)),  # 左撇
    ((0.680, 0.260), (0.500, 0.505)),  # 右捺
    ((0.500, 0.505), (0.500, 0.760)),  # 竖
    ((0.350, 0.550), (0.650, 0.550)),  # 上横
    ((0.350, 0.660), (0.650, 0.660)),  # 下横
]
HALF_W = 0.036          # 笔画半宽（相对边长）
TOP = (52, 211, 153)    # 渐变顶色 #34D399
BOT = (4, 120, 87)      # 渐变底色 #047857
INK = (255, 255, 255)   # 笔画颜色


def seg_dist(px, py, a, b):
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy
    t = ((px - ax) * dx + (py - ay) * dy) / L2
    t = 0.0 if t < 0.0 else (1.0 if t > 1.0 else t)
    ex, ey = ax + t * dx - px, ay + t * dy - py
    return math.sqrt(ex * ex + ey * ey)


def render(size):
    aa = 1.2 / size  # 抗锯齿过渡宽度
    rows = []
    for y in range(size):
        v = (y + 0.5) / size
        row = bytearray()
        for x in range(size):
            u = (x + 0.5) / size
            t = min(1.0, max(0.0, v * 0.85 + u * 0.15))
            r = TOP[0] + (BOT[0] - TOP[0]) * t
            g = TOP[1] + (BOT[1] - TOP[1]) * t
            b = TOP[2] + (BOT[2] - TOP[2]) * t
            # 只在符号包围盒内算距离，其余纯背景
            if 0.24 < u < 0.76 and 0.20 < v < 0.82:
                d = min(seg_dist(u, v, a, bp) for a, bp in SEGMENTS)
                cov = (HALF_W + aa - d) / aa
                cov = 0.0 if cov < 0.0 else (1.0 if cov > 1.0 else cov)
                if cov > 0.0:
                    r += (INK[0] - r) * cov
                    g += (INK[1] - g) * cov
                    b += (INK[2] - b) * cov
            row += bytes((int(r + 0.5), int(g + 0.5), int(b + 0.5)))
        rows.append(bytes(row))
    return rows


def chunk(tag, data):
    body = tag + data
    return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)


def write_png(path, size, rows):
    raw = b"".join(b"\x00" + r for r in rows)
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", ihdr))
        f.write(chunk(b"IDAT", zlib.compress(raw, 9)))
        f.write(chunk(b"IEND", b""))


def main():
    out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "icons")
    os.makedirs(out, exist_ok=True)
    for size in (512, 192, 180):
        path = os.path.join(out, f"icon-{size}.png")
        write_png(path, size, render(size))
        print(f"wrote {path}")


if __name__ == "__main__":
    main()
