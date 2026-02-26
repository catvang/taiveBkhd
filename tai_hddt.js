(function() {
    // 1. Tạo hoặc lấy cửa sổ thông báo (Status Box)
    let statusBox = document.getElementById('fb-download-status');
    if (!statusBox) {
        statusBox = document.createElement('div');
        statusBox.id = 'fb-download-status';
        Object.assign(statusBox.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '15px 20px',
            background: '#fff',
            borderLeft: '5px solid #3182ce',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            zIndex: '1000001',
            borderRadius: '8px',
            fontFamily: 'Segoe UI, Arial, sans-serif',
            fontSize: '14px',
            color: '#2d3748',
            minWidth: '250px',
            transition: 'all 0.3s'
        });
        document.body.appendChild(statusBox);
    }

    // Hàm cập nhật nội dung thông báo
    function updateStatus(message, isDone = false) {
        statusBox.style.display = 'block';
        statusBox.innerHTML = `
            <div style="font-weight:bold; margin-bottom:5px; color:#3182ce">
                ${isDone ? '✅ Hoàn thành' : '⏳ Đang xử lý...'}
            </div>
            <div style="font-size:13px">${message}</div>
        `;
        if (isDone) {
            statusBox.style.borderLeftColor = '#48bb78';
            setTimeout(() => { statusBox.style.display = 'none'; }, 3000); // Ẩn sau 3s khi xong
        }
    }

    // Hàm click nút tải hệ thống (giữ nguyên logic của bạn)
    window.taive = function() {
        const selector = "#__next > section > section > main > div > div > div > div > div.ant-tabs-content.ant-tabs-content-animated.ant-tabs-top-content > div.ant-tabs-tabpane.ant-tabs-tabpane-active > div.ant-row > div:nth-child(2) > div.ant-row-flex.ant-row-flex-space-between.ant-row-flex-middle > div:nth-child(2) > div > div:nth-child(8) > button";
        const btn = document.querySelector(selector);
        if (btn) btn.click();
    };

    // 2. Gắn nút "Tải về" vào từng dòng table (giữ nguyên logic xử lý text của bạn)
    document.querySelectorAll("table > tbody > tr").forEach(row => {
        const sellerInfo = row.querySelector("td:nth-child(6)");
        const invoiceCell = row.querySelector("td:nth-child(4)");

        if (sellerInfo && !sellerInfo.dataset.cleaned) {
            sellerInfo.innerHTML = sellerInfo.innerHTML
                .replace(/Tên người (bán|mua): |MST người (bán|mua): |<br>/g, " - ")
                .replace(/^ - /, "");
            sellerInfo.dataset.cleaned = "true";
        }

        if (invoiceCell && !invoiceCell.querySelector('button[name="tai_ve"]')) {
            invoiceCell.innerHTML += `<br><button onclick="this.parentElement.click(); taive()" style="border: none; border-radius: 4px; padding: 2px 8px; cursor:pointer;" class="ant-btn-primary" name="tai_ve">Tải về</button>`;
        }
    });

    function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    // 3. Hàm tải tất cả có hiển thị thông báo
    async function tai_ve_hdon() {
        const rows = document.querySelectorAll('table > tbody > tr');
        const buttons = document.querySelectorAll('button[name="tai_ve"]');
        
        if (buttons.length === 0) {
            updateStatus("Không tìm thấy hóa đơn nào để tải.", true);
            return;
        }

        for (let i = 0; i < buttons.length; i++) {
            const row = buttons[i].closest('tr');
            // Lấy tên người bán/mua từ cột 6 để hiển thị lên thông báo
            const name = row.querySelector('td:nth-child(6)')?.innerText.split('-')[0].trim() || "Hóa đơn";
            
            updateStatus(`Đang tải (${i + 1}/${buttons.length}):<br><b>${name}</b>`);
            
            buttons[i].click();
            await delay(1200); // Tăng nhẹ delay lên 1.2s để hệ thống kịp xử lý
        }
        
        updateStatus(`Đã tải xong toàn bộ ${buttons.length} hóa đơn.`, true);
    };

    // Chạy lệnh tải
    tai_ve_hdon();
})();
