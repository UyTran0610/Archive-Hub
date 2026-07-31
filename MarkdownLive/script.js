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

const btnSync = document.getElementById('btn-sync');
const btnReset = document.getElementById('btn-reset');
const btnCopy = document.getElementById('btn-copy');
const btnPdf = document.getElementById('btn-pdf');
const toast = document.getElementById('toast');

// Khởi tạo trạng thái ứng dụng
let isSyncScrollEnabled = true;
let activeScrollSource = null;
let mermaidTimeout = null;

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
    renderMarkdown();
    // Đưa thanh cuộn về đầu trang
    markdownInput.scrollTop = 0;
    previewOutput.scrollTop = 0;
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

markdownInput.addEventListener('scroll', () => handleScroll(markdownInput, previewOutput));
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

// Danh sách các URL CDN chính thức của thư viện bản mới nhất
const librariesToUpdate = [
    {
        url: 'https://cdnjs.cloudflare.com/ajax/libs/github-markdown-css/5.5.1/github-markdown.min.css',
        filename: 'github-markdown.min.css'
    },
    {
        url: 'https://cdn.jsdelivr.net/npm/lucide@latest/dist/umd/lucide.min.js',
        filename: 'lucide.min.js'
    },
    {
        url: 'https://cdn.jsdelivr.net/npm/marked/marked.min.js',
        filename: 'marked.min.js'
    },
    {
        url: 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
        filename: 'html2pdf.bundle.min.js'
    },
    {
        url: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css',
        filename: 'github-highlight.min.css'
    },
    {
        url: 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js',
        filename: 'highlight.min.js'
    },
    {
        url: 'https://cdnjs.cloudflare.com/ajax/libs/mermaid/10.9.1/mermaid.min.js',
        filename: 'mermaid.min.js'
    },
    {
        url: 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css',
        filename: 'katex.min.css'
    },
    {
        url: 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js',
        filename: 'katex.min.js'
    },
    {
        url: 'https://cdn.jsdelivr.net/npm/marked-katex-extension@5.1.2/lib/index.umd.js',
        filename: 'marked-katex-extension.min.js'
    }
];

// Logic nút Cập nhật thư viện (Update Libs)
// const btnUpdateLibs = document.getElementById('btn-update-libs');

// btnUpdateLibs.addEventListener('click', async () => {
//     // 1. Kiểm tra kết nối mạng của trình duyệt
//     if (!navigator.onLine) {
//         showToast("⚠️ Vui lòng kết nối Internet để tải bản cập nhật!");
//         return;
//     }

//     const confirmUpdate = confirm(
//         "Vì lý do bảo mật, trình duyệt không thể tự ghi đè tệp trực tiếp lên ổ cứng của bạn.\n\n" +
//         "Hệ thống sẽ tải xuống 10 tệp thư viện phiên bản mới nhất về máy. " +
//         "Sau khi tải xong, bạn chỉ cần di chuyển chúng vào thư mục 'libs/' để hoàn tất cập nhật. Bạn muốn tiếp tục?"
//     );

//     if (!confirmUpdate) return;

//     showToast("🔄 Đang tải các thư viện bản mới nhất...");

//     try {
//         for (const lib of librariesToUpdate) {
//             const response = await fetch(lib.url);
//             if (!response.ok) throw new Error(`Không thể tải ${lib.filename}`);
            
//             const blob = await response.blob();
//             const downloadUrl = URL.createObjectURL(blob);
            
//             // Tạo phần tử liên kết ẩn để kích hoạt tính năng tải tệp của trình duyệt
//             const a = document.createElement('a');
//             a.href = downloadUrl;
//             a.download = lib.filename;
//             document.body.appendChild(a);
//             a.click();
//             document.body.removeChild(a);
//             URL.revokeObjectURL(downloadUrl);
//         }
//         showToast("✅ Đã tải xong! Hãy chuyển các file vừa tải vào thư mục 'libs/' để ghi đè.");
//     } catch (error) {
//         console.error("Lỗi cập nhật thư viện:", error);
//         showToast("❌ Có lỗi xảy ra trong quá trình tải thư viện.");
//     }
// });

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