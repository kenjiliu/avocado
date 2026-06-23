// === 設定與定義 ===
const CROP_CODE = 'G3';
const MARKETS = ['台北一', '台北二', '三重區', '板橋區', '桃農', '豐原區', '台中市', '高雄市', '鳳山區'];
const COLUMNS = ['市場名稱', '上價', '中價', '下價', '平均價', '交易量'];
const API_URL = 'https://data.moa.gov.tw/Service/OpenData/FromM/FarmTransData.aspx';

let cachedRawData = []; 

// 紀錄目前的排序欄位與狀態: 'none' (預設), 'asc' (低到高), 'desc' (高到低)
let currentSort = {
    column: 'market', 
    state: 'none'
};

function getMinguoDate(daysOffset = 0) {
    const date = new Date();
    date.setDate(date.getDate() + daysOffset);
    const minguoYear = date.getFullYear() - 1911;
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${minguoYear}.${month}.${day}`;
}

const TODAY = getMinguoDate(0);

async function fetchFarmData(cropCode, market, date) {
    const params = new URLSearchParams({ 'CropCode': cropCode, 'Market': market, 'StartDate': date, 'EndDate': date });
    try {
        const response = await fetch(`${API_URL}?${params.toString()}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error(`讀取市場 [${market}] 資料失敗:`, error);
        return null;
    }
}

/**
 * 處理排序狀態切換並重繪表格
 */
function toggleSort(type) {
    if (currentSort.column === type) {
        if (currentSort.state === 'none') currentSort.state = 'desc';
        else if (currentSort.state === 'desc') currentSort.state = 'asc';
        else currentSort.state = 'none';
    } else {
        currentSort.column = type;
        currentSort.state = 'desc';
    }

    // 更新表頭 UI 箭頭樣式
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

    // 執行資料排序
    displayItems.sort((a, b) => {
        // 不管怎麼排，休市永遠在最下層
        if (a.isRest) return 1;
        if (b.isRest) return -1;
        
        if (currentSort.state === 'none') {
            return a.originalIndex - b.originalIndex;
        }

        let valA, valB;
        // 對應各欄位的 API Key 進行數值轉換
        switch(currentSort.column) {
            case 'market':
                valA = a.originalIndex;
                valB = b.originalIndex;
                break;
            case 'high':
                valA = Number(a['上價']);
                valB = Number(b['上價']);
                break;
            case 'mid':
                valA = Number(a['中價']);
                valB = Number(b['中價']);
                break;
            case 'low':
                valA = Number(a['下價']);
                valB = Number(b['下價']);
                break;
            case 'price':
                valA = Number(a['平均價']);
                valB = Number(b['平均價']);
                break;
            case 'volume':
                valA = Number(a['交易量']);
                valB = Number(b['交易量']);
                break;
            default:
                return 0;
        }

        return currentSort.state === 'desc' ? valB - valA : valA - valB;
    });

    // 輸出 HTML
    let htmlRows = "";
    displayItems.forEach(item => {
        htmlRows += "<tr>";
        if (item.isRest) {
            htmlRows += `<td>${item['市場名稱']}</td><td colspan="5" class="text-center text-muted">[本日休市 / 尚無資料]</td>`;
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

async function initDashboard() {
    document.getElementById('title').innerText = `今日酪梨市場價格（${TODAY}）`;
    cachedRawData = [];

    for (let i = 0; i < MARKETS.length; i++) {
        const market = MARKETS[i];
        const data = await fetchFarmData(CROP_CODE, market, TODAY);

        if (data && data.length > 0) {
            data.forEach(item => {
                item.originalIndex = i; 
                cachedRawData.push(item);
            });
        } else {
            cachedRawData.push({ '市場名稱': market, 'isRest': true, 'originalIndex': i });
        }
    }

    renderTable();
}

document.addEventListener('DOMContentLoaded', initDashboard);
