import { deepseek } from './deepseek.js';

var map = new AMap.Map('container', {
    zoom: 5,
    center: [116.397428, 39.90923]
});

var districtPolygons = [];
var isSearching = false;
var districtSearch;

AMap.plugin(['AMap.DistrictSearch', 'AMap.Geocoder'], function() {
    var geocoder = new AMap.Geocoder();
    districtSearch = new AMap.DistrictSearch({
        level: 'city',
        extensions: 'all',
        subdistrict: 0
    });

    map.on('click', function(e) {
        if (isSearching) {
            console.log('已有查询正在进行中，请等待...');
            return;
        }
        isSearching = true;
        
        clearHighlight();
        
        var lnglat = [e.lnglat.lng, e.lnglat.lat];
        console.log('===== 开始新的查询 =====');
        console.log('点击位置:', {
            经度: lnglat[0],
            纬度: lnglat[1],
            格式化坐标: `${lnglat[0].toFixed(6)},${lnglat[1].toFixed(6)}`
        });

        // 使用逆地理编码获取地址信息
        geocoder.getAddress(lnglat, function(status, result) {
            try {
                console.log('逆地理编码返回:', {
                    状态: status,
                    完整结果: result
                });

                if (status !== 'complete' || !result.regeocode) {
                    throw new Error('逆地理编码失败');
                }

                var addressComponent = result.regeocode.addressComponent;
                console.log('地址组件详情:', {
                    省份: addressComponent.province,
                    城市: addressComponent.city,
                    区县: addressComponent.district,
                    编码: addressComponent.adcode,
                    城市编码: addressComponent.citycode
                });

                // 直接使用 adcode 前四位 + '00' 获取市级边界
                var cityAdcode = addressComponent.adcode.substring(0, 4) + '00';
                console.log('市级行政区查询参数:', {
                    原始区域编码: addressComponent.adcode,
                    处理后编码: cityAdcode,
                    查询级别: 'city'
                });

                // 直接查询市级边界
                districtSearch.search(cityAdcode, function(status2, result2) {
                    try {
                        console.log('市级查询返回:', {
                            状态: status2,
                            信息: result2 ? result2.info : null,
                            结果数量: result2 && result2.districts ? result2.districts.length : 0,
                            完整结果: JSON.stringify(result2)
                        });

                        if (status2 === 'complete' && result2 && result2.info === 'OK') {
                            var districts = result2.districts || result2.districtList || [];
                            
                            if (districts.length > 0) {
                                var cityDistrict = districts[0];
                                console.log('找到市级行政区:', {
                                    名称: cityDistrict.name,
                                    级别: cityDistrict.level,
                                    编码: cityDistrict.adcode,
                                    边界数据: cityDistrict.boundaries ? '有' : '无'
                                });
                                
                                if (cityDistrict.boundaries) {
                                    drawDistrictBoundaries(cityDistrict);
                                    // 调用 DeepSeek API 获取地理知识
                                    getRegionInfo(cityDistrict.name);
                                } else {
                                    console.error('行政区无边界数据:', cityDistrict.name);
                                }
                            } else {
                                throw new Error(`未找到行政区数据: ${cityAdcode}`);
                            }
                        } else {
                            throw new Error(`查询失败: ${result2 ? result2.info : '未知错误'}`);
                        }
                    } catch (error) {
                        console.error('查询处理出错:', {
                            错误消息: error.message,
                            堆栈: error.stack
                        });
                    } finally {
                        isSearching = false;
                    }
                });
            } catch (error) {
                console.error('地址解析详情:', {
                    错误消息: error.message,
                    堆栈: error.stack,
                    原始状态: status,
                    原始结果: result
                });
                isSearching = false;
            }
        });
    });
});

function clearHighlight() {
    districtPolygons.forEach(function(polygon) {
        polygon.setMap(null);
    });
    districtPolygons = [];
}

// 简化后的绘制函数
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
                strokeColor: "#FF33FF",
                strokeWeight: 2,
                fillColor: "#FF99FF",
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

// 添加学习级别状态变量
let currentLevel = 'default';

// 修改 getRegionInfo 函数
async function getRegionInfo(regionName) {
    const infoPanel = document.getElementById('infoPanel');
    const title = infoPanel.querySelector('.title');
    const content = infoPanel.querySelector('.content');
    
    // 显示面板和加载状态
    title.textContent = `${regionName} (${getLevelName(currentLevel)})`;
    content.innerHTML = '<div class="loading">正在加载地理知识...</div>';
    infoPanel.style.display = 'block';

    try {
        const messages = [{
            role: 'user',
            content: `${regionName}的地理特征和知识`
        }];

        const response = await deepseek.chat(messages, `study.${currentLevel}`);
        
        // 检查响应数据结构
        if (response && response.choices && response.choices[0] && response.choices[0].message) {
            // 从 message 对象中获取 content
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

// 添加级别名称转换函数
function getLevelName(level) {
    const levelNames = {
        'default': '小学水平',
        'beginner': '初中水平',
        'advanced': '高中水平',
        'practical': '大学水平',
        'professional': '研究生水平'
    };
    return levelNames[level] || '未知水平';
}

// 添加事件监听器
document.addEventListener('DOMContentLoaded', function() {
    // 点击地图时如果面板显示，则隐藏面板
    map.on('click', function() {
        const infoPanel = document.getElementById('infoPanel');
        if (infoPanel.style.display === 'block') {
            infoPanel.style.display = 'none';
        }
    });

    // 添加级别切换按钮的事件监听
    const buttons = document.querySelectorAll('.level-switcher button');
    buttons.forEach(button => {
        button.addEventListener('click', function() {
            // 移除所有按钮的活动状态
            buttons.forEach(btn => btn.classList.remove('active'));
            // 添加当前按钮的活动状态
            this.classList.add('active');
            // 更新当前级别
            currentLevel = this.dataset.level;
            
            // 如果面板当前显示，则刷新内容
            const infoPanel = document.getElementById('infoPanel');
            if (infoPanel.style.display === 'block') {
                const regionName = infoPanel.querySelector('.title').textContent.split(' (')[0];
                getRegionInfo(regionName);
            }
        });
    });

    // 添加关闭按钮的事件监听
    const closeBtn = document.querySelector('#infoPanel .close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', function(e) {
            e.stopPropagation(); // 阻止事件冒泡
            const infoPanel = document.getElementById('infoPanel');
            infoPanel.style.display = 'none';
        });
    }

    // 防止点击面板内容时触发地图的点击事件
    const infoPanel = document.getElementById('infoPanel');
    infoPanel.addEventListener('click', function(e) {
        e.stopPropagation();
    });

    // 在地图初始化后添加卫星图层
    var satelliteLayer = new AMap.TileLayer.Satellite();
    var roadNetLayer = new AMap.TileLayer.RoadNet();

    // 添加地图类型切换功能
    const mapTypeBtns = document.querySelectorAll('.map-type-switch button');
    mapTypeBtns.forEach(button => {
        button.addEventListener('click', function() {
            // 更新按钮状态
            mapTypeBtns.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');

            // 切换地图类型
            const mapType = this.dataset.type;
            if (mapType === 'satellite') {
                // 切换到卫星图
                satelliteLayer.setMap(map);
                roadNetLayer.setMap(map);
            } else {
                // 切换到普通地图
                satelliteLayer.setMap(null);
                roadNetLayer.setMap(null);
            }
        });
    });
});