(async function () {
    'use strict';

    // 0. Tự động nạp JSZip và xlsx-js-style (hỗ trợ Border & Color cho Excel)
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
        // Nạp bản SheetJS có hỗ trợ Style (Màu nền, Border, Font)
        await loadScript('https://cdn.jsdelivr.net/npm/xlsx-js-style@1.2.0/dist/xlsx.bundle.js');
        console.log("%c[HDDT]%c Đã nạp thành công JSZip & xlsx-js-style!", "color:#1677ff;font-weight:bold;", "color:#16a34a;");
    } catch (e) {
        alert(e.message);
        return;
    }

    // 1. Sinh UUID v4 cho Request-Id
    function generateUUID() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    // 2. Lấy JWT Token từ Cookie
    function getJwtToken() {
        const match = document.cookie.match(/(?:^|;\s*)jwt=([^;]+)/);
        if (match && match[1]) {
            return decodeURIComponent(match[1]);
        }
        return null;
    }

    // 3. Phân loại trạng thái và gán mã màu
    function parseInvoiceStatus(item) {
        const tchat = Number(item.tchat);
        const tthai = Number(item.tthai);
        const hasGocInfo = Boolean((item.khhdgoc && item.khhdgoc.trim()) || (item.shdgoc && String(item.shdgoc).trim()));
        const hasHsGocId = Boolean(item.hsgoc && String(item.hsgoc).trim());

        let statusText = '';
        let refText = '-';
        let rowType = 'normal'; // normal, modified, replaced_source

        // 1. HĐ ĐIỀU CHỈNH: khhdgoc/shdgoc có dữ liệu + tchat = 3 hoặc 5
        if (hasGocInfo && (tchat === 3 || tchat === 5)) {
            statusText = 'HĐ Điều chỉnh';
            const note = item.gchdgoc ? ` (${item.gchdgoc})` : '';
            refText = `Đ/c cho HĐ: ${item.shdgoc || ''} (${item.khhdgoc || ''})${note}`;
            rowType = 'modified';
        }
        // 2. HĐ BỊ ĐIỀU CHỈNH: hsgoc có ID + tthai = 5
        else if (hasHsGocId && tthai === 5) {
            statusText = 'HĐ Bị điều chỉnh';
            refText = 'Gốc bị điều chỉnh';
            rowType = 'replaced_source';
        }
        // 3. HĐ THAY THẾ: khhdgoc/shdgoc có dữ liệu + tchat = 2 hoặc 4
        else if (hasGocInfo && (tchat === 2 || tchat === 4)) {
            statusText = 'HĐ Thay thế';
            refText = `Thay thế cho HĐ: ${item.shdgoc || ''} (${item.khhdgoc || ''})`;
            rowType = 'modified';
        }
        // 4. HĐ BỊ THAY THẾ: tthai = 4
        else if (tthai === 4) {
            statusText = 'HĐ Bị thay thế';
            refText = 'Đã bị thay thế (Hủy/Bỏ)';
            rowType = 'replaced_source';
        }
        // 5. Hóa đơn gốc ban đầu
        else if (tthai === 1 && tchat === 1) {
            statusText = 'Hóa đơn gốc';
            refText = '-';
            rowType = 'normal';
        } else {
            statusText = `Khác (${item.tthai})`;
            refText = '-';
            rowType = 'normal';
        }

        return { statusText, refText, rowType };
    }

    // 4. Diễn giải Kết quả xử lý CQT
    function mapKetQuaXuLyText(ttxly) {
        switch (Number(ttxly)) {
            case 5: return 'Đã cấp mã CQT';
            case 6: return 'CQT đã nhận không mã';
            case 8: return 'Đã nhận HĐ MTT';
            case 1: return 'Đã gửi CQT';
            case 2: return 'Lỗi từ chối';
            default: return (ttxly !== null && ttxly !== undefined) ? `Trạng thái ${ttxly}` : '-';
        }
    }

    // Dọn dẹp DOM cũ trước khi chèn mới
    const oldPanel = document.getElementById('api-hddt-panel');
    if (oldPanel) oldPanel.remove();
    const oldModal = document.getElementById('api-hddt-modal');
    if (oldModal) oldModal.remove();
    const oldOverlay = document.getElementById('api-hddt-overlay');
    if (oldOverlay) oldOverlay.remove();

    // 5. CSS giao diện (Bổ sung màu dòng cho bảng HTML)
    const style = document.createElement('style');
    style.innerHTML = `
        #api-hddt-panel {
            position: fixed;
            bottom: 25px;
            left: 25px;
            width: 330px;
            background: #ffffff;
            border-radius: 12px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.25);
            border: 1px solid #cbd5e1;
            padding: 14px 16px;
            z-index: 999998;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 13px;
            user-select: none;
        }
        .a-row { display: flex; gap: 6px; margin-bottom: 8px; align-items: center; }
        .a-btn-group { display: flex; width: 100%; background: #f1f5f9; padding: 3px; border-radius: 6px; gap: 4px; }
        .a-btn-tab { flex: 1; padding: 5px 0; border: none; background: transparent; cursor: pointer; border-radius: 4px; font-weight: 600; font-size: 12px; color: #475569; }
        .a-btn-tab.active { background: #1677ff; color: #fff; }
        .a-select { width: 100%; padding: 5px 8px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 12px; background: #fff; }
        .a-grid-q { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin-top: 6px; }
        .a-btn-q { padding: 5px 0; border: 1px solid #93c5fd; background: #eff6ff; color: #1d4ed8; border-radius: 4px; font-weight: 700; cursor: pointer; font-size: 12px; }
        .a-btn-q:hover { background: #2563eb; color: #fff; border-color: #2563eb; }
        .a-grid-m { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin: 6px 0 8px 0; }
        .a-btn-m { padding: 6px 0; border: 1px solid #cbd5e1; background: #f8fafc; border-radius: 4px; font-weight: 600; cursor: pointer; font-size: 12px; }
        .a-btn-m:hover { background: #1677ff; color: #fff; border-color: #1677ff; }

        #api-hddt-modal {
            display: none;
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 96vw;
            max-width: 1550px;
            max-height: 88vh;
            background: #ffffff;
            border-radius: 12px;
            box-shadow: 0 15px 50px rgba(0,0,0,0.35);
            z-index: 999999;
            padding: 20px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            flex-direction: column;
        }
        #api-hddt-overlay {
            display: none;
            position: fixed;
            top: 0; left: 0; width: 100vw; height: 100vh;
            background: rgba(0,0,0,0.45);
            z-index: 999998;
        }
        .modal-filter-bar {
            display: flex;
            align-items: center;
            gap: 10px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            padding: 8px 12px;
            border-radius: 8px;
            margin-top: 10px;
            font-size: 12px;
        }
        .modal-tbl-wrap { overflow: auto; flex: 1; margin: 12px 0; border: 1px solid #e2e8f0; border-radius: 6px; }
        .modal-tbl { width: 100%; border-collapse: collapse; font-size: 12px; white-space: nowrap; }
        .modal-tbl th, .modal-tbl td { border-bottom: 1px solid #e2e8f0; padding: 7px 9px; text-align: left; }
        .modal-tbl th { background: #f8fafc; position: sticky; top: 0; z-index: 2; font-weight: 600; color: #1e293b; }
        
        /* Màu nhận diện dòng trên web */
        .row-warning-modified { background-color: #fef9c3 !important; } /* Nền vàng cam nhạt */
        .row-danger-replaced { background-color: #fee2e2 !important; color: #991b1b !important; } /* Nền đỏ hồng nhạt */

        .btn-download-xml { background: #10b981; color: #fff; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px; }
        .btn-download-xml:hover { background: #059669; }
        .btn-download-xml:disabled { opacity: 0.6; cursor: not-allowed; }
        .btn-excel { background: #047857; color: #fff; border: none; padding: 7px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; }
        .btn-excel:hover { background: #065f46; }
    `;
    document.head.appendChild(style);

    // 6. Giao diện bảng điều khiển
    const panel = document.createElement('div');
    panel.id = 'api-hddt-panel';
    panel.innerHTML = `
        <div style="font-weight: 700; color: #0f172a; margin-bottom: 8px;">Tra Cứu HĐĐT (Theo Tháng / Quý)</div>
        <div class="a-row">
            <div class="a-btn-group" id="api-group-type">
                <button class="a-btn-tab" data-val="sold">Bán ra</button>
                <button class="a-btn-tab active" data-val="purchase">Mua vào</button>
            </div>
        </div>
        <div class="a-row">
            <select id="api-loai-hd" class="a-select">
                <option value="co_ma">Hóa đơn có mã (ttxly=5)</option>
                <option value="khong_ma">Hóa đơn không mã (ttxly=6)</option>
                <option value="may_tinh_tien">HĐ từ máy tính tiền (sco-query, ttxly=8)</option>
            </select>
        </div>
        <div class="a-row" style="justify-content: space-between;">
            <span style="font-weight: 600;">Số dòng/trang:</span>
            <select id="api-page-size" style="padding: 2px 6px; border-radius: 4px; border: 1px solid #cbd5e1;">
                <option value="15" selected>15 dòng</option>
                <option value="50">50 dòng</option>
            </select>
        </div>
        <div class="a-row" style="justify-content: space-between;">
            <span style="font-weight: 600;">Năm:</span>
            <div style="display: flex; gap: 4px;">
                <button id="api-prev-y" style="width:24px;">-</button>
                <input id="api-year" type="number" value="2026" style="width: 60px; text-align: center; font-weight: bold; border: 1px solid #cbd5e1; border-radius: 4px;">
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
        <div id="api-status" style="font-size: 11px; color: #64748b; text-align: center; min-height: 14px;">Chọn tháng hoặc quý để tải</div>
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
            <span style="font-weight: 600; color: #334155;">Chọn nhanh theo ngày phát sinh:</span>
            <span style="color: #64748b;">Từ ngày:</span>
            <input type="date" id="filter-date-after" style="padding: 3px 6px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 12px;">
            <button id="btn-apply-date-filter" style="background: #2563eb; color: #fff; border: none; padding: 4px 10px; border-radius: 4px; font-weight: 500; cursor: pointer;">
                Chọn các HĐ từ ngày này trở đi
            </button>
            <button id="btn-clear-selection" style="background: #f1f5f9; color: #475569; border: 1px solid #cbd5e1; padding: 4px 10px; border-radius: 4px; cursor: pointer;">
                Bỏ chọn tất cả
            </button>
        </div>

        <div class="modal-tbl-wrap">
            <table class="modal-tbl">
                <thead>
                    <tr>
                        <th style="width: 30px;"><input type="checkbox" id="chk-all"></th>
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
                    Xuất Excel Kế Toán (.xlsx)
                </button>
                <button id="btn-download-selected" style="background: #1677ff; color: #fff; border: none; padding: 7px 16px; border-radius: 6px; font-weight: 600; cursor: pointer;">
                    Tải các mục đã chọn (XML)
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    let isCurrentSco = false;
    let isFetching = false;
    let isBatchDownloading = false;
    let currentInvoices = [];
    let currentPeriodContext = { isPurchase: true, periodTitle: '', year: 2026 };

    // 7. Giải nén ZIP trong bộ nhớ và lưu duy nhất file invoice.xml
    async function extractAndSaveXml(zipBuffer, item) {
        const zip = await JSZip.loadAsync(zipBuffer);

        let xmlFile = zip.file("invoice.xml");
        if (!xmlFile) {
            const xmlFiles = zip.file(/\.xml$/i);
            if (xmlFiles.length > 0) xmlFile = xmlFiles[0];
        }

        if (!xmlFile) {
            throw new Error("Không tìm thấy file XML bên trong gói nén!");
        }

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

    // 8. Tải và xử lý giải nén bất đồng bộ
    async function downloadXmlAsync(item) {
        const token = getJwtToken();
        const baseEndpoint = isCurrentSco ? 'sco-query' : 'query';
        const url = `https://hoadondientu.gdt.gov.vn/api/${baseEndpoint}/invoices/export-xml?nbmst=${item.nbmst}&khhdon=${encodeURIComponent(item.khhdon)}&shdon=${item.shdon}&khmshdon=${item.khmshdon}`;

        let retries = 0;
        const maxRetries = 3;

        while (retries < maxRetries) {
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
                    console.warn(`Hệ thống giới hạn tốc độ (429) khi tải số ${item.shdon}, đợi 2.5s thử lại lần ${retries}...`);
                    await new Promise(r => setTimeout(r, 2500));
                    continue;
                }

                if (!res.ok) throw new Error(`HTTP ${res.status}`);

                const arrayBuffer = await res.arrayBuffer();
                await extractAndSaveXml(arrayBuffer, item);
                return true;
            } catch (err) {
                if (retries >= maxRetries - 1) {
                    console.error(`Không thể giải nén/tải hóa đơn số ${item.shdon}: ${err.message}`);
                    return false;
                }
            }
        }
        return false;
    }

    // 9. Nạp hóa đơn của 1 tháng
    async function fetchInvoicesOfMonth(month, year, isPurchase, ttxly, apiType, actionEncoded, pageSize, statusEl, labelPrefix) {
        const token = getJwtToken();
        const pad = (n) => String(n).padStart(2, '0');
        const daysInMonth = new Date(year, month, 0).getDate();

        const fromDateStr = `01/${pad(month)}/${year}T00:00:00`;
        const toDateStr = `${pad(daysInMonth)}/${pad(month)}/${year}T23:59:59`;

        const direction = isPurchase ? 'purchase' : 'sold';
        const searchParam = `tdlap=ge=${fromDateStr};tdlap=le=${toDateStr};ttxly==${ttxly}`;
        const baseUrl = `https://hoadondientu.gdt.gov.vn/api/${apiType}/invoices/${direction}?sort=tdlap:desc&size=${pageSize}`;

        let monthInvoices = [];
        let currentState = null;
        let pageNum = 1;
        let totalCount = 0;

        while (true) {
            statusEl.textContent = `${labelPrefix} [T${pad(month)}] Trang ${pageNum}... (${monthInvoices.length} HĐ)`;
            statusEl.style.color = "#1677ff";

            let fetchUrl = `${baseUrl}`;
            if (currentState) {
                fetchUrl += `&state=${encodeURIComponent(currentState)}`;
            }
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
                    statusEl.style.color = "#ea580c";
                    await new Promise(r => setTimeout(r, 2000));
                } else {
                    break;
                }
            }

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.message || `Mã HTTP: ${res.status}`);
            }

            const list = data.datas || [];
            totalCount = (typeof data.total === 'number') ? data.total : list.length;
            monthInvoices = monthInvoices.concat(list);

            if (list.length === 0 || !data.state || monthInvoices.length >= totalCount) {
                break;
            }

            currentState = data.state;
            pageNum++;

            await new Promise(r => setTimeout(r, 1200));
        }

        return monthInvoices;
    }

    // 10. Điều phối truy vấn theo Tháng/Quý & Sắp xếp dữ liệu
    async function queryPeriod(monthsList, periodTitle, year) {
        if (isFetching) {
            console.warn("Đang có tiến trình truy vấn, vui lòng đợi...");
            return;
        }

        const token = getJwtToken();
        if (!token) {
            alert("Chưa tìm thấy Cookie 'jwt'! Vui lòng đảm bảo bạn đang ở trạng thái đã đăng nhập.");
            return;
        }

        isFetching = true;

        const isPurchase = document.querySelector('#api-group-type .active').getAttribute('data-val') === 'purchase';
        const loaiHD = document.getElementById('api-loai-hd').value;
        const pageSize = document.getElementById('api-page-size').value;

        currentPeriodContext = { isPurchase, periodTitle, year };

        let ttxly = 5;
        let apiType = 'query';
        let actionRaw = isPurchase ? "Tìm kiếm (hóa đơn mua vào)" : "Tìm kiếm (hóa đơn bán ra)";

        if (loaiHD === "co_ma") {
            ttxly = 5;
            apiType = 'query';
        } else if (loaiHD === "khong_ma") {
            ttxly = 6;
            apiType = 'query';
        } else if (loaiHD === "may_tinh_tien") {
            ttxly = 8;
            apiType = 'sco-query';
            actionRaw = isPurchase
                ? "Tìm kiếm (hóa đơn có mã khởi tạo từ máy tính tiền mua vào)"
                : "Tìm kiếm (hóa đơn có mã khởi tạo từ máy tính tiền bán ra)";
        }

        isCurrentSco = (apiType === 'sco-query');
        const actionEncoded = encodeURIComponent(actionRaw);
        const statusEl = document.getElementById('api-status');
        currentInvoices = [];

        try {
            for (let i = 0; i < monthsList.length; i++) {
                const m = monthsList[i];
                const prefix = monthsList.length > 1 ? `[${periodTitle}] (${i + 1}/${monthsList.length})` : '';
                const mList = await fetchInvoicesOfMonth(m, year, isPurchase, ttxly, apiType, actionEncoded, pageSize, statusEl, prefix);
                currentInvoices = currentInvoices.concat(mList);

                if (i < monthsList.length - 1) {
                    await new Promise(r => setTimeout(r, 1200));
                }
            }

            // SẮP XẾP DỮ LIỆU ĐA TẦNG:
            currentInvoices.sort((a, b) => {
                const dateA = a.tdlap || '';
                const dateB = b.tdlap || '';
                if (dateA !== dateB) {
                    return dateB.localeCompare(dateA);
                }

                if (!isPurchase) {
                    // Bán ra: Số hóa đơn giảm dần
                    return Number(b.shdon || 0) - Number(a.shdon || 0);
                } else {
                    // Mua vào: Nhà cung cấp tăng dần -> Số hóa đơn giảm dần
                    const supplierA = (a.nbten || a.nbmst || '').trim();
                    const supplierB = (b.nbten || b.nbmst || '').trim();
                    const cmpSupplier = supplierA.localeCompare(supplierB, 'vi');
                    if (cmpSupplier !== 0) {
                        return cmpSupplier;
                    }
                    return Number(b.shdon || 0) - Number(a.shdon || 0);
                }
            });

            statusEl.textContent = `Hoàn tất: ${periodTitle} năm ${year} lấy được ${currentInvoices.length} HĐ!`;
            statusEl.style.color = "#10b981";
            showModal(currentInvoices, periodTitle, year, isPurchase, currentInvoices.length, monthsList[0]);

        } catch (err) {
            statusEl.textContent = "Lỗi: " + err.message;
            statusEl.style.color = "#ef4444";
            alert("Lỗi khi tải dữ liệu: " + err.message);
        } finally {
            isFetching = false;
        }
    }

    // 11. Hiển thị bảng Modal dữ liệu (Có màu sắc theo dòng)
    function showModal(list, periodTitle, year, isPurchase, totalCount, defaultStartMonth) {
        const tbody = document.getElementById('modal-tbody');
        tbody.innerHTML = '';

        document.getElementById('modal-title').textContent =
            `Danh sách Hóa đơn ${isPurchase ? 'Mua vào' : 'Bán ra'} - ${periodTitle}/${year} (Tổng cộng: ${totalCount} HĐ)`;

        const pad = (n) => String(n).padStart(2, '0');
        const filterInput = document.getElementById('filter-date-after');
        if (filterInput && defaultStartMonth) {
            filterInput.value = `${year}-${pad(defaultStartMonth)}-01`;
        }

        const fmtMoney = (val) => (val !== null && val !== undefined && val !== '') ? Number(val).toLocaleString('vi-VN') : '0';

        list.forEach((item, index) => {
            const tr = document.createElement('tr');
            
            // Xử lý thông tin đối tác: Nếu nmten = null thì lấy nmtnmua
            let partnerName = '-';
            let partnerMst = '-';
            if (isPurchase) {
                partnerName = item.nbten || '-';
                partnerMst = item.nbmst || '-';
            } else {
                partnerName = (item.nmten && item.nmten.trim()) ? item.nmten : (item.nmtnmua || '-');
                partnerMst = item.nmmst || '-';
            }

            const dateOnly = item.tdlap ? item.tdlap.substring(0, 10) : '';
            const { statusText, refText, rowType } = parseInvoiceStatus(item);

            // Gán class màu cho dòng
            if (rowType === 'modified') {
                tr.className = 'row-warning-modified';
            } else if (rowType === 'replaced_source') {
                tr.className = 'row-danger-replaced';
            }

            tr.innerHTML = `
                <td><input type="checkbox" class="chk-item" data-index="${index}" data-date="${dateOnly}"></td>
                <td style="color: #64748b; text-align: center;">${index + 1}</td>
                <td><strong>${item.khmshdon || ''}${item.khhdon || ''}</strong></td>
                <td><span style="color: #1677ff; font-weight: 600;">${item.shdon}</span></td>
                <td>${dateOnly}</td>
                <td style="max-width: 230px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${partnerName}">${partnerName}</td>
                <td>${partnerMst}</td>
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
                const idx = parseInt(this.getAttribute('data-index'));
                this.textContent = 'Đang giải nén...';
                this.disabled = true;
                await downloadXmlAsync(list[idx]);
                this.textContent = 'Đã tải';
                setTimeout(() => {
                    this.textContent = 'Tải XML';
                    this.disabled = false;
                }, 1500);
            };
        });

        updateSummary();
        overlay.style.display = 'block';
        modal.style.display = 'flex';
    }

    function updateSummary() {
        const total = currentInvoices.length;
        const selectedCount = document.querySelectorAll('.chk-item:checked').length;
        document.getElementById('modal-summary').textContent = `Đã chọn: ${selectedCount}/${total} hóa đơn.`;
    }

    // 12. Xuất File Excel Kế Toán có màu nền, viền kẻ và font chữ chuyên nghiệp
    function exportToProfessionalExcel() {
        if (!currentInvoices || currentInvoices.length === 0) {
            alert("Không có dữ liệu để xuất file Excel!");
            return;
        }

        const isPurchase = currentPeriodContext.isPurchase;
        const titleText = isPurchase 
            ? `BẢNG KÊ HÓA ĐƠN ĐIỆN TỬ MUA VÀO - ${currentPeriodContext.periodTitle.toUpperCase()} NĂM ${currentPeriodContext.year}`
            : `BẢNG KÊ HÓA ĐƠN ĐIỆN TỬ BÁN RA - ${currentPeriodContext.periodTitle.toUpperCase()} NĂM ${currentPeriodContext.year}`;

        // Header thông tin tiêu đề kế toán
        const rows = [
            [titleText],
            [`Ngày xuất báo cáo: ${new Date().toLocaleDateString('vi-VN')} ${new Date().toLocaleTimeString('vi-VN')}`],
            [] // Dòng trống
        ];

        // Dòng tiêu đề bảng
        const tableHeaders = [
            "STT",
            "Mẫu số",
            "Ký hiệu",
            "Số hóa đơn",
            "Ngày lập",
            isPurchase ? "Tên người bán" : "Tên người mua",
            isPurchase ? "Mã số thuế người bán" : "Mã số thuế người mua",
            "ĐVT",
            "Doanh số chưa thuế",
            "Tiền thuế GTGT",
            "Tiền thuế suất khác/Phí",
            "Tổng tiền thanh toán",
            "Trạng thái hóa đơn",
            "Hóa đơn liên quan",
            "Kết quả kiểm tra CQT"
        ];
        rows.push(tableHeaders);

        let sumChuaThue = 0;
        let sumThue = 0;
        let sumPhi = 0;
        let sumTong = 0;

        const rowMetaList = []; // Lưu trữ trạng thái để tô màu dòng trong Excel

        // Điền dữ liệu
        currentInvoices.forEach((item, idx) => {
            let partnerName = '';
            let partnerMst = '';
            if (isPurchase) {
                partnerName = item.nbten || '-';
                partnerMst = item.nbmst || '-';
            } else {
                partnerName = (item.nmten && item.nmten.trim()) ? item.nmten : (item.nmtnmua || '-');
                partnerMst = item.nmmst || '-';
            }

            const valChuaThue = Number(item.tgtcthue) || 0;
            const valThue = Number(item.tgtthue) || 0;
            const valPhi = Number(item.tgtphi) || 0;
            const valTong = Number(item.tgtttbso) || 0;

            sumChuaThue += valChuaThue;
            sumThue += valThue;
            sumPhi += valPhi;
            sumTong += valTong;

            const { statusText, refText, rowType } = parseInvoiceStatus(item);
            rowMetaList.push(rowType);

            rows.push([
                idx + 1,
                item.khmshdon || 1,
                item.khhdon || '',
                item.shdon || '',
                item.tdlap ? item.tdlap.substring(0, 10) : '',
                partnerName,
                partnerMst,
                item.dvtte || 'VND',
                valChuaThue,
                valThue,
                valPhi,
                valTong,
                statusText,
                refText,
                mapKetQuaXuLyText(item.ttxly)
            ]);
        });

        // Dòng TỔNG CỘNG
        rows.push([
            "TỔNG CỘNG", "", "", "", "", "", "", "",
            sumChuaThue,
            sumThue,
            sumPhi,
            sumTong,
            "", "", ""
        ]);

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(rows);

        // Định dạng độ rộng cột
        ws['!cols'] = [
            { wch: 6 },  // STT
            { wch: 8 },  // Mẫu số
            { wch: 10 }, // Ký hiệu
            { wch: 12 }, // Số HĐ
            { wch: 12 }, // Ngày lập
            { wch: 40 }, // Tên đối tác
            { wch: 16 }, // MST
            { wch: 6 },  // ĐVT
            { wch: 18 }, // Tiền chưa thuế
            { wch: 15 }, // Thuế GTGT
            { wch: 15 }, // Phí
            { wch: 18 }, // Tổng tiền
            { wch: 18 }, // Trạng thái
            { wch: 35 }, // HĐ liên quan
            { wch: 22 }  // Kết quả CQT
        ];

        // Ghép ô tiêu đề
        ws['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: 11 } },
            { s: { r: 1, c: 0 }, e: { r: 1, c: 11 } },
            { s: { r: rows.length - 1, c: 0 }, e: { r: rows.length - 1, c: 7 } }
        ];

        // Định nghĩa bộ Style chuẩn kế toán chuyên nghiệp
        const borderThin = {
            top: { style: "thin", color: { rgb: "D1D5DB" } },
            bottom: { style: "thin", color: { rgb: "D1D5DB" } },
            left: { style: "thin", color: { rgb: "D1D5DB" } },
            right: { style: "thin", color: { rgb: "D1D5DB" } }
        };

        const borderDoubleBottom = {
            top: { style: "thin", color: { rgb: "000000" } },
            bottom: { style: "double", color: { rgb: "000000" } },
            left: { style: "thin", color: { rgb: "D1D5DB" } },
            right: { style: "thin", color: { rgb: "D1D5DB" } }
        };

        // Style cho dòng Tiêu đề bảng (Header - Hàng 4)
        const headerStyle = {
            font: { name: "Times New Roman", sz: 11, bold: true, color: { rgb: "FFFFFF" } },
            fill: { fgColor: { rgb: "1E3A8A" } }, // Xanh than đậm thanh lịch
            alignment: { horizontal: "center", vertical: "center", wrapText: true },
            border: borderThin
        };

        // Style dòng tổng cộng
        const totalStyleNumber = {
            font: { name: "Times New Roman", sz: 11, bold: true, color: { rgb: "000000" } },
            fill: { fgColor: { rgb: "F1F5F9" } },
            alignment: { horizontal: "right", vertical: "center" },
            border: borderDoubleBottom
        };

        const totalStyleText = {
            font: { name: "Times New Roman", sz: 11, bold: true, color: { rgb: "000000" } },
            fill: { fgColor: { rgb: "F1F5F9" } },
            alignment: { horizontal: "center", vertical: "center" },
            border: borderDoubleBottom
        };

        // Style dòng tiêu đề báo cáo
        if (ws['A1']) {
            ws['A1'].s = {
                font: { name: "Times New Roman", sz: 15, bold: true, color: { rgb: "1E3A8A" } },
                alignment: { horizontal: "left", vertical: "center" }
            };
        }
        if (ws['A2']) {
            ws['A2'].s = {
                font: { name: "Times New Roman", sz: 10, italic: true, color: { rgb: "6B7280" } },
                alignment: { horizontal: "left", vertical: "center" }
            };
        }

        const range = XLSX.utils.decode_range(ws['!ref']);
        const headerRowIndex = 3; // Index hàng 4 trong Excel
        const totalRowIndex = range.e.r;

        // Áp dụng định dạng cho từng ô trong bảng tính
        for (let R = headerRowIndex; R <= range.e.r; ++R) {
            for (let C = 0; C <= range.e.c; ++C) {
                const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
                if (!ws[cellRef]) ws[cellRef] = { t: 's', v: '' };

                // 1. Dòng Header cột
                if (R === headerRowIndex) {
                    ws[cellRef].s = headerStyle;
                    continue;
                }

                // 2. Dòng TỔNG CỘNG cuối bảng
                if (R === totalRowIndex) {
                    if (C >= 8 && C <= 11) {
                        ws[cellRef].s = totalStyleNumber;
                        ws[cellRef].z = '#,##0';
                    } else {
                        ws[cellRef].s = totalStyleText;
                    }
                    continue;
                }

                // 3. Các dòng dữ liệu chi tiết
                const dataIndex = R - (headerRowIndex + 1);
                const rowType = rowMetaList[dataIndex] || 'normal';

                // Xác định màu nền và màu chữ theo trạng thái
                let cellFill = { fgColor: { rgb: "FFFFFF" } };
                let cellFontColor = { rgb: "000000" };
                let isBold = false;

                if (rowType === 'modified') {
                    cellFill = { fgColor: { rgb: "FEF3C7" } }; // Vàng cam nhạt
                    cellFontColor = { rgb: "92400E" }; // Nâu cam
                    isBold = (C === 12);
                } else if (rowType === 'replaced_source') {
                    cellFill = { fgColor: { rgb: "FEE2E2" } }; // Đỏ hồng nhạt
                    cellFontColor = { rgb: "991B1B" }; // Đỏ đậm
                    isBold = (C === 12);
                }

                // Căn lề theo từng loại cột
                let alignH = "left";
                if (C === 0 || C === 1 || C === 2 || C === 3 || C === 4 || C === 6 || C === 7 || C === 12 || C === 14) {
                    alignH = "center";
                } else if (C >= 8 && C <= 11) {
                    alignH = "right";
                }

                ws[cellRef].s = {
                    font: { name: "Times New Roman", sz: 11, bold: isBold, color: cellFontColor },
                    fill: cellFill,
                    alignment: { horizontal: alignH, vertical: "center" },
                    border: borderThin
                };

                // Định dạng tiền tệ
                if (C >= 8 && C <= 11 && typeof ws[cellRef].v === 'number') {
                    ws[cellRef].z = '#,##0';
                }
            }
        }

        const sheetName = isPurchase ? "HoaDonMuaVao" : "HoaDonBanRa";
        XLSX.utils.book_append_sheet(wb, ws, sheetName);

        const fileName = `Bang_Ke_HDDT_${isPurchase ? 'Mua_Vao' : 'Ban_Ra'}_${currentPeriodContext.periodTitle}_${currentPeriodContext.year}.xlsx`;
        XLSX.writeFile(wb, fileName);
    }

    // 13. Đóng Modal
    document.getElementById('btn-close-modal').onclick = () => {
        overlay.style.display = 'none';
        modal.style.display = 'none';
    };
    overlay.onclick = () => {
        overlay.style.display = 'none';
        modal.style.display = 'none';
    };

    document.getElementById('chk-all').onchange = function () {
        document.querySelectorAll('.chk-item').forEach(chk => chk.checked = this.checked);
        updateSummary();
    };

    document.getElementById('modal-tbody').addEventListener('change', (e) => {
        if (e.target.classList.contains('chk-item')) {
            updateSummary();
        }
    });

    // Lọc theo ngày
    document.getElementById('btn-apply-date-filter').onclick = () => {
        const filterVal = document.getElementById('filter-date-after').value;
        if (!filterVal) {
            alert("Vui lòng chọn ngày mốc cần lọc!");
            return;
        }

        const checkboxes = document.querySelectorAll('.chk-item');
        let matched = 0;

        checkboxes.forEach(chk => {
            const itemDate = chk.getAttribute('data-date');
            if (itemDate && itemDate >= filterVal) {
                chk.checked = true;
                matched++;
            } else {
                chk.checked = false;
            }
        });

        document.getElementById('chk-all').checked = (matched === checkboxes.length && matched > 0);
        updateSummary();
    };

    document.getElementById('btn-clear-selection').onclick = () => {
        document.querySelectorAll('.chk-item').forEach(chk => chk.checked = false);
        document.getElementById('chk-all').checked = false;
        updateSummary();
    };

    // 14. Bắt sự kiện Xuất Excel
    document.getElementById('btn-export-excel').onclick = exportToProfessionalExcel;

    // 15. Tải hàng loạt tuần tự: Giải nén và lưu file XML
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

        btnDownload.disabled = true;

        for (let i = 0; i < checkedBoxes.length; i++) {
            const chk = checkedBoxes[i];
            const idx = parseInt(chk.getAttribute('data-index'));
            const inv = currentInvoices[idx];

            btnDownload.textContent = `Đang xử lý: ${i + 1}/${checkedBoxes.length}...`;
            summaryEl.textContent = `Đang giải nén & tải XML hóa đơn số ${inv.shdon} (${i + 1}/${checkedBoxes.length})`;

            await downloadXmlAsync(inv);

            await new Promise(r => setTimeout(r, 900));
        }

        btnDownload.textContent = originalBtnText;
        btnDownload.disabled = false;
        summaryEl.textContent = `Đã giải nén và lưu xong toàn bộ ${checkedBoxes.length} hóa đơn XML.`;
        isBatchDownloading = false;
    };

    // 16. Điều khiển Panel Widget
    document.querySelectorAll('#api-group-type .a-btn-tab').forEach(btn => {
        btn.onclick = function () {
            document.querySelectorAll('#api-group-type .a-btn-tab').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
        };
    });

    const yearInput = document.getElementById('api-year');
    document.getElementById('api-prev-y').onclick = () => yearInput.value = parseInt(yearInput.value) - 1;
    document.getElementById('api-next-y').onclick = () => yearInput.value = parseInt(yearInput.value) + 1;

    // Nút chọn Quý
    document.querySelectorAll('.a-btn-q').forEach(btn => {
        btn.onclick = () => {
            const q = parseInt(btn.getAttribute('data-q'));
            const y = parseInt(yearInput.value);
            const quarterMap = {
                1: [1, 2, 3],
                2: [4, 5, 6],
                3: [7, 8, 9],
                4: [10, 11, 12]
            };
            queryPeriod(quarterMap[q], `Quý ${q}`, y);
        };
    });

    // Nút chọn Tháng
    const monthsContainer = document.getElementById('api-months');
    for (let m = 1; m <= 12; m++) {
        const btn = document.createElement('button');
        btn.className = 'a-btn-m';
        btn.textContent = `T${m < 10 ? '0' + m : m}`;
        btn.onclick = () => {
            const y = parseInt(yearInput.value);
            const padM = m < 10 ? '0' + m : m;
            queryPeriod([m], `Tháng ${padM}`, y);
        };
        monthsContainer.appendChild(btn);
    }

    console.log("%c[HDDT]%c Đã cập nhật hoàn chỉnh: Phân màu HĐ Thay thế/Điều chỉnh trên Web & Bảng kê Excel có Viền + Màu nền!", "color:#1677ff;font-weight:bold;", "color:#16a34a;");
})();
