(function() {
    // --- PHẦN 1: LOGIC XỬ LÝ DỮ LIỆU & TẢI FILE ---

    function formatDateToDDMMYYYY(date) {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        return `${day}/${month}/${date.getFullYear()}`;
    }

    function getFirstAndLastDate(month, year) {
        return {
            firstDate: formatDateToDDMMYYYY(new Date(year, month - 1, 1)),
            lastDate: formatDateToDDMMYYYY(new Date(year, month, 0))
        };
    }

    function getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        return parts.length === 2 ? parts.pop().split(';').shift() : null;
    }

    function generateUUID() {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
    }

    async function downloadExcelFile(company, year, month, selectedReportIds) {
        const actionMua = "T%C3%ACm%20ki%E1%BA%BFm%20(h%C3%B3a%20%C4%91%C6%A1n%20mua%20v%C3%A0o)";
        const actionBan = "T%C3%ACm%20ki%E1%BA%BFm%20(h%C3%B3a%20%C4%91%C6%A1n%20b%C3%A1n%20ra)";

        const reports = [
            { id: 'ban_cma', file_name: "BK Ban", link: "query/invoices/export-excel?sort=tdlap:desc&search=tdlap=ge=01/11/2024T00:00:00;tdlap=le=30/11/2024T23:59:59", action: actionBan },
            { id: 'ban_mtt', file_name: "BK Ban MTTien", link: "sco-query/invoices/export-excel?sort=tdlap:desc&search=tdlap=ge=01/11/2024T00:00:00;tdlap=le=30/11/2024T23:59:59", action: actionBan },
            { id: 'mua_cma', file_name: "BK Mua CMa", link: "query/invoices/export-excel-sold?sort=tdlap:desc&search=tdlap=ge=01/11/2024T00:00:00;tdlap=le=30/11/2024T23:59:59;ttxly==5%20%20%20%20&type=purchase", action: actionMua },
            { id: 'mua_kma', file_name: "BK Mua KMa", link: "query/invoices/export-excel-sold?sort=tdlap:desc&search=tdlap=ge=01/11/2024T00:00:00;tdlap=le=30/11/2024T23:59:59;ttxly==6%20%20%20%20&type=purchase", action: actionMua },
            { id: 'mua_mtt', file_name: "BK Mua MTTien", link: "sco-query/invoices/export-excel-sold?sort=tdlap:desc&search=tdlap=ge=01/11/2024T00:00:00;tdlap=le=30/11/2024T23:59:59;ttxly==8%20%20%20%20&type=purchase", action: actionMua }
        ];

        const { firstDate, lastDate } = getFirstAndLastDate(month, year);
        const jwtToken = getCookie('jwt');

        if (!jwtToken) {
            alert('Không tìm thấy Token JWT. Vui lòng đăng nhập lại!');
            return;
        }

        const filteredReports = reports.filter(r => selectedReportIds.includes(r.id));

        for (const report of filteredReports) {
            const url = "https://hoadondientu.gdt.gov.vn/api/" + report.link.replace('01/11/2024', firstDate).replace('30/11/2024', lastDate);
            try {
                const res = await fetch(url, {
                    method: "GET",
                    credentials: "include",
                    headers: {
                        "accept": "application/json, text/plain, */*",
                        "accept-language": "vi",
                        "action": report.action,
                        "authorization": `Bearer ${jwtToken}`,
                        "end-point": "/tra-cuu/tra-cuu-hoa-don",
                        "request-id": generateUUID()
                    }
                });

                if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

                const blob = await res.blob();
                const downloadUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = downloadUrl;
                a.download = `${company} ${report.file_name} T${month} ${year}.xlsx`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(downloadUrl);
                
                await new Promise(resolve => setTimeout(resolve, 600));
            } catch (err) {
                console.error(`Lỗi khi tải file ${report.file_name}:`, err);
            }
        }
    }

    async function downloadMonthRange(year, fromMonth, toMonth, company, selectedReportIds) {
        for (let i = fromMonth; i <= toMonth; i++) {
            await downloadExcelFile(company, year, i, selectedReportIds);
        }
        alert('Đã hoàn thành quá trình tải file!');
    }

    // --- PHẦN 2: GIAO DIỆN HIỆN ĐẠI (MODERN UI) ---

    function createTriggerButton() {
        if (document.getElementById('fb-reopen-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'fb-reopen-btn';
        btn.innerHTML = `
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            <span>Tải Bảng Kê</span>
        `;
        Object.assign(btn.style, {
            position: 'fixed',
            bottom: '26px',
            right: '26px',
            zIndex: '999999',
            background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
            color: '#ffffff',
            border: 'none',
            borderRadius: '9999px',
            padding: '11px 20px',
            boxShadow: '0 10px 25px -5px rgba(37, 99, 235, 0.45), 0 8px 10px -6px rgba(37, 99, 235, 0.3)',
            cursor: 'pointer',
            fontSize: '13.5px',
            fontWeight: '600',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
        });

        btn.onmouseover = () => {
            btn.style.transform = 'translateY(-2px)';
            btn.style.boxShadow = '0 15px 30px -5px rgba(37, 99, 235, 0.55), 0 10px 12px -5px rgba(37, 99, 235, 0.35)';
        };
        btn.onmouseout = () => {
            btn.style.transform = 'translateY(0)';
            btn.style.boxShadow = '0 10px 25px -5px rgba(37, 99, 235, 0.45), 0 8px 10px -6px rgba(37, 99, 235, 0.3)';
        };
        btn.onclick = () => showDialog();

        document.body.appendChild(btn);
    }

    function showDialog() {
        let overlay = document.getElementById('fb-dialog-overlay');
        if (overlay) {
            overlay.style.display = 'flex';
            return;
        }

        const style = document.createElement('style');
        style.innerHTML = `
            #fb-dialog-overlay {
                backdrop-filter: blur(8px);
                -webkit-backdrop-filter: blur(8px);
                background: rgba(15, 23, 42, 0.55);
            }
            .fb-card {
                background: #ffffff;
                border-radius: 20px;
                width: 420px;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(226, 232, 240, 0.8);
                overflow: hidden;
                animation: fbPopIn 0.28s cubic-bezier(0.16, 1, 0.3, 1);
            }
            @keyframes fbPopIn {
                from { opacity: 0; transform: scale(0.96) translateY(8px); }
                to { opacity: 1; transform: scale(1) translateY(0); }
            }
            .fb-header {
                padding: 18px 24px 14px;
                border-bottom: 1px solid #f1f5f9;
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            .fb-header h3 {
                margin: 0;
                font-size: 16.5px;
                font-weight: 700;
                color: #0f172a;
                letter-spacing: -0.01em;
            }
            .fb-close-icon {
                background: none;
                border: none;
                color: #94a3b8;
                cursor: pointer;
                border-radius: 8px;
                padding: 4px;
                display: flex;
                transition: all 0.15s ease;
            }
            .fb-close-icon:hover {
                background: #f1f5f9;
                color: #475569;
            }
            .fb-body {
                padding: 20px 24px 24px;
            }
            .fb-section-label {
                font-size: 11px;
                font-weight: 700;
                letter-spacing: 0.05em;
                color: #64748b;
                text-transform: uppercase;
                margin-bottom: 6px;
                display: block;
            }
            .fb-input {
                width: 100%;
                box-sizing: border-box;
                padding: 9px 12px;
                background: #f8fafc;
                border: 1px solid #e2e8f0;
                border-radius: 10px;
                font-size: 13.5px;
                color: #0f172a;
                transition: all 0.2s ease;
                outline: none;
            }
            .fb-input:focus {
                background: #ffffff;
                border-color: #3b82f6;
                box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
            }
            .fb-container {
                background: #f8fafc;
                border: 1px solid #e2e8f0;
                border-radius: 12px;
                padding: 14px;
                margin-bottom: 16px;
            }
            .fb-chk-item {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                cursor: pointer;
                user-select: none;
                font-size: 12.5px;
                font-weight: 500;
                color: #334155;
            }
            .fb-chk-item input[type="checkbox"] {
                accent-color: #2563eb;
                width: 15px;
                height: 15px;
                border-radius: 4px;
                cursor: pointer;
            }
            .fb-stepper {
                display: inline-flex;
                align-items: center;
                background: #ffffff;
                border: 1px solid #e2e8f0;
                border-radius: 10px;
                padding: 2px;
            }
            .fb-stepper-btn {
                background: transparent;
                border: none;
                width: 28px;
                height: 28px;
                cursor: pointer;
                color: #64748b;
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: 600;
                transition: all 0.15s ease;
            }
            .fb-stepper-btn:hover {
                background: #f1f5f9;
                color: #0f172a;
            }
            #report_year {
                border: none;
                background: transparent;
                width: 50px;
                text-align: center;
                font-weight: 700;
                font-size: 14px;
                color: #0f172a;
                outline: none;
            }
            .btn-grid-period {
                padding: 7px 0;
                border: 1px solid #e2e8f0;
                background: #ffffff;
                cursor: pointer;
                border-radius: 8px;
                font-size: 12px;
                font-weight: 600;
                color: #475569;
                transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
            }
            .btn-grid-period:hover {
                background: #eff6ff;
                color: #2563eb;
                border-color: #bfdbfe;
                transform: translateY(-1px);
            }
            .btn-primary-action {
                flex: 2;
                padding: 10.5px;
                border: none;
                background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
                color: #ffffff;
                border-radius: 11px;
                cursor: pointer;
                font-size: 13.5px;
                font-weight: 600;
                box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);
                transition: all 0.2s ease;
            }
            .btn-primary-action:hover {
                opacity: 0.95;
                box-shadow: 0 6px 16px rgba(37, 99, 235, 0.4);
                transform: translateY(-1px);
            }
            .btn-secondary-action {
                flex: 1;
                padding: 10.5px;
                border: 1px solid #e2e8f0;
                background: #ffffff;
                color: #475569;
                border-radius: 11px;
                cursor: pointer;
                font-size: 13.5px;
                font-weight: 600;
                transition: all 0.15s ease;
            }
            .btn-secondary-action:hover {
                background: #f8fafc;
                color: #0f172a;
            }
        `;
        document.head.appendChild(style);

        overlay = document.createElement('div');
        overlay.id = 'fb-dialog-overlay';
        Object.assign(overlay.style, {
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000000
        });

        const dialog = document.createElement('div');
        dialog.className = 'fb-card';
        dialog.onclick = (e) => e.stopPropagation();

        const curYear = localStorage.report_year || new Date().getFullYear();
        const curCty = localStorage.company_id || "Congty";

        dialog.innerHTML = `
            <div class="fb-header">
                <h3>Tải Bảng Kê Hóa Đơn</h3>
                <button class="fb-close-icon" id="fb_header_close" title="Ẩn hộp thoại">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
            
            <div class="fb-body">
                <div style="margin-bottom: 15px;">
                    <label class="fb-section-label">Mã Công Ty</label>
                    <input type="text" id="company_id" value="${curCty}" class="fb-input">
                </div>

                <!-- Section: Bảng kê hóa đơn -->
                <div class="fb-container">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 10px;">
                        <span class="fb-section-label" style="margin:0;">Bảng kê kết xuất</span>
                        <button type="button" id="btn_toggle_all" style="background:none; border:none; color:#2563eb; font-size:11.5px; font-weight:600; cursor:pointer; padding:0;">
                            Bỏ chọn tất cả
                        </button>
                    </div>
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 8px 12px;">
                        <label class="fb-chk-item">
                            <input type="checkbox" id="chk_ban_cma" name="bkReport" value="ban_cma" checked> Bán ra (Có mã)
                        </label>
                        <label class="fb-chk-item">
                            <input type="checkbox" id="chk_ban_mtt" name="bkReport" value="ban_mtt"> Bán ra (MTT)
                        </label>
                        <label class="fb-chk-item">
                            <input type="checkbox" id="chk_mua_cma" name="bkReport" value="mua_cma" checked> Mua vào (Có mã)
                        </label>
                        <label class="fb-chk-item">
                            <input type="checkbox" id="chk_mua_kma" name="bkReport" value="mua_kma" checked> Mua vào (Không mã)
                        </label>
                        <label class="fb-chk-item" style="grid-column: span 2;">
                            <input type="checkbox" id="chk_mua_mtt" name="bkReport" value="mua_mtt" checked> Mua vào (Máy tính tiền)
                        </label>
                    </div>
                </div>

                <!-- Section: Kỳ tính thuế -->
                <div class="fb-container" style="margin-bottom: 20px;">
                    <span class="fb-section-label" style="margin-bottom: 8px;">Kỳ tính thuế</span>
                    <div style="display:grid; grid-template-columns: 1fr 1.3fr; gap: 12px; margin-bottom: 12px;">
                        <div>
                            <div style="font-size:11px; color:#64748b; margin-bottom:4px; font-weight:500;">Năm kê khai</div>
                            <div class="fb-stepper">
                                <button type="button" class="fb-stepper-btn" onclick="document.getElementById('report_year').stepDown()">—</button>
                                <input type="number" id="report_year" value="${curYear}">
                                <button type="button" class="fb-stepper-btn" onclick="document.getElementById('report_year').stepUp()">+</button>
                            </div>
                        </div>
                        <div>
                            <div style="font-size:11px; color:#64748b; margin-bottom:4px; font-weight:500;">Phạm vi tháng</div>
                            <div style="display:flex; align-items:center; gap:6px;">
                                <input type="number" id="fromM" min="1" max="12" placeholder="Từ" class="fb-input" style="text-align:center; padding: 6px 4px; font-weight: 600;">
                                <span style="color:#94a3b8; font-weight:bold;">–</span>
                                <input type="number" id="toM" min="1" max="12" placeholder="Đến" class="fb-input" style="text-align:center; padding: 6px 4px; font-weight: 600;">
                            </div>
                        </div>
                    </div>

                    <div style="background:#ffffff; padding: 8px; border-radius: 10px; border: 1px solid #e2e8f0;">
                        <div style="display:grid; grid-template-columns:repeat(6, 1fr); gap: 5px;" id="m-grid"></div>
                        <div style="display:flex; gap: 5px; margin-top: 6px;" id="q-grid"></div>
                    </div>
                </div>

                <div style="display:flex; gap:10px;">
                    <button id="close-fb" type="button" class="btn-secondary-action">Ẩn</button>
                    <button id="dl-fb" type="button" class="btn-primary-action">Bắt đầu tải xuống</button>
                </div>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const btnToggleAll = dialog.querySelector('#btn_toggle_all');
        const checkboxes = dialog.querySelectorAll('input[name="bkReport"]');

        btnToggleAll.onclick = () => {
            const hasUnchecked = Array.from(checkboxes).some(cb => !cb.checked);
            checkboxes.forEach(cb => cb.checked = hasUnchecked);
            btnToggleAll.textContent = hasUnchecked ? 'Bỏ chọn tất cả' : 'Chọn tất cả';
        };

        checkboxes.forEach(cb => {
            cb.onchange = () => {
                const allChecked = Array.from(checkboxes).every(c => c.checked);
                btnToggleAll.textContent = allChecked ? 'Bỏ chọn tất cả' : 'Chọn tất cả';
            };
        });

        const getFormData = () => {
            const checkedBoxes = Array.from(document.querySelectorAll('input[name="bkReport"]:checked'));
            return {
                y: document.getElementById('report_year').value,
                cty: document.getElementById('company_id').value,
                selectedReportIds: checkedBoxes.map(chk => chk.value)
            };
        };

        const hideDialog = () => { overlay.style.display = 'none'; };

        const mGrid = dialog.querySelector('#m-grid');
        for (let i = 1; i <= 12; i++) {
            const b = document.createElement('button'); 
            b.className = 'btn-grid-period'; 
            b.type = 'button';
            b.textContent = `T${i}`;
            b.onclick = async () => { 
                const data = getFormData();
                if (data.selectedReportIds.length === 0) {
                    alert('Vui lòng chọn ít nhất một loại bảng kê!');
                    return;
                }
                hideDialog(); 
                await downloadMonthRange(data.y, i, i, data.cty, data.selectedReportIds); 
            };
            mGrid.appendChild(b);
        }

        const qGrid = dialog.querySelector('#q-grid');
        for (let i = 1; i <= 4; i++) {
            const b = document.createElement('button'); 
            b.className = 'btn-grid-period'; 
            b.type = 'button';
            b.style.flex = "1"; 
            b.textContent = `Quý ${i}`;
            b.onclick = async () => { 
                const data = getFormData();
                if (data.selectedReportIds.length === 0) {
                    alert('Vui lòng chọn ít nhất một loại bảng kê!');
                    return;
                }
                hideDialog(); 
                await downloadMonthRange(data.y, (i-1)*3+1, i*3, data.cty, data.selectedReportIds); 
            };
            qGrid.appendChild(b);
        }

        dialog.querySelector('#dl-fb').onclick = async () => {
            const data = getFormData();
            if (data.selectedReportIds.length === 0) {
                alert('Vui lòng chọn ít nhất một loại bảng kê!');
                return;
            }
            const f = Number(document.getElementById('fromM').value) || 1;
            const t = Number(document.getElementById('toM').value) || f;
            
            localStorage.report_year = data.y;
            localStorage.company_id = data.cty;
            
            hideDialog();
            await downloadMonthRange(data.y, f, t, data.cty, data.selectedReportIds);
        };

        dialog.querySelector('#close-fb').onclick = hideDialog;
        dialog.querySelector('#fb_header_close').onclick = hideDialog;
        overlay.onclick = hideDialog;
    }

    showDialog();
    createTriggerButton();
})();
