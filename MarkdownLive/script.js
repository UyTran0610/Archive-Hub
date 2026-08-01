// Nội dung Markdown mặc định khi tải trang hoặc ấn Reset
const defaultMarkdown = `# Trình soạn thảo Markdown Live

Chào mừng bạn đến với **Markdown Live**! Đây là một ứng dụng hỗ trợ soạn thảo và xem trước nội dung Markdown trong thời gian thực.

## Các chức năng chính:
- **Cập nhật thư viện (Update Libs)**: Tải xuống các thư viện bản mới nhất.
- **Đồng bộ cuộn (Sync Scroll)**: Cuộn song song cả 2 khung soạn thảo và xem trước.
- **Copy**: Sao chép nhanh mã nguồn Markdown.
- **Export PDF**: Xuất trực tiếp nội dung Preview thành định dạng PDF.
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

### 2. Công thức toán học (LaTeX/Math)
- Viết cùng dòng (inline): $E = mc^2$ hoặc đường chéo tam giác $c = \\sqrt{a^2 + b^2}$.
- Viết khối hiển thị trung tâm (block display):
$$
f(x) = \\int_{-\\infty}^{\\infty} e^{-x^2} dx
$$

---

### 3. Biểu đồ trực quan (Mermaid Diagrams)
\`\`\`mermaid
graph TD
    A[Bắt đầu] --> B(Soạn thảo Markdown)
    B --> C{Xem trước?}
    C -- Có --> D[Hiển thị HTML]
    C -- Không --> E[Tiếp tục viết]
    D --> F[Xuất bản PDF]
\`\`\`

---

### 4. Tô màu cú pháp (Syntax Highlighting)
\`\`\`javascript
// Một đoạn code Javascript đơn giản
function helloWorld() {
    console.log("Xin chào từ Markdown Live!");
}
helloWorld();
\`\`\`

### 5. Bảng biểu (Table)

| Tên công cụ | Tính năng | Trạng thái |
| :--- | :--- | :--- |
| Marked JS | Chuyển đổi Markdown | Đã tích hợp |
| Lucide | Bộ Icon tối giản | Đã tích hợp |
| html2pdf | Xuất định dạng PDF | Đã tích hợp |

### 6. Trích dẫn thông thường (Blockquote)
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
const toast = document.getElementById('toast');

// Khởi tạo trạng thái ứng dụng
let isSyncScrollEnabled = true;
let activeScrollSource = null;
let mermaidTimeout = null;

// ==========================================================================
// TÔ MÀU CÚ PHÁP MARKDOWN TRONG EDITOR (Syntax Highlighting cho khung soạn thảo)
// ==========================================================================

// Bảng màu cho các loại GFM Alert, dùng chung tông màu với phần Preview
const alertHighlightColors = {
    NOTE: '#0969da',
    TIP: '#1a7f37',
    IMPORTANT: '#8250df',
    WARNING: '#9a6700',
    CAUTION: '#d1242f'
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
    // Mỗi khi một quy tắc khớp và tạo ra span, ta "khóa" đoạn đó lại bằng một token
    // tạm thời (ký tự \u0000 không thể gõ được) để các quy tắc chạy sau không quét
    // nhầm vào bên trong span vừa tạo (ví dụ: tránh việc "**đậm**" bị quy tắc in
    // nghiêng xử lý chồng thêm lần nữa vì nó chứa cặp dấu "*").
    const store = [];
    const protect = (html) => {
        const token = `\u0000T${store.length}\u0000`;
        store.push(html);
        return token;
    };

    // 1. Code inline: `code`
    text = text.replace(/(`+)([^`]+?)\1/g, (m, ticks, content) =>
        protect(`<span class="md-code-inline">${ticks}${content}${ticks}</span>`));

    // 2. Ảnh: ![alt](url)
    text = text.replace(/(!)(\[)([^\]]*)(\])(\()([^)]*)(\))/g, (m, bang, ob, alt, cb, op, url, cp) =>
        protect(`<span class="md-link-marker">${bang}${ob}</span><span class="md-link-text">${alt}</span><span class="md-link-marker">${cb}${op}</span><span class="md-link-url">${url}</span><span class="md-link-marker">${cp}</span>`));

    // 3. Liên kết: [text](url)
    text = text.replace(/(\[)([^\]]*)(\])(\()([^)]*)(\))/g, (m, ob, t, cb, op, url, cp) =>
        protect(`<span class="md-link-marker">${ob}</span><span class="md-link-text">${t}</span><span class="md-link-marker">${cb}${op}</span><span class="md-link-url">${url}</span><span class="md-link-marker">${cp}</span>`));

    // 4. In đậm + in nghiêng: ***text*** hoặc ___text___
    text = text.replace(/(\*\*\*|___)([^*_\n]+?)\1/g, (m, d, c) =>
        protect(`<span class="md-bolditalic">${d}${c}${d}</span>`));

    // 5. In đậm: **text** hoặc __text__
    text = text.replace(/(\*\*|__)([^*_\n]+?)\1/g, (m, d, c) =>
        protect(`<span class="md-bold">${d}${c}${d}</span>`));

    // 6. In nghiêng: *text* hoặc _text_
    text = text.replace(/(\*|_)([^*_\n]+?)\1/g, (m, d, c) =>
        protect(`<span class="md-italic">${d}${c}${d}</span>`));

    // 7. Gạch ngang giữa chữ: ~~text~~
    text = text.replace(/(~~)([^~\n]+?)\1/g, (m, d, c) =>
        protect(`<span class="md-strikethrough">${d}${c}${d}</span>`));

    // 8. Công thức toán dạng inline: $...$
    text = text.replace(/(\$)([^$\n]+?)\1/g, (m, d, c) =>
        protect(`<span class="md-math">${d}${c}${d}</span>`));

    // Khôi phục toàn bộ token đã bảo vệ. Lặp lại vì một span vừa khôi phục
    // (ví dụ liên kết) có thể chứa token khác lồng bên trong nó (ví dụ code inline).
    let previous;
    do {
        previous = text;
        text = text.replace(/\u0000T(\d+)\u0000/g, (m, idx) => store[Number(idx)]);
    } while (text !== previous);

    return text;
}

// Xử lý cú pháp ở cấp độ dòng (tiêu đề, trích dẫn, danh sách, gạch ngang, bảng biểu...)
function highlightMarkdownLine(line) {
    // Đường kẻ ngang (Horizontal Rule): ---, ***, ___
    if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
        return `<span class="md-hr">${escapeHtml(line)}</span>`;
    }

    // Tiêu đề dạng ATX: #, ##, ### ...
    let m = line.match(/^(\s{0,3})(#{1,6})(\s+)(.*)$/);
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

    // Danh sách (List item): -, *, +, hoặc số thứ tự "1."
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
    // Thêm một dòng trống ở cuối để đảm bảo chiều cao luôn khớp với textarea
    // (đặc biệt khi nội dung kết thúc bằng dấu xuống dòng)
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
                
                // Loại bỏ thẻ cảnh báo khỏi nội dung đoạn văn đầu tiên
                firstP.innerHTML = firstP.innerHTML.replace(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(?:<br\s*\/?>)?\s*/i, '');
                
                // Gán class style CSS
                bq.classList.add('markdown-alert', `markdown-alert-${type.toLowerCase()}`);
                
                // Chèn thêm thanh tiêu đề nếu chưa tồn tại
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

// Cập nhật kết quả Preview từ Markdown sang HTML
function renderMarkdown() {
    const rawText = markdownInput.value;
    
    // 1. Chuyển đổi Markdown sang HTML (đã được tích hợp sẵn KaTeX thông qua extension)
    previewOutput.innerHTML = marked.parse(rawText);
    charCounter.textContent = `${rawText.length} ký tự`;

    // 2. Chuyển đổi các khối blockquote đặc biệt thành GFM Alerts
    processGFMAlerts();

    // 3. Tô màu mã nguồn (Syntax Highlighting) bằng Highlight.js
    if (typeof hljs !== 'undefined') {
        previewOutput.querySelectorAll('pre code').forEach((block) => {
            // Không áp dụng Highlight.js trực tiếp lên khối chứa biểu đồ Mermaid
            if (!block.classList.contains('language-mermaid')) {
                hljs.highlightElement(block);
            }
        });
    }

    // 4. Xử lý các khối code Mermaid và vẽ biểu đồ
    if (typeof mermaid !== 'undefined') {
        const mermaidBlocks = previewOutput.querySelectorAll('pre code.language-mermaid');
        mermaidBlocks.forEach((block) => {
            const code = block.textContent;
            const pre = block.parentElement;
            
            // Thay thế pre > code tiêu chuẩn bằng pre có class "mermaid"
            const newPre = document.createElement('pre');
            newPre.className = 'mermaid';
            newPre.textContent = code;
            pre.replaceWith(newPre);
        });

        // Sử dụng debounce 300ms để trì hoãn vẽ biểu đồ, tránh làm nghẽn luồng nhập liệu của bàn phím
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

    // 5. Cập nhật và vẽ lại tất cả icon từ Lucide (bao gồm cả các icon trong GFM Alerts)
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// Hàm gán lại dữ liệu mặc định
function loadDefaultContent() {
    markdownInput.value = defaultMarkdown;
    updateEditorHighlight();
    renderMarkdown();
    // Đưa thanh cuộn về đầu trang
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

// Tạo hàm render có độ trễ 300ms
const debouncedRender = debounce(renderMarkdown, 300);

// Sự kiện nhập liệu trong Editor
markdownInput.addEventListener('input', () => {
    // Cập nhật số ký tự ngay lập tức để cảm giác gõ vẫn mượt
    charCounter.textContent = `${markdownInput.value.length} ký tự`;

    // Tô màu cú pháp trong Editor ngay lập tức (nhẹ, không cần debounce)
    updateEditorHighlight();

    // Đợi ngừng gõ 300ms mới xử lý render Markdown / KaTeX / Mermaid
    debouncedRender();
});

// Đồng bộ cuộn trang (Sync Scroll) dựa trên phần trăm vị trí cuộn
function handleScroll(source, target) {
    if (!isSyncScrollEnabled || activeScrollSource !== source) return;
    
    const scrollPercentage = source.scrollTop / (source.scrollHeight - source.clientHeight);
    target.scrollTop = scrollPercentage * (target.scrollHeight - target.clientHeight);
}

// Bắt sự kiện di chuột (PC) và chạm tay (Điện thoại)
markdownInput.addEventListener('mouseenter', () => activeScrollSource = markdownInput);
previewOutput.addEventListener('mouseenter', () => activeScrollSource = previewOutput);

markdownInput.addEventListener('touchstart', () => activeScrollSource = markdownInput, { passive: true });
previewOutput.addEventListener('touchstart', () => activeScrollSource = previewOutput, { passive: true });

markdownInput.addEventListener('scroll', () => {
    handleScroll(markdownInput, previewOutput);
    // Đồng bộ lớp nền tô màu cú pháp cuộn theo đúng vị trí của textarea
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

// Nút Xuất file PDF (Sử dụng thư viện html2pdf.js)
btnPdf.addEventListener('click', () => {
    // Tùy chỉnh thông số xuất bản PDF
    const options = {
        margin: [15, 15, 15, 15],
        filename: 'markdown-live-export.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    
    showToast("Đang tạo file PDF...");
    html2pdf().set(options).from(previewOutput).save()
        .then(() => showToast("Tải xuống PDF thành công!"))
        .catch(() => showToast("Xuất PDF thất bại."));
});

// Chạy khởi tạo ứng dụng khi trang web tải xong
window.addEventListener('DOMContentLoaded', () => {
    // Khởi tạo sơ đồ Mermaid (tắt tự động khởi chạy trên tải trang để chạy thủ công qua render)
    if (typeof mermaid !== 'undefined') {
        mermaid.initialize({ startOnLoad: false, theme: 'default' });
    }

    // Khởi tạo cấu hình tiện ích toán học cho Marked.js
    if (typeof markedKatex !== 'undefined') {
        // Tương thích linh hoạt với cả mô hình đóng gói UMD khác nhau
        const katexExt = typeof markedKatex === 'function' ? markedKatex : markedKatex.markedKatex;
        if (katexExt) {
            marked.use(katexExt({ throwOnError: false }));
        }
    }

    lucide.createIcons(); // Vẽ các icon từ Lucide
    loadDefaultContent();
});

window.renderMarkdown = renderMarkdown;