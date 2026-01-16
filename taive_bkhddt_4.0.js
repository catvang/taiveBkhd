function formatDateToDDMMYYYY(date) {
    let day = String(date.getDate()).padStart(2, '0'); // Get day and pad with leading zero
    let month = String(date.getMonth() + 1).padStart(2, '0'); // Get month (0-based) and pad with leading zero
    let year = date.getFullYear(); // Get the full year

    return `${day}/${month}/${year}`; // Format as DD/MM/YYYY
}

function getFirstAndLastDate(month, year) {
    // Month is 0-based (January is 0, February is 1, etc.)
    const firstDate = new Date(year, month - 1, 1); // First day of the month
    const lastDate = new Date(year, month, 0); // Last day of the month

    return {
        firstDate: formatDateToDDMMYYYY(firstDate),
        lastDate: formatDateToDDMMYYYY(lastDate)
    };
}

// Utility function to get a cookie by name
function getCookie(name) {
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop().split(';').shift();
    return null;
}

// Function to fetch and download an Excel file
function downloadExcelFile(company, year, month, group) {

    let reports = [
        {
            group: 'ban',
            file_name: "BK Ban",
            link: "query/invoices/export-excel?sort=tdlap:desc,khmshdon:asc,shdon:desc&search=tdlap=ge=01/11/2024T00:00:00;tdlap=le=30/11/2024T23:59:59",
            action: "Xu%E1%BA%A5t%20h%C3%B3a%20%C4%91%C6%A1n%20(h%C3%B3a%20%C4%91%C6%A1n%20b%C3%A1n%20ra)"
        },
        {
            group: 'mua',
            file_name: "BK Mua CMa",
            link: "query/invoices/export-excel-sold?sort=tdlap:desc,khmshdon:asc,shdon:desc&search=tdlap=ge=01/11/2024T00:00:00;tdlap=le=30/11/2024T23:59:59;ttxly==5%20%20%20%20&type=purchase",
            action: "Xu%E1%BA%A5t%20h%C3%B3a%20%C4%91%C6%A1n%20(h%C3%B3a%20%C4%91%C6%A1n%20mua%20v%C3%A0o)"
        },
        {
            group: 'mua',
            file_name: "BK Mua KMa",
            link: "query/invoices/export-excel-sold?sort=tdlap:desc,khmshdon:asc,shdon:desc&search=tdlap=ge=01/11/2024T00:00:00;tdlap=le=30/11/2024T23:59:59;ttxly==6%20%20%20%20&type=purchase",
            action: "Xu%E1%BA%A5t%20h%C3%B3a%20%C4%91%C6%A1n%20(h%C3%B3a%20%C4%91%C6%A1n%20mua%20v%C3%A0o)"
        },
        {
            group: 'mua',
            file_name: "BK Mua MTTien",
            link: "sco-query/invoices/export-excel-sold?sort=tdlap:desc,khmshdon:asc,shdon:desc&search=tdlap=ge=01/11/2024T00:00:00;tdlap=le=30/11/2024T23:59:59;ttxly==8%20%20%20%20&type=purchase",
            action: "Xu%E1%BA%A5t%20h%C3%B3a%20%C4%91%C6%A1n%20(h%C3%B3a%20%C4%91%C6%A1n%20m%C3%A1y%20t%C3%ADnh%20ti%E1%BB%81n%20mua%20v%C3%A0o)"
        }
    ];

    let { firstDate, lastDate } = getFirstAndLastDate(month, year);

    let jwtToken = getCookie('jwt'); // Replace 'jwt' with the name of your cookie

    if (!jwtToken) {
        console.error('JWT token not found in cookies');
        return;
    }
    reports
        .filter(report => (group === "all" || group === undefined || report.group === group))
        .forEach(report => {

            // Fetch the file
            fetch("https://hoadondientu.gdt.gov.vn:30000/" + report.link.replace('01/11/2024', firstDate).replace('30/11/2024', lastDate), {
                "headers": {
                    "accept": "application/json, text/plain, */*",
                    "accept-language": "vi",
                    "action": report.action,
                    'authorization': `Bearer ${jwtToken}`, // Include the JWT token
                    "end-point": "/tra-cuu/tra-cuu-hoa-don",
                    "sec-ch-ua": "\"Google Chrome\";v=\"131\", \"Chromium\";v=\"131\", \"Not_A Brand\";v=\"24\"",
                    "sec-ch-ua-mobile": "?0",
                    "sec-ch-ua-platform": "\"Windows\"",
                    "sec-fetch-dest": "empty",
                    "sec-fetch-mode": "cors",
                    "sec-fetch-site": "same-site",
                    credentials: 'include', // Include cookies in the request
                    "Referrer-Policy": "strict-origin-when-cross-origin"
                },
                "body": null,
                "method": "GET"
            })
                .then(response => {
                    if (!response.ok) {
                        throw new Error('Network response was not ok');
                    }
                    return response.blob(); // Get the file as a Blob
                })
                .then(blob => {
                    // Create a URL for the Blob
                    const downloadUrl = URL.createObjectURL(blob);

                    // Create a temporary <a> element
                    const a = document.createElement('a');
                    a.href = downloadUrl;
                    a.download = `${company} ${report.file_name} T${month} ${year}.xlsx`; // The file name to save as
                    document.body.appendChild(a);
                    a.click(); // Trigger the download

                    // Clean up
                    document.body.removeChild(a);
                    URL.revokeObjectURL(downloadUrl);
                })
                .catch(error => {
                    console.error('There was an error downloading the file:', error);
                });
        });
}

function downloadMonthRange(year, fromMonth, toMonth) {
    const company = document.getElementById('company_id').value;
    const group = document.querySelector('input[name="loaiHd"]:checked').value;

    for (let i = fromMonth; i <= toMonth; i++) {
        downloadExcelFile(company, year, i, group);
    }
}

function getSelectedReportYear() {
    const now = new Date();
    const picked = document.querySelector('input[name="nam_bcao"]:checked');
    const offset = picked ? Number(picked.value.split('_')[1]) : 0; // nam_0..nam_3
    return now.getFullYear() - offset;
}

function downloadSelectedYearMonth(month) {
    const y = getSelectedReportYear();
    downloadMonthRange(y, month, month);
    document.getElementById('cancelBtn')?.click();
}

function downloadSelectedYearQuarter(q) {
    const y = getSelectedReportYear();
    const fromMonth = (q - 1) * 3 + 1;
    const toMonth = q * 3;
    downloadMonthRange(y, fromMonth, toMonth);
    document.getElementById('cancelBtn')?.click();
}


function getDateRange(type) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth(); // 0-based

    let fromYear = year, fromMonth = month + 1;
    let toMonth = month + 1;

    switch (type) {
        case 'this_month':
            break;

        case 'last_month': {
            const d = new Date(year, month - 1, 1);
            fromYear = d.getFullYear();
            fromMonth = d.getMonth() + 1;
            toMonth = fromMonth;
            break;
        }

        case 'this_quarter': {
            const q = Math.floor(month / 3);
            fromMonth = q * 3 + 1;
            toMonth = fromMonth + 2;
            break;
        }

        case 'last_quarter': {
            const q = Math.floor(month / 3) - 1;
            const d = new Date(year, q * 3, 1);
            fromYear = d.getFullYear();
            fromMonth = d.getMonth() + 1;
            toMonth = fromMonth + 2;
            break;
        }

        default:
            throw new Error('Invalid type');
    }

    downloadMonthRange(fromYear, fromMonth, toMonth);
    document.getElementById('cancelBtn').click();
}

function showDialog() {

    let company_id = localStorage.company_id || "Congty";

    // Create overlay
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = 0;
    overlay.style.left = 0;
    overlay.style.right = 0;
    overlay.style.bottom = 0;
    overlay.style.background = 'rgba(0,0,0,0.5)';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.zIndex = 1000;

    // Create dialog box
    const dialog = document.createElement('div');
    dialog.style.background = '#fff';
    dialog.style.padding = '20px';
    dialog.style.borderRadius = '8px';
    dialog.style.boxShadow = '0 0 10px #00000050';
    dialog.style.minWidth = '300px';

    // Dialog content
    dialog.innerHTML = `
    <label>Mã Cty:</label><br>
    <input type="text" id="company_id" value="${company_id}">
    <br><br>

    <label for="loaiHd">Loại hóa đơn: </label>
        <input type="radio" name="loaiHd" value="all" checked> Tất cả
        <input type="radio" name="loaiHd" value="mua" > Mua
        <input type="radio" name="loaiHd" value="ban" > Bán
    <br><br>

    <label>Từ tháng:</label>
    <input type="number" id="fromMonth" min="1" max="12">

    <label>Đến tháng<button id="cungThangBtn">(cùng tháng):</button></label>
    <input type="number" id="toMonth" min="1" max="12">
    <br><br>

    <label for="nam_bcao">Năm báo cáo: </label>
        <input type="radio" name="nam_bcao" value="nam_0" checked> Năm nay
        <input type="radio" name="nam_bcao" value="nam_1" > Năm trước
        <input type="radio" name="nam_bcao" value="nam_2" > Hai Năm trước
        <input type="radio" name="nam_bcao" value="nam_3" > Ba Năm trước
    <br>
    <button id="okBtn">OK</button>
    <button id="cancelBtn">Cancel</button>
    <br><br>

    <strong>Hoặc chọn nhanh:</strong><br>
    <button id="thangNay" onclick="getDateRange('this_month')">Tháng này</button>
    <button id="thangTruoc" onclick="getDateRange('last_month')">Tháng trước</button>
    <button id="quyNay" onclick="getDateRange('this_quarter')">Quý này</button>
    <button id="quyTruoc" onclick="getDateRange('last_quarter')">Quý trước</button>

    <br><br>
    <strong>Chọn nhanh theo Năm báo cáo:</strong><br>
    <div id="quickPrevYearMonths" style="display:flex;flex-wrap:wrap;gap:6px;margin:6px 0;"></div>
    <div id="quickPrevYearQuarters" style="display:flex;flex-wrap:wrap;gap:6px;margin:6px 0;"></div>
  `;

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
	
    const companyInput = dialog.querySelector('#company_id');
	companyInput.addEventListener('input', (e) => {
		localStorage.company_id = e.target.value;
	});

// Restore "Năm báo cáo" from localStorage and persist on change
const savedNamBaoCao = localStorage.nam_bcao || 'nam_0';
const savedRadio = dialog.querySelector(`input[name="nam_bcao"][value="${savedNamBaoCao}"]`);
if (savedRadio) savedRadio.checked = true;

dialog.querySelectorAll('input[name="nam_bcao"]').forEach(r => {
    r.addEventListener('change', (e) => {
        localStorage.nam_bcao = e.target.value;
    });
});


    // Render quick buttons for previous year
    const monthsWrap = dialog.querySelector('#quickPrevYearMonths');
    for (let m = 1; m <= 12; m++) {
        const btn = document.createElement('button');
        btn.textContent = `T${m}`;
        btn.onclick = () => downloadSelectedYearMonth(m);
        monthsWrap.appendChild(btn);
    }

    const quartersWrap = dialog.querySelector('#quickPrevYearQuarters');
    for (let q = 1; q <= 4; q++) {
        const btn = document.createElement('button');
        btn.textContent = `Quý ${q}`;
        btn.onclick = () => downloadSelectedYearQuarter(q);
        quartersWrap.appendChild(btn);
    }

    // Button handlers
    dialog.querySelector('#okBtn').onclick = () => {
        let tu_thang = Number(document.getElementById('fromMonth').value);
        let den_thang = Number(document.getElementById('toMonth').value);
        let now = new Date();
        let year = now.getFullYear() + -document.querySelector('input[name="nam_bcao"]:checked').value.split('_')[1];

        downloadMonthRange(year, tu_thang, den_thang);

        localStorage.company_id = document.getElementById("company_id").value;
        document.body.removeChild(overlay);
    };

    dialog.querySelector('#cungThangBtn').onclick = (e) => {
        e.preventDefault();
        document.getElementById('toMonth').value = document.getElementById('fromMonth').value;
    };

    dialog.querySelector('#cancelBtn').onclick = () => {
        document.body.removeChild(overlay);
    };
}
showDialog();
