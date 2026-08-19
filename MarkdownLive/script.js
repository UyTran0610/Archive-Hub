// Nội dung Markdown mặc định khi tải trang hoặc ấn Reset
const defaultMarkdown = `# Trình soạn thảo Markdown Live

Chào mừng bạn đến với **Markdown Live**! Đây là một ứng dụng hỗ trợ soạn thảo và xem trước nội dung Markdown trong thời gian thực.

## Các chức năng chính:
- **Bảo mật XSS**: Tự động lọc sạch mã độc hại với DOMPurify.
- **Đồng bộ cuộn (Sync Scroll)**: Cuộn song song cả 2 khung soạn thảo và xem trước.
- **Copy**: Sao chép nhanh mã nguồn Markdown.
- **Export PDF**: Xuất trực tiếp nội dung Preview thành định dạng PDF với **văn bản chọn được (Selectable Text)**.
- **Reset**: Đưa dữ liệu về văn bản mẫu ban đầu này bất kỳ lúc nào.

---

## Tính năng nâng cao chuyên nghiệp:

### 1. Hộp thông báo đặc biệt (GFM Alerts / Callouts)
> [!NOTE]
> Đây là một ghi chú quan trọng giúp người đọc lưu ý thông tin nhanh.

> [!TIP]
> Gợi ý cách làm việc hiệu quả hơn hoặc một mẹo nhỏ hữu ích.

> [!IMPORTANT]
> Đây là thông tin cực kỳ quan trọng không thể bỏ qua.

> [!WARNING]
> Cảnh báo rủi ro có thể xảy ra lỗi nếu thao tác sai.

> [!CAUTION]
> Khuyến cáo nguy hiểm về nguy cơ mất mát dữ liệu hoặc hỏng hóc.

---

### 2. Danh sách công việc (Task List)
- [x] Tích hợp DOMPurify ngăn chặn tấn công XSS
- [x] Cải tiến bộ tô màu cú pháp Editor (Escape, Footnote, Reference Link, Tasklist)
- [ ] Thử nghiệm tạo tài liệu Markdown của riêng bạn

---

### 3. Công thức toán học (LaTeX/Math)
- Viết cùng dòng (inline): $E = mc^2$ hoặc đường chéo tam giác $c = \\sqrt{a^2 + b^2}$.
- Viết khối hiển thị trung tâm (block display):
$$
f(x) = \\int_{-\\infty}^{\\infty} e^{-x^2} dx
$$

---

### 4. Biểu đồ trực quan (Mermaid Diagrams)
\`\`\`mermaid
graph TD
    A[Bắt đầu] --> B(Soạn thảo Markdown)
    B --> C{Xem trước?}
    C -- Có --> D[Hiển thị HTML]
    C -- Không --> E[Tiếp tục viết]
    D --> F[Xuất bản PDF]
\`\`\`

---

### 5. Tô màu cú pháp (Syntax Highlighting)
\`\`\`javascript
// Một đoạn code Javascript đơn giản
function helloWorld() {
    console.log("Xin chào từ Markdown Live!");
}
helloWorld();
\`\`\`

---

### 6. Thoát ký tự (Escape), Liên kết tham chiếu
- Thoát ký tự đặc biệt không bị format: \\*không in nghiêng\\*, \\# không phải tiêu đề.
- Liên kết tự động (Autolink): <https://github.com> hoặc email <support@example.com>.
- Liên kết tham chiếu: Tìm kiếm tại [Google][google-ref] hoặc đọc tài liệu [Markdown Guide][md-guide].

[google-ref]: https://www.google.com "Công cụ tìm kiếm Google"
[md-guide]: https://www.markdownguide.org "Tài liệu Markdown chính thức"

---

### 7. Bảng biểu (Table)

| Tên công cụ | Tính năng | Trạng thái |
| :--- | :--- | :--- |
| Marked JS | Chuyển đổi Markdown | Đã tích hợp |
| DOMPurify | Bảo mật XSS | Đã tích hợp |
| Lucide | Bộ Icon tối giản | Đã tích hợp |

### 8. Trích dẫn thông thường (Blockquote)
> "Sự đơn giản là độ tinh tế tối thượng." — *Leonardo da Vinci*

---
Hãy chỉnh sửa thử nội dung ở khung bên trái và quan sát sự thay đổi tức thì ở khung bên phải nhé!
`;

// Lấy các phần tử DOM
const markdownInput = document.getElementById('markdown-input');
const previewOutput = document.getElementById('preview-output');
const charCounter = document.getElementById('char-counter');
const editorHighlight = document.getElementById('editor-highlight');
const editorHighlightCode = document.getElementById('editor-highlight-code');

const btnSync = document.getElementById('btn-sync');
const btnReset = document.getElementById('btn-reset');
const btnCopy = document.getElementById('btn-copy');
const btnPdf = document.getElementById('btn-pdf');
const btnTheme = document.getElementById('btn-theme');
const toast = document.getElementById('toast');

// Các thẻ <link> có thể hoán đổi phiên bản sáng/tối (được thiết lập ban đầu ở <head>)
const markdownThemeLink = document.getElementById('theme-markdown-css');
const hljsThemeLink = document.getElementById('theme-hljs-css');
const THEME_STORAGE_KEY = 'markdown-live-theme';

// Khởi tạo trạng thái ứng dụng
let isSyncScrollEnabled = true;
let activeScrollSource = null;
let mermaidTimeout = null;

// ==========================================================================
// CHUYỂN ĐỔI GIAO DIỆN SÁNG / TỐI (Light / Dark Theme)
// ==========================================================================

// Lấy theme hiện tại đang áp dụng trên thẻ <html> (đã được thiết lập sớm ở <head>)
function getCurrentTheme() {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

// Áp dụng theme: cập nhật thuộc tính data-theme, hoán đổi CSS bên ngoài (markdown/hljs)
// và đồng bộ theme của Mermaid. persist=true khi người dùng chủ động bấm nút chuyển đổi.
function applyTheme(theme, persist) {
    document.documentElement.setAttribute('data-theme', theme);

    if (markdownThemeLink) {
        markdownThemeLink.href = theme === 'dark'
            ? 'https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.5.1/github-markdown-dark.min.css'
            : 'https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.5.1/github-markdown-light.min.css';
    }
    if (hljsThemeLink) {
        hljsThemeLink.href = theme === 'dark'
            ? 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css'
            : 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css';
    }
    if (typeof mermaid !== 'undefined') {
        mermaid.initialize({ startOnLoad: false, theme: theme === 'dark' ? 'dark' : 'default' });
    }

    if (persist) {
        try {
            localStorage.setItem(THEME_STORAGE_KEY, theme);
        } catch (e) {
            // Bỏ qua nếu trình duyệt chặn localStorage (ví dụ chế độ ẩn danh)
        }
    }
}

// Nút Bật/Tắt giao diện Sáng / Tối
if (btnTheme) {
    btnTheme.addEventListener('click', () => {
        const nextTheme = getCurrentTheme() === 'dark' ? 'light' : 'dark';
        applyTheme(nextTheme, true);
        // Vẽ lại Preview để cập nhật màu Highlight.js / Mermaid theo theme mới
        if (typeof renderMarkdown === 'function') renderMarkdown();
        showToast(nextTheme === 'dark' ? "Đã chuyển sang giao diện Tối" : "Đã chuyển sang giao diện Sáng");
    });
}

// Tự động chuyển theme theo hệ thống nếu người dùng chưa từng chọn thủ công
if (window.matchMedia) {
    const darkSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    darkSchemeQuery.addEventListener('change', (event) => {
        let hasManualPreference = false;
        try {
            hasManualPreference = localStorage.getItem(THEME_STORAGE_KEY) !== null;
        } catch (e) {}

        if (!hasManualPreference) {
            applyTheme(event.matches ? 'dark' : 'light', false);
            if (typeof renderMarkdown === 'function') renderMarkdown();
        }
    });
}

// ==========================================================================
// TÔ MÀU CÚ PHÁP MARKDOWN TRONG EDITOR (Syntax Highlighting cho khung soạn thảo)
// ==========================================================================

// Bảng màu cho các loại GFM Alert, dùng chung tông màu với phần Preview
const alertHighlightColors = {
    NOTE: 'var(--alert-note-color)',
    TIP: 'var(--alert-tip-color)',
    IMPORTANT: 'var(--alert-important-color)',
    WARNING: 'var(--alert-warning-color)',
    CAUTION: 'var(--alert-caution-color)'
};

// Escape các ký tự HTML đặc biệt để tránh phá vỡ cấu trúc thẻ khi chèn span
function escapeHtml(str) {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// Xử lý các cú pháp định dạng nằm trong một dòng (in đậm, in nghiêng, code, liên kết...)
// Lưu ý: chuỗi đầu vào "text" đã được escapeHtml() từ trước
function highlightInline(text) {
    const store = [];
    const protect = (html) => {
        const token = `\u0000T${store.length}\u0000`;
        store.push(html);
        return token;
    };

    // 0. Nhận diện các ký tự thoát (Escape characters): \* \_ \[ \] \$ \~ \# ...
    // Bảo vệ ngay đầu tiên để không bị các regex phía sau nhận nhầm thành cú pháp định dạng
    text = text.replace(/\\(&lt;|&gt;|&amp;|[\\`*_{}\[\]()#+\-.!~$~|^])/g, (m, char) =>
        protect(`<span class="md-escape">\\${char}</span>`));

    // 1. Code inline: `code`
    text = text.replace(/(`+)([^`]+?)\1/g, (m, ticks, content) =>
        protect(`<span class="md-code-inline">${ticks}${content}${ticks}</span>`));

    // 2. Công thức toán dạng inline: $...$
    text = text.replace(/(\$)([^$\n]+?)\1/g, (m, d, c) =>
        protect(`<span class="md-math">${d}${c}${d}</span>`));

    // 3. Tham chiếu Footnote: [^id]
    text = text.replace(/(\[\^)([^\]]+?)(\])/g, (m, ob, id, cb) =>
        protect(`<span class="md-footnote-ref"><span class="md-footnote-marker">${ob}</span><span class="md-footnote-id">${id}</span><span class="md-footnote-marker">${cb}</span></span>`));

    // 4. Ảnh: ![alt](url)
    text = text.replace(/(!)(\[)([^\]]*)(\])(\()([^)]*)(\))/g, (m, bang, ob, alt, cb, op, url, cp) =>
        protect(`<span class="md-link-marker">${bang}${ob}</span><span class="md-link-text">${alt}</span><span class="md-link-marker">${cb}${op}</span><span class="md-link-url">${url}</span><span class="md-link-marker">${cp}</span>`));

    // 5. Reference Link usage: [text][id] hoặc [text][]
    text = text.replace(/(\[)([^\]]+?)(\])(\s*)(\[)([^\]]*?)(\])/g, (m, ob1, txt, cb1, sp, ob2, id, cb2) =>
        protect(`<span class="md-link-marker">${ob1}</span><span class="md-link-text">${txt}</span><span class="md-link-marker">${cb1}${sp}${ob2}</span><span class="md-ref-id">${id}</span><span class="md-link-marker">${cb2}</span>`));

    // 6. Liên kết thông thường: [text](url)
    text = text.replace(/(\[)([^\]]*)(\])(\()([^)]*)(\))/g, (m, ob, t, cb, op, url, cp) =>
        protect(`<span class="md-link-marker">${ob}</span><span class="md-link-text">${t}</span><span class="md-link-marker">${cb}${op}</span><span class="md-link-url">${url}</span><span class="md-link-marker">${cp}</span>`));

    // 7. Autolinks dạng ngoặc nhọn: <https://...> hoặc <email@example.com>
    text = text.replace(/(&lt;)(https?:\/\/[^\s&]+|mailto:[^\s&]+|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})(&gt;)/gi, (m, ob, link, cb) =>
        protect(`<span class="md-link-marker">${ob}</span><span class="md-autolink">${link}</span><span class="md-link-marker">${cb}</span>`));

    // 8. Autolinks URL trần: https://... hoặc http://...
    text = text.replace(/\b(https?:\/\/[^\s<>()"']+)/gi, (m, url) =>
        protect(`<span class="md-autolink">${url}</span>`));

    // 9. In đậm + in nghiêng: ***text*** hoặc ___text___
    text = text.replace(/(\*\*\*|___)([^*_\n]+?)\1/g, (m, d, c) =>
        protect(`<span class="md-bolditalic">${d}${c}${d}</span>`));

    // 10. In đậm: **text** hoặc __text__
    text = text.replace(/(\*\*|__)([^*_\n]+?)\1/g, (m, d, c) =>
        protect(`<span class="md-bold">${d}${c}${d}</span>`));

    // 11. In nghiêng: *text* hoặc _text_
    text = text.replace(/(\*|_)([^*_\n]+?)\1/g, (m, d, c) =>
        protect(`<span class="md-italic">${d}${c}${d}</span>`));

    // 12. Gạch ngang giữa chữ: ~~text~~
    text = text.replace(/(~~)([^~\n]+?)\1/g, (m, d, c) =>
        protect(`<span class="md-strikethrough">${d}${c}${d}</span>`));

    // Khôi phục toàn bộ token đã bảo vệ
    let previous;
    do {
        previous = text;
        text = text.replace(/\u0000T(\d+)\u0000/g, (m, idx) => store[Number(idx)]);
    } while (text !== previous);

    return text;
}

// Xử lý cú pháp ở cấp độ dòng (tiêu đề, trích dẫn, danh sách, gạch ngang, bảng biểu, footnote...)
function highlightMarkdownLine(line) {
    // Đường kẻ ngang (Horizontal Rule): ---, ***, ___
    if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
        return `<span class="md-hr">${escapeHtml(line)}</span>`;
    }

    // Định nghĩa Chú thích chân trang (Footnote definition): [^1]: Nội dung
    let m = line.match(/^(\s{0,3})(\[\^)([^\]]+)(\]:)(\s*)(.*)$/);
    if (m) {
        const [, indent, ob, fnId, cb, space, content] = m;
        return `${escapeHtml(indent)}<span class="md-footnote-marker">${ob}</span><span class="md-footnote-id">${escapeHtml(fnId)}</span><span class="md-footnote-marker">${cb}</span>${escapeHtml(space)}${highlightInline(escapeHtml(content))}`;
    }

    // Định nghĩa Liên kết tham chiếu (Reference link definition): [id]: url "optional title"
    m = line.match(/^(\s{0,3})(\[)([^\]^]+)(\])(:)(\s*)(\S+)(?:(\s+)(.*))?$/);
    if (m) {
        const [, indent, ob, id, cb, colon, sp1, url, sp2 = '', title = ''] = m;
        return `${escapeHtml(indent)}<span class="md-link-marker">${ob}</span><span class="md-ref-id">${escapeHtml(id)}</span><span class="md-link-marker">${cb}${colon}</span>${escapeHtml(sp1)}<span class="md-link-url">${escapeHtml(url)}</span>${escapeHtml(sp2)}${title ? `<span class="md-ref-title">${escapeHtml(title)}</span>` : ''}`;
    }

    // Tiêu đề dạng ATX: #, ##, ### ...
    m = line.match(/^(\s{0,3})(#{1,6})(\s+)(.*)$/);
    if (m) {
        const [, indent, hashes, space, content] = m;
        const level = hashes.length;
        return `${escapeHtml(indent)}<span class="md-header-marker">${hashes}</span>${escapeHtml(space)}<span class="md-header md-header-${level}">${highlightInline(escapeHtml(content))}</span>`;
    }

    // Trích dẫn / GFM Alerts (Blockquote): > ...
    m = line.match(/^(\s{0,3}>+\s?)(.*)$/);
    if (m) {
        const [, marker, rest] = m;
        const alertMatch = rest.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\](.*)$/i);
        if (alertMatch) {
            const type = alertMatch[1].toUpperCase();
            const color = alertHighlightColors[type] || '#0969da';
            return `<span class="md-quote-marker">${escapeHtml(marker)}</span><span class="md-alert-tag" style="color:${color}">[!${type}]</span><span class="md-quote-text">${highlightInline(escapeHtml(alertMatch[2]))}</span>`;
        }
        return `<span class="md-quote-marker">${escapeHtml(marker)}</span><span class="md-quote-text">${highlightInline(escapeHtml(rest))}</span>`;
    }

    // Task-list (Danh sách công việc có checkbox): - [ ] hoặc - [x]
    m = line.match(/^(\s*)([-*+]|\d+[.)])(\s+)(\[(?: |x|X)\])(\s+)(.*)$/);
    if (m) {
        const [, indent, marker, sp1, checkbox, sp2, content] = m;
        const isChecked = checkbox.toLowerCase().includes('x');
        const checkClass = isChecked ? 'md-task-checked' : 'md-task-unchecked';
        return `${escapeHtml(indent)}<span class="md-list-marker">${escapeHtml(marker)}</span>${escapeHtml(sp1)}<span class="md-task-checkbox ${checkClass}">${escapeHtml(checkbox)}</span>${escapeHtml(sp2)}${highlightInline(escapeHtml(content))}`;
    }

    // Danh sách thông thường (List item): -, *, +, hoặc số thứ tự "1."
    m = line.match(/^(\s*)([-*+]|\d+[.)])(\s+)(.*)$/);
    if (m) {
        const [, indent, marker, space, content] = m;
        return `${escapeHtml(indent)}<span class="md-list-marker">${escapeHtml(marker)}</span>${escapeHtml(space)}${highlightInline(escapeHtml(content))}`;
    }

    // Dòng thuộc bảng biểu (chứa dấu |)
    if (line.includes('|')) {
        const escapedWithPipes = escapeHtml(line).replace(/\|/g, '<span class="md-table-pipe">|</span>');
        return highlightInline(escapedWithPipes);
    }

    // Dòng văn bản thông thường (paragraph)
    return highlightInline(escapeHtml(line));
}

// Hàm chính: quét toàn bộ nội dung Markdown, xử lý cả khối code (```...```) nhiều dòng
function highlightMarkdown(text) {
    const lines = text.split('\n');
    let inFence = false;

    const outputLines = lines.map((line) => {
        const fenceMatch = line.match(/^(\s{0,3})(`{3,}|~{3,})(.*)$/);

        if (fenceMatch) {
            if (!inFence) {
                inFence = true;
                const [, indent, marker, lang] = fenceMatch;
                return `${escapeHtml(indent)}<span class="md-fence-marker">${escapeHtml(marker)}</span><span class="md-fence-lang">${escapeHtml(lang)}</span>`;
            } else {
                inFence = false;
                const [, indent, marker] = fenceMatch;
                return `${escapeHtml(indent)}<span class="md-fence-marker">${escapeHtml(marker)}</span>`;
            }
        }

        if (inFence) {
            return `<span class="md-code-block">${escapeHtml(line)}</span>`;
        }

        return highlightMarkdownLine(line);
    });

    return outputLines.join('\n');
}

// Cập nhật lớp nền tô màu cú pháp phía sau khung soạn thảo
function updateEditorHighlight() {
    editorHighlightCode.innerHTML = highlightMarkdown(markdownInput.value) + '\n';
}

// Hàm hiển thị thông báo Toast
function showToast(message) {
    toast.textContent = message;
    toast.classList.remove('hidden');
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 2500);
}

// Hàm hỗ trợ lấy tên Icon Lucide cho các loại GFM Alert
function getAlertIcon(type) {
    switch (type) {
        case 'NOTE': return 'info';
        case 'TIP': return 'lightbulb';
        case 'IMPORTANT': return 'alert-circle';
        case 'WARNING': return 'alert-triangle';
        case 'CAUTION': return 'ban';
        default: return 'info';
    }
}

// Hàm hỗ trợ lấy tiêu đề hiển thị cho GFM Alert
function getAlertTitle(type) {
    switch (type) {
        case 'NOTE': return 'Note';
        case 'TIP': return 'Tip';
        case 'IMPORTANT': return 'Important';
        case 'WARNING': return 'Warning';
        case 'CAUTION': return 'Caution';
        default: return type;
    }
}

// Xử lý các khối blockquote để định dạng thành GFM Alerts (phong cách GitHub)
function processGFMAlerts() {
    previewOutput.querySelectorAll('blockquote').forEach((bq) => {
        const firstP = bq.querySelector('p');
        if (firstP) {
            const htmlContent = firstP.innerHTML.trim();
            const match = htmlContent.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(?:<br\s*\/?>)?\s*/i);
            
            if (match) {
                const type = match[1].toUpperCase();
                
                firstP.innerHTML = firstP.innerHTML.replace(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(?:<br\s*\/?>)?\s*/i, '');
                bq.classList.add('markdown-alert', `markdown-alert-${type.toLowerCase()}`);
                
                if (!bq.querySelector('.markdown-alert-title')) {
                    const titleP = document.createElement('p');
                    titleP.className = 'markdown-alert-title';
                    titleP.innerHTML = `<i data-lucide="${getAlertIcon(type)}"></i>${getAlertTitle(type)}`;
                    bq.insertBefore(titleP, bq.firstChild);
                }
            }
        }
    });
}

// Bảo mật bổ sung cho DOMPurify: nếu nội dung Markdown chèn HTML thô có
// thẻ <a target="...">, luôn ép rel="noopener noreferrer nofollow" để
// chống tấn công reverse tabnabbing (trang đích can thiệp ngược qua window.opener).
if (typeof DOMPurify !== 'undefined') {
    DOMPurify.addHook('afterSanitizeAttributes', (node) => {
        if (node.tagName === 'A') {
            if (node.hasAttribute('target')) {
                node.setAttribute('rel', 'noopener noreferrer nofollow');
            }
            // Chặn scheme nguy hiểm còn sót (phòng thủ theo chiều sâu, DOMPurify đã lọc mặc định)
            const href = node.getAttribute('href') || '';
            if (/^\s*(javascript|data|vbscript):/i.test(href)) {
                node.removeAttribute('href');
            }
        }
    });
}

// Cập nhật kết quả Preview từ Markdown sang HTML (Đảm bảo an toàn XSS)
function renderMarkdown() {
    const rawText = markdownInput.value;
    
    // 1. Chuyển đổi Markdown sang HTML
    const dirtyHtml = marked.parse(rawText);

    // 2. Bảo mật XSS: Khử độc HTML bằng DOMPurify (hỗ trợ đầy đủ MathML KaTeX và SVG Mermaid)
    const cleanHtml = typeof DOMPurify !== 'undefined'
        ? DOMPurify.sanitize(dirtyHtml, {
            USE_PROFILES: { html: true, mathMl: true, svg: true },
            ADD_ATTR: ['target', 'rel']
        })
        : dirtyHtml;

    previewOutput.innerHTML = cleanHtml;
    charCounter.textContent = `${rawText.length} ký tự`;

    // 3. Chuyển đổi các khối blockquote đặc biệt thành GFM Alerts
    processGFMAlerts();

    // 4. Tô màu mã nguồn (Syntax Highlighting) bằng Highlight.js
    if (typeof hljs !== 'undefined') {
        previewOutput.querySelectorAll('pre code').forEach((block) => {
            if (!block.classList.contains('language-mermaid')) {
                hljs.highlightElement(block);
            }
        });
    }

    // 5. Xử lý các khối code Mermaid và vẽ biểu đồ
    if (typeof mermaid !== 'undefined') {
        const mermaidBlocks = previewOutput.querySelectorAll('pre code.language-mermaid');
        mermaidBlocks.forEach((block) => {
            const code = block.textContent;
            const pre = block.parentElement;
            
            const newPre = document.createElement('pre');
            newPre.className = 'mermaid';
            newPre.textContent = code;
            pre.replaceWith(newPre);
        });

        clearTimeout(mermaidTimeout);
        mermaidTimeout = setTimeout(() => {
            const nodes = previewOutput.querySelectorAll('.mermaid');
            if (nodes.length > 0) {
                mermaid.run({
                    nodes: nodes,
                    suppressErrors: true
                }).catch(err => {
                    console.warn("Mermaid render error (đang soạn thảo sơ đồ chưa hoàn thiện):", err);
                });
            }
        }, 300);
    }

    // 6. Cập nhật và vẽ lại tất cả icon từ Lucide
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// Hàm gán lại dữ liệu mặc định
function loadDefaultContent() {
    markdownInput.value = defaultMarkdown;
    updateEditorHighlight();
    renderMarkdown();
    markdownInput.scrollTop = 0;
    previewOutput.scrollTop = 0;
    editorHighlight.scrollTop = 0;
}

// Hàm hoãn xử lý (Debounce) giúp tránh giật lag khi gõ văn bản
function debounce(func, delay = 300) {
    let timeoutId;
    return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}

const debouncedRender = debounce(renderMarkdown, 300);

// Sự kiện nhập liệu trong Editor
markdownInput.addEventListener('input', () => {
    charCounter.textContent = `${markdownInput.value.length} ký tự`;
    updateEditorHighlight();
    debouncedRender();
});

// Đồng bộ cuộn trang (Sync Scroll) dựa trên phần trăm vị trí cuộn
function handleScroll(source, target) {
    if (!isSyncScrollEnabled || activeScrollSource !== source) return;

    const sourceScrollable = source.scrollHeight - source.clientHeight;
    // Tránh chia cho 0 (NaN) khi nội dung nguồn chưa đủ dài để cuộn
    if (sourceScrollable <= 0) return;

    const targetScrollable = target.scrollHeight - target.clientHeight;
    const scrollPercentage = source.scrollTop / sourceScrollable;
    target.scrollTop = scrollPercentage * Math.max(targetScrollable, 0);
}

markdownInput.addEventListener('mouseenter', () => activeScrollSource = markdownInput);
previewOutput.addEventListener('mouseenter', () => activeScrollSource = previewOutput);

markdownInput.addEventListener('touchstart', () => activeScrollSource = markdownInput, { passive: true });
previewOutput.addEventListener('touchstart', () => activeScrollSource = previewOutput, { passive: true });

markdownInput.addEventListener('scroll', () => {
    handleScroll(markdownInput, previewOutput);
    editorHighlight.scrollTop = markdownInput.scrollTop;
    editorHighlight.scrollLeft = markdownInput.scrollLeft;
});
previewOutput.addEventListener('scroll', () => handleScroll(previewOutput, markdownInput));

// Nút Bật/Tắt Sync Scroll
btnSync.addEventListener('click', () => {
    isSyncScrollEnabled = !isSyncScrollEnabled;
    btnSync.classList.toggle('active', isSyncScrollEnabled);
    showToast(isSyncScrollEnabled ? "Đã bật đồng bộ cuộn trang" : "Đã tắt đồng bộ cuộn trang");
});

// Nút Reset
btnReset.addEventListener('click', () => {
    if (confirm("Bạn có chắc chắn muốn khôi phục lại văn bản mẫu không? Hành động này sẽ ghi đè nội dung hiện tại của bạn.")) {
        loadDefaultContent();
        showToast("Đã khôi phục dữ liệu mẫu!");
    }
});

// Nút Copy nội dung Markdown
btnCopy.addEventListener('click', () => {
    const textToCopy = markdownInput.value;
    navigator.clipboard.writeText(textToCopy)
        .then(() => showToast("Đã sao chép Markdown vào khay nhớ tạm!"))
        .catch(() => showToast("Có lỗi xảy ra khi sao chép."));
});

// Nút Xuất file PDF với văn bản vector chọn được (Selectable Text & Searchable)
btnPdf.addEventListener('click', () => {
    showToast("Đang chuẩn bị trang in / xuất file PDF...");
    setTimeout(() => {
        window.print();
    }, 200);
});

// Chạy khởi tạo ứng dụng khi trang web tải xong
window.addEventListener('DOMContentLoaded', () => {
    if (typeof mermaid !== 'undefined') {
        mermaid.initialize({ startOnLoad: false, theme: getCurrentTheme() === 'dark' ? 'dark' : 'default' });
    }

    if (typeof markedKatex !== 'undefined') {
        const katexExt = typeof markedKatex === 'function' ? markedKatex : markedKatex.markedKatex;
        if (katexExt) {
            marked.use(katexExt({ throwOnError: false }));
        }
    }

    lucide.createIcons();
    loadDefaultContent();
});

window.renderMarkdown = renderMarkdown;