# 漫游坐标 · 纯静态版

这是从原项目生成的独立静态版本，原项目文件没有被修改。

直接双击 `index.html` 即可运行，也可以把整个 `map-traveling` 目录上传到任意静态托管服务。运行时不需要 React、Next.js、数据库、Node.js 或网络连接。

当前版本保留：

- 覆盖首屏的互动地球画布
- 单 Canvas 的高效地图绘制与稳定球面裁切
- 静止时自动暂停绘制，交互时按需恢复
- 拖动旋转、滚轮缩放与国家识别
- 全中文国家/地区名称；Taiwan 地图几何与点击结果统一归入中国
- 600 个目的地及联合国 M49 地域筛选
- 搜索、随机抽取、收藏和旅行足迹
- 桌面与手机响应式布局

文件说明：

- `index.html`：页面入口
- `assets/og.png`：社交分享预览封面
- `assets/favicon.svg` 与 `assets/icon-*.png`：标签页及桌面快捷方式图标
- `manifest.webmanifest`：桌面与移动设备安装清单
- `app.js`：原生 JavaScript 交互（唯一手写脚本）
- `styles.css`：样式，自 React 版导出
- `data/destinations.js`：目的地与地域数据，自 React 版导出
- `data/atlas.js`：本地世界地图数据，自 React 版导出
- `vendor/geo.js`：地图投影与边界裁切，自 React 版打包产物中提取的第三方 d3-geo

`styles.css`、`data/`、`vendor/geo.js` 都是当年从 React 版一次性导出的产物，仓库里没有生成脚本，原项目源码也不在这里——**它们就是唯一副本，需要改样式或数据时直接改这些文件**。
