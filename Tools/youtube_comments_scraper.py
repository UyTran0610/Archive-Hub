from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import (
    TimeoutException,
    NoSuchElementException,
    ElementClickInterceptedException,
)
from selenium.webdriver.common.keys import Keys
from bs4 import BeautifulSoup
import time
import re
import json
import os
from datetime import datetime

# Thời gian (giây) chờ sau khi mở trang, trước khi tìm phần comments.
# Để dài hơn một chút để có thời gian giải captcha (nếu YouTube yêu cầu xác minh).
INITIAL_PAGE_WAIT_SECONDS = 10

# Thời gian tối đa (giây) chờ phần tử #comments xuất hiện.
COMMENTS_WAIT_TIMEOUT = 60


def scroll_comments(driver):
    try:
        # Selector cho phần chứa comments (CSS selector)
        scrollable_selector = "#comments"

        try:
            WebDriverWait(driver, 10).until(
                EC.visibility_of_element_located((By.CSS_SELECTOR, scrollable_selector))
            )
        except TimeoutException:
            print("Comments section is not visible")
            return False

        # Tìm thẻ body
        body = driver.find_element(By.TAG_NAME, "body")

        # Biến theo dõi số lần không thể cuộn thêm
        no_scroll_count = 0
        max_no_scroll = 7

        # Lưu chiều cao cuộn ban đầu
        last_height = driver.execute_script(
            "return document.documentElement.scrollHeight"
        )

        # Xác định nếu bất kỳ nội dung nào đã được tải
        content_loaded = False

        while True:
            # lướt xuống bằng "Page Down"
            body.send_keys(Keys.PAGE_DOWN)

            # chờ trang tải
            time.sleep(1.2)

            # Tính toán chiều cao cuộn mới và so sánh với chiều cao cuộn trước đó
            new_height = driver.execute_script(
                "return document.documentElement.scrollHeight"
            )

            if new_height == last_height:
                no_scroll_count += 1
                if no_scroll_count >= max_no_scroll and content_loaded:
                    return True
            else:
                content_loaded = True
                no_scroll_count = 0
                last_height = new_height

            last_height = new_height

    except Exception as e:
        print(f"Lỗi khi cuộn trang: {e}")
        return False


def extract_video_id(video_url):
    """Trích xuất video ID từ URL YouTube (hỗ trợ dạng watch?v=, youtu.be/, shorts/)."""
    match = re.search(
        r"(?:v=|youtu\.be/|shorts/)([0-9A-Za-z_-]{11})", video_url
    )
    return match.group(1) if match else "unknown_video"


def save_comments_to_json(video_id, data):
    """Lưu kết quả (tiêu đề + bình luận) ra file JSON tên: <videoID>-<ngày>-<tháng>-<năm>.json"""
    now = datetime.now()
    filename = f"{video_id}-{now.day:02d}-{now.month:02d}-{now.year}.json"
    filepath = os.path.join(os.getcwd(), filename)

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"Đã lưu {len(data['comments'])} bình luận vào file: {filepath}")
    return filepath


def get_all_youtube_comments(video_url):
    options = Options()
    options.add_argument("--lang=vi")
    # Ẩn cửa sổ trình duyệt
    # options.add_argument("--headless=new")
    # options.add_argument("--window-position=-2400,-2400")

    driver = webdriver.Chrome(options=options)
    video_title = "Tiêu đề video (Cần bổ sung)"

    try:
        driver.get(video_url)

        # Chờ lâu hơn ở đây để có thời gian giải captcha nếu YouTube yêu cầu xác minh
        print(
            f"Đang chờ {INITIAL_PAGE_WAIT_SECONDS} giây để trang tải xong "
            "(nếu xuất hiện captcha, vui lòng giải trong lúc này)..."
        )
        time.sleep(INITIAL_PAGE_WAIT_SECONDS)

        try:
            # Đợi cho phần comments xuất hiện, cũng để thêm thời gian dự phòng cho captcha
            WebDriverWait(driver, COMMENTS_WAIT_TIMEOUT).until(
                EC.presence_of_element_located((By.ID, "comments"))
            )
        except TimeoutException:
            print("Không thể tải phần comments trong thời gian quy định.")
            return {"video_title": video_title, "comments": []}

        # Cuộn trang để tải comments
        if not scroll_comments(driver):
            print("Cuộn trang thất bại.")
            return {"video_title": video_title, "comments": []}

        # Lấy nội dung HTML
        html_content = driver.page_source
    except TimeoutException:
        print("Timeout waiting for page to load")
        return {"video_title": video_title, "comments": []}
    except NoSuchElementException:
        print("Could not find the comments section")
        return {"video_title": video_title, "comments": []}
    except Exception as e:
        print(f"Unexpected error: {e}")
        return {"video_title": video_title, "comments": []}
    finally:
        if driver:
            driver.quit()

    # Phân tích HTML
    soup = BeautifulSoup(html_content, "html.parser")
    comment_elements = soup.find_all(
        "ytd-comment-thread-renderer", class_="style-scope ytd-item-section-renderer"
    )

    comments = []
    for element in comment_elements:
        try:
            # Lấy author
            author_elem = element.find("a", {"id": "author-text"})
            author = author_elem.text.strip() if author_elem else "Ẩn danh"

            # Lấy nội dung comment
            text_elem = element.find("yt-attributed-string", {"id": "content-text"})
            text = text_elem.text.strip() if text_elem else ""

            # Lấy thời gian
            rtime_elem = element.find("span", {"id": "published-time-text"})
            rtime = (
                rtime_elem.text.strip() if rtime_elem else "Thời gian không xác định"
            )

            # Only append comment if it has content
            if text:
                comments.append({"author": author, "text": text, "rtime": rtime})

        except Exception as e:
            print(f"Lỗi khi xử lý comment: {e}")
            continue
    try:
        video_title_element = soup.find(
            "yt-formatted-string", class_="style-scope ytd-watch-metadata"
        )
        video_title = (
            video_title_element.text.strip()
            if video_title_element
            else "Tiêu đề video không xác định"
        )
    except:
        video_title = "Tiêu đề video (Cần bổ sung)"

    return {"video_title": video_title, "comments": comments}


if __name__ == "__main__":
    # Example Usage (with a placeholder URL)
    video_url = "https://www.youtube.com/watch?v=i-wuWm_bDAk"  # Replace with a real URL if needed

    comments_data = get_all_youtube_comments(video_url)

    if comments_data:
        print(f"Đã lấy được {len(comments_data['comments'])} comments.")
        # In ra một vài comments để kiểm tra
        for i, comment in enumerate(
            comments_data["comments"][:5]
        ):  # Chỉ in 5 comments đầu
            print(f"Comment {i+1}:")
            print(f"  Author: {comment['author']}")
            print(f"  Text: {comment['text']}")
            print(f"  Time: {comment['rtime']}")
            print("-" * 20)

        # Lưu toàn bộ kết quả ra file JSON: <videoID>-<ngày>-<tháng>-<năm>.json
        video_id = extract_video_id(video_url)
        save_comments_to_json(video_id, comments_data)
    else:
        print("Không thể lấy comments.")