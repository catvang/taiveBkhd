(async function runFastHddtExcelParserPortal() {
    'use strict';

    // 0. Nạp JSZip và xlsx-js-style
    function loadScript(url) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = url;
            s.onload = () => resolve(true);
            s.onerror = () => reject(new Error("Lỗi nạp thư viện: " + url));
            document.head.appendChild(s);
        });
    }

    try {
        if (typeof JSZip === 'undefined') {
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
        }
        if (typeof XLSX === 'undefined') {
            await loadScript('https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js');
        }
    } catch (e) {
        alert(e.message);
        return;
    }

    // 1. Tiện ích hệ thống
    function generateUUID() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

    function getJwtToken() {
        const match = document.cookie.match(/(?:^|;\s*)jwt=([^;]+)/);
        return match && match[1] ? decodeURIComponent(match[1]) : null;
    }

    const pad = (n) => String(n).padStart(2, '0');
    const fmtDateParam = (d, isEnd) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}T${isEnd ? '23:59:59' : '00:00:00'}`;

    // 2. Captcha Dialog cho Máy tính tiền
    async function fetchCaptcha() {
        const token = getJwtToken();
        const res = await fetch('https://hoadondientu.gdt.gov.vn/api/captcha', {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Authorization': `Bearer ${token}`,
                'End-Point': '/tra-cuu/tra-cuu-hoa-don',
                'Request-Id': generateUUID()
            }
        });
        if (!res.ok) throw new Error(`Lỗi tải captcha (HTTP ${res.status})`);
        return await res.json();
    }

    function promptCaptcha(svgContent, infoText) {
        return new Promise((resolve) => {
            const oldBox = document.getElementById('sco-captcha-dialog');
            if (oldBox) oldBox.remove();

            const box = document.createElement('div');
            box.id = 'sco-captcha-dialog';
            box.style.cssText = `
                position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                background: #ffffff; padding: 18px 24px; border-radius: 12px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.45); z-index: 10000000;
                border: 1px solid #cbd5e1; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                width: 330px; text-align: center;
            `;

            box.innerHTML = `
                <div style="font-weight:700; color:#0f172a; margin-bottom:6px; font-size:14px;">MÃ BẢO MẬT (CAPTCHA)</div>
                <div style="font-size:11.5px; color:#64748b; margin-bottom:10px;">${infoText}</div>
                <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px; padding:6px; margin-bottom:10px; display:flex; justify-content:center;">
                    ${svgContent}
                </div>
                <input type="text" id="sco-captcha-input" maxlength="10" placeholder="Nhập mã captcha..." 
                    style="width: 100%; padding: 8px 12px; border: 1px solid #94a3b8; border-radius: 6px; font-size: 14px; font-weight: bold; text-align: center; box-sizing: border-box; outline: none; margin-bottom: 12px;">
                <div style="display:flex; gap:8px;">
                    <button id="sco-captcha-btn-ok" style="flex:1; background:#0284c7; color:#fff; border:none; padding:8px 0; border-radius:6px; font-weight:700; cursor:pointer;">Xác nhận (Enter)</button>
                    <button id="sco-captcha-btn-cancel" style="background:#f1f5f9; color:#475569; border:1px solid #cbd5e1; padding:8px 12px; border-radius:6px; cursor:pointer;">Hủy</button>
                </div>
            `;
            document.body.appendChild(box);

            const input = document.getElementById('sco-captcha-input');
            input.focus();

            function submit() {
                const val = input.value.trim();
                if (!val) return;
                box.remove();
                resolve(val);
            }

            document.getElementById('sco-captcha-btn-ok').onclick = submit;
            input.onkeydown = (e) => { if (e.key === 'Enter') submit(); };
            document.getElementById('sco-captcha-btn-cancel').onclick = () => {
                box.remove();
                resolve(null);
            };
        });
    }

    // 3. Trích xuất file XML từ gói ZIP và bóc tách thông tin HĐ liên quan
    async function extractXmlTextFromZip(zipBuffer) {
        const zip = await JSZip.loadAsync(zipBuffer);
        let xmlFile = zip.file("invoice.xml");
        if (!xmlFile) {
            const xmlFiles = zip.file(/\.xml$/i);
            if (xmlFiles.length > 0) xmlFile = xmlFiles[0];
        }
        if (!xmlFile) return null;
        return await xmlFile.async("string");
    }

    async function fetchRelatedInfoFromXml(item, isSco) {
        const token = getJwtToken();
        const baseEndpoint = isSco ? 'sco-query' : 'query';
        const url = `https://hoadondientu.gdt.gov.vn/api/${baseEndpoint}/invoices/export-xml?nbmst=${item.nbmst}&khhdon=${encodeURIComponent(item.khhdon)}&shdon=${item.shdon}&khmshdon=${item.khmshdon}`;

        try {
            const res = await fetch(url, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'vi',
                    'Authorization': `Bearer ${token}`,
                    'End-Point': '/tra-cuu/tra-cuu-hoa-don',
                    'Request-Id': generateUUID()
                }
            });

            if (!res.ok) return null;
            const arrayBuffer = await res.arrayBuffer();
            const xmlStr = await extractXmlTextFromZip(arrayBuffer);
            if (!xmlStr) return null;

            // Đọc thông tin HĐ liên quan từ thẻ <TTHDLQuan>
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(xmlStr, "text/xml");
            const nodeLQuan = xmlDoc.querySelector("TTHDLQuan") || xmlDoc.querySelector("tthdlquan");

            if (nodeLQuan) {
                const shdGoc = nodeLQuan.querySelector("SHDGoc, shdgoc")?.textContent || '';
                const khhdGoc = nodeLQuan.querySelector("KHHDGoc, khhdgoc")?.textContent || '';
                const nlapGoc = nodeLQuan.querySelector("NLapHDGoc, nlaphdgoc")?.textContent || '';
                const gchu = nodeLQuan.querySelector("GChu, gchu")?.textContent || '';

                let result = '';
                if (shdGoc) result += `Số HĐ: ${shdGoc}`;
                if (khhdGoc) result += ` (${khhdGoc})`;
                if (nlapGoc) result += ` ngày ${nlapGoc}`;
                if (gchu) result += ` - ${gchu}`;
                return result || null;
            }
        } catch (e) {
            console.warn(`Không đọc được XML HĐ số ${item.shdon}:`, e);
        }
        return null;
    }

    // 4. Tải file XML về máy khi người dùng nhấn nút Tải XML
    async function downloadXmlDirectly(item, isSco) {
        const token = getJwtToken();
        const baseEndpoint = isSco ? 'sco-query' : 'query';
        const url = `https://hoadondientu.gdt.gov.vn/api/${baseEndpoint}/invoices/export-xml?nbmst=${item.nbmst}&khhdon=${encodeURIComponent(item.khhdon)}&shdon=${item.shdon}&khmshdon=${item.khmshdon}`;

        const res = await fetch(url, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'vi',
                'Authorization': `Bearer ${token}`,
                'End-Point': '/tra-cuu/tra-cuu-hoa-don',
                'Request-Id': generateUUID()
            }
        });

        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const arrayBuffer = await res.arrayBuffer();
        const zip = await JSZip.loadAsync(arrayBuffer);
        let xmlFile = zip.file("invoice.xml") || zip.file(/\.xml$/i)[0];
        const xmlBlob = await xmlFile.async("blob");

        const a = document.createElement('a');
        a.href = URL.createObjectURL(xmlBlob);
        a.download = `${item.nbmst || 'NB'}_${item.nmmst || 'NM'}_${item.khhdon}_${item.shdon}.xml`;
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    // 5. Giao diện Panel & Modal
    const oldP = document.getElementById('api-hddt-panel');
    if (oldP) oldP.remove();
    const oldModal = document.getElementById('api-hddt-modal');
    if (oldModal) oldModal.remove();
    const oldOverlay = document.getElementById('api-hddt-overlay');
    if (oldOverlay) oldOverlay.remove();

    const styleEl = document.createElement('style');
    styleEl.innerHTML = `
        #api-hddt-panel {
            position: fixed; bottom: 25px; left: 25px; width: 340px;
            background: #ffffff; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.25);
            border: 1px solid #cbd5e1; padding: 14px 16px; z-index: 999998;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 13px; user-select: none;
        }
        .a-row { display: flex; gap: 6px; margin-bottom: 8px; align-items: center; }
        .a-btn-group { display: flex; width: 100%; background: #f1f5f9; padding: 3px; border-radius: 6px; gap: 4px; }
        .a-btn-tab { flex: 1; padding: 5px 0; border: none; background: transparent; cursor: pointer; border-radius: 4px; font-weight: 600; font-size: 12px; color: #475569; }
        .a-btn-tab.active { background: #0284c7; color: #fff; }
        .a-type-group { display: flex; width: 100%; background: #f1f5f9; padding: 3px; border-radius: 6px; gap: 4px; margin-bottom: 8px; }
        .a-btn-type { flex: 1; padding: 5px 2px; border: 1px solid transparent; background: transparent; cursor: pointer; border-radius: 4px; font-weight: 600; font-size: 11px; color: #475569; text-align: center; }
        .a-btn-type:hover { background: #e2e8f0; }
        .a-btn-type.active { background: #0284c7; color: #fff; font-weight: 700; }
        .a-input-code { width: 110px; padding: 4px 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-weight: bold; color: #0284c7; }
        .a-grid-q { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin-top: 6px; }
        .a-btn-q { padding: 5px 0; border: 1px solid #93c5fd; background: #eff6ff; color: #0284c7; border-radius: 4px; font-weight: 700; cursor: pointer; font-size: 12px; }
        .a-btn-q:hover { background: #0284c7; color: #fff; }
        .a-grid-m { display: grid; grid-template-columns: repeat(6, 1fr); gap: 3px; margin: 6px 0 8px 0; }
        .a-btn-m { padding: 5px 0; border: 1px solid #cbd5e1; background: #f8fafc; border-radius: 4px; font-weight: 600; cursor: pointer; font-size: 11px; }
        .a-btn-m:hover { background: #0284c7; color: #fff; border-color: #0284c7; }

        #api-hddt-modal {
            display: none; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
            width: 96vw; max-width: 1550px; max-height: 88vh; background: #ffffff;
            border-radius: 12px; box-shadow: 0 15px 50px rgba(0,0,0,0.35); z-index: 999999;
            padding: 16px 20px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            flex-direction: column;
        }
        #api-hddt-overlay {
            display: none; position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0,0,0,0.45); z-index: 999998;
        }
        .modal-filter-bar {
            display: flex; align-items: center; justify-content: space-between;
            background: #f8fafc; border: 1px solid #e2e8f0; padding: 8px 12px;
            border-radius: 8px; margin-top: 10px; font-size: 12px; gap: 12px; flex-wrap: wrap;
        }
        .modal-filter-group { display: flex; align-items: center; gap: 8px; }
        .input-mst-filter {
            width: 140px; padding: 4px 8px; border: 1px solid #94a3b8; border-radius: 4px;
            font-weight: 700; color: #0369a1; font-size: 12px; outline: none;
        }
        .badge-count {
            font-weight: 700; color: #059669; background: #ecfdf5;
            padding: 2px 7px; border-radius: 4px; border: 1px solid #a7f3d0; font-size: 11px;
        }
        .modal-tbl-wrap { overflow: auto; flex: 1; margin: 10px 0; border: 1px solid #e2e8f0; border-radius: 6px; }
        .modal-tbl { width: 100%; border-collapse: collapse; font-size: 12px; white-space: nowrap; }
        .modal-tbl th, .modal-tbl td { border-bottom: 1px solid #e2e8f0; padding: 7px 9px; text-align: left; }
        .modal-tbl th { background: #f8fafc; position: sticky; top: 0; z-index: 2; font-weight: 600; color: #1e293b; }
        
        .row-warning-modified { background-color: #fef9c3 !important; }
        .row-danger-replaced { background-color: #fee2e2 !important; color: #991b1b !important; }

        .btn-download-xml { background: #10b981; color: #fff; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px; }
        .btn-download-xml:hover { background: #059669; }
        .btn-download-xml:disabled { opacity: 0.6; cursor: not-allowed; }
        .btn-excel { background: #047857; color: #fff; border: none; padding: 7px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; }
        .btn-excel:hover { background: #065f46; }
    `;
    document.head.appendChild(styleEl);

    const panel = document.createElement('div');
    panel.id = 'api-hddt-panel';
    const currentYear = new Date().getFullYear();

    panel.innerHTML = `
        <div style="font-weight: 700; color: #0f172a; margin-bottom: 8px;">Tra Cứu & Tải Nhanh Bảng Kê Excel</div>
        <div class="a-row">
            <div class="a-btn-group" id="api-group-type">
                <button class="a-btn-tab" data-val="sold">Bán ra</button>
                <button class="a-btn-tab active" data-val="purchase">Mua vào</button>
            </div>
        </div>
        <div class="a-row">
            <div class="a-type-group" id="api-group-loai-hd">
                <button type="button" class="a-btn-type active" data-type="co_ma">Có mã</button>
                <button type="button" class="a-btn-type" id="btn-type-khong-ma" data-type="khong_ma">Không mã</button>
                <button type="button" class="a-btn-type" data-type="may_tinh_tien">Máy tính tiền</button>
            </div>
        </div>
        <div class="a-row" style="justify-content: space-between;">
            <span style="font-weight: 600;">Mã công ty:</span>
            <input type="text" id="api-company-code" class="a-input-code" value="Lkqt" placeholder="Mã Cty...">
        </div>
        <div class="a-row" style="justify-content: space-between;">
            <span style="font-weight: 600;">Năm kê khai:</span>
            <div style="display:flex; gap:4px; align-items:center;">
                <button id="api-prev-y" style="width:24px;">-</button>
                <input id="api-year" type="number" value="${currentYear}" style="width: 60px; text-align: center; font-weight: bold; border: 1px solid #cbd5e1; border-radius: 4px;">
                <button id="api-next-y" style="width:24px;">+</button>
            </div>
        </div>
        <div style="font-size: 11px; font-weight: 600; color: #475569; margin-top: 4px;">Tra cứu theo quý:</div>
        <div class="a-grid-q">
            <button class="a-btn-q" data-q="1">Quý 1</button>
            <button class="a-btn-q" data-q="2">Quý 2</button>
            <button class="a-btn-q" data-q="3">Quý 3</button>
            <button class="a-btn-q" data-q="4">Quý 4</button>
        </div>
        <div style="font-size: 11px; font-weight: 600; color: #475569; margin-top: 8px;">Tra cứu theo tháng:</div>
        <div class="a-grid-m" id="api-months"></div>
        <div id="api-status" style="font-size: 11px; color: #64748b; text-align: center; min-height: 14px;">Sẵn sàng</div>
    `;
    document.body.appendChild(panel);

    const overlay = document.createElement('div');
    overlay.id = 'api-hddt-overlay';
    document.body.appendChild(overlay);

    const modal = document.createElement('div');
    modal.id = 'api-hddt-modal';
    modal.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <h3 style="margin: 0; font-size: 16px; color: #0f172a;" id="modal-title">Danh sách hóa đơn</h3>
            <button id="btn-close-modal" style="border: none; background: #e2e8f0; border-radius: 50%; width: 26px; height: 26px; cursor: pointer; font-weight: bold;">✕</button>
        </div>
        
        <div class="modal-filter-bar">
            <div class="modal-filter-group">
                <span style="font-weight: 700; color: #0f172a;">⚡ Lọc MST:</span>
                <input type="text" id="filter-mst-input" class="input-mst-filter" placeholder="Nhập MST cần lọc...">
                <span class="badge-count" id="badge-match-count">0 dòng</span>
                <button id="btn-select-visible" style="background: #0284c7; color: #fff; border: none; padding: 4px 10px; border-radius: 4px; font-weight: 600; cursor: pointer;">
                    ☑ Chọn tất cả đang lọc
                </button>
                <button id="btn-reset-mst-filter" style="background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; padding: 4px 8px; border-radius: 4px; cursor: pointer;">
                    ↺ Hiện hết
                </button>
            </div>

            <div class="modal-filter-group">
                <span style="font-weight: 600; color: #334155;">Từ ngày:</span>
                <input type="date" id="filter-date-after" style="padding: 3px 6px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 12px;">
                <button id="btn-apply-date-filter" style="background: #2563eb; color: #fff; border: none; padding: 4px 10px; border-radius: 4px; font-weight: 500; cursor: pointer;">
                    Chọn từ ngày này
                </button>
                <button id="btn-clear-selection" style="background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; padding: 4px 8px; border-radius: 4px; cursor: pointer;">
                    Bỏ chọn
                </button>
            </div>
        </div>

        <div class="modal-tbl-wrap">
            <table class="modal-tbl">
                <thead>
                    <tr>
                        <th style="width: 30px;"><input type="checkbox" id="chk-all" title="Chọn tất cả các dòng đang hiển thị"></th>
                        <th style="width: 35px;">STT</th>
                        <th>Ký hiệu</th>
                        <th>Số HĐ</th>
                        <th>Ngày lập</th>
                        <th>Đối tác</th>
                        <th>MST đối tác</th>
                        <th style="text-align: center;">ĐVT</th>
                        <th style="text-align: right;">Tiền chưa thuế</th>
                        <th style="text-align: right;">Tiền thuế</th>
                        <th style="text-align: right;">Tiền phí</th>
                        <th style="text-align: right;">Tổng tiền</th>
                        <th style="text-align: center;">Trạng thái HĐ</th>
                        <th>Hóa đơn liên quan</th>
                        <th style="text-align: center;">Kết quả xử lý</th>
                        <th style="text-align: center; width: 85px;">Thao tác</th>
                    </tr>
                </thead>
                <tbody id="modal-tbody"></tbody>
            </table>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <span id="modal-summary" style="font-size: 12px; color: #475569;"></span>
            <div style="display: flex; gap: 8px;">
                <button id="btn-download-selected" style="background: #0284c7; color: #fff; border: none; padding: 7px 16px; border-radius: 6px; font-weight: 600; cursor: pointer;">
                    Tải các mục đã chọn (XML)
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    let isFetching = false;
    let isBatchDownloading = false;
    let currentInvoices = [];
    let currentContext = { isPurchase: true, isSco: false };

    // 6. TẢI FILE EXCEL BẢNG KÊ TRỰC TIẾP TỪ SERVER
    async function requestAndDownloadExcel(fromD, toD, isPurchase, loaiHD, companyCode, monthTag, year, statusEl) {
        const token = getJwtToken();
        const fromStr = fmtDateParam(fromD, false);
        const toStr = fmtDateParam(toD, true);

        let url = '';
        let actionRaw = '';
        let fileTypeTag = '';
        const isSco = (loaiHD === 'may_tinh_tien');

        if (isSco) {
            fileTypeTag = 'MTTien';
            statusEl.textContent = `[T${monthTag}] Đang nạp Captcha tải bảng kê Excel MTT...`;
            const captchaData = await fetchCaptcha();
            const captchaVal = await promptCaptcha(captchaData.content, `Tải bảng kê máy tính tiền ${isPurchase ? 'Mua vào' : 'Bán ra'} T${monthTag}/${year}`);
            if (!captchaVal) throw new Error("Đã hủy nhập Captcha.");

            statusEl.textContent = `[T${monthTag}] Đang tải file Excel từ máy chủ...`;
            if (isPurchase) {
                actionRaw = "Xuất hóa đơn có mã khởi tạo từ máy tính tiền mua vào";
                url = `https://hoadondientu.gdt.gov.vn/api/sco-query/invoices/export-excel-sold?sort=tdlap:desc&search=tdlap=ge=${fromStr};tdlap=le=${toStr};ttxly==8&ttxly==8&type=purchase&ckey=${encodeURIComponent(captchaData.key)}&cvalue=${encodeURIComponent(captchaVal)}`;
            } else {
                actionRaw = "Xuất hóa đơn có mã khởi tạo từ máy tính tiền bán ra";
                url = `https://hoadondientu.gdt.gov.vn/api/sco-query/invoices/export-excel?sort=tdlap:desc&search=tdlap=ge=${fromStr};tdlap=le=${toStr}&ckey=${encodeURIComponent(captchaData.key)}&cvalue=${encodeURIComponent(captchaVal)}`;
            }
        } else {
            const ttxly = (loaiHD === 'co_ma') ? 5 : 6;
            if (isPurchase) {
                fileTypeTag = (loaiHD === 'co_ma') ? 'CMa' : 'KMa';
                actionRaw = "Tìm kiếm (hóa đơn mua vào)";
                url = `https://hoadondientu.gdt.gov.vn/api/query/invoices/export-excel-sold?sort=tdlap:desc&search=tdlap=ge=${fromStr};tdlap=le=${toStr};ttxly==${ttxly}&type=purchase`;
            } else {
                fileTypeTag = '';
                actionRaw = "Tìm kiếm (hóa đơn bán ra)";
                url = `https://hoadondientu.gdt.gov.vn/api/query/invoices/export-excel?sort=tdlap:desc&search=tdlap=ge=${fromStr};tdlap=le=${toStr}`;
            }
        }

        const res = await fetch(url, {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Accept-Language': 'vi',
                'Authorization': `Bearer ${token}`,
                'Action': encodeURIComponent(actionRaw),
                'End-Point': '/tra-cuu/tra-cuu-hoa-don',
                'Request-Id': generateUUID()
            }
        });

        if (!res.ok) throw new Error(`Lỗi máy chủ HTTP ${res.status}`);

        const blob = await res.blob();
        const arrayBuffer = await blob.arrayBuffer();

        // Tự động tải file Excel về máy
        const dirStr = isPurchase ? 'Mua' : 'Ban';
        const fileNameParts = [companyCode, 'BK', dirStr, fileTypeTag, `T${monthTag}`, year].filter(Boolean).join(' ');
        const finalFileName = `${fileNameParts}.xlsx`;

        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = finalFileName;
        document.body.appendChild(a);
        a.click();
        a.remove();
        console.log(`[HDDT] Đã lưu file: ${finalFileName}`);

        return { arrayBuffer, isSco };
    }

    // 7. PHÂN TÍCH FILE EXCEL VÀ TRÍCH XUẤT DANH SÁCH HÓA ĐƠN
    function parseExcelBuffer(arrayBuffer, isPurchase, isSco) {
        const wb = XLSX.read(arrayBuffer, { type: 'array' });
        const sheetName = wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const rawJson = XLSX.utils.sheet_to_json(ws, { header: 1 });

        // Tìm dòng tiêu đề (chứa "STT" và "Ký hiệu")
        let headerRowIdx = -1;
        for (let r = 0; r < Math.min(rawJson.length, 10); r++) {
            const row = rawJson[r] || [];
            if (row.some(c => String(c).trim() === 'STT') && row.some(c => String(c).includes('Ký hiệu'))) {
                headerRowIdx = r;
                break;
            }
        }

        if (headerRowIdx === -1) headerRowIdx = 5; // Mặc định dòng 6 (0-indexed = 5)

        const headers = rawJson[headerRowIdx].map(h => String(h || '').trim());
        const getColIdx = (keyword) => headers.findIndex(h => h.toLowerCase().includes(keyword.toLowerCase()));

        const colIdx = {
            khms: getColIdx('mẫu số'),
            kh: getColIdx('ký hiệu hóa đơn'),
            shd: getColIdx('số hóa đơn'),
            ngay: getColIdx('ngày lập'),
            mstBan: getColIdx('mst người bán'),
            tenBan: getColIdx('tên người bán'),
            mstMua: getColIdx('mst người mua'),
            tenMua: getColIdx('tên người mua'),
            chuaThue: getColIdx('chưa thuế'),
            thue: getColIdx('tiền thuế'),
            phi: getColIdx('tiền phí'),
            tong: getColIdx('thanh toán'),
            dvtte: getColIdx('tiền tệ'),
            tt: getColIdx('trạng thái'),
            cqt: getColIdx('kiểm tra')
        };

        const parsedList = [];
        for (let r = headerRowIdx + 1; r < rawJson.length; r++) {
            const row = rawJson[r];
            if (!row || row.length === 0 || !row[colIdx.shd]) continue;

            const sttVal = String(row[0] || '').trim();
            if (sttVal.toUpperCase().includes('TỔNG CỘNG') || sttVal.toUpperCase().includes('TOTAL')) continue;

            let ngayLapStr = String(row[colIdx.ngay] || '').trim();
            let dateIso = '';
            if (ngayLapStr.includes('/')) {
                const parts = ngayLapStr.split('/');
                if (parts.length === 3) dateIso = `${parts[2]}-${pad(parts[1])}-${pad(parts[0])}`;
            }

            const ttText = String(row[colIdx.tt] || 'Hóa đơn mới').trim();
            let rowType = 'normal';
            if (ttText.includes('điều chỉnh') || ttText.includes('thay thế')) {
                rowType = (ttText.includes('đã bị') || ttText.includes('bị')) ? 'replaced_source' : 'modified';
            }

            parsedList.push({
                khmshdon: String(row[colIdx.khms] || '1').trim(),
                khhdon: String(row[colIdx.kh] || '').trim(),
                shdon: String(row[colIdx.shd] || '').trim(),
                ngayLap: ngayLapStr,
                dateIso: dateIso,
                nbmst: String(row[colIdx.mstBan] || '').trim(),
                nbten: String(row[colIdx.tenBan] || '').trim(),
                nmmst: String(row[colIdx.mstMua] || '').trim(),
                nmten: String(row[colIdx.tenMua] || '').trim(),
                tgtcthue: row[colIdx.chuaThue] || 0,
                tgtthue: row[colIdx.thue] || 0,
                tgtphi: (colIdx.phi !== -1 ? row[colIdx.phi] : 0) || 0,
                tgtttbso: row[colIdx.tong] || 0,
                dvtte: (colIdx.dvtte !== -1 ? String(row[colIdx.dvtte] || 'VND') : 'VND'),
                statusText: ttText,
                rowType: rowType,
                refText: '-',
                ketQuaXuLy: String(row[colIdx.cqt] || 'Đã kiểm tra').trim()
            });
        }

        return parsedList;
    }

    // 8. ĐIỀU PHỐI: TẢI EXCEL -> PARSE DỮ LIỆU -> QUÉT XML LẤY HÓA ĐƠN LIÊN QUAN
    async function startQueryWorkflow(monthsList, periodTag, year) {
        if (isFetching) {
            alert("Đang có tiến trình truy vấn, vui lòng đợi...");
            return;
        }

        const token = getJwtToken();
        if (!token) {
            alert("Chưa tìm thấy Cookie 'jwt'! Vui lòng đảm bảo bạn đang ở trạng thái đã đăng nhập.");
            return;
        }

        isFetching = true;
        const isPurchase = document.querySelector('#api-group-type .active').getAttribute('data-val') === 'purchase';
        const activeTypeBtn = document.querySelector('#api-group-loai-hd .a-btn-type.active');
        const loaiHD = activeTypeBtn ? activeTypeBtn.getAttribute('data-type') : 'co_ma';
        const companyCode = document.getElementById('api-company-code').value.trim() || 'Lkqt';
        const statusEl = document.getElementById('api-status');

        currentInvoices = [];
        const isSco = (loaiHD === 'may_tinh_tien');
        currentContext = { isPurchase, isSco };

        try {
            for (let i = 0; i < monthsList.length; i++) {
                const m = monthsList[i];
                const daysInMonth = new Date(year, m, 0).getDate();
                const fromD = new Date(year, m - 1, 1);
                const toD = new Date(year, m - 1, daysInMonth);

                statusEl.textContent = `[T${pad(m)}] Đang tải file bảng kê Excel từ cơ quan Thuế...`;
                const { arrayBuffer } = await requestAndDownloadExcel(fromD, toD, isPurchase, loaiHD, companyCode, pad(m), year, statusEl);

                statusEl.textContent = `[T${pad(m)}] Đang đọc dữ liệu bảng kê...`;
                const monthInvoices = parseExcelBuffer(arrayBuffer, isPurchase, isSco);
                currentInvoices = currentInvoices.concat(monthInvoices);

                await new Promise(r => setTimeout(r, 600));
            }

            // Sắp xếp ngày giảm dần
            currentInvoices.sort((a, b) => (b.dateIso || '').localeCompare(a.dateIso || ''));

            // TÌM CÁC HÓA ĐƠN ĐIỀU CHỈNH / THAY THẾ ĐỂ ĐỌC XML LẤY THÔNG TIN LIÊN QUAN
            const needXmlList = currentInvoices.filter(inv => inv.rowType === 'modified');
            if (needXmlList.length > 0) {
                statusEl.textContent = `Đang quét XML đọc HĐ liên quan cho ${needXmlList.length} hóa đơn điều chỉnh/thay thế...`;
                for (let k = 0; k < needXmlList.length; k++) {
                    const item = needXmlList[k];
                    statusEl.textContent = `Đang đọc XML HĐ số ${item.shdon} (${k + 1}/${needXmlList.length})...`;
                    const refInfo = await fetchRelatedInfoFromXml(item, isSco);
                    if (refInfo) {
                        item.refText = refInfo;
                    }
                    await new Promise(r => setTimeout(r, 300));
                }
            }

            statusEl.textContent = `✔ Hoàn tất: Đã tải file Excel và trích xuất ${currentInvoices.length} HĐ!`;
            statusEl.style.color = "#10b981";
            showModal(currentInvoices, periodTag, year, isPurchase, isSco);

        } catch (err) {
            statusEl.textContent = "Lỗi: " + err.message;
            statusEl.style.color = "#ef4444";
            console.error(err);
        } finally {
            isFetching = false;
        }
    }

    // 9. HIỂN THỊ DỮ LIỆU LÊN MODAL
    function showModal(list, periodTag, year, isPurchase, isSco) {
        const tbody = document.getElementById('modal-tbody');
        tbody.innerHTML = '';

        document.getElementById('modal-title').textContent =
            `Danh sách Hóa đơn ${isPurchase ? 'Mua vào' : 'Bán ra'} - ${periodTag}/${year} (Tổng: ${list.length} HĐ - Đã lưu Excel)`;

        const fmtMoney = (val) => (val !== null && val !== undefined && val !== '') ? Number(val).toLocaleString('vi-VN') : '0';

        list.forEach((item, index) => {
            const tr = document.createElement('tr');
            let partnerName = isPurchase ? (item.nbten || '-') : (item.nmten || '-');
            let partnerMst = isPurchase ? (item.nbmst || '-') : (item.nmmst || '-');

            if (item.rowType === 'modified') tr.className = 'row-warning-modified';
            else if (item.rowType === 'replaced_source') tr.className = 'row-danger-replaced';

            tr.setAttribute('data-mst', String(partnerMst).toLowerCase());
            tr.setAttribute('data-date', item.dateIso);

            tr.innerHTML = `
                <td><input type="checkbox" class="chk-item" data-index="${index}" data-date="${item.dateIso}"></td>
                <td style="color: #64748b; text-align: center;">${index + 1}</td>
                <td><strong>${item.khmshdon}${item.khhdon}</strong></td>
                <td><span style="color: #0284c7; font-weight: 600;">${item.shdon}</span></td>
                <td>${item.ngayLap}</td>
                <td style="max-width: 230px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${partnerName}">${partnerName}</td>
                <td class="col-mst">${partnerMst}</td>
                <td style="text-align: center; color: #475569;">${item.dvtte}</td>
                <td style="text-align: right;">${fmtMoney(item.tgtcthue)}</td>
                <td style="text-align: right;">${fmtMoney(item.tgtthue)}</td>
                <td style="text-align: right; color: #64748b;">${fmtMoney(item.tgtphi)}</td>
                <td style="text-align: right; font-weight: 600; color: #0f172a;">${fmtMoney(item.tgtttbso)}</td>
                <td style="text-align: center;"><b>${item.statusText}</b></td>
                <td style="font-size: 11px; max-width: 250px; white-space: normal;">${item.refText}</td>
                <td style="text-align: center;">${item.ketQuaXuLy}</td>
                <td style="text-align: center;">
                    <button class="btn-download-xml" data-index="${index}">Tải XML</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        tbody.querySelectorAll('.btn-download-xml').forEach(btn => {
            btn.onclick = async function () {
                const idx = parseInt(this.getAttribute('data-index'), 10);
                this.textContent = 'Đang tải...';
                this.disabled = true;
                try {
                    await downloadXmlDirectly(list[idx], isSco);
                    this.textContent = 'Đã tải';
                } catch (e) {
                    this.textContent = 'Lỗi';
                }
                setTimeout(() => {
                    this.textContent = 'Tải XML';
                    this.disabled = false;
                }, 1500);
            };
        });

        applyMstFilter();
        overlay.style.display = 'block';
        modal.style.display = 'flex';
    }

    // 10. BỘ LỌC MST & CHECKBOX
    function applyMstFilter() {
        const filterVal = (document.getElementById('filter-mst-input').value || '').trim().toLowerCase();
        const rows = document.querySelectorAll('#modal-tbody tr');
        let visibleCount = 0;

        rows.forEach(tr => {
            const rowMst = tr.getAttribute('data-mst') || '';
            if (!filterVal || rowMst.includes(filterVal)) {
                tr.style.display = '';
                visibleCount++;
            } else {
                tr.style.display = 'none';
            }
        });

        const badge = document.getElementById('badge-match-count');
        if (badge) badge.textContent = `${visibleCount}/${rows.length} dòng`;
        updateSummary();
    }

    function updateSummary() {
        const rows = Array.from(document.querySelectorAll('#modal-tbody tr'));
        const total = rows.length;
        const visibleRows = rows.filter(r => r.style.display !== 'none');
        const selectedCount = document.querySelectorAll('#modal-tbody .chk-item:checked').length;
        
        document.getElementById('modal-summary').textContent = 
            `Đã chọn: ${selectedCount} | Hiển thị: ${visibleRows.length}/${total} hóa đơn.`;

        const chkAll = document.getElementById('chk-all');
        if (chkAll && visibleRows.length > 0) {
            chkAll.checked = visibleRows.every(r => {
                const chk = r.querySelector('.chk-item');
                return chk && chk.checked;
            });
        } else if (chkAll) {
            chkAll.checked = false;
        }
    }

    document.getElementById('filter-mst-input').oninput = applyMstFilter;

    document.getElementById('btn-reset-mst-filter').onclick = () => {
        document.getElementById('filter-mst-input').value = '';
        applyMstFilter();
    };

    document.getElementById('btn-select-visible').onclick = () => {
        const visibleRows = Array.from(document.querySelectorAll('#modal-tbody tr')).filter(r => r.style.display !== 'none');
        visibleRows.forEach(tr => {
            const chk = tr.querySelector('.chk-item');
            if (chk) chk.checked = true;
        });
        updateSummary();
    };

    // 11. SỰ KIỆN NÚT TRÊN MODAL
    document.getElementById('btn-close-modal').onclick = () => {
        overlay.style.display = 'none';
        modal.style.display = 'none';
    };
    overlay.onclick = () => {
        overlay.style.display = 'none';
        modal.style.display = 'none';
    };

    document.getElementById('chk-all').onchange = function () {
        const rows = document.querySelectorAll('#modal-tbody tr');
        rows.forEach(tr => {
            if (tr.style.display !== 'none') {
                const chk = tr.querySelector('.chk-item');
                if (chk) chk.checked = this.checked;
            }
        });
        updateSummary();
    };

    document.getElementById('modal-tbody').addEventListener('change', (e) => {
        if (e.target.classList.contains('chk-item')) updateSummary();
    });

    document.getElementById('btn-apply-date-filter').onclick = () => {
        const filterVal = document.getElementById('filter-date-after').value;
        if (!filterVal) {
            alert("Vui lòng chọn ngày mốc cần lọc!");
            return;
        }
        const rows = document.querySelectorAll('#modal-tbody tr');
        rows.forEach(tr => {
            if (tr.style.display !== 'none') {
                const itemDate = tr.getAttribute('data-date');
                const chk = tr.querySelector('.chk-item');
                if (chk) chk.checked = Boolean(itemDate && itemDate >= filterVal);
            }
        });
        updateSummary();
    };

    document.getElementById('btn-clear-selection').onclick = () => {
        document.querySelectorAll('.chk-item').forEach(chk => chk.checked = false);
        document.getElementById('chk-all').checked = false;
        updateSummary();
    };

    // Tải hàng loạt XML đã chọn
    document.getElementById('btn-download-selected').onclick = async () => {
        if (isBatchDownloading) return;

        const checkedBoxes = Array.from(document.querySelectorAll('.chk-item:checked'));
        if (checkedBoxes.length === 0) {
            alert("Vui lòng tích chọn ít nhất 1 hóa đơn cần tải!");
            return;
        }

        isBatchDownloading = true;
        const btnDownload = document.getElementById('btn-download-selected');
        const summaryEl = document.getElementById('modal-summary');
        const originalBtnText = btnDownload.textContent;
        const isSco = currentContext.isSco;

        btnDownload.disabled = true;

        for (let i = 0; i < checkedBoxes.length; i++) {
            const chk = checkedBoxes[i];
            const idx = parseInt(chk.getAttribute('data-index'), 10);
            const inv = currentInvoices[idx];

            btnDownload.textContent = `Đang xử lý: ${i + 1}/${checkedBoxes.length}...`;
            summaryEl.textContent = `Đang giải nén & tải XML HĐ số ${inv.shdon} (${i + 1}/${checkedBoxes.length})`;

            try {
                await downloadXmlDirectly(inv, isSco);
            } catch (e) {
                console.error("Lỗi tải XML:", e);
            }
            await new Promise(r => setTimeout(r, 800));
        }

        btnDownload.textContent = originalBtnText;
        btnDownload.disabled = false;
        summaryEl.textContent = `Đã giải nén và lưu xong toàn bộ ${checkedBoxes.length} hóa đơn XML.`;
        isBatchDownloading = false;
    };

    // 12. GẮN SỰ KIỆN CÁC NÚT TRÊN PANEL ĐIỀU KHIỂN
    document.querySelectorAll('#api-group-type .a-btn-tab').forEach(btn => {
        btn.onclick = function () {
            document.querySelectorAll('#api-group-type .a-btn-tab').forEach(b => b.classList.remove('active'));
            this.classList.add('active');

            const isSold = (this.getAttribute('data-val') === 'sold');
            const btnKhongMa = document.getElementById('btn-type-khong-ma');

            if (isSold) {
                btnKhongMa.style.display = 'none';
                if (btnKhongMa.classList.contains('active')) {
                    btnKhongMa.classList.remove('active');
                    const btnCoMa = document.querySelector('#api-group-loai-hd .a-btn-type[data-type="co_ma"]');
                    if (btnCoMa) btnCoMa.classList.add('active');
                }
            } else {
                btnKhongMa.style.display = 'block';
            }
        };
    });

    document.querySelectorAll('#api-group-loai-hd .a-btn-type').forEach(btn => {
        btn.onclick = function () {
            document.querySelectorAll('#api-group-loai-hd .a-btn-type').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
        };
    });

    const yearInput = document.getElementById('api-year');
    document.getElementById('api-prev-y').onclick = () => yearInput.value = parseInt(yearInput.value, 10) - 1;
    document.getElementById('api-next-y').onclick = () => yearInput.value = parseInt(yearInput.value, 10) + 1;

    document.querySelectorAll('.a-btn-q').forEach(btn => {
        btn.onclick = () => {
            const q = parseInt(btn.getAttribute('data-q'), 10);
            const y = parseInt(yearInput.value, 10);
            const quarterMap = { 1: [1, 2, 3], 2: [4, 5, 6], 3: [7, 8, 9], 4: [10, 11, 12] };
            startQueryWorkflow(quarterMap[q], `Q${q}`, y);
        };
    });

    const monthsContainer = document.getElementById('api-months');
    for (let m = 1; m <= 12; m++) {
        const btn = document.createElement('button');
        btn.className = 'a-btn-m';
        btn.textContent = `T${pad(m)}`;
        btn.onclick = () => {
            const y = parseInt(yearInput.value, 10);
            startQueryWorkflow([m], `T${pad(m)}`, y);
        };
        monthsContainer.appendChild(btn);
    }

    console.log("%c[HDDT]%c Đã kích hoạt giải pháp tải trực tiếp Excel & phân tích tự động!", "color:#0284c7;font-weight:bold;", "color:#16a34a;");
})();
