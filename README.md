# 环球大富翁｜我们的家庭旅行局

一款为家庭聚会设计的世界城市大富翁网页游戏，支持 2–6 人、双球轮盘、小朋友加法互动、中文语音主持、城市经营、资产自救、机会与命运卡，以及随时按原价结算排行。

## 在线游玩

GitHub Pages 发布完成后访问：

<https://ritl.github.io/dafuweng/>

iPhone 可在 Safari 中选择“分享 → 添加到主屏幕”，之后像普通 App 一样启动。安卓电视支持 AirPlay 时可直接屏幕镜像；不支持时可在电视端安装 AirPlay 接收应用。

## 本地运行

需要 Node.js 22.13 或更高版本。

```bash
npm ci
npm run dev
```

## 验证与发布

```bash
npm test
npm run build:pages
```

推送到 `main` 后，GitHub Actions 会自动构建并更新 GitHub Pages。

## 隐私说明

玩家姓名、资产和对局存档只保存在当前设备的浏览器中，不会上传到服务器。清理浏览器网站数据会同时清除本机存档。
