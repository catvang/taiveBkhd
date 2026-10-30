(async function runUnifiedHddtPortal() {
    'use strict';

    // 0. Tự động nạp thư viện JSZip và xlsx-js-style
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

    // 1. Tiện ích sinh UUID và lấy JWT Cookie
    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    function getJwtToken() {
        const match = document.cookie.match(/(?:^|;\s*)jwt=([^;]+)/);
        return match && match[1] ? decodeURIComponent(match[1]) : null;
    }

    const pad = (n) => String(n).padStart(2, '0');
    const fmtDateParam = (d, isEnd) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}T${isEnd ? '23:59:59' : '00:00:00'}`;
    const fmtDateDisplay = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

    // Chuyển tdlap thành Date Object chuẩn của JavaScript (bù múi giờ, tránh bị lùi 1 ngày)
    function parseTdlapToDate(tdlapStr) {
        if (!tdlapStr) return null;
        try {
            const d = new Date(tdlapStr);
            if (isNaN(d.getTime())) return null;
            return new Date(d.getFullYear(), d.getMonth(), d.getDate());
        } catch (e) {
            return null;
        }
    }

    // 2. Phân loại trạng thái hóa đơn
    function parseInvoiceStatus(item) {
        const tchat = Number(item.tchat);
        const tthai = Number(item.tthai);
        const hasGocInfo = Boolean((item.khhdgoc && item.khhdgoc.trim()) || (item.shdgoc && String(item.shdgoc).trim()));
        const hasHsGocId = Boolean(item.hsgoc && String(item.hsgoc).trim());

        let statusText = '';
        let refText = '-';
        let rowType = 'normal';

        if (hasGocInfo && (tchat === 3 || tchat === 5)) {
            statusText = 'Hóa đơn điều chỉnh';
            const note = item.gchdgoc ? ` (${item.gchdgoc})` : '';
            refText = `Đ/c cho HĐ: ${item.shdgoc || ''} (${item.khhdgoc || ''})${note}`;
            rowType = 'modified';
        } else if (hasHsGocId && tthai === 5) {
            statusText = 'Hóa đơn bị điều chỉnh';
            refText = 'Gốc bị điều chỉnh';
            rowType = 'replaced_source';
        } else if (hasGocInfo && (tchat === 2 || tchat === 4)) {
            statusText = 'Hóa đơn thay thế';
            refText = `Thay thế cho HĐ: ${item.shdgoc || ''} (${item.khhdgoc || ''})`;
            rowType = 'modified';
        } else if (tthai === 4) {
            statusText = 'Hóa đơn bị thay thế';
            refText = 'Đã bị thay thế (Hủy/Bỏ)';
            rowType = 'replaced_source';
        } else if (tthai === 1 && tchat === 1) {
            statusText = 'Hóa đơn mới';
            refText = '-';
            rowType = 'normal';
        } else {
            statusText = `Khác (${item.tthai})`;
            refText = '-';
            rowType = 'normal';
        }

        return { statusText, refText, rowType };
    }

    function mapKetQuaXuLyText(ttxly) {
        switch (Number(ttxly)) {
            case 5: return 'Đã cấp mã hóa đơn';
            case 6: return 'Tổng cục thuế đã nhận không mã';
            case 8: return 'Cục Thuế đã nhận hóa đơn có mã khởi tạo từ máy tính tiền';
            case 1: return 'Đã gửi CQT';
            case 2: return 'Lỗi từ chối';
            default: return (ttxly !== null && ttxly !== undefined) ? `Trạng thái ${ttxly}` : '-';
        }
    }

    // 3. Giải nén ZIP trong bộ nhớ và tải XML
    async function extractAndSaveXml(zipBuffer, item) {
        const zip = await JSZip.loadAsync(zipBuffer);
        let xmlFile = zip.file("invoice.xml");
        if (!xmlFile) {
            const xmlFiles = zip.file(/\.xml$/i);
            if (xmlFiles.length > 0) xmlFile = xmlFiles[0];
        }

        if (!xmlFile) throw new Error("Không tìm thấy file XML bên trong gói nén!");

        const xmlBlob = await xmlFile.async("blob");
        const a = document.createElement('a');
        a.href = URL.createObjectURL(xmlBlob);
        const nbmst = item.nbmst || 'NB';
        const nmmst = item.nmmst || 'NM';
        a.download = `${nbmst}_${nmmst}_${item.khhdon}_${item.shdon}.xml`;
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    async function downloadXmlAsync(item, isSco) {
        const token = getJwtToken();
        const baseEndpoint = isSco ? 'sco-query' : 'query';
        const url = `https://hoadondientu.gdt.gov.vn/api/${baseEndpoint}/invoices/export-xml?nbmst=${item.nbmst}&khhdon=${encodeURIComponent(item.khhdon)}&shdon=${item.shdon}&khmshdon=${item.khmshdon}`;

        let retries = 0;
        while (retries < 3) {
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

                if (res.status === 429) {
                    retries++;
                    await new Promise(r => setTimeout(r, 2500));
                    continue;
                }
                if (!res.ok) throw new Error(`HTTP ${res.status}`);

                const arrayBuffer = await res.arrayBuffer();
                await extractAndSaveXml(arrayBuffer, item);
                return true;
            } catch (err) {
                if (retries >= 2) return false;
            }
        }
        return false;
    }

    // 4. Captcha API và Dialog nhập mã
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

    function chunkDateRange(startDate, endDate, maxDays = 10) {
        const chunks = [];
        let currStart = new Date(startDate);
        while (currStart <= endDate) {
            let currEnd = new Date(currStart);
            currEnd.setDate(currEnd.getDate() + (maxDays - 1));
            if (currEnd > endDate) currEnd = new Date(endDate);
            chunks.push({ from: new Date(currStart), to: new Date(currEnd) });
            currStart.setDate(currStart.getDate() + maxDays);
        }
        return chunks;
    }

    // 5. Giao diện Panel & Modal
    const oldP = document.getElementById('api-hddt-panel');
    if (oldP) oldP.remove();
    const oldModal = document.getElementById('api-hddt-modal');
    if (oldModal) oldModal.remove();
    const oldOverlay = document.getElementById('api-hddt-overlay');
    if (oldOverlay) oldOverlay.remove();

    const style = document.createElement('style');
    style.innerHTML = `
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
        .a-select { width: 100%; padding: 5px 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 12px; background: #fff; }
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
		.a-type-group { display: flex; width: 100%; background: #f1f5f9; padding: 3px; border-radius: 6px; gap: 4px; margin-bottom: 8px; }
		.a-btn-type { flex: 1; padding: 5px 2px; border: 1px solid transparent; background: transparent; cursor: pointer; border-radius: 4px; font-weight: 600; font-size: 11px; color: #475569; text-align: center; }
		.a-btn-type:hover { background: #e2e8f0; }
		.a-btn-type.active { background: #0284c7; color: #fff; font-weight: 700; }
    `;
    document.head.appendChild(style);

    const panel = document.createElement('div');
    panel.id = 'api-hddt-panel';
    const currentYear = new Date().getFullYear();

    panel.innerHTML = `
        <div style="font-weight: 700; color: #0f172a; margin-bottom: 8px;">Tra Cứu HĐĐT (Xuất Excel Chuẩn Thuế)</div>
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
            <span style="font-weight: 600;">Số dòng / Năm:</span>
            <div style="display:flex; gap:4px; align-items:center;">
                <select id="api-page-size" style="padding: 2px 4px; border-radius: 4px; border: 1px solid #cbd5e1;">
                    <option value="15">15</option>
                    <option value="50" selected>50</option>
                </select>
                <button id="api-prev-y" style="width:20px;">-</button>
                <input id="api-year" type="number" value="${currentYear}" style="width: 55px; text-align: center; font-weight: bold; border: 1px solid #cbd5e1; border-radius: 4px;">
                <button id="api-next-y" style="width:20px;">+</button>
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
        <div id="api-status" style="font-size: 11px; color: #64748b; text-align: center; min-height: 14px;">Sẵn sàng tra cứu</div>
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
                <button id="btn-export-excel" class="btn-excel">
                    Xuất Lại Excel Chuẩn (.xlsx)
                </button>
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
    let currentContext = {
        isPurchase: true,
        loaiHD: 'co_ma',
        startDateStr: '',
        endDateStr: '',
        periodTag: '',
        year: currentYear,
        companyCode: 'Lkqt'
    };

    // 6. XUẤT FILE EXCEL CHUẨN ĐỊNH DẠNG THUẾ CHO CẢ 3 LOẠI
    function exportTaxTemplateExcel() {
        if (!currentInvoices || currentInvoices.length === 0) {
            alert("Không có dữ liệu để xuất file Excel!");
            return;
        }

        const isPurchase = currentContext.isPurchase;
        const isSco = (currentContext.loaiHD === 'may_tinh_tien');
        const mainTitle = isSco ? "DANH SÁCH HÓA ĐƠN MÁY TÍNH TIỀN" : "DANH SÁCH HÓA ĐƠN";
        const dateRangeText = `Từ ngày ${currentContext.startDateStr} đến ngày ${currentContext.endDateStr}`;

        // Cấu trúc tiêu đề 17 cột (MTT) hoặc 19 cột (Có mã / Không mã)
        const headerCols = isSco ? [
            "STT", "Ký hiệu mẫu số", "Ký hiệu hóa đơn", "Số hóa đơn", "Ngày lập",
            "MST người bán/MST người xuất hàng", "Tên người bán/Tên người xuất hàng",
            isPurchase ? "Địa chỉ người bán" : "Địa chỉ người mua",
            "MST người mua/MST người nhận hàng", "Tên người mua/Tên người nhận hàng",
            "Căn cước công dân", "Tổng tiền chưa thuế", "Tổng tiền thuế",
            "Tổng tiền chiết khấu thương mại", "Tổng tiền thanh toán",
            "Trạng thái hóa đơn", "Kết quả kiểm tra hóa đơn"
        ] : [
            "STT", "Ký hiệu mẫu số", "Ký hiệu hóa đơn", "Số hóa đơn", "Ngày lập",
            "MST người bán/MST người xuất hàng", "Tên người bán/Tên người xuất hàng",
            "MST người mua/MST người nhận hàng", "Tên người mua/Tên người nhận hàng",
            "Địa chỉ người mua", "Tổng tiền chưa thuế", "Tổng tiền thuế",
            "Tổng tiền chiết khấu thương mại", "Tổng tiền phí", "Tổng tiền thanh toán",
            "Đơn vị tiền tệ", "Tỷ giá", "Trạng thái hóa đơn", "Kết quả kiểm tra hóa đơn"
        ];

        const rows = [
            [], [],
            [mainTitle],
            [dateRangeText],
            [],
            headerCols
        ];

        currentInvoices.forEach((item, idx) => {
            const partnerBuyerName = (item.nmten && item.nmten.trim()) ? item.nmten : (item.nmtnmua || '');
            const valChuaThue = (item.tgtcthue !== null && item.tgtcthue !== undefined && item.tgtcthue !== '') ? Number(item.tgtcthue) : null;
            const valThue = (item.tgtthue !== null && item.tgtthue !== undefined && item.tgtthue !== '') ? Number(item.tgtthue) : null;
            const valCktm = (item.tgttcktm !== null && item.tgttcktm !== undefined && item.tgttcktm !== '') ? Number(item.tgttcktm) : 0;
            const valPhi = (item.tgtphi !== null && item.tgtphi !== undefined && item.tgtphi !== '') ? Number(item.tgtphi) : 0;
            const valTong = (item.tgtttbso !== null && item.tgtttbso !== undefined && item.tgtttbso !== '') ? Number(item.tgtttbso) : null;
            const { statusText } = parseInvoiceStatus(item);
            const ketQuaKiemTra = mapKetQuaXuLyText(item.ttxly);
            const dateObj = parseTdlapToDate(item.tdlap);

            if (isSco) {
                const cccd = item.nmcccd || item.cccd || item.nmtcccd || item.nmtcmnd || '';
                const addressCol = isPurchase ? (item.nbdchi || '') : (item.nmdchi || '');
                rows.push([
                    idx + 1, item.khmshdon || '1', item.khhdon || '', item.shdon || '', dateObj,
                    item.nbmst || '', item.nbten || '', addressCol,
                    item.nmmst || '', partnerBuyerName, cccd,
                    valChuaThue, valThue, valCktm, valTong, statusText, ketQuaKiemTra
                ]);
            } else {
                rows.push([
                    idx + 1, item.khmshdon || '1', item.khhdon || '', item.shdon || '', dateObj,
                    item.nbmst || '', item.nbten || '', item.nmmst || '', partnerBuyerName,
                    item.nmdchi || '', valChuaThue, valThue, valCktm, valPhi, valTong,
                    item.dvtte || 'VND', item.tygia || '1.0', statusText, ketQuaKiemTra
                ]);
            }
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(rows, { cellDates: true });

        const maxColIdx = headerCols.length - 1;
        ws['!merges'] = [
            { s: { r: 2, c: 0 }, e: { r: 2, c: maxColIdx } },
            { s: { r: 3, c: 0 }, e: { r: 3, c: maxColIdx } }
        ];

        ws['!rows'] = [];
        ws['!rows'][5] = { hpt: 45 };

        // Độ rộng cột
        if (isSco) {
            ws['!cols'] = [
                { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 },
                { wch: 22 }, { wch: 38 }, { wch: 38 }, { wch: 22 }, { wch: 38 },
                { wch: 18 }, { wch: 18 }, { wch: 16 }, { wch: 20 }, { wch: 20 },
                { wch: 20 }, { wch: 45 }
            ];
        } else {
            ws['!cols'] = [
                { wch: 8 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 },
                { wch: 22 }, { wch: 38 }, { wch: 22 }, { wch: 38 }, { wch: 38 },
                { wch: 18 }, { wch: 16 }, { wch: 18 }, { wch: 16 }, { wch: 20 },
                { wch: 14 }, { wch: 10 }, { wch: 20 }, { wch: 30 }
            ];
        }

        const borderThin = {
            top: { style: "thin", color: { rgb: "D1D5DB" } },
            bottom: { style: "thin", color: { rgb: "D1D5DB" } },
            left: { style: "thin", color: { rgb: "D1D5DB" } },
            right: { style: "thin", color: { rgb: "D1D5DB" } }
        };

        const headerStyle = {
            font: { name: "Times New Roman", sz: 11, bold: true, color: { rgb: "000000" } },
            fill: { fgColor: { rgb: "FFCC00" } }, // Màu vàng ánh kim cơ quan thuế
            alignment: { horizontal: "center", vertical: "center", wrapText: true },
            border: borderThin
        };

        if (ws['A3']) {
            ws['A3'].s = {
                font: { name: "Times New Roman", sz: 11, bold: true, color: { rgb: "000000" } },
                alignment: { horizontal: "center", vertical: "center" }
            };
        }
        if (ws['A4']) {
            ws['A4'].s = {
                font: { name: "Times New Roman", sz: 11, bold: true, color: { rgb: "000000" } },
                alignment: { horizontal: "center", vertical: "center" }
            };
        }

        const range = XLSX.utils.decode_range(ws['!ref']);
        const headerRowIdx = 5;

        for (let R = headerRowIdx; R <= range.e.r; ++R) {
            for (let C = 0; C <= range.e.c; ++C) {
                const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
                if (!ws[cellRef]) ws[cellRef] = { t: 's', v: '' };

                if (R === headerRowIdx) {
                    ws[cellRef].s = headerStyle;
                    continue;
                }

                let alignH = "left";
                if (C === 0 || C === 1 || C === 3 || C === 4 || C === 5 || (isSco ? C === 8 : C === 7)) {
                    alignH = "center";
                } else if ((isSco && C >= 11 && C <= 14) || (!isSco && C >= 10 && C <= 14)) {
                    alignH = "right";
                }

                ws[cellRef].s = {
                    font: { name: "Times New Roman", sz: 11, color: { rgb: "000000" } },
                    alignment: { horizontal: alignH, vertical: "center" },
                    border: borderThin
                };

                // Cột Ngày lập (C === 4)
                if (C === 4) {
                    ws[cellRef].z = 'dd/mm/yyyy';
                }

                // Cột Tiền
                if (((isSco && C >= 11 && C <= 14) || (!isSco && C >= 10 && C <= 14)) && typeof ws[cellRef].v === 'number') {
                    ws[cellRef].z = '#,##0';
                }
            }
        }

        XLSX.utils.book_append_sheet(wb, ws, "sheet 1");

        // CẤU TRÚC ĐẶT TÊN FILE THEO FILE MẪU CỦA NGƯỜI DÙNG:
        // [Cty] BK [Ban/Mua] [CMa/KMa/MTTien] [Txx/Qx] [YYYY].xlsx
        const cCode = currentContext.companyCode || 'Cty';
        const dirStr = isPurchase ? 'Mua' : 'Ban';
        let typeStr = '';
        if (currentContext.loaiHD === 'co_ma') {
            typeStr = isPurchase ? 'CMa' : '';
        } else if (currentContext.loaiHD === 'khong_ma') {
            typeStr = isPurchase ? 'KMa' : '';
        } else {
            typeStr = 'MTTien';
        }

        const fileNameParts = [cCode, 'BK', dirStr, typeStr, currentContext.periodTag, currentContext.year]
            .filter(Boolean)
            .join(' ');
        const exportFileName = `${fileNameParts}.xlsx`;

        XLSX.writeFile(wb, exportFileName);
    }

    // 7. TRUY VẤN HÓA ĐƠN THƯỜNG (CÓ MÃ / KHÔNG MÃ)
    async function fetchNormalMonth(month, year, isPurchase, ttxly, pageSize, statusEl, prefix) {
        const token = getJwtToken();
        const daysInMonth = new Date(year, month, 0).getDate();
        const fromDateStr = `01/${pad(month)}/${year}T00:00:00`;
        const toDateStr = `${pad(daysInMonth)}/${pad(month)}/${year}T23:59:59`;
        const direction = isPurchase ? 'purchase' : 'sold';
        const searchParam = `tdlap=ge=${fromDateStr};tdlap=le=${toDateStr};ttxly==${ttxly}`;
        const baseUrl = `https://hoadondientu.gdt.gov.vn/api/query/invoices/${direction}?sort=tdlap:desc&size=${pageSize}`;
        const actionRaw = isPurchase ? "Tìm kiếm (hóa đơn mua vào)" : "Tìm kiếm (hóa đơn bán ra)";
        const actionEncoded = encodeURIComponent(actionRaw);

        let listResult = [];
        let currentState = null;
        let pageNum = 1;
        let totalCount = 0;

        while (true) {
            statusEl.textContent = `${prefix} [T${pad(month)}] Trang ${pageNum}... (${listResult.length} HĐ)`;
            statusEl.style.color = "#1677ff";

            let fetchUrl = `${baseUrl}`;
            if (currentState) fetchUrl += `&state=${encodeURIComponent(currentState)}`;
            fetchUrl += `&search=${searchParam}`;

            let res = null;
            let retryCount = 0;
            while (retryCount < 3) {
                res = await fetch(fetchUrl, {
                    method: 'GET',
                    credentials: 'include',
                    headers: {
                        'Accept': 'application/json, text/plain, */*',
                        'Accept-Language': 'vi',
                        'Authorization': `Bearer ${token}`,
                        'Action': actionEncoded,
                        'End-Point': '/tra-cuu/tra-cuu-hoa-don',
                        'Request-Id': generateUUID()
                    }
                });

                if (res.status === 429) {
                    retryCount++;
                    statusEl.textContent = `Máy chủ bận (429), thử lại lần ${retryCount}...`;
                    await new Promise(r => setTimeout(r, 2000));
                } else break;
            }

            const data = await res.json();
            if (!res.ok) throw new Error(data.message || `Mã HTTP: ${res.status}`);

            const list = data.datas || [];
            totalCount = (typeof data.total === 'number') ? data.total : list.length;
            listResult = listResult.concat(list);

            if (list.length === 0 || !data.state || listResult.length >= totalCount) break;

            currentState = data.state;
            pageNum++;
            await new Promise(r => setTimeout(r, 1000));
        }

        return listResult;
    }

    // 8. TRUY VẤN HÓA ĐƠN MÁY TÍNH TIỀN (CHIA NHỎ 10 NGÀY + CAPTCHA)
    async function fetchScoChunk(fromD, toD, isPurchase, pageSize, statusEl, chunkIdx, totalChunks) {
        const token = getJwtToken();
        const fromStr = fmtDateParam(fromD, false);
        const toStr = fmtDateParam(toD, true);
        const direction = isPurchase ? 'purchase' : 'sold';
        const searchParam = `tdlap=ge=${fromStr};tdlap=le=${toStr};ttxly==8`;
        const actionRaw = isPurchase 
            ? "Tìm kiếm (hóa đơn có mã khởi tạo từ máy tính tiền mua vào)" 
            : "Tìm kiếm (hóa đơn có mã khởi tạo từ máy tính tiền bán ra)";
        const actionEncoded = encodeURIComponent(actionRaw);

        let chunkInvoices = [];
        let currentState = null;
        let pageNum = 1;

        while (true) {
            statusEl.textContent = `[Đợt ${chunkIdx + 1}/${totalChunks}] Đang nạp Captcha...`;
            const captchaData = await fetchCaptcha();

            const info = `Đợt ${chunkIdx + 1}/${totalChunks} (${fmtDateDisplay(fromD)} -> ${fmtDateDisplay(toD)}) - Trang ${pageNum}`;
            const captchaValue = await promptCaptcha(captchaData.content, info);
            if (!captchaValue) throw new Error("Người dùng đã hủy nhập Captcha.");

            statusEl.textContent = `[Đợt ${chunkIdx + 1}/${totalChunks}] Đang truy vấn trang ${pageNum}...`;

            let fetchUrl = `https://hoadondientu.gdt.gov.vn/api/sco-query/invoices/${direction}?sort=tdlap:desc&size=${pageSize}&search=${searchParam}&ckey=${encodeURIComponent(captchaData.key)}&cvalue=${encodeURIComponent(captchaValue)}`;
            if (currentState) fetchUrl += `&state=${encodeURIComponent(currentState)}`;

            const res = await fetch(fetchUrl, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Language': 'vi',
                    'Authorization': `Bearer ${token}`,
                    'Action': actionEncoded,
                    'End-Point': '/tra-cuu/tra-cuu-hoa-don',
                    'Ckey': captchaData.key,
                    'Cvalue': captchaValue,
                    'Request-Id': generateUUID()
                }
            });

            const data = await res.json();
            if (!res.ok) {
                alert(`Lỗi máy chủ/Sai Captcha: ${data.message || res.status}. Vui lòng nhập lại.`);
                continue;
            }

            const list = data.datas || [];
            const total = (typeof data.total === 'number') ? data.total : list.length;
            chunkInvoices = chunkInvoices.concat(list);

            if (list.length === 0 || !data.state || chunkInvoices.length >= total) break;

            currentState = data.state;
            pageNum++;
            await new Promise(r => setTimeout(r, 1000));
        }

        return chunkInvoices;
    }

    // 9. ĐIỀU PHỐI TRUY VẤN
    async function startQueryWorkflow(monthsList, periodTag, year, startDate, endDate) {
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
        const pageSize = document.getElementById('api-page-size').value;
        const companyCode = document.getElementById('api-company-code').value.trim() || 'Cty';

        currentContext = {
            isPurchase,
            loaiHD,
            startDateStr: fmtDateDisplay(startDate),
            endDateStr: fmtDateDisplay(endDate),
            periodTag,
            year,
            companyCode
        };

        const statusEl = document.getElementById('api-status');
        currentInvoices = [];

        try {
            if (loaiHD === 'may_tinh_tien') {
                // Luồng Máy tính tiền: Tải trọn tháng (nếu chọn Quý thì chạy lần lượt từng tháng)
                for (let i = 0; i < monthsList.length; i++) {
                    const m = monthsList[i];
                    const daysInMonth = new Date(year, m, 0).getDate();
                    const fromD = new Date(year, m - 1, 1);
                    const toD = new Date(year, m - 1, daysInMonth);

                    const list = await fetchScoChunk(fromD, toD, isPurchase, pageSize, statusEl, i, monthsList.length);
                    currentInvoices = currentInvoices.concat(list);

                    if (i < monthsList.length - 1) {
                        await new Promise(r => setTimeout(r, 1000));
                    }
                }
            } else {
                // Luồng Có mã (5) / Không mã (6): Chạy theo từng tháng
                const ttxly = (loaiHD === 'co_ma') ? 5 : 6;
                for (let i = 0; i < monthsList.length; i++) {
                    const m = monthsList[i];
                    const prefix = monthsList.length > 1 ? `[${periodTag}] (${i + 1}/${monthsList.length})` : '';
                    const mList = await fetchNormalMonth(m, year, isPurchase, ttxly, pageSize, statusEl, prefix);
                    currentInvoices = currentInvoices.concat(mList);
                    if (i < monthsList.length - 1) await new Promise(r => setTimeout(r, 1000));
                }
            }

            // Sắp xếp dữ liệu đa tầng
            currentInvoices.sort((a, b) => {
                const dateA = a.tdlap || '';
                const dateB = b.tdlap || '';
                if (dateA !== dateB) return dateB.localeCompare(dateA);

                if (!isPurchase) {
                    return Number(b.shdon || 0) - Number(a.shdon || 0);
                } else {
                    const supplierA = (a.nbten || a.nbmst || '').trim();
                    const supplierB = (b.nbten || b.nbmst || '').trim();
                    const cmpSupplier = supplierA.localeCompare(supplierB, 'vi');
                    if (cmpSupplier !== 0) return cmpSupplier;
                    return Number(b.shdon || 0) - Number(a.shdon || 0);
                }
            });

            // Tự động kết xuất và tải ngay File Excel chuẩn cơ quan thuế
            if (currentInvoices.length > 0) {
                exportTaxTemplateExcel();
                statusEl.textContent = `✔ Đã tải Excel chuẩn & lấy xong ${currentInvoices.length} HĐ!`;
            } else {
                statusEl.textContent = `Hoàn tất: Không có hóa đơn nào trong ${periodTag} ${year}.`;
            }

            statusEl.style.color = "#10b981";
            showModal(currentInvoices, periodTag, year, isPurchase, currentInvoices.length, (loaiHD === 'may_tinh_tien'));

        } catch (err) {
            statusEl.textContent = "Lỗi: " + err.message;
            statusEl.style.color = "#ef4444";
            console.error(err);
        } finally {
            isFetching = false;
        }
    }

    // 10. ĐỔ DỮ LIỆU VÀO BẢNG MODAL
    function showModal(list, periodTag, year, isPurchase, totalCount, isSco) {
        const tbody = document.getElementById('modal-tbody');
        tbody.innerHTML = '';

        document.getElementById('modal-title').textContent =
            `Danh sách Hóa đơn ${isPurchase ? 'Mua vào' : 'Bán ra'} - ${periodTag}/${year} (Tổng cộng: ${totalCount} HĐ)`;

        const mstInput = document.getElementById('filter-mst-input');
        if (mstInput) mstInput.value = '';

        const fmtMoney = (val) => (val !== null && val !== undefined && val !== '') ? Number(val).toLocaleString('vi-VN') : '0';

        list.forEach((item, index) => {
            const tr = document.createElement('tr');
            let partnerName = isPurchase ? (item.nbten || '-') : ((item.nmten && item.nmten.trim()) ? item.nmten : (item.nmtnmua || '-'));
            let partnerMst = isPurchase ? (item.nbmst || '-') : (item.nmmst || '-');
            // Dùng parseTdlapToDate đã có sẵn để bù đúng múi giờ Việt Nam
			const dateObj = parseTdlapToDate(item.tdlap);
			const dateDisplay = dateObj ? fmtDateDisplay(dateObj) : ''; // dd/mm/yyyy hiển thị trên bảng
			const dateIso = dateObj 
				? `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())}` 
				: ''; // yyyy-mm-dd để lọc theo ngày

			const { statusText, refText, rowType } = parseInvoiceStatus(item);

			if (rowType === 'modified') tr.className = 'row-warning-modified';
			else if (rowType === 'replaced_source') tr.className = 'row-danger-replaced';

			tr.setAttribute('data-mst', String(partnerMst).toLowerCase());
			tr.setAttribute('data-date', dateIso);

			tr.innerHTML = `
				<td><input type="checkbox" class="chk-item" data-index="${index}" data-date="${dateIso}"></td>
				<td style="color: #64748b; text-align: center;">${index + 1}</td>
				<td><strong>${item.khmshdon || ''}${item.khhdon || ''}</strong></td>
				<td><span style="color: #0284c7; font-weight: 600;">${item.shdon}</span></td>
				<td>${dateDisplay}</td>
                <td style="max-width: 230px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${partnerName}">${partnerName}</td>
                <td class="col-mst">${partnerMst}</td>
                <td style="text-align: center; color: #475569;">${item.dvtte || 'VND'}</td>
                <td style="text-align: right;">${fmtMoney(item.tgtcthue)}</td>
                <td style="text-align: right;">${fmtMoney(item.tgtthue)}</td>
                <td style="text-align: right; color: #64748b;">${fmtMoney(item.tgtphi)}</td>
                <td style="text-align: right; font-weight: 600; color: #0f172a;">${fmtMoney(item.tgtttbso)}</td>
                <td style="text-align: center;"><b>${statusText}</b></td>
                <td style="font-size: 11px;">${refText}</td>
                <td style="text-align: center;">${mapKetQuaXuLyText(item.ttxly)}</td>
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
                await downloadXmlAsync(list[idx], isSco);
                this.textContent = 'Đã tải';
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

    // 11. BỘ LỌC MST & CHECKBOX
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

    // 12. SỰ KIỆN NÚT TRÊN MODAL
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

    // Bấm nút xuất lại Excel chuẩn
    document.getElementById('btn-export-excel').onclick = exportTaxTemplateExcel;

    // Tải hàng loạt tuần tự XML
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
        const isSco = (currentContext.loaiHD === 'may_tinh_tien');

        btnDownload.disabled = true;

        for (let i = 0; i < checkedBoxes.length; i++) {
            const chk = checkedBoxes[i];
            const idx = parseInt(chk.getAttribute('data-index'), 10);
            const inv = currentInvoices[idx];

            btnDownload.textContent = `Đang xử lý: ${i + 1}/${checkedBoxes.length}...`;
            summaryEl.textContent = `Đang giải nén & tải XML HĐ số ${inv.shdon} (${i + 1}/${checkedBoxes.length})`;

            await downloadXmlAsync(inv, isSco);
            await new Promise(r => setTimeout(r, 900));
        }

        btnDownload.textContent = originalBtnText;
        btnDownload.disabled = false;
        summaryEl.textContent = `Đã giải nén và lưu xong toàn bộ ${checkedBoxes.length} hóa đơn XML.`;
        isBatchDownloading = false;
    };

    // 13. GẮN SỰ KIỆN CÁC NÚT TRÊN PANEL ĐIỀU KHIỂN
		// 13.1. Xử lý click chuyển tab Bán ra / Mua vào
		document.querySelectorAll('#api-group-type .a-btn-tab').forEach(btn => {
			btn.onclick = function () {
				document.querySelectorAll('#api-group-type .a-btn-tab').forEach(b => b.classList.remove('active'));
				this.classList.add('active');

				const isSold = (this.getAttribute('data-val') === 'sold');
				const btnKhongMa = document.getElementById('btn-type-khong-ma');

				if (isSold) {
					// Khi Bán ra: Ẩn nút "Không mã"
					btnKhongMa.style.display = 'none';

					// Nếu trước đó đang chọn "Không mã", tự động chuyển về "Có mã"
					if (btnKhongMa.classList.contains('active')) {
						btnKhongMa.classList.remove('active');
						const btnCoMa = document.querySelector('#api-group-loai-hd .a-btn-type[data-type="co_ma"]');
						if (btnCoMa) btnCoMa.classList.add('active');
					}
				} else {
					// Khi Mua vào: Hiển thị lại nút "Không mã"
					btnKhongMa.style.display = 'block';
				}
			};
		});

		// 13.2. Xử lý click chọn nút Loại hóa đơn (Có mã / Không mã / Máy tính tiền)
		document.querySelectorAll('#api-group-loai-hd .a-btn-type').forEach(btn => {
			btn.onclick = function () {
				document.querySelectorAll('#api-group-loai-hd .a-btn-type').forEach(b => b.classList.remove('active'));
				this.classList.add('active');
			};
		});

    const yearInput = document.getElementById('api-year');
    document.getElementById('api-prev-y').onclick = () => yearInput.value = parseInt(yearInput.value, 10) - 1;
    document.getElementById('api-next-y').onclick = () => yearInput.value = parseInt(yearInput.value, 10) + 1;

    // Bấm chọn Quý
    document.querySelectorAll('.a-btn-q').forEach(btn => {
        btn.onclick = () => {
            const q = parseInt(btn.getAttribute('data-q'), 10);
            const y = parseInt(yearInput.value, 10);
            const startM = (q - 1) * 3;
            const startDate = new Date(y, startM, 1);
            const endDate = new Date(y, startM + 3, 0);
            const quarterMap = { 1: [1, 2, 3], 2: [4, 5, 6], 3: [7, 8, 9], 4: [10, 11, 12] };

            startQueryWorkflow(quarterMap[q], `Q${q}`, y, startDate, endDate);
        };
    });

    // Bấm chọn Tháng
    const monthsContainer = document.getElementById('api-months');
    for (let m = 1; m <= 12; m++) {
        const btn = document.createElement('button');
        btn.className = 'a-btn-m';
        btn.textContent = `T${pad(m)}`;
        btn.onclick = () => {
            const y = parseInt(yearInput.value, 10);
            const startDate = new Date(y, m - 1, 1);
            const endDate = new Date(y, m, 0);

            startQueryWorkflow([m], `T${pad(m)}`, y, startDate, endDate);
        };
        monthsContainer.appendChild(btn);
    }

    console.log("%c[HDDT]%c Đã khởi tạo hoàn tất Portal tra cứu HĐĐT tích hợp chuẩn định dạng Excel Cơ quan Thuế!", "color:#0284c7;font-weight:bold;", "color:#16a34a;");
})();
