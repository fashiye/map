// district-map.js
async function callDeepseekChat(messages, style = 'default') {
    const response = await fetch('/api/deepseek/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, style })
    });
    return await response.json();
}

var map = new AMap.Map('container', {
    zoom: 5,
    center: [116.397428, 39.90923]
});

var districtPolygons = [];
var isSearching = false;

// 清除高亮
function clearHighlight() {
    districtPolygons.forEach(function(polygon) {
        polygon.setMap(null);
    });
    districtPolygons = [];
}

// 绘制边界
function drawDistrictBoundaries(district) {
    try {
        if (!district || !district.boundaries || !district.boundaries.length) {
            throw new Error(`无效的边界数据: ${district ? district.name : '未知'}`);
        }
        district.boundaries.forEach(function(boundary) {
            if (!Array.isArray(boundary) || boundary.length === 0) {
                console.warn('跳过无效边界数据');
                return;
            }
            var polygon = new AMap.Polygon({
                map: map,
                path: boundary,
                strokeColor: "#09c8eaea",
                strokeWeight: 2,
                fillColor: "#09c8eaea",
                fillOpacity: 0.3
            });
            districtPolygons.push(polygon);
        });
        if (districtPolygons.length > 0) {
            map.setFitView(districtPolygons);
            console.log('已绘制市级行政区:', district.name);
        } else {
            console.error('未能绘制任何边界:', district.name);
        }
    } catch (error) {
        console.error('绘制边界时出错:', error);
    }
}

// 学习级别
let currentLevel = 'default';

// 获取地理知识
async function getRegionInfo(regionName) {
    const infoPanel = document.getElementById('infoPanel');
    const title = infoPanel.querySelector('.title');
    const content = infoPanel.querySelector('.content');
    title.textContent = `${regionName} (${getLevelName(currentLevel)})`;
    content.innerHTML = '<div class="loading">正在加载地理知识...</div>';
    infoPanel.style.display = 'block';

    try {
        const messages = [{
            role: 'user',
            content: `${regionName}的地理特征和知识`
        }];
        // 这里调用后端转发的 deepseek
        const response = await callDeepseekChat(messages, `study.${currentLevel}`);
        if (response && response.choices && response.choices[0] && response.choices[0].message) {
            const content_text = response.choices[0].message.content;
            if (content_text) {
                content.innerHTML = content_text.replace(/\n/g, '<br>');
            } else {
                content.innerHTML = '返回的内容为空';
            }
        } else {
            console.error('意外的响应格式:', response);
            content.innerHTML = '数据格式错误';
        }
    } catch (error) {
        console.error('获取地理信息失败:', error);
        content.innerHTML = '获取信息时出错，请稍后重试';
    }
}

// 级别名称
function getLevelName(level) {
    const levelNames = {
        'default': '小学水平',
        'beginner': '初中水平',
        'advanced': '高中水平',
        'practical': '大学水平',
    };
    return levelNames[level] || '未知水平';
}

// 地图点击事件
map.on('click', async function(e) {
    if (isSearching) {
        console.log('已有查询正在进行中，请等待...');
        return;
    }
    isSearching = true;
    clearHighlight();
    var lnglat = [e.lnglat.lng, e.lnglat.lat];
    // 1. 逆地理编码（后端API）
    try {
        const geoRes = await fetch(`/api/geocode?lng=${lnglat[0]}&lat=${lnglat[1]}`);
        const geoData = await geoRes.json();
        if (!geoData.regeocode || !geoData.regeocode.addressComponent) {
            throw new Error('逆地理编码失败');
        }
        const addressComponent = geoData.regeocode.addressComponent;
        // 2. 获取市级adcode
        var cityAdcode = addressComponent.adcode.substring(0, 4) + '00';
        // 3. 查询市级行政区（后端API）
        const distRes = await fetch(`/api/district?adcode=${cityAdcode}`);
        const distData = await distRes.json();
        if (distData.status === '1' && distData.districts && distData.districts.length > 0) {
            var cityDistrict = distData.districts[0];
            if (cityDistrict.boundaries && cityDistrict.boundaries.length > 0) {
                drawDistrictBoundaries(cityDistrict);
                getRegionInfo(cityDistrict.name);
            } else {
                console.error('行政区无边界数据:', cityDistrict.name);
            }
        } else {
            throw new Error('未找到市级行政区');
        }
    } catch (error) {
        console.error('点击查询出错:', error);
    } finally {
        isSearching = false;
    }
});

// 事件监听
document.addEventListener('DOMContentLoaded', function() {
    // 点击地图时如果面板显示，则隐藏面板
    map.on('click', function() {
        const infoPanel = document.getElementById('infoPanel');
        if (infoPanel.style.display === 'block') {
            infoPanel.style.display = 'none';
        }
    });

    // 学习级别切换
    const buttons = document.querySelectorAll('.level-switcher button');
    buttons.forEach(button => {
        button.addEventListener('click', function() {
            buttons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            currentLevel = this.dataset.level;
            const infoPanel = document.getElementById('infoPanel');
            if (infoPanel.style.display === 'block') {
                const regionName = infoPanel.querySelector('.title').textContent.split(' (')[0];
                getRegionInfo(regionName);
            }
        });
    });

    // 关闭按钮
    const closeBtn = document.querySelector('#infoPanel .close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            const infoPanel = document.getElementById('infoPanel');
            infoPanel.style.display = 'none';
        });
    }

    // 防止点击面板内容时触发地图的点击事件
    const infoPanel = document.getElementById('infoPanel');
    infoPanel.addEventListener('click', function(e) {
        e.stopPropagation();
    });

    // 地图类型切换
    var satelliteLayer = new AMap.TileLayer.Satellite();
    var roadNetLayer = new AMap.TileLayer.RoadNet();
    const mapTypeBtns = document.querySelectorAll('.map-type-switch button');
    mapTypeBtns.forEach(button => {
        button.addEventListener('click', function() {
            mapTypeBtns.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            const mapType = this.dataset.type;
            if (mapType === 'satellite') {
                satelliteLayer.setMap(map);
                roadNetLayer.setMap(map);
            } else {
                satelliteLayer.setMap(null);
                roadNetLayer.setMap(null);
            }
        });
    });
});