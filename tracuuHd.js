(function () {
    'use strict';

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

    // 3. Diễn giải Trạng thái hóa đơn (tthai)
    function mapTrangThaiHDon(tthai) {
        switch (Number(tthai)) {
            case 1: return '<span style="color: #16a34a; font-weight: 500;">Hóa đơn gốc</span>';
            case 2: return '<span style="color: #2563eb; font-weight: 500;">HĐ thay thế</span>';
            case 3: return '<span style="color: #d97706; font-weight: 500;">HĐ điều chỉnh</span>';
            case 4: return '<span style="color: #dc2626; font-weight: 500;">HĐ bị xóa bỏ</span>';
            case 5: return '<span style="color: #9333ea; font-weight: 500;">HĐ bị hủy</span>';
            default: return (tthai !== null && tthai !== undefined) ? `Khác (${tthai})` : '-';
        }
    }

    // 4. Diễn giải Kết quả xử lý CQT (ttxly)
    function mapKetQuaXuLy(ttxly) {
        switch (Number(ttxly)) {
            case 5: return '<span style="color: #16a34a;">Đã cấp mã CQT</span>';
            case 6: return '<span style="color: #0284c7;">CQT đã nhận không mã</span>';
            case 8: return '<span style="color: #0d9488;">Đã nhận HĐ MTT</span>';
            case 1: return '<span style="color: #64748b;">Đã gửi CQT</span>';
            case 2: return '<span style="color: #dc2626;">Lỗi từ chối</span>';
            default: return (ttxly !== null && ttxly !== undefined) ? `Trạng thái ${ttxly}` : '-';
        }
    }

    // 5. Chèn CSS dùng chung
    const style = document.createElement('style');
    style.innerHTML = `
        #api-hddt-panel {
            position: fixed;
            bottom: 25px;
            right: 25px;
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
        .a-grid-m { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; margin: 8px 0; }
        .a-btn-m { padding: 6px 0; border: 1px solid #cbd5e1; background: #f8fafc; border-radius: 4px; font-weight: 600; cursor: pointer; font-size: 12px; }
        .a-btn-m:hover { background: #1677ff; color: #fff; border-color: #1677ff; }

        #api-hddt-modal {
            display: none;
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: 96vw;
            max-width: 1450px;
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
        .btn-download-xml { background: #10b981; color: #fff; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 11px; }
        .btn-download-xml:hover { background: #059669; }
        .btn-download-xml:disabled { opacity: 0.6; cursor: not-allowed; }
    `;
    document.head.appendChild(style);

    // 6. Dựng khung điều khiển Widget nổi
    const panel = document.createElement('div');
    panel.id = 'api-hddt-panel';
    panel.innerHTML = `
        <div style="font-weight: 700; color: #0f172a; margin-bottom: 8px;">Tra Cứu HĐĐT (Tự Động Nạp Toàn Bộ)</div>
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
        <div class="a-grid-m" id="api-months"></div>
        <div id="api-status" style="font-size: 11px; color: #64748b; text-align: center; min-height: 14px;">Bấm tháng để tải dữ liệu</div>
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

        <!-- Thanh công cụ lọc chọn nhanh theo ngày phát sinh -->
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
                        <th style="text-align: center;">Kết quả xử lý</th>
                        <th style="text-align: center; width: 85px;">Thao tác</th>
                    </tr>
                </thead>
                <tbody id="modal-tbody"></tbody>
            </table>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <span id="modal-summary" style="font-size: 12px; color: #475569;"></span>
            <button id="btn-download-selected" style="background: #1677ff; color: #fff; border: none; padding: 7px 16px; border-radius: 6px; font-weight: 600; cursor: pointer;">
                Tải các mục đã chọn (XML)
            </button>
        </div>
    `;
    document.body.appendChild(modal);

    let isCurrentSco = false;
    let isFetching = false;
    let isBatchDownloading = false;
    let currentInvoices = [];

    // 7. Tải 1 file XML bất đồng bộ (chống lỗi 429 và tên file có nmmst)
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

                const blob = await res.blob();
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);

                const nbmst = item.nbmst || 'NB';
                const nmmst = item.nmmst || 'NM';
                a.download = `invoice_${nbmst}_${nmmst}_${item.khhdon}_${item.shdon}.zip`;

                document.body.appendChild(a);
                a.click();
                a.remove();
                return true;
            } catch (err) {
                if (retries >= maxRetries - 1) {
                    console.error(`Không thể tải file XML hóa đơn số ${item.shdon}: ${err.message}`);
                    return false;
                }
            }
        }
        return false;
    }

    // 8. Đệ quy qua cursor "state" nạp toàn bộ hóa đơn của tháng
    async function queryAllPages(month, year) {
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

        const pad = (n) => String(n).padStart(2, '0');
        const daysInMonth = new Date(year, month, 0).getDate();

        const fromDateStr = `01/${pad(month)}/${year}T00:00:00`;
        const toDateStr = `${pad(daysInMonth)}/${pad(month)}/${year}T23:59:59`;

        const direction = isPurchase ? 'purchase' : 'sold';
        const actionEncoded = encodeURIComponent(actionRaw);

        const searchParam = `tdlap=ge=${fromDateStr};tdlap=le=${toDateStr};ttxly==${ttxly}`;
        const baseUrl = `https://hoadondientu.gdt.gov.vn/api/${apiType}/invoices/${direction}?sort=tdlap:desc&size=${pageSize}`;

        const statusEl = document.getElementById('api-status');
        currentInvoices = [];
        let currentState = null;
        let pageNum = 1;
        let totalCount = 0;

        try {
            while (true) {
                statusEl.textContent = `Đang nạp trang ${pageNum}... (Đã lấy ${currentInvoices.length} HĐ)`;
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
                currentInvoices = currentInvoices.concat(list);

                if (list.length === 0 || !data.state || currentInvoices.length >= totalCount) {
                    break;
                }

                currentState = data.state;
                pageNum++;

                await new Promise(r => setTimeout(r, 1200));
            }

            statusEl.textContent = `Hoàn tất: Đã lấy ${currentInvoices.length}/${totalCount} hóa đơn!`;
            statusEl.style.color = "#10b981";
            showModal(currentInvoices, month, year, isPurchase, totalCount);

        } catch (err) {
            statusEl.textContent = "Lỗi: " + err.message;
            statusEl.style.color = "#ef4444";
            alert("Lỗi khi tải dữ liệu: " + err.message);
        } finally {
            isFetching = false;
        }
    }

    // 9. Hiển thị bảng Modal dữ liệu & khởi tạo ngày mặc định cho bộ lọc
    function showModal(list, month, year, isPurchase, totalCount) {
        const tbody = document.getElementById('modal-tbody');
        tbody.innerHTML = '';

        document.getElementById('modal-title').textContent =
            `Danh sách Hóa đơn ${isPurchase ? 'Mua vào' : 'Bán ra'} - Tháng ${month}/${year} (Đã nạp: ${list.length}/${totalCount})`;

        // Thiết lập sẵn giá trị mặc định cho ô chọn ngày (ngày đầu tháng)
        const pad = (n) => String(n).padStart(2, '0');
        const filterInput = document.getElementById('filter-date-after');
        if (filterInput) {
            filterInput.value = `${year}-${pad(month)}-01`;
        }

        const fmtMoney = (val) => (val !== null && val !== undefined && val !== '') ? Number(val).toLocaleString('vi-VN') : '0';

        list.forEach((item, index) => {
            const tr = document.createElement('tr');
            const partnerName = isPurchase ? item.nbten : item.nmten;
            const partnerMst = isPurchase ? item.nbmst : item.nmmst;

            // Lấy chuỗi YYYY-MM-DD để so sánh ngày chính xác
            const dateOnly = item.tdlap ? item.tdlap.substring(0, 10) : '';

            tr.innerHTML = `
                <td><input type="checkbox" class="chk-item" data-index="${index}" data-date="${dateOnly}"></td>
                <td style="color: #64748b; text-align: center;">${index + 1}</td>
                <td><strong>${item.khmshdon || ''}${item.khhdon || ''}</strong></td>
                <td><span style="color: #1677ff; font-weight: 600;">${item.shdon}</span></td>
                <td>${dateOnly}</td>
                <td style="max-width: 240px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${partnerName || ''}">${partnerName || '-'}</td>
                <td>${partnerMst || '-'}</td>
                <td style="text-align: center; color: #475569;">${item.dvtte || 'VND'}</td>
                <td style="text-align: right;">${fmtMoney(item.tgtcthue)}</td>
                <td style="text-align: right;">${fmtMoney(item.tgtthue)}</td>
                <td style="text-align: right; color: #64748b;">${fmtMoney(item.tgtphi)}</td>
                <td style="text-align: right; font-weight: 600; color: #0f172a;">${fmtMoney(item.tgtttbso)}</td>
                <td style="text-align: center;">${mapTrangThaiHDon(item.tthai)}</td>
                <td style="text-align: center;">${mapKetQuaXuLy(item.ttxly)}</td>
                <td style="text-align: center;">
                    <button class="btn-download-xml" data-index="${index}">Tải XML</button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Bắt sự kiện tải riêng lẻ cho từng nút trong bảng
        tbody.querySelectorAll('.btn-download-xml').forEach(btn => {
            btn.onclick = async function () {
                const idx = parseInt(this.getAttribute('data-index'));
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

        updateSummary();
        overlay.style.display = 'block';
        modal.style.display = 'flex';
    }

    // Cập nhật thông tin số lượng mục đã chọn
    function updateSummary() {
        const total = currentInvoices.length;
        const selectedCount = document.querySelectorAll('.chk-item:checked').length;
        document.getElementById('modal-summary').textContent = `Đã chọn: ${selectedCount}/${total} hóa đơn.`;
    }

    // 10. Đóng Modal
    document.getElementById('btn-close-modal').onclick = () => {
        overlay.style.display = 'none';
        modal.style.display = 'none';
    };
    overlay.onclick = () => {
        overlay.style.display = 'none';
        modal.style.display = 'none';
    };

    // Chọn / Bỏ chọn tất cả qua checkbox ở tiêu đề
    document.getElementById('chk-all').onchange = function () {
        document.querySelectorAll('.chk-item').forEach(chk => chk.checked = this.checked);
        updateSummary();
    };

    // Bắt sự kiện thay đổi từng checkbox lẻ
    document.getElementById('modal-tbody').addEventListener('change', (e) => {
        if (e.target.classList.contains('chk-item')) {
            updateSummary();
        }
    });

    // 11. Xử lý nút Lọc chọn theo ngày phát sinh (>= ngày chỉ định)
    document.getElementById('btn-apply-date-filter').onclick = () => {
        const filterVal = document.getElementById('filter-date-after').value;
        if (!filterVal) {
            alert("Vui lòng chọn ngày mốc cần lọc!");
            return;
        }

        const checkboxes = document.querySelectorAll('.chk-item');
        let matched = 0;

        checkboxes.forEach(chk => {
            const itemDate = chk.getAttribute('data-date'); // YYYY-MM-DD
            if (itemDate && itemDate >= filterVal) {
                chk.checked = true;
                matched++;
            } else {
                chk.checked = false;
            }
        });

        // Bỏ chọn nút chk-all ở tiêu đề nếu không chọn hết
        document.getElementById('chk-all').checked = (matched === checkboxes.length && matched > 0);
        updateSummary();
    };

    // Bỏ chọn tất cả
    document.getElementById('btn-clear-selection').onclick = () => {
        document.querySelectorAll('.chk-item').forEach(chk => chk.checked = false);
        document.getElementById('chk-all').checked = false;
        updateSummary();
    };

    // 12. Tải tuần tự hàng loạt (Sequential Queue) chống 429
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

            btnDownload.textContent = `Đang tải: ${i + 1}/${checkedBoxes.length}...`;
            summaryEl.textContent = `Đang tải hóa đơn số ${inv.shdon} (${i + 1}/${checkedBoxes.length})`;

            await downloadXmlAsync(inv);

            // Nghỉ 900ms giữa các lượt tải
            await new Promise(r => setTimeout(r, 900));
        }

        btnDownload.textContent = originalBtnText;
        btnDownload.disabled = false;
        summaryEl.textContent = `Đã tải xong toàn bộ ${checkedBoxes.length} hóa đơn đã chọn.`;
        isBatchDownloading = false;
    };

    // 13. Điều khiển trên Panel Widget
    document.querySelectorAll('#api-group-type .a-btn-tab').forEach(btn => {
        btn.onclick = function () {
            document.querySelectorAll('#api-group-type .a-btn-tab').forEach(b => b.classList.remove('active'));
            this.classList.add('active');
        };
    });

    const yearInput = document.getElementById('api-year');
    document.getElementById('api-prev-y').onclick = () => yearInput.value = parseInt(yearInput.value) - 1;
    document.getElementById('api-next-y').onclick = () => yearInput.value = parseInt(yearInput.value) + 1;

    const monthsContainer = document.getElementById('api-months');
    for (let m = 1; m <= 12; m++) {
        const btn = document.createElement('button');
        btn.className = 'a-btn-m';
        btn.textContent = `T${m < 10 ? '0' + m : m}`;
        btn.onclick = () => queryAllPages(m, parseInt(yearInput.value));
        monthsContainer.appendChild(btn);
    }
})();
