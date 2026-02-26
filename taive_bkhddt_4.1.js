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

    function downloadExcelFile(company, year, month, group) {
        let reports = [
            { group: 'ban', file_name: "BK Ban", link: "query/invoices/export-excel?sort=tdlap:desc,khmshdon:asc,shdon:desc&search=tdlap=ge=01/11/2024T00:00:00;tdlap=le=30/11/2024T23:59:59", action: "Xu%E1%BA%A5t%20h%C3%B3a%20%C4%91%C6%A1n%20(h%C3%B3a%20%C4%91%C6%A1n%20b%C3%A1n%20ra)" },
            { group: 'mua', file_name: "BK Mua CMa", link: "query/invoices/export-excel-sold?sort=tdlap:desc,khmshdon:asc,shdon:desc&search=tdlap=ge=01/11/2024T00:00:00;tdlap=le=30/11/2024T23:59:59;ttxly==5%20%20%20%20&type=purchase", action: "Xu%E1%BA%A5t%20h%C3%B3a%20%C4%91%C6%A1n%20(h%C3%B3a%20%C4%91%C6%A1n%20mua%20v%C3%A0o)" },
            { group: 'mua', file_name: "BK Mua KMa", link: "query/invoices/export-excel-sold?sort=tdlap:desc,khmshdon:asc,shdon:desc&search=tdlap=ge=01/11/2024T00:00:00;tdlap=le=30/11/2024T23:59:59;ttxly==6%20%20%20%20&type=purchase", action: "Xu%E1%BA%A5t%20h%C3%B3a%20%C4%91%C6%A1n%20(h%C3%B3a%20%C4%91%C6%A1n%20mua%20v%C3%A0o)" },
            { group: 'mua', file_name: "BK Mua MTTien", link: "sco-query/invoices/export-excel-sold?sort=tdlap:desc,khmshdon:asc,shdon:desc&search=tdlap=ge=01/11/2024T00:00:00;tdlap=le=30/11/2024T23:59:59;ttxly==8%20%20%20%20&type=purchase", action: "Xu%E1%BA%A5t%20h%C3%B3a%20%C4%91%C6%A1n%20(h%C3%B3a%20%C4%91%C6%A1n%20m%C3%A1y%20t%C3%ADnh%20ti%E1%BB%81n%20mua%20v%C3%A0o)" }
        ];

        let { firstDate, lastDate } = getFirstAndLastDate(month, year);
        let jwtToken = getCookie('jwt');

        if (!jwtToken) {
            alert('Không tìm thấy Token JWT. Vui lòng đăng nhập lại!');
            return;
        }

        reports.filter(r => (group === "all" || group === undefined || r.group === group))
            .forEach(report => {
                const url = "https://hoadondientu.gdt.gov.vn:30000/" + report.link.replace('01/11/2024', firstDate).replace('30/11/2024', lastDate);
                
                fetch(url, {
                    "headers": {
                        "accept": "application/json, text/plain, */*",
                        "action": report.action,
                        "authorization": `Bearer ${jwtToken}`,
                        "end-point": "/tra-cuu/tra-cuu-hoa-don"
                    },
                    "method": "GET"
                })
                .then(res => res.ok ? res.blob() : Promise.reject('Error'))
                .then(blob => {
                    const downloadUrl = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = downloadUrl;
                    a.download = `${company} ${report.file_name} T${month} ${year}.xlsx`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(downloadUrl);
                })
                .catch(err => console.error('Lỗi tải file:', err));
            });
    }

    function downloadMonthRange(year, fromMonth, toMonth) {
        const company = document.getElementById('company_id').value;
        const group = document.querySelector('input[name="loaiHd"]:checked').value;
        for (let i = fromMonth; i <= toMonth; i++) {
            downloadExcelFile(company, year, i, group);
        }
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
            background: '#fff', padding: '25px', borderRadius: '15px', width: '380px', fontFamily: 'sans-serif'
        });

        const curYear = localStorage.report_year || new Date().getFullYear();
        const curCty = localStorage.company_id || "Congty";

        dialog.innerHTML = `
            <h3 style="margin:0 0 15px 0; color:#2d3748; text-align:center">Tải bảng kê hóa đơn</h3>
            <div style="margin-bottom:12px">
                <label style="font-size:12px; font-weight:bold; color:#718096">MÃ CÔNG TY</label>
                <input type="text" id="company_id" value="${curCty}" class="fb-input" style="width:100%; box-sizing:border-box; margin-top:4px">
            </div>
            <div style="margin-bottom:12px">
                <label style="font-size:12px; font-weight:bold; color:#718096">LOẠI HÓA ĐƠN</label>
                <div style="display:flex; gap:15px; margin-top:4px">
                    <label><input type="radio" name="loaiHd" value="all" checked> Tất cả</label>
                    <label><input type="radio" name="loaiHd" value="mua"> Mua</label>
                    <label><input type="radio" name="loaiHd" value="ban"> Bán</label>
                </div>
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px; margin-bottom:15px">
                <div>
                    <label style="font-size:12px; font-weight:bold; color:#718096">NĂM</label>
                    <div class="year-stepper" style="margin-top:4px">
                        <button class="year-btn" onclick="document.getElementById('report_year').stepDown()">—</button>
                        <input type="number" id="report_year" value="${curYear}">
                        <button class="year-btn" onclick="document.getElementById('report_year').stepUp()">+</button>
                    </div>
                </div>
                <div>
                    <label style="font-size:12px; font-weight:bold; color:#718096">THÁNG (TỪ - ĐẾN)</label>
                    <div style="display:flex; align-items:center; gap:3px; margin-top:4px">
                        <input type="number" id="fromM" min="1" max="12" class="fb-input" style="width:40px">
                        <span>-</span>
                        <input type="number" id="toM" min="1" max="12" class="fb-input" style="width:40px">
                    </div>
                </div>
            </div>
            <div style="background:#f7fafc; padding:10px; border-radius:10px">
                <div style="display:grid; grid-template-columns:repeat(6, 1fr); gap:4px" id="m-grid"></div>
                <div style="display:flex; gap:4px; margin-top:5px" id="q-grid"></div>
            </div>
            <div style="margin-top:20px; display:flex; gap:10px">
                <button id="close-fb" style="flex:1; padding:10px; border:none; background:#edf2f7; border-radius:8px; cursor:pointer">Hủy</button>
                <button id="dl-fb" style="flex:2; padding:10px; border:none; background:#3182ce; color:#fff; border-radius:8px; cursor:pointer; font-weight:bold">Tải xuống</button>
            </div>
        `;

        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        // Render nút nhanh
        const mGrid = dialog.querySelector('#m-grid');
        for (let i = 1; i <= 12; i++) {
            const b = document.createElement('button'); b.className = 'btn-q'; b.textContent = `T${i}`;
            b.onclick = () => { downloadMonthRange(document.getElementById('report_year').value, i, i); overlay.remove(); };
            mGrid.appendChild(b);
        }

        const qGrid = dialog.querySelector('#q-grid');
        for (let i = 1; i <= 4; i++) {
            const b = document.createElement('button'); b.className = 'btn-q'; b.style.flex = "1"; b.textContent = `Q${i}`;
            b.onclick = () => { 
                const y = document.getElementById('report_year').value;
                downloadMonthRange(y, (i-1)*3+1, i*3); 
                overlay.remove(); 
            };
            qGrid.appendChild(b);
        }

        // Event buttons
        dialog.querySelector('#dl-fb').onclick = () => {
            const y = document.getElementById('report_year').value;
            const f = Number(document.getElementById('fromM').value) || 1;
            const t = Number(document.getElementById('toM').value) || f;
            localStorage.report_year = y;
            localStorage.company_id = document.getElementById('company_id').value;
            downloadMonthRange(y, f, t);
            overlay.remove();
        };

        dialog.querySelector('#close-fb').onclick = () => overlay.remove();
        overlay.onclick = (e) => e.target === overlay && overlay.remove();
    }

    showDialog();
})();
