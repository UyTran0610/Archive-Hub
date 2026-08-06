#!/usr/bin/env python3
"""
Video Batch Downscale 1080p/4K → 720p
Requires: ffmpeg installed on system
"""

import os
import sys
import time
import signal
import subprocess
import threading
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

# ──────────────────────────────────────────────
#  CONFIG  (chỉnh tùy ý)
# ──────────────────────────────────────────────
MAX_WORKERS   = 1           # veryslow dùng ~100% CPU/video → mặc định 1 worker (Chỉ tăng nếu dùng preset fast/medium)
OUTPUT_SUFFIX = "_720p"     # Hậu tố thêm vào tên file output
OUTPUT_EXT    = ".mp4"      # Định dạng output
CRF           = 20          # Chất lượng: 18 (cao) → 28 (thấp), 23 = cân bằng tốt
PRESET        = "slow"  # Tốc độ encode: ultrafast/fast/medium/slow/veryslow (⚠ veryslow + MAX_WORKERS>1 sẽ phản tác dụng)
AUDIO_BITRATE = "128k"      # Bitrate audio output
VIDEO_CODEC   = "libx264"   # Codec: libx264 (phổ biến) (libx265 nhỏ hơn ~40%, cần thêm -tag:v hvc1 cho iOS/macOS)
FFMPEG_TIMEOUT = 3600       # Timeout mỗi video (giây) — tránh treo vô thời hạn
MIN_OUTPUT_SIZE = 1024      # Byte tối thiểu của file output hợp lệ

# ──────────────────────────────────────────────
#  ANSI COLORS
# ──────────────────────────────────────────────
R    = "\033[91m"
G    = "\033[92m"
Y    = "\033[93m"
B    = "\033[94m"
M    = "\033[95m"
C    = "\033[96m"
W    = "\033[97m"
DIM  = "\033[2m"
BOLD = "\033[1m"
RST  = "\033[0m"

LOCK = threading.Lock()

# Track các file đang được ghi để dọn dẹp khi Ctrl+C
_active_outputs: set[Path] = set()
_active_lock = threading.Lock()

# ──────────────────────────────────────────────
#  SIGNAL HANDLER — dọn file dở khi Ctrl+C
# ──────────────────────────────────────────────

def _cleanup_and_exit(sig, frame):
    print(f"\n\n{Y}⚠  Bị ngắt! Đang dọn dẹp file chưa hoàn thành…{RST}")
    with _active_lock:
        for p in list(_active_outputs):
            if p.exists():
                try:
                    p.unlink()
                    print(f"  {R}✗ Đã xóa file dở:{RST} {p.name}")
                except OSError:
                    pass
    print(f"{Y}Đã dọn xong. Thoát.{RST}\n")
    sys.exit(1)

signal.signal(signal.SIGINT,  _cleanup_and_exit)
signal.signal(signal.SIGTERM, _cleanup_and_exit)

# ──────────────────────────────────────────────
#  HELPERS
# ──────────────────────────────────────────────

def banner():
    print(f"""
{C}╔══════════════════════════════════════════════════════╗
║  {BOLD}{W}🎬  VIDEO BATCH CONVERTER  ·  1080p/4K → 720p{RST}{C}       ║
║  {DIM}FFmpeg · H.264 · CRF {CRF} · {PRESET}{RST}{C}                       ║
╚══════════════════════════════════════════════════════╝{RST}
""")

def human_size(path: Path) -> str:
    b = path.stat().st_size
    for unit in ("KB", "MB", "GB"):
        b /= 1024
        if b < 1024:
            return f"{b:.1f} {unit}"
    return f"{b:.1f} GB"

def check_ffmpeg():
    try:
        subprocess.run(["ffmpeg", "-version"], capture_output=True, check=True)
        return True
    except (FileNotFoundError, subprocess.CalledProcessError):
        return False

def get_video_resolution(path: Path):
    """Trả về (width, height) hoặc (0,0) nếu lỗi."""
    cmd = [
        "ffprobe", "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height",
        "-of", "csv=p=0",
        str(path)
    ]
    try:
        out = subprocess.check_output(cmd, stderr=subprocess.DEVNULL, timeout=30).decode().strip()
        w, h = out.split(",")
        return int(w), int(h)
    except Exception:
        return 0, 0

def collect_videos(folder: Path, recursive: bool = False) -> list[Path]:
    """Scan video files. recursive=True để quét cả subfolder."""
    exts = {".mp4", ".mkv", ".mov", ".avi", ".wmv", ".flv", ".webm", ".m4v"}
    if recursive:
        return sorted(p for p in folder.rglob("*")
                      if p.is_file() and p.suffix.lower() in exts)
    return sorted(p for p in folder.iterdir()
                  if p.is_file() and p.suffix.lower() in exts)

def is_partial_output(path: Path) -> bool:
    """Kiểm tra file có phải output dở (từ lần chạy bị ngắt trước) không."""
    return path.exists() and path.stat().st_size < MIN_OUTPUT_SIZE

# ──────────────────────────────────────────────
#  CORE CONVERTER
# ──────────────────────────────────────────────

def convert_video(src: Path, out_dir: Path, idx: int, total: int) -> dict:
    stem = src.stem
    dst  = out_dir / f"{stem}{OUTPUT_SUFFIX}{OUTPUT_EXT}"

    # Bỏ qua nếu đã convert thành công (file hợp lệ, không phải file dở)
    if dst.exists():
        if is_partial_output(dst):
            with LOCK:
                print(f"  {Y}[RETRY]{RST} {stem} — file dở từ lần trước, convert lại")
            dst.unlink()
        else:
            with LOCK:
                print(f"  {Y}[SKIP]{RST} {stem} — đã tồn tại ({human_size(dst)})")
            return {"src": src, "dst": dst, "status": "skipped"}

    src_size = src.stat().st_size
    w, h = get_video_resolution(src)
    res_tag = f"{w}×{h}" if w else "unknown"

    with LOCK:
        print(f"  {B}[{idx:02d}/{total:02d}]{RST} {W}{stem}{RST}  {DIM}({res_tag}, {human_size(src)}){RST}")

    # Xác định cạnh ngắn để scale đúng cho cả video ngang lẫn dọc
    short_side = min(w, h) if w and h else h
    if short_side > 720:
        if w <= h:
            scale_filter = "scale=720:-2"   # portrait / dọc
        else:
            scale_filter = "scale=-2:720"   # landscape / ngang
    else:
        scale_filter = "scale=trunc(iw/2)*2:trunc(ih/2)*2"

    cmd = [
        "ffmpeg", "-y",
        "-i", str(src),
        "-vf", scale_filter,
        "-c:v", VIDEO_CODEC,
        "-crf", str(CRF),
        "-preset", PRESET,
        "-c:a", "aac",
        "-b:a", AUDIO_BITRATE,
        "-movflags", "+faststart",
        "-loglevel", "error",
        str(dst)
    ]

    # Đăng ký file đang ghi để cleanup khi Ctrl+C
    with _active_lock:
        _active_outputs.add(dst)

    t0 = time.time()
    try:
        subprocess.run(cmd, check=True, stderr=subprocess.PIPE, timeout=FFMPEG_TIMEOUT)
        elapsed = time.time() - t0

        # Validate output — ffmpeg đôi khi exit 0 nhưng file rỗng/corrupt
        if not dst.exists() or dst.stat().st_size < MIN_OUTPUT_SIZE:
            raise ValueError(f"Output file quá nhỏ hoặc không tồn tại ({dst.stat().st_size if dst.exists() else 0} bytes)")

        ratio = dst.stat().st_size / src_size * 100
        with LOCK:
            print(f"    {G}✓ Done{RST}  {human_size(dst)}  {DIM}({ratio:.0f}% kích thước gốc, {elapsed:.1f}s){RST}")
        return {"src": src, "dst": dst, "status": "ok", "elapsed": elapsed, "ratio": ratio, "src_size": src_size}

    except subprocess.TimeoutExpired:
        err = f"Timeout sau {FFMPEG_TIMEOUT}s"
        with LOCK:
            print(f"    {R}✗ Lỗi:{RST} {err}")
        if dst.exists():
            dst.unlink()
        return {"src": src, "dst": dst, "status": "error", "error": err}

    except (subprocess.CalledProcessError, ValueError) as e:
        if isinstance(e, subprocess.CalledProcessError):
            err = e.stderr.decode(errors="replace").strip().splitlines()[-1] if e.stderr else "unknown"
        else:
            err = str(e)
        with LOCK:
            print(f"    {R}✗ Lỗi:{RST} {err}")
        if dst.exists():
            dst.unlink()
        return {"src": src, "dst": dst, "status": "error", "error": err}

    finally:
        # Gỡ khỏi danh sách active dù thành công hay thất bại
        with _active_lock:
            _active_outputs.discard(dst)

# ──────────────────────────────────────────────
#  MAIN
# ──────────────────────────────────────────────

def main():
    banner()

    # ── Kiểm tra ffmpeg ──
    if not check_ffmpeg():
        print(f"{R}✗ Không tìm thấy ffmpeg!{RST}")
        print(f"  Cài đặt: {Y}winget install ffmpeg{RST}  hoặc  {Y}choco install ffmpeg{RST}")
        sys.exit(1)
    print(f"{G}✓ FFmpeg OK{RST}\n")

    # ── Chọn thư mục input ──
    default_input = Path(".")
    raw = input(f"{W}📂 Thư mục chứa video {DIM}[Enter = thư mục hiện tại]{RST}: ").strip()
    input_dir = Path(raw) if raw else default_input
    if not input_dir.is_dir():
        print(f"{R}✗ Không tìm thấy thư mục: {input_dir}{RST}")
        sys.exit(1)

    # ── Chọn thư mục output ──
    default_out = input_dir / "720p_output"
    raw2 = input(f"{W}💾 Thư mục lưu output {DIM}[Enter = {default_out.name}]{RST}: ").strip()
    out_dir = Path(raw2) if raw2 else default_out
    out_dir.mkdir(parents=True, exist_ok=True)

    # ── Hỏi recursive ──
    rec_ans = input(f"{W}🔍 Quét cả subfolder? {DIM}[y/N]{RST}: ").strip().lower()
    recursive = rec_ans == "y"

    # ── Scan video ──
    videos = collect_videos(input_dir, recursive=recursive)

    # Lọc bỏ các file nằm trong out_dir (tránh convert lại output cũ)
    videos = [v for v in videos if out_dir not in v.parents and v.parent != out_dir]

    if not videos:
        print(f"{Y}⚠  Không tìm thấy video nào trong: {input_dir}{RST}")
        sys.exit(0)

    print(f"\n{C}══ Tìm thấy {len(videos)} video ══{RST}")
    for v in videos:
        w, h = get_video_resolution(v)
        tag   = f"{h}p" if h else "?"
        arrow = f"  {B}→ 720p{RST}" if h > 720 else f"  {DIM}(đã ≤720p){RST}"
        rel   = v.relative_to(input_dir) if recursive else Path(v.name)
        print(f"  {DIM}•{RST} {rel}  {Y}[{tag}]{RST}{arrow}")

    # ── Cảnh báo preset + workers ──
    if MAX_WORKERS > 1 and PRESET in ("slow", "veryslow"):
        print(f"\n{Y}⚠  CẢNH BÁO: MAX_WORKERS={MAX_WORKERS} với preset '{PRESET}' sẽ khiến CPU tranh nhau{RST}")
        print(f"   {DIM}Khuyến nghị: MAX_WORKERS=1 khi dùng slow/veryslow{RST}")

    # ── Xác nhận ──
    print(f"\n{W}Workers song song: {C}{MAX_WORKERS}{RST}   "
          f"{W}CRF: {C}{CRF}{RST}   {W}Preset: {C}{PRESET}{RST}   "
          f"{W}Codec: {C}{VIDEO_CODEC}{RST}   "
          f"{W}Timeout: {C}{FFMPEG_TIMEOUT}s/video{RST}")
    confirm = input(f"\n{W}Bắt đầu convert? [y/N]: {RST}").strip().lower()
    if confirm != "y":
        print("Hủy.")
        sys.exit(0)

    # ── Convert ──
    print(f"\n{C}══ Đang convert… ══{RST}\n")
    t_start = time.time()
    results = []

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futures = {
            ex.submit(convert_video, v, out_dir, i + 1, len(videos)): v
            for i, v in enumerate(videos)
        }
        for fut in as_completed(futures):
            results.append(fut.result())

    # ── Tổng kết ──
    total_time = time.time() - t_start
    ok      = [r for r in results if r["status"] == "ok"]
    skipped = [r for r in results if r["status"] == "skipped"]
    errors  = [r for r in results if r["status"] == "error"]

    print(f"\n{C}══ Kết quả ══{RST}")
    print(f"  {G}✓ Thành công : {len(ok)}{RST}")
    print(f"  {Y}↷ Bỏ qua    : {len(skipped)}{RST}")
    print(f"  {R}✗ Lỗi       : {len(errors)}{RST}")
    print(f"  {DIM}⏱ Tổng thời gian: {total_time:.1f}s{RST}")

    if ok:
        avg_ratio = sum(r["ratio"] for r in ok) / len(ok)
        src_total = sum(r["src_size"] for r in ok)
        dst_total = sum(r["dst"].stat().st_size for r in ok)
        saved     = (src_total - dst_total) / 1024 / 1024
        print(f"  {G}💾 Giảm dung lượng trung bình: {avg_ratio:.0f}% — tiết kiệm ~{saved:.1f} MB{RST}")

    if errors:
        print(f"\n{R}Danh sách lỗi:{RST}")
        for r in errors:
            print(f"  • {r['src'].name}: {r.get('error', '?')}")

    print(f"\n{G}Output: {out_dir.resolve()}{RST}\n")


if __name__ == "__main__":
    main()