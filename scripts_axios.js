// === 設定與定義 ===
const CROP_CODE = 'G3'; // G3 代表 酪梨
const COLUMNS = ['市場名稱', '上價', '中價', '下價', '平均價', '交易量'];

// 採用最直覺且相容 Axios 網址參數的 CORS 代理
const CORS_PROXY = 'https://cors-anywhere.herokuapp.com/'; 
const API_URL = 'https://data.moa.gov.tw/Service/OpenData/FromM/FarmTransData.aspx';

// 保持分離對照：API 查詢用 code，表格渲染用 name
const MARKET_MAP = [
    { code: '台北一', name: '台北一市' },
    { code: '台北二', name: '台北二市' },
    { code: '三重區', name: '三重區' },
    { code: '板橋區', name: '板橋區' },
    { code: '桃農',   name: '桃農' },
    { code: '豐原區', name: '豐原區' },
    { code: '台中市', name: '台中市' },
    { code: '高雄市', name: '高雄市' },
    { code: '鳳山區', name: '鳳山區' }
];

let cachedRawData = []; 
let currentSort = { column: 'market', state: 'none' };

// 取得當天民國日期的字串 (格式如: 115.07.14)
function getTodayMinguoStr() {
    const date = new Date();
    const minguoYear = date.getFullYear() - 1911;
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${minguoYear}.${month}.${day}`;
}

const TODAY_STR = getTodayMinguoStr();

/**
 * 嚴格限定抓取今日資料的 Axios 請求
 */
async function fetchFarmData(cropCode, marketCode, dateStr) {
    try {
        // 直接將代理拼在 API URL 前面，讓 Axios 的 params 自動處理後續組合與轉碼
        const response = await axios.get(`${CORS_PROXY}${API_URL}`, {
            params: {
                'CropCode': cropCode,
                'Market': marketCode,
                'StartDate': dateStr,
                'EndDate': dateStr
            },
            headers: {
                'X-Requested-With': 'XMLHttpRequest'
            }
        });
        
        return response.data;
    } catch (error) {
        console.error(`今日市場 [${marketCode}] 請求失敗:`, error.message);
        return null;
    }
}

function toggleSort(type) {
    if (currentSort.column === type) {
        if (currentSort.state === 'none') currentSort.state = 'desc';
        else if (currentSort.state === 'desc') currentSort.state = 'asc';
        else currentSort.state = 'none';
    } else {
        currentSort.column = type;
        currentSort.state = 'desc';
    }

    document.querySelectorAll('th.sortable').forEach(th => {
        th.classList.remove('asc', 'desc');
    });
    
    if (currentSort.state !== 'none') {
        const activeTh = document.getElementById(`th-${type}`);
        if (activeTh) activeTh.classList.add(currentSort.state);
    }

    renderTable();
}

function renderTable() {
    const tableBody = document.getElementById('price-table-body');
    let displayItems = [...cachedRawData];

    displayItems.sort((a, b) => {
        if (a.isRest) return 1;
        if (b.isRest) return -1;
        
        if (currentSort.state === 'none') {
            return a.originalIndex - b.originalIndex;
        }

        let valA, valB;
        switch(currentSort.column) {
            case 'market':
                valA = a.originalIndex; valB = b.originalIndex; break;
            case 'high':
                valA = Number(a['上價']); valB = Number(b['上價']); break;
            case 'mid':
                valA = Number(a['中價']); valB = Number(b['中價']); break;
            case 'low':
                valA = Number(a['下價']); valB = Number(b['下價']); break;
            case 'price':
                valA = Number(a['平均價']); valB = Number(b['平均價']); break;
            case 'volume':
                valA = Number(a['交易量']); valB = Number(b['交易量']); break;
            default:
                return 0;
        }
        return currentSort.state === 'desc' ? valB - valA : valA - valB;
    });

    let htmlRows = "";
    displayItems.forEach(item => {
        htmlRows += "<tr>";
        if (item.isRest) {
            htmlRows += `<td>${item['市場名稱']}</td><td colspan="5" class="text-center text-muted">[本日休市 / 尚無當日資料]</td>`;
        } else {
            COLUMNS.forEach(col => {
                let value = item[col] !== undefined ? item[col] : '';
                if (col === '交易量' && !isNaN(value) && value !== '') {
                    value = Number(value).toLocaleString();
                }
                htmlRows += `<td>${value}</td>`;
            });
        }
        htmlRows += "</tr>";
    });

    tableBody.innerHTML = htmlRows || `<tr><td colspan="6" class="text-center text-danger">全部市場皆查無資料。</td></tr>`;
}

/**
 * 初始化看板：純粹鎖定今日，並加上無效數據與 0 值過濾
 */
async function initDashboard() {
    document.getElementById('title').innerText = `今日酪梨市場價格（民國 ${TODAY_STR}）`;
    cachedRawData = [];

    for (let i = 0; i < MARKET_MAP.length; i++) {
        const target = MARKET_MAP[i];
        
        let data = await fetchFarmData(CROP_CODE, target.code, TODAY_STR);

        // 檢查是否有抓到資料
        if (data && data.length > 0) {
            let hasValidData = false;

            data.forEach(item => {
                // 💡 關鍵修正：將字串轉為數字，判定是否為無效交易（都是 0 的資料）
                const avgPrice = Number(item['平均價']) || 0;
                const volume = Number(item['交易量']) || 0;

                // 只有當平均價或交易量大於 0 時，才視為有效資料
                if (avgPrice > 0 || volume > 0) {
                    item.originalIndex = i; 
                    item['市場名稱'] = target.name; 
                    cachedRawData.push(item);
                    hasValidData = true;
                }
            });

            // 如果該市場回傳的全部都是 0 的無效交易，則手動塞入休市提示
            if (!hasValidData) {
                cachedRawData.push({ '市場名稱': target.name, 'isRest': true, 'originalIndex': i });
            }

        } else {
            // API 回傳空陣列（如台中市、豐原區今日尚無資料或休市）
            cachedRawData.push({ '市場名稱': target.name, 'isRest': true, 'originalIndex': i });
        }
    }

    renderTable();
}

document.addEventListener('DOMContentLoaded', initDashboard);
