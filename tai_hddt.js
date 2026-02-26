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
            minWidth: '280px',
            transition: 'all 0.3s'
        });
        document.body.appendChild(statusBox);
    }

    // Hàm cập nhật nội dung thông báo
    function updateStatus(message, isDone = false) {
        statusBox.style.display = 'block';
        statusBox.innerHTML = `
            <div style="font-weight:bold; margin-bottom:5px; color:#3182ce; display:flex; justify-content:between;">
                <span>${isDone ? '✅ Hoàn thành' : '⏳ Đang tải...'}</span>
            </div>
            <div style="font-size:13px; line-height: 1.5;">${message}</div>
        `;
        if (isDone) {
            statusBox.style.borderLeftColor = '#48bb78';
            setTimeout(() => { statusBox.style.display = 'none'; }, 4000);
        }
    }

    // Hàm click nút tải hệ thống
    window.taive = function() {
        const selector = "#__next > section > section > main > div > div > div > div > div.ant-tabs-content.ant-tabs-content-animated.ant-tabs-top-content > div.ant-tabs-tabpane.ant-tabs-tabpane-active > div.ant-row > div:nth-child(2) > div.ant-row-flex.ant-row-flex-space-between.ant-row-flex-middle > div:nth-child(2) > div > div:nth-child(8) > button";
        const btn = document.querySelector(selector);
        if (btn) btn.click();
    };

    // 2. Gắn nút "Tải về" và làm sạch text
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
            invoiceCell.innerHTML += `<br><button onclick="this.parentElement.click(); taive()" style="border: none; border-radius: 4px; padding: 2px 8px; cursor:pointer; background:#1890ff; color:#fff;" name="tai_ve">Tải về</button>`;
        }
    });

    function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

    // 3. Hàm tải tất cả với hiển thị Tên đơn vị + Số hóa đơn
    async function tai_ve_hdon() {
        const buttons = document.querySelectorAll('button[name="tai_ve"]');
        
        if (buttons.length === 0) {
            updateStatus("Không tìm thấy hóa đơn nào.", true);
            return;
        }

        for (let i = 0; i < buttons.length; i++) {
            const row = buttons[i].closest('tr');
            
            // Lấy tên đơn vị (Cột 6)
            const sellerText = row.querySelector('td:nth-child(6)')?.innerText || "";
            const name = sellerText.split('-')[0].trim();
            
            // Lấy Số hóa đơn (Cột 5 - ô liền kề phía sau cột nút bấm)
            const invoiceNo = row.querySelector('td:nth-child(5)')?.innerText.trim() || "N/A";
            
            updateStatus(`
                <b>Ngày:</b> ${name}<br>
                <b>Số HĐ:</b> <span style="color:#e53e3e; font-weight:bold;">${invoiceNo}</span><br>
                <small style="color:#718096;">Tiến độ: ${i + 1}/${buttons.length}</small>
            `);
            
            buttons[i].click();
            await delay(1200); 
        }
        
        updateStatus(`Đã tải xong toàn bộ ${buttons.length} hóa đơn.`, true);
    };

    // Thực thi
    tai_ve_hdon();
})();
