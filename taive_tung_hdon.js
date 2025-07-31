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
 
 //  javascript: document.head.appendChild(Object.assign(document.createElement('script'), {src: 'https://cdn.jsdelivr.net/gh/catvang/taiveBkhd@main/taive_tung_hdon.js'}));