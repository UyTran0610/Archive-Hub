#!/usr/bin/env python3
"""
Video Batch Downscale — chuyển đổi hàng loạt video sang độ phân giải bạn chọn
Requires: ffmpeg + ffprobe installed on system

Script sẽ tự động quét video trong CHÍNH thư mục chứa file .py này (không quét subfolder).
"""

import os
import sys
import json
import time
import signal
import subprocess
import threading
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

# ──────────────────────────────────────────────
#  CONFIG  (chỉnh tùy ý)
# ──────────────────────────────────────────────
MAX_WORKERS      = 1           # veryslow dùng ~100% CPU/video → mặc định 1 worker (Chỉ tăng nếu dùng preset fast/medium)
OUTPUT_EXT       = ".mp4"      # Định dạng output
CRF              = 20          # Chất lượng: 18 (cao) → 28 (thấp), 23 = cân bằng tốt
PRESET           = "slow"      # Tốc độ encode: ultrafast/fast/medium/slow/veryslow (⚠ veryslow + MAX_WORKERS>1 sẽ phản tác dụng)
AUDIO_BITRATE    = "128k"      # Bitrate audio output
VIDEO_CODEC      = "libx264"   # Codec: libx264 (phổ biến) (libx265 nhỏ hơn ~40%, cần thêm -tag:v hvc1 cho iOS/macOS)
FFMPEG_TIMEOUT   = 3600        # Timeout mỗi video (giây) — tránh treo vô thời hạn
MIN_OUTPUT_SIZE  = 1024        # Byte tối thiểu của file output hợp lệ

RESOLUTION_PRESETS = {         # menu chọn độ phân giải đầu ra (cạnh ngắn, theo chiều dọc)
    "1": 480,
    "2": 720,
    "3": 1080,
    "4": 1440,
}

VIDEO_EXTS = {".mp4", ".mkv", ".mov", ".avi", ".wmv", ".flv", ".webm", ".m4v"}

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
                except OSError as e:
                    print(f"  {R}✗ Không xóa được {p.name}: {e}{RST}")
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
║  {BOLD}{W}🎬  VIDEO BATCH DOWNSCALER{RST}{C}                          ║
║  {DIM}FFmpeg · H.264 · CRF {CRF} · {PRESET}{RST}{C}                      ║
╚══════════════════════════════════════════════════════╝{RST}
""")

def human_size(path: Path) -> str:
    """Trả về kích thước file dạng dễ đọc. Trả về '?' nếu không đọc được."""
    try:
        b = path.stat().st_size
    except OSError:
        return "?"
    for unit in ("KB", "MB", "GB"):
        b /= 1024
        if b < 1024:
            return f"{b:.1f} {unit}"
    return f"{b:.1f} GB"

def check_ffmpeg() -> bool:
    """Kiểm tra ffmpeg VÀ ffprobe (script cần cả hai). In rõ cái nào thiếu."""
    missing = []
    for tool in ("ffmpeg", "ffprobe"):
        try:
            subprocess.run([tool, "-version"], capture_output=True, check=True, timeout=10)
        except FileNotFoundError:
            missing.append(tool)
        except subprocess.CalledProcessError:
            missing.append(f"{tool} (lỗi khi chạy)")
        except subprocess.TimeoutExpired:
            missing.append(f"{tool} (timeout)")
    if missing:
        print(f"{R}✗ Thiếu: {', '.join(missing)}{RST}")
        return False
    return True

def get_video_resolution(path: Path):
    """Trả về (width, height) THEO HƯỚNG HIỂN THỊ THỰC TẾ, hoặc (0, 0) nếu không đọc được
    (file lỗi/không phải video).

    Lưu ý quan trọng: video quay dọc bằng điện thoại (iPhone/Android) thường được MÃ HÓA
    ở dạng ngang (vd 1920×1080) kèm metadata xoay 90°/270° (rotate tag hoặc display matrix),
    trình phát/ffmpeg sẽ tự xoay lại khi hiển thị hoặc khi encode lại (autorotate mặc định
    bật). Nếu chỉ đọc width/height gốc, ta sẽ nhầm video dọc thành video ngang và chọn sai
    hướng scale khi convert. Hàm này đọc thêm góc xoay (side_data displaymatrix hoặc tag
    rotate cũ) và hoán đổi width/height cho khớp với khung hình thật sự sẽ được xử lý.
    """
    cmd = [
        "ffprobe", "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=width,height:stream_tags=rotate:stream_side_data=rotation",
        "-of", "json",
        str(path)
    ]
    try:
        out = subprocess.check_output(cmd, stderr=subprocess.DEVNULL, timeout=30)
        info = json.loads(out)
        streams = info.get("streams") or []
        if not streams:
            return 0, 0
        s = streams[0]
        w = int(s.get("width") or 0)
        h = int(s.get("height") or 0)
        if not w or not h:
            return 0, 0

        # Ưu tiên góc xoay từ side_data (displaymatrix) — cách hiện đại, đáng tin cậy nhất.
        rotation = 0
        for sd in (s.get("side_data_list") or []):
            if "rotation" in sd:
                try:
                    rotation = round(float(sd["rotation"]))
                except (ValueError, TypeError):
                    rotation = 0
                break
        else:
            # Fallback: tag "rotate" kiểu cũ (một số file/thiết bị đời cũ chỉ có tag này)
            tag_rotate = (s.get("tags") or {}).get("rotate")
            if tag_rotate is not None:
                try:
                    rotation = round(float(tag_rotate))
                except (ValueError, TypeError):
                    rotation = 0

        # Chuẩn hóa về 0-359 (xử lý cả góc âm như -90), chỉ hoán đổi khi xoay 1/4 vòng
        # (90°/270°) — xoay 180° không đổi hướng ngang/dọc nên không cần hoán đổi.
        rotation = rotation % 360
        if rotation in (90, 270):
            w, h = h, w

        return w, h
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired,
            ValueError, TypeError, FileNotFoundError, OSError,
            json.JSONDecodeError, KeyError, IndexError):
        return 0, 0

def collect_videos(folder: Path) -> list[Path]:
    """Quét video ngay trong `folder` (không quét subfolder)."""
    try:
        entries = list(folder.iterdir())
    except OSError as e:
        print(f"{R}✗ Không đọc được thư mục {folder}: {e}{RST}")
        return []
    return sorted(p for p in entries if p.is_file() and p.suffix.lower() in VIDEO_EXTS)

def is_partial_output(path: Path) -> bool:
    """Kiểm tra file có phải output dở (từ lần chạy bị ngắt trước) không."""
    try:
        return path.exists() and path.stat().st_size < MIN_OUTPUT_SIZE
    except OSError:
        return False

def choose_resolution() -> int:
    """Hỏi người dùng độ phân giải đầu ra. Trả về chiều cao (px) của cạnh ngắn mục tiêu."""
    print(f"{W}🎯 Chọn độ phân giải đầu ra:{RST}")
    for key, val in RESOLUTION_PRESETS.items():
        print(f"   {C}{key}{RST}) {val}p")
    print(f"   {C}5{RST}) Tùy chỉnh…")

    while True:
        choice = input(f"{W}→ Lựa chọn {DIM}[Enter = 720p]{RST}: ").strip()
        if choice == "":
            return 720
        if choice in RESOLUTION_PRESETS:
            return RESOLUTION_PRESETS[choice]
        if choice == "5":
            while True:
                custom = input(f"{W}  Nhập chiều cao mong muốn (px, vd 540): {RST}").strip()
                if custom.isdigit() and int(custom) > 0:
                    return int(custom)
                print(f"  {R}✗ Giá trị không hợp lệ, nhập số nguyên dương.{RST}")
            # unreachable
        print(f"  {R}✗ Lựa chọn không hợp lệ, thử lại.{RST}")

# ──────────────────────────────────────────────
#  CORE CONVERTER
# ──────────────────────────────────────────────

def convert_video(src: Path, out_dir: Path, target_height: int, idx: int, total: int,
                   resolution: tuple[int, int]) -> dict:
    stem = src.stem
    suffix = f"_{target_height}p"
    dst = out_dir / f"{stem}{suffix}{OUTPUT_EXT}"

    # Bỏ qua nếu đã convert thành công (file hợp lệ, không phải file dở)
    if dst.exists():
        if is_partial_output(dst):
            with LOCK:
                print(f"  {Y}[RETRY]{RST} {stem} — file dở từ lần trước, convert lại")
            try:
                dst.unlink()
            except OSError as e:
                with LOCK:
                    print(f"  {R}✗ Không xóa được file dở {dst.name}: {e}{RST}")
                return {"src": src, "dst": dst, "status": "error", "error": f"Không xóa được file dở: {e}"}
        else:
            with LOCK:
                print(f"  {Y}[SKIP]{RST} {stem} — đã tồn tại ({human_size(dst)})")
            return {"src": src, "dst": dst, "status": "skipped"}

    # Kiểm tra file nguồn hợp lệ trước khi động vào ffmpeg
    try:
        src_size = src.stat().st_size
    except OSError as e:
        with LOCK:
            print(f"    {R}✗ Lỗi:{RST} Không đọc được file nguồn ({e})")
        return {"src": src, "dst": dst, "status": "error", "error": f"Không đọc được file nguồn: {e}"}

    if src_size == 0:
        with LOCK:
            print(f"    {R}✗ Lỗi:{RST} File nguồn rỗng (0 byte)")
        return {"src": src, "dst": dst, "status": "error", "error": "File nguồn rỗng (0 byte)"}

    w, h = resolution
    res_tag = f"{w}×{h}" if w and h else "unknown"

    with LOCK:
        print(f"  {B}[{idx:02d}/{total:02d}]{RST} {W}{stem}{RST}  {DIM}({res_tag}, {human_size(src)}){RST}")

    if not w or not h:
        with LOCK:
            print(f"    {R}✗ Lỗi:{RST} Không đọc được độ phân giải — file có thể hỏng hoặc không phải video")
        return {"src": src, "dst": dst, "status": "error",
                "error": "Không đọc được độ phân giải (file hỏng hoặc không phải video)"}

    # Xác định cạnh ngắn để scale đúng cho cả video ngang lẫn dọc
    short_side = min(w, h)
    if short_side > target_height:
        if w <= h:
            scale_filter = f"scale={target_height}:-2"   # portrait / dọc
        else:
            scale_filter = f"scale=-2:{target_height}"   # landscape / ngang
    else:
        # Đã ≤ độ phân giải mục tiêu → chỉ ép kích thước chẵn, không upscale
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
        out_size = dst.stat().st_size if dst.exists() else 0
        if out_size < MIN_OUTPUT_SIZE:
            raise ValueError(f"Output file quá nhỏ hoặc không tồn tại ({out_size} bytes)")

        ratio = out_size / src_size * 100
        with LOCK:
            print(f"    {G}✓ Done{RST}  {human_size(dst)}  {DIM}({ratio:.0f}% kích thước gốc, {elapsed:.1f}s){RST}")
        return {"src": src, "dst": dst, "status": "ok", "elapsed": elapsed, "ratio": ratio, "src_size": src_size}

    except FileNotFoundError:
        err = "Không tìm thấy lệnh ffmpeg (có thể đã bị gỡ giữa chừng)"
        with LOCK:
            print(f"    {R}✗ Lỗi:{RST} {err}")
        return {"src": src, "dst": dst, "status": "error", "error": err}

    except subprocess.TimeoutExpired:
        err = f"Timeout sau {FFMPEG_TIMEOUT}s"
        with LOCK:
            print(f"    {R}✗ Lỗi:{RST} {err}")
        if dst.exists():
            try:
                dst.unlink()
            except OSError:
                pass
        return {"src": src, "dst": dst, "status": "error", "error": err}

    except (subprocess.CalledProcessError, ValueError) as e:
        if isinstance(e, subprocess.CalledProcessError):
            lines = e.stderr.decode(errors="replace").strip().splitlines() if e.stderr else []
            err = lines[-1] if lines else f"ffmpeg thoát với mã lỗi {e.returncode}"
        else:
            err = str(e)
        with LOCK:
            print(f"    {R}✗ Lỗi:{RST} {err}")
        if dst.exists():
            try:
                dst.unlink()
            except OSError:
                pass
        return {"src": src, "dst": dst, "status": "error", "error": err}

    except Exception as e:
        # Bắt các lỗi không lường trước để 1 video lỗi không làm chết cả batch
        err = f"Lỗi không xác định: {e}"
        with LOCK:
            print(f"    {R}✗ Lỗi:{RST} {err}")
        if dst.exists():
            try:
                dst.unlink()
            except OSError:
                pass
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

    # ── Kiểm tra ffmpeg/ffprobe ──
    if not check_ffmpeg():
        print(f"  Cài đặt: {Y}winget install ffmpeg{RST}  hoặc  {Y}choco install ffmpeg{RST}")
        sys.exit(1)
    print(f"{G}✓ FFmpeg/FFprobe OK{RST}\n")

    # ── Thư mục chứa video = thư mục chứa file script này ──
    try:
        input_dir = Path(__file__).resolve().parent
    except (NameError, OSError):
        input_dir = Path(".").resolve()
    print(f"{W}📂 Thư mục quét video: {C}{input_dir}{RST}")

    # ── Chọn độ phân giải đầu ra ──
    target_height = choose_resolution()

    # ── Chọn thư mục output ──
    default_out = input_dir / f"{target_height}p_output"
    raw = input(f"{W}💾 Thư mục lưu output {DIM}[Enter = {default_out.name}]{RST}: ").strip()
    out_dir = Path(raw) if raw else default_out
    try:
        out_dir.mkdir(parents=True, exist_ok=True)
    except OSError as e:
        print(f"{R}✗ Không tạo được thư mục output {out_dir}: {e}{RST}")
        sys.exit(1)

    # ── Scan video (chỉ thư mục hiện tại, không đệ quy) ──
    videos = collect_videos(input_dir)

    if not videos:
        print(f"{Y}⚠  Không tìm thấy video nào trong: {input_dir}{RST}")
        sys.exit(0)

    print(f"\n{C}══ Tìm thấy {len(videos)} video ══{RST}")
    resolutions: dict[Path, tuple[int, int]] = {}
    for v in videos:
        w, h = get_video_resolution(v)
        resolutions[v] = (w, h)
        if not w or not h:
            tag = "?"
            arrow = f"  {R}(không đọc được độ phân giải){RST}"
        else:
            # Dùng cạnh ngắn để đánh giá — khớp với logic scale thật trong convert_video()
            short_side = min(w, h)
            tag = f"{w}×{h}"
            arrow = f"  {B}→ {target_height}p{RST}" if short_side > target_height else f"  {DIM}(đã ≤{target_height}p){RST}"
        print(f"  {DIM}•{RST} {v.name}  {Y}[{tag}]{RST}{arrow}")

    # ── Cảnh báo preset + workers ──
    if MAX_WORKERS > 1 and PRESET in ("slow", "veryslow"):
        print(f"\n{Y}⚠  CẢNH BÁO: MAX_WORKERS={MAX_WORKERS} với preset '{PRESET}' sẽ khiến CPU tranh nhau{RST}")
        print(f"   {DIM}Khuyến nghị: MAX_WORKERS=1 khi dùng slow/veryslow{RST}")

    # ── Xác nhận ──
    print(f"\n{W}Độ phân giải: {C}{target_height}p{RST}   "
          f"{W}Workers song song: {C}{MAX_WORKERS}{RST}   "
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
            ex.submit(convert_video, v, out_dir, target_height, i + 1, len(videos), resolutions[v]): v
            for i, v in enumerate(videos)
        }
        for fut in as_completed(futures):
            try:
                results.append(fut.result())
            except Exception as e:
                # An toàn tuyệt đối: nếu 1 future ném exception ngoài dự kiến, không để cả batch chết
                v = futures[fut]
                print(f"  {R}✗ Lỗi không xác định với {v.name}: {e}{RST}")
                results.append({"src": v, "dst": None, "status": "error", "error": str(e)})

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
        try:
            dst_total = sum(r["dst"].stat().st_size for r in ok)
            saved = (src_total - dst_total) / 1024 / 1024
            print(f"  {G}💾 Giảm dung lượng trung bình: {avg_ratio:.0f}% — tiết kiệm ~{saved:.1f} MB{RST}")
        except OSError:
            print(f"  {G}💾 Giảm dung lượng trung bình: {avg_ratio:.0f}%{RST}")

    if errors:
        print(f"\n{R}Danh sách lỗi:{RST}")
        for r in errors:
            print(f"  • {r['src'].name}: {r.get('error', '?')}")

    print(f"\n{G}Output: {out_dir.resolve()}{RST}\n")


if __name__ == "__main__":
    main()