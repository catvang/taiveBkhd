(function() {
    // --- PHẦN 1: LOGIC XỬ LÝ DỮ LIỆU & TẢI FILE ---

    function formatDateToDDMMYYYY(date) {
        let day = String(date.getDate()).padStart(2, '0');
        let month = String(date.getMonth() + 1).padStart(2, '0');
        let year = date.getFullYear();
        return `${day}/${month}/${year}`;
    }

    function getFirstAndLastDate(month, year) {
        const firstDate = new Date(year, month - 1, 1);
        const lastDate = new Date(year, month, 0);
        return {
            firstDate: formatDateToDDMMYYYY(firstDate),
            lastDate: formatDateToDDMMYYYY(lastDate)
        };
    }

    function getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
        return null;
    }

    async function downloadExcelFile(company, year, month, selectedReportIds) {
        const reports = [
            { id: 'ban_cma', file_name: "BK Ban", link: "query/invoices/export-excel?sort=tdlap:desc,khmshdon:asc,shdon:desc&search=tdlap=ge=01/11/2024T00:00:00;tdlap=le=30/11/2024T23:59:59", action: "ket-xuat" },
            { id: 'ban_mtt', file_name: "BK Ban MTTien", link: "sco-query/invoices/export-excel?sort=tdlap:desc&search=tdlap=ge=01/11/2024T00:00:00;tdlap=le=30/11/2024T23:59:59", action: "ket-xuat" },
            { id: 'mua_cma', file_name: "BK Mua CMa", link: "query/invoices/export-excel-sold?sort=tdlap:desc,khmshdon:asc,shdon:desc&search=tdlap=ge=01/11/2024T00:00:00;tdlap=le=30/11/2024T23:59:59;ttxly==5%20%20%20%20&type=purchase", action: "ket-xuat" },
            { id: 'mua_kma', file_name: "BK Mua KMa", link: "query/invoices/export-excel-sold?sort=tdlap:desc,khmshdon:asc,shdon:desc&search=tdlap=ge=01/11/2024T00:00:00;tdlap=le=30/11/2024T23:59:59;ttxly==6%20%20%20%20&type=purchase", action: "ket-xuat" },
            { id: 'mua_mtt', file_name: "BK Mua MTTien", link: "sco-query/invoices/export-excel-sold?sort=tdlap:desc,khmshdon:asc,shdon:desc&search=tdlap=ge=01/11/2024T00:00:00;tdlap=le=30/11/2024T23:59:59;ttxly==8%20%20%20%20&type=purchase", action: "ket-xuat" }
        ];

        let { firstDate, lastDate } = getFirstAndLastDate(month, year);
        let jwtToken = getCookie('jwt');

        if (!jwtToken) {
            alert('Không tìm thấy Token JWT. Vui lòng đăng nhập lại!');
            return;
        }

        const filteredReports = reports.filter(r => selectedReportIds.includes(r.id));

        for (const report of filteredReports) {
            const url = "https://hoadondientu.gdt.gov.vn/api/" + report.link.replace('01/11/2024', firstDate).replace('30/11/2024', lastDate);
            
            try {
                console.log(`Đang tải: ${report.file_name} T${month}...`);
                const res = await fetch(url, {
                    "headers": {
                        "accept": "application/json, text/plain, */*",
                        "action": report.action,
                        "authorization": `Bearer ${jwtToken}`,
                        "end-point": "/tra-cuu/tra-cuu-hoa-don"
                    },
                    "method": "GET"
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
                
                await new Promise(resolve => setTimeout(resolve, 300));
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

    // --- PHẦN 2: GIAO DIỆN (UI) ---

    function showDialog() {
        if (document.getElementById('fb-dialog-overlay')) return;

        const style = document.createElement('style');
        style.innerHTML = `
            .fb-input { padding: 8px 10px; border: 1px solid #cbd5e0; border-radius: 6px; outline: none; }
            .year-stepper { display: flex; align-items: center; background: #edf2f7; border-radius: 8px; padding: 2px; }
            .year-btn { background: #fff; border: 1px solid #cbd5e0; width: 30px; height: 30px; cursor: pointer; border-radius: 6px; font-weight: bold; }
            .year-btn:hover { background: #3182ce; color: #fff; }
            #report_year { border: none; background: transparent; width: 55px; text-align: center; font-weight: bold; font-size: 15px; }
            .btn-q { padding: 6px; border: 1px solid #e2e8f0; background: #fff; cursor: pointer; border-radius: 6px; font-size: 12px; transition: 0.2s; }
            .btn-q:hover { background: #3182ce; color: #fff; }
            .fb-chk-label { cursor: pointer; user-select: none; display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: #4a5568; }
            .fb-chk-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px; margin-top: 6px; }
            .fb-fieldset { border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 12px; margin-bottom: 12px; }
            .fb-legend { font-size: 11px; font-weight: bold; color: #718096; padding: 0 6px; text-transform: uppercase; }
            .btn-toggle-all { background: none; border: none; color: #3182ce; font-size: 11px; cursor: pointer; padding: 0; text-decoration: underline; font-weight: normal; }
            .btn-toggle-all:hover { color: #2b6cb0; }
        `;
        document.head.appendChild(style);

        const overlay = document.createElement('div');
        overlay.id = 'fb-dialog-overlay';
        Object.assign(overlay.style, {
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000000
        });

        const dialog = document.createElement('div');
        Object.assign(dialog.style, {
            background: '#fff', padding: '22px', borderRadius: '15px', width: '400px', fontFamily: 'sans-serif'
        });

        dialog.onclick = (e) => e.stopPropagation();

        const curYear = localStorage.report_year || new Date().getFullYear();
        const curCty = localStorage.company_id || "Congty";

        dialog.innerHTML = `
            <h3 style="margin:0 0 14px 0; color:#2d3748; text-align:center">Tải bảng kê hóa đơn</h3>
            
            <div style="margin-bottom:12px">
                <label style="font-size:12px; font-weight:bold; color:#718096">MÃ CÔNG TY</label>
                <input type="text" id="company_id" value="${curCty}" class="fb-input" style="width:100%; box-sizing:border-box; margin-top:4px">
            </div>

            <!-- Khung chọn Bảng kê hóa đơn -->
            <fieldset class="fb-fieldset">
                <legend class="fb-legend" style="display:flex; justify-content:space-between; align-items:center; width:calc(100% - 12px);">
                    <span>Bảng kê hóa đơn</span>
                    <button type="button" class="btn-toggle-all" id="btn_toggle_all">Bỏ chọn tất cả</button>
                </legend>
                <div class="fb-chk-grid">
                    <!-- Hàng 1: Bán ra -->
                    <label class="fb-chk-label" for="chk_ban_cma">
                        <input type="checkbox" id="chk_ban_cma" name="bkReport" value="ban_cma" checked> Bán ra (Có mã)
                    </label>
                    <label class="fb-chk-label" for="chk_ban_mtt">
                        <input type="checkbox" id="chk_ban_mtt" name="bkReport" value="ban_mtt"> Bán ra (MTT)
                    </label>
                    
                    <!-- Hàng 2: Mua vào -->
                    <label class="fb-chk-label" for="chk_mua_cma">
                        <input type="checkbox" id="chk_mua_cma" name="bkReport" value="mua_cma" checked> Mua vào (Có mã)
                    </label>
                    <label class="fb-chk-label" for="chk_mua_kma">
                        <input type="checkbox" id="chk_mua_kma" name="bkReport" value="mua_kma" checked> Mua vào (Không mã)
                    </label>

                    <!-- Hàng 3: Mua vào MTT -->
                    <label class="fb-chk-label" for="chk_mua_mtt" style="grid-column: span 2;">
                        <input type="checkbox" id="chk_mua_mtt" name="bkReport" value="mua_mtt" checked> Mua vào (MTT)
                    </label>
                </div>
            </fieldset>

            <!-- Khung chọn Kỳ tính thuế (Năm / Tháng / Quý) -->
            <fieldset class="fb-fieldset" style="background:#fafafa;">
                <legend class="fb-legend">Kỳ tính thuế</legend>
                
                <div style="display:grid; grid-template-columns: 1fr 1.2fr; gap:12px; margin-bottom:10px">
                    <div>
                        <label style="font-size:11px; font-weight:bold; color:#718096">NĂM</label>
                        <div class="year-stepper" style="margin-top:3px">
                            <button class="year-btn" type="button" onclick="document.getElementById('report_year').stepDown()">—</button>
                            <input type="number" id="report_year" value="${curYear}">
                            <button class="year-btn" type="button" onclick="document.getElementById('report_year').stepUp()">+</button>
                        </div>
                    </div>
                    <div>
                        <label style="font-size:11px; font-weight:bold; color:#718096">THÁNG (TỪ - ĐẾN)</label>
                        <div style="display:flex; align-items:center; gap:5px; margin-top:3px">
                            <input type="number" id="fromM" min="1" max="12" placeholder="Từ" class="fb-input" style="flex:1; width:auto; text-align:center; padding:6px 2px">
                            <span style="color:#a0aec0; font-weight:bold">-</span>
                            <input type="number" id="toM" min="1" max="12" placeholder="Đến" class="fb-input" style="flex:1; width:auto; text-align:center; padding:6px 2px">
                        </div>
                    </div>
                </div>

                <div style="background:#fff; padding:8px; border-radius:8px; border:1px solid #edf2f7;">
                    <div style="display:grid; grid-template-columns:repeat(6, 1fr); gap:4px" id="m-grid"></div>
                    <div style="display:flex; gap:4px; margin-top:5px" id="q-grid"></div>
                </div>
            </fieldset>

            <div style="margin-top:16px; display:flex; gap:10px">
                <button id="close-fb" type="button" style="flex:1; padding:10px; border:none; background:#edf2f7; border-radius:8px; cursor:pointer">Hủy</button>
                <button id="dl-fb" type="button" style="flex:2; padding:10px; border:none; background:#3182ce; color:#fff; border-radius:8px; cursor:pointer; font-weight:bold">Tải xuống</button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        // Xử lý nút Chọn tất cả / Bỏ chọn tất cả
        const btnToggleAll = dialog.querySelector('#btn_toggle_all');
        const checkboxes = dialog.querySelectorAll('input[name="bkReport"]');

        btnToggleAll.onclick = () => {
            const hasUnchecked = Array.from(checkboxes).some(cb => !cb.checked);
            checkboxes.forEach(cb => cb.checked = hasUnchecked);
            btnToggleAll.textContent = hasUnchecked ? 'Bỏ chọn tất cả' : 'Chọn tất cả';
        };

        // Cập nhật nhãn nút khi tick chọn thủ công
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

        const mGrid = dialog.querySelector('#m-grid');
        for (let i = 1; i <= 12; i++) {
            const b = document.createElement('button'); 
            b.className = 'btn-q'; 
            b.type = 'button';
            b.textContent = `T${i}`;
            b.onclick = async () => { 
                const data = getFormData();
                if (data.selectedReportIds.length === 0) {
                    alert('Vui lòng chọn ít nhất một loại bảng kê!');
                    return;
                }
                overlay.remove(); 
                await downloadMonthRange(data.y, i, i, data.cty, data.selectedReportIds); 
            };
            mGrid.appendChild(b);
        }

        const qGrid = dialog.querySelector('#q-grid');
        for (let i = 1; i <= 4; i++) {
            const b = document.createElement('button'); 
            b.className = 'btn-q'; 
            b.type = 'button';
            b.style.flex = "1"; 
            b.textContent = `Q${i}`;
            b.onclick = async () => { 
                const data = getFormData();
                if (data.selectedReportIds.length === 0) {
                    alert('Vui lòng chọn ít nhất một loại bảng kê!');
                    return;
                }
                overlay.remove(); 
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
            
            overlay.remove();
            await downloadMonthRange(data.y, f, t, data.cty, data.selectedReportIds);
        };

        dialog.querySelector('#close-fb').onclick = () => overlay.remove();
        overlay.onclick = () => overlay.remove();
    }

    showDialog();
})();
