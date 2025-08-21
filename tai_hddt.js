function taive() {
    document.querySelector(
      "#__next > section > section > main > div > div > div > div > div.ant-tabs-content.ant-tabs-content-animated.ant-tabs-top-content > div.ant-tabs-tabpane.ant-tabs-tabpane-active > div.ant-row > div:nth-child(2) > div.ant-row-flex.ant-row-flex-space-between.ant-row-flex-middle > div:nth-child(2) > div > div:nth-child(8) > button"
    ).click();
  }

  document.querySelectorAll("table > tbody > tr").forEach(row => {
    const sellerInfo = row.querySelector("td:nth-child(6)");
    const invoiceCell = row.querySelector("td:nth-child(4)");

    sellerInfo.innerHTML = sellerInfo.innerHTML
      .replace(/Tên người (bán|mua): |MST người (bán|mua): |<br>/g, " - ")
      .replace(/^ - /, ""); // Loại bỏ dấu đầu tiên nếu có
	if (!invoiceCell.querySelector('button[name="tai_ve"]')) {
		invoiceCell.innerHTML += `<br><button onclick="this.parentElement.click(); taive()" style="border: aliceblue; border-radius: 4px;" class="ant-btn-primary" name="tai_ve">Tải về</button>`;
	}
  });

// Hàm delay (trả Promise chờ ms milliseconds)
function delay(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

// Hàm tải tất cả với delay 1 giây giữa mỗi nút
async function tai_ve_hdon() {
const buttons = document.querySelectorAll('button[name="tai_ve"]');
for (let i = 0; i < buttons.length; i++) {
  buttons[i].click();
  console.log(`Đã bấm nút ${i + 1}`);
  await delay(1000); // chờ 1 giây
}
console.log('Tải xong tất cả.');
};

 tai_ve_hdon();
 
//  javascript: document.head.appendChild(Object.assign(document.createElement('script'), {src: 'https://cdn.jsdelivr.net/gh/catvang/taiveBkhd@main/nut_tai_ve.js'}));
