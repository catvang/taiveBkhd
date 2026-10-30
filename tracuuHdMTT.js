(async function runScoInvoiceQueryWithTemplateExcel() {
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

    // 1. Sinh UUID v4
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
        return match && match[1] ? decodeURIComponent(match[1]) : null;
    }

	// Chuyển tdlap thành đối tượng Date chuẩn Excel, không bị lệch múi giờ
	function parseTdlapToDate(tdlapStr) {
		if (!tdlapStr) return null;
		try {
			const d = new Date(tdlapStr);
			if (isNaN(d.getTime())) return null;
			// Trả về đối tượng Date cục bộ (chỉ lấy phần ngày, đặt giờ 00:00:00 để tránh sai lệch)
			return new Date(d.getFullYear(), d.getMonth(), d.getDate());
		} catch (e) {
			return null;
		}
	}
	
    const pad = (n) => String(n).padStart(2, '0');
    const fmtDateParam = (d, isEnd) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}T${isEnd ? '23:59:59' : '00:00:00'}`;
    const fmtDateDisplay = (d) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;

    // 3. Phân loại trạng thái hóa đơn chuẩn Thuế
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

    // 4. Giải nén ZIP trong bộ nhớ và lưu duy nhất file invoice.xml
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

    // 5. Tải file XML hóa đơn máy tính tiền (sco-query)
    async function downloadXmlAsync(item) {
        const token = getJwtToken();
        const url = `https://hoadondientu.gdt.gov.vn/api/sco-query/invoices/export-xml?nbmst=${item.nbmst}&khhdon=${encodeURIComponent(item.khhdon)}&shdon=${item.shdon}&khmshdon=${item.khmshdon}`;

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

    // 6. Lấy và hiển thị Captcha
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
            input.onkeydown = (e) => {
                if (e.key === 'Enter') submit();
            };
            document.getElementById('sco-captcha-btn-cancel').onclick = () => {
                box.remove();
                resolve(null);
            };
        });
    }

    // 7. Chia nhỏ dải ngày <= 10 ngày
    function chunkDateRange(startDate, endDate, maxDays = 10) {
        const chunks = [];
        let currStart = new Date(startDate);

        while (currStart <= endDate) {
            let currEnd = new Date(currStart);
            currEnd.setDate(currEnd.getDate() + (maxDays - 1));
            if (currEnd > endDate) {
                currEnd = new Date(endDate);
            }
            chunks.push({
                from: new Date(currStart),
                to: new Date(currEnd)
            });
            currStart.setDate(currStart.getDate() + maxDays);
        }
        return chunks;
    }

    // 8. Nạp dữ liệu 1 đợt qua API (kèm ckey, cvalue)
    async function fetchInvoicesChunkWithCaptcha(fromD, toD, isPurchase, pageSize, statusEl, chunkIdx, totalChunks) {
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
            if (!captchaValue) {
                throw new Error("Người dùng đã hủy nhập Captcha.");
            }

            statusEl.textContent = `[Đợt ${chunkIdx + 1}/${totalChunks}] Đang truy vấn danh sách trang ${pageNum}...`;

            let fetchUrl = `https://hoadondientu.gdt.gov.vn/api/sco-query/invoices/${direction}?sort=tdlap:desc&size=${pageSize}&search=${searchParam}&ckey=${encodeURIComponent(captchaData.key)}&cvalue=${encodeURIComponent(captchaValue)}`;
            if (currentState) {
                fetchUrl += `&state=${encodeURIComponent(currentState)}`;
            }

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

            if (list.length === 0 || !data.state || chunkInvoices.length >= total) {
                break;
            }

            currentState = data.state;
            pageNum++;
            await new Promise(r => setTimeout(r, 1000));
        }

        return chunkInvoices;
    }

    // 9. Giao diện DOM
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
        .input-mst-filter:focus { border-color: #0284c7; box-shadow: 0 0 0 2px rgba(2,132,199,0.2); }
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
    document.head.appendChild(style);

    const panel = document.createElement('div');
    panel.id = 'api-hddt-panel';
    const currentYear = new Date().getFullYear();

    panel.innerHTML = `
        <div style="font-weight: 700; color: #0f172a; margin-bottom: 8px;">Tra Cứu HĐ Máy Tính Tiền (Xuất Mẫu Chuẩn Thuế)</div>
        <div class="a-row">
            <div class="a-btn-group" id="api-group-type">
                <button class="a-btn-tab" data-val="sold">Bán ra</button>
                <button class="a-btn-tab active" data-val="purchase">Mua vào</button>
            </div>
        </div>
        <div class="a-row" style="justify-content: space-between;">
            <span style="font-weight: 600;">Năm:</span>
            <div style="display: flex; gap: 4px;">
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
        <div id="api-status" style="font-size: 11px; color: #64748b; text-align: center; min-height: 14px;">Chọn tháng hoặc quý để bắt đầu</div>
    `;
    document.body.appendChild(panel);

    const overlay = document.createElement('div');
    overlay.id = 'api-hddt-overlay';
    document.body.appendChild(overlay);

    const modal = document.createElement('div');
    modal.id = 'api-hddt-modal';
    modal.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <h3 style="margin: 0; font-size: 16px; color: #0f172a;" id="modal-title">Danh sách HĐ Máy Tính Tiền</h3>
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
                        <th style="width: 30px;"><input type="checkbox" id="chk-all" title="Chọn tất cả dòng đang hiển thị"></th>
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
    let currentPeriodContext = { isPurchase: true, startDateStr: '', endDateStr: '', periodTitle: '' };

    // 10. Xuất file Excel ĐÚNG ĐỊNH DẠNG CỘT & TIÊU ĐỀ THEO FILE MẪU
function exportTemplateExcel() {
        if (!currentInvoices || currentInvoices.length === 0) {
            alert("Không có dữ liệu để xuất file Excel!");
            return;
        }

        const isPurchase = currentPeriodContext.isPurchase;
        const dateRangeText = `Từ ngày ${currentPeriodContext.startDateStr} đến ngày ${currentPeriodContext.endDateStr}`;

        const rows = [
            [], // Dòng 1 trống
            [], // Dòng 2 trống
            ["DANH SÁCH HÓA ĐƠN MÁY TÍNH TIỀN"], // Dòng 3 (merged A3:Q3)
            [dateRangeText],                     // Dòng 4 (merged A4:Q4)
            [],                                  // Dòng 5 trống
            [                                    // Dòng 6: 17 Cột chuẩn
                "STT",
                "Ký hiệu mẫu số",
                "Ký hiệu hóa đơn",
                "Số hóa đơn",
                "Ngày lập",
                "MST người bán/MST người xuất hàng",
                "Tên người bán/Tên người xuất hàng",
                "Địa chỉ người bán",
                "MST người mua/MST người nhận hàng",
                "Tên người mua/Tên người nhận hàng",
                "Căn cước công dân",
                "Tổng tiền chưa thuế",
                "Tổng tiền thuế",
                "Tổng tiền chiết khấu thương mại",
                "Tổng tiền thanh toán",
                "Trạng thái hóa đơn",
                "Kết quả kiểm tra hóa đơn"
            ]
        ];

        // Hàm parse ngày an toàn, khắc phục lỗi lùi 1 ngày do UTC
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

        currentInvoices.forEach((item, idx) => {
            const partnerBuyerName = (item.nmten && item.nmten.trim()) ? item.nmten : (item.nmtnmua || '');
            const cccd = item.nmcccd || item.cccd || item.nmtcccd || item.nmtcmnd || '';
            const valChuaThue = (item.tgtcthue !== null && item.tgtcthue !== undefined && item.tgtcthue !== '') ? Number(item.tgtcthue) : null;
            const valThue = (item.tgtthue !== null && item.tgtthue !== undefined && item.tgtthue !== '') ? Number(item.tgtthue) : null;
            const valCktm = (item.tgttcktm !== null && item.tgttcktm !== undefined && item.tgttcktm !== '') ? Number(item.tgttcktm) : 0;
            const valTong = (item.tgtttbso !== null && item.tgtttbso !== undefined && item.tgtttbso !== '') ? Number(item.tgtttbso) : null;

            const { statusText } = parseInvoiceStatus(item);
            const ketQuaKiemTra = "Cục Thuế đã nhận hóa đơn có mã khởi tạo từ máy tính tiền";
            
            // Xử lý Date Object chính xác
            const dateObj = parseTdlapToDate(item.tdlap);

            rows.push([
                idx + 1,
                item.khmshdon || '1',
                item.khhdon || '',
                item.shdon || '',
                dateObj,
                item.nbmst || '',
                item.nbten || '',
                item.nbdchi || '',
                item.nmmst || '',
                partnerBuyerName,
                cccd,
                valChuaThue,
                valThue,
                valCktm,
                valTong,
                statusText,
                ketQuaKiemTra
            ]);
        });

        // Bật cờ cellDates để SheetJS nhận diện đối tượng Date
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.aoa_to_sheet(rows, { cellDates: true });

        ws['!cols'] = [
            { wch: 8 },  // A: STT
            { wch: 12 }, // B: Ký hiệu mẫu số
            { wch: 12 }, // C: Ký hiệu hóa đơn
            { wch: 12 }, // D: Số hóa đơn
            { wch: 15 }, // E: Ngày lập
            { wch: 22 }, // F: MST người bán
            { wch: 38 }, // G: Tên người bán
            { wch: 38 }, // H: Địa chỉ người bán
            { wch: 22 }, // I: MST người mua
            { wch: 38 }, // J: Tên người mua
            { wch: 18 }, // K: CCCD
            { wch: 18 }, // L: Tổng tiền chưa thuế
            { wch: 16 }, // M: Tổng tiền thuế
            { wch: 20 }, // N: Chiết khấu TM
            { wch: 20 }, // O: Tổng tiền thanh toán
            { wch: 20 }, // P: Trạng thái hóa đơn
            { wch: 45 }  // Q: Kết quả kiểm tra
        ];

        ws['!merges'] = [
            { s: { r: 2, c: 0 }, e: { r: 2, c: 16 } },
            { s: { r: 3, c: 0 }, e: { r: 3, c: 16 } }
        ];

        ws['!rows'] = [];
        ws['!rows'][5] = { hpt: 45 };

        const borderThin = {
            top: { style: "thin", color: { rgb: "D1D5DB" } },
            bottom: { style: "thin", color: { rgb: "D1D5DB" } },
            left: { style: "thin", color: { rgb: "D1D5DB" } },
            right: { style: "thin", color: { rgb: "D1D5DB" } }
        };

        const headerStyle = {
            font: { name: "Times New Roman", sz: 11, bold: true, color: { rgb: "000000" } },
            fill: { fgColor: { rgb: "FFCC00" } },
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
                if (C === 0 || C === 1 || C === 3 || C === 4 || C === 5 || C === 8) {
                    alignH = "center";
                } else if (C >= 11 && C <= 14) {
                    alignH = "right";
                }

                ws[cellRef].s = {
                    font: { name: "Times New Roman", sz: 11, color: { rgb: "000000" } },
                    alignment: { horizontal: alignH, vertical: "center", wrapText: (C === 6 || C === 7 || C === 9) },
                    border: borderThin
                };

                // Thiết lập định dạng kiểu Ngày tháng cho cột E (C === 4)
                if (C === 4) {
                    ws[cellRef].z = 'dd/mm/yyyy';
                }

                // Định dạng số tiền
                if (C >= 11 && C <= 14 && typeof ws[cellRef].v === 'number') {
                    ws[cellRef].z = '#,##0';
                }
            }
        }

        XLSX.utils.book_append_sheet(wb, ws, "sheet 1");
        const exportFileName = `DANH SÁCH HÓA ĐƠN (${isPurchase ? 'Mua_vao' : 'Ban_ra'}_${currentPeriodContext.periodTitle.replace(/[\/\\]/g, '_')}).xlsx`;
        XLSX.writeFile(wb, exportFileName);
    }
	
    // 11. Tiến trình điều phối truy vấn: Tải dữ liệu -> Tự động kết xuất Excel mẫu chuẩn -> Mở Modal
    async function queryPeriod(startDate, endDate, periodTitle, year) {
        if (isFetching) {
            alert("Đang có tiến trình truy vấn, vui lòng đợi...");
            return;
        }

        const token = getJwtToken();
        if (!token) {
            alert("Chưa tìm thấy Cookie 'jwt'! Hãy đảm bảo bạn đang ở trạng thái đã đăng nhập.");
            return;
        }

        isFetching = true;
        const isPurchase = document.querySelector('#api-group-type .active').getAttribute('data-val') === 'purchase';
        currentPeriodContext = { 
            isPurchase, 
            startDateStr: fmtDateDisplay(startDate), 
            endDateStr: fmtDateDisplay(endDate), 
            periodTitle 
        };

        const statusEl = document.getElementById('api-status');
        const chunks = chunkDateRange(startDate, endDate, 10);
        currentInvoices = [];

        try {
            for (let i = 0; i < chunks.length; i++) {
                const c = chunks[i];
                const list = await fetchInvoicesChunkWithCaptcha(c.from, c.to, isPurchase, 50, statusEl, i, chunks.length);
                currentInvoices = currentInvoices.concat(list);
                await new Promise(r => setTimeout(r, 800));
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

            // Tự động kết xuất và tải ngay File Excel theo đúng định dạng mẫu
            if (currentInvoices.length > 0) {
                exportTemplateExcel();
                statusEl.textContent = `✔ Đã tạo file Excel chuẩn & lấy xong ${currentInvoices.length} HĐ!`;
            } else {
                statusEl.textContent = `Hoàn tất: Không có hóa đơn nào trong ${periodTitle}.`;
            }

            statusEl.style.color = "#10b981";
            showModal(currentInvoices, periodTitle, year, isPurchase, currentInvoices.length);

        } catch (err) {
            statusEl.textContent = "Lỗi: " + err.message;
            statusEl.style.color = "#ef4444";
            console.error(err);
        } finally {
            isFetching = false;
        }
    }

    // 12. Đổ dữ liệu vào Modal Table
    function showModal(list, periodTitle, year, isPurchase, totalCount) {
        const tbody = document.getElementById('modal-tbody');
        tbody.innerHTML = '';

        document.getElementById('modal-title').textContent =
            `Danh sách Hóa đơn MTT ${isPurchase ? 'Mua vào' : 'Bán ra'} - ${periodTitle} (Tổng cộng: ${totalCount} HĐ)`;

        const mstInput = document.getElementById('filter-mst-input');
        if (mstInput) mstInput.value = '';

        const fmtMoney = (val) => (val !== null && val !== undefined && val !== '') ? Number(val).toLocaleString('vi-VN') : '0';

        list.forEach((item, index) => {
            const tr = document.createElement('tr');
            
            let partnerName = isPurchase ? (item.nbten || '-') : ((item.nmten && item.nmten.trim()) ? item.nmten : (item.nmtnmua || '-'));
            let partnerMst = isPurchase ? (item.nbmst || '-') : (item.nmmst || '-');
            const dateOnly = item.tdlap ? item.tdlap.substring(0, 10) : '';
            const { statusText, refText, rowType } = parseInvoiceStatus(item);

            if (rowType === 'modified') {
                tr.className = 'row-warning-modified';
            } else if (rowType === 'replaced_source') {
                tr.className = 'row-danger-replaced';
            }

            tr.setAttribute('data-mst', String(partnerMst).toLowerCase());
            tr.setAttribute('data-date', dateOnly);

            tr.innerHTML = `
                <td><input type="checkbox" class="chk-item" data-index="${index}" data-date="${dateOnly}"></td>
                <td style="color: #64748b; text-align: center;">${index + 1}</td>
                <td><strong>${item.khmshdon || ''}${item.khhdon || ''}</strong></td>
                <td><span style="color: #0284c7; font-weight: 600;">${item.shdon}</span></td>
                <td>${dateOnly}</td>
                <td style="max-width: 230px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${partnerName}">${partnerName}</td>
                <td class="col-mst">${partnerMst}</td>
                <td style="text-align: center; color: #475569;">${item.dvtte || 'VND'}</td>
                <td style="text-align: right;">${fmtMoney(item.tgtcthue)}</td>
                <td style="text-align: right;">${fmtMoney(item.tgtthue)}</td>
                <td style="text-align: right; color: #64748b;">${fmtMoney(item.tgtphi)}</td>
                <td style="text-align: right; font-weight: 600; color: #0f172a;">${fmtMoney(item.tgtttbso)}</td>
                <td style="text-align: center;"><b>${statusText}</b></td>
                <td style="font-size: 11px;">${refText}</td>
                <td style="text-align: center;">Đã nhận HĐ MTT</td>
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
                await downloadXmlAsync(list[idx]);
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

    // 13. Lọc MST và tính toán trạng thái checkbox
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
        if (badge) {
            badge.textContent = `${visibleCount}/${rows.length} dòng`;
        }

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
            const allVisibleChecked = visibleRows.every(r => {
                const chk = r.querySelector('.chk-item');
                return chk && chk.checked;
            });
            chkAll.checked = allVisibleChecked;
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

    // 14. Đóng Modal
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
        if (e.target.classList.contains('chk-item')) {
            updateSummary();
        }
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

    document.getElementById('btn-export-excel').onclick = exportTemplateExcel;

    // 15. Tải hàng loạt tuần tự XML
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
            const idx = parseInt(chk.getAttribute('data-index'), 10);
            const inv = currentInvoices[idx];

            btnDownload.textContent = `Đang xử lý: ${i + 1}/${checkedBoxes.length}...`;
            summaryEl.textContent = `Đang giải nén & tải XML HĐ số ${inv.shdon} (${i + 1}/${checkedBoxes.length})`;

            await downloadXmlAsync(inv);
            await new Promise(r => setTimeout(r, 900));
        }

        btnDownload.textContent = originalBtnText;
        btnDownload.disabled = false;
        summaryEl.textContent = `Đã giải nén và lưu xong toàn bộ ${checkedBoxes.length} hóa đơn XML.`;
        isBatchDownloading = false;
    };

    // 16. Gắn sự kiện các nút Panel
    document.querySelectorAll('#api-group-type .a-btn-tab').forEach(btn => {
        btn.onclick = function () {
            document.querySelectorAll('#api-group-type .a-btn-tab').forEach(b => b.classList.remove('active'));
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
            const startM = (q - 1) * 3;
            queryPeriod(new Date(y, startM, 1), new Date(y, startM + 3, 0), `Quý ${q}/${y}`, y);
        };
    });

    const monthsContainer = document.getElementById('api-months');
    for (let m = 1; m <= 12; m++) {
        const btn = document.createElement('button');
        btn.className = 'a-btn-m';
        btn.textContent = `T${pad(m)}`;
        btn.onclick = () => {
            const y = parseInt(yearInput.value, 10);
            queryPeriod(new Date(y, m - 1, 1), new Date(y, m, 0), `Tháng ${pad(m)}/${y}`, y);
        };
        monthsContainer.appendChild(btn);
    }

    console.log("%c[HDDT]%c Đã cập nhật: Xuất trực tiếp file Excel theo chuẩn mẫu Thuế!", "color:#0284c7;font-weight:bold;", "color:#16a34a;");
})();