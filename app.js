let map;
let currentMarker;
let isMapInitialized = false;

// 1. 各地点のデータ（Pythonのspots.jsonのキーと完全一致させます）
const translationPoints = [
    {
        name: "東京情報大学5号館",
        location_key: "tokyo_johodai_5",
        lat: 35.6369279,
        lng: 140.2020905,
        radius: 100,
        spots: [
            { category: "施設", name: "情報大 5号館講義室", distance: "0m" },
            { category: "グルメ", name: "学食（ポプラ）", distance: "120m" },
            { category: "施設", name: "情報大 本部棟図書館", distance: "250m" }
        ]
    },
    {
        name: "自宅",
        location_key: "ichihara_shiku",
        //lat: 35.508572, 
        //lng: 140.071769, 
        radius: 100,
        spots: [
            { category: "歴史", name: "姉崎二子塚古墳", distance: "4.7km" },
            { category: "グルメ", name: "田中屋", distance: "1.7km" },
            { category: "道の駅", name: "道の駅 あずの里・いちはら", distance: "7.6km" }
        ]
    },
    {
        name: "地点C（ゴール周辺）",
        location_key: "ginza_shiku",
        lat: 35.671989, 
        lng: 139.764632, 
        radius: 100,
        spots: [
            { category: "景勝地", name: "ガス灯通りの洋館", distance: "80m" },
            { category: "グルメ", name: "老舗の喫茶ブラン", distance: "150m" },
            { category: "歴史", name: "近代建築記念碑", distance: "320m" }
        ]
    }
];

const defaultText = "走行中...。歴史や文化のあるスポットに近づくと、ここに自動で『風景翻訳』のテキストが表示されます。";
const defaultSpots = [
    { category: "なし", name: "周辺情報はありません", distance: "- m" },
    { category: "なし", name: "周辺情報はありません", distance: "- m" },
    { category: "なし", name: "周辺情報はありません", distance: "- m" }
];

// 【Python連動】サーバーから観光テキストと選曲タグを取得して画面に分配する関数
async function fetchRagGuide(locationKey) {
    const translationElement = document.getElementById('translationText');
    // 🛠️ index.htmlのクラス名（.track-title, .track-artist）に合わせて修正
    const bgmTitleElement = document.querySelector('.track-title'); 
    const bgmArtistElement = document.querySelector('.track-artist'); 

    translationElement.textContent = "🔄 周辺の観光情報を読み込み中...";
    if (bgmTitleElement) bgmTitleElement.textContent = "🔄 AI選曲中...";

    try {
        // 🛠️ URLのバグを修正
        const response = await fetch('http://127.0.0.1:8000/api/guide', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ location_key: locationKey })
        });
        
        const data = await response.json();
        
        // ① 観光サイトの文章（データ）を「LANDSCAPE TRANSLATION」に表示
        translationElement.textContent = data.sightseeing_text;
        
        // ② Geminiが考えた選曲を「BGM SUGGESTION」の枠に表示
        if (bgmTitleElement) {
            bgmTitleElement.textContent = data.bgm_genre; 
        }
        if (bgmArtistElement) {
            bgmArtistElement.textContent = "Selected by Gemini RAG"; 
        }
        
    } catch (error) {
        console.error("サーバー通信エラー:", error);
        translationElement.textContent = "❌ 観光情報の取得に失敗しました。";
        if (bgmTitleElement) bgmTitleElement.textContent = "通信エラー";
    }
}

// 2点間の直線距離（メートル）を計算する関数
function getDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// 周辺スポット（NEARBY SPOTS）のHTMLを書き換える関数
function updateSpotsCarousel(spotsArray) {
    const carousel = document.getElementById('spotsCarousel');
    if (!carousel) return;

    let htmlContent = '';
    spotsArray.forEach(spot => {
        htmlContent += `
            <div class="spot-card" style="${spot.category === 'なし' ? 'opacity: 0.5;' : ''}">
                <span class="spot-category cat-${spot.category}">${spot.category}</span>
                <div class="spot-name">${spot.name}</div>
                <div class="spot-distance">📍 ${spot.distance}</div>
            </div>
        `;
    });
    carousel.innerHTML = htmlContent;
}

// 最後に通信した場所のキーを記憶（何度も同じ場所でAPIを叩かないようにする対策）
let lastLocationKey = "";

// 現在地をチェックして画面をアップデートするメイン処理
function checkLocation(position) {
    const currentLat = position.coords.latitude;
    const currentLng = position.coords.longitude;

    if (!isMapInitialized) {
        map = L.map('map').setView([currentLat, currentLng], 15);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        currentMarker = L.marker([currentLat, currentLng]).addTo(map).bindPopup('現在地').openPopup();

        translationPoints.forEach(point => {
            L.circle([point.lat, point.lng], {
                color: '#60c9ec',
                fillColor: '#60c9ec',
                fillOpacity: 0.2,
                radius: point.radius
            }).addTo(map).bindPopup(point.name);
        });

        isMapInitialized = true;
    } else {
        map.setView([currentLat, currentLng]);
        currentMarker.setLatLng([currentLat, currentLng]);
    }

    let inRange = false;
    let matchedSpots = defaultSpots;

    for (const point of translationPoints) {
        const distance = getDistance(currentLat, currentLng, point.lat, point.lng);
        
        if (distance <= point.radius) {
            inRange = true;
            matchedSpots = point.spots;
            
            // 新しくその場所に入ったときだけサーバーにリクエストする
            if (lastLocationKey !== point.location_key) {
                lastLocationKey = point.location_key;
                fetchRagGuide(point.location_key);
            }
            break;
        }
    }

    // どの範囲からも外れたらデフォルト表示に戻す
    if (!inRange) {
        if (lastLocationKey !== "") {
            lastLocationKey = "";
            document.getElementById('translationText').textContent = defaultText;
            
            // 🛠️ クラス名をindex.htmlに合わせて修正
            const bgmTitleElement = document.querySelector('.track-title');
            const bgmArtistElement = document.querySelector('.track-artist');
            if (bgmTitleElement) bgmTitleElement.textContent = "Brick Quarter Nostalgia";
            if (bgmArtistElement) bgmArtistElement.textContent = "Ambient Synced Track";
        }
        updateSpotsCarousel(defaultSpots);
    } else {
        updateSpotsCarousel(matchedSpots);
    }
}

// エラーハンドリング
function handleError(error) {
    console.error("GPSエラー:", error);
    document.getElementById('translationText').textContent = "GPSの取得に失敗しました。位置情報サービスが許可されているか確認してください。";
}

// ページ読み込み時の初期化
window.onload = function() {
    updateSpotsCarousel(defaultSpots);

    if (navigator.geolocation) {
        navigator.geolocation.watchPosition(checkLocation, handleError, {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 5000
        });
    } else {
        alert("このブラウザは位置情報（GPS）に対応していません。");
    }
};