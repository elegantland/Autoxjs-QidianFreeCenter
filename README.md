# Autoxjs-QidianFreeCenter

<p align="center">
  <img src="https://img.shields.io/badge/Autox.js-v7.2.2+-brightgreen.svg" alt="Autox.js">
  <img src="https://img.shields.io/badge/ 起点读书-7.9.450+-blue.svg" alt="起点读书">
  <img src="https://img.shields.io/badge/ 最新版本-261025-orange.svg" alt="Version">
  <img src="https://img.shields.io/badge/ 适配机型-一加%20Ace%205%20至尊版-red.svg" alt="Device">
</p>

起点读书福利中心自动化领福利脚本。深度针对 **一加 Ace 5 / Ace 5 至尊版** 高刷全面屏与各版本广告浮层进行适配与逻辑加固，全自动搞定日常福利、加点任务与阅读奖励。

> 本项目基于 [qkqpttgf/Autoxjs-QidianFreeCenter](https://github.com/qkqpttgf/Autoxjs-QidianFreeCenter) 二次开发，感谢原作者。

---

## 🚀 快速开始

1. **安装环境**：
   - 手机安装 [Autox.js v7](https://github.com/kkevsekk1/AutoX) （推荐 7.2.2 及以上版本，需支持 Paddle-OCR）。
   - 赋予 Autox.js **无障碍服务**、**悬浮窗**、**后台白名单/电池无限制** 以及 **截屏权限**。
2. **下载脚本**：
   - 下载仓库中的主脚本文件：[`qd1025.js`](./qd1025.js)。
3. **导入运行**：
   - 在 Autox.js 中打开 `qd1025.js`，按需调整顶部参数后点击运行。

---

## ⚙️ 关键配置说明 (位于脚本 L20~L38)

若非一加 Ace 5 系列机型，只需在脚本顶部快速调整以下配置：

| 配置变量 | 默认值 | 说明 |
| :--- | :--- | :--- |
| `targetBookName` | `"盖世双谐"` | “去阅读”任务要在书架上打开的书名，**请务必改成你书架已有的书** |
| `enableGameTask` | `false` | 是否执行玩游戏任务（耗时较长，建议关闭） |
| `enableLottery` | `false` | 是否执行转盘抽奖 |
| `fixedCloseXPos` | `{ x: 1182, y: 280 }` | 广告右上角 **关闭按钮 (X)** 固定坐标（用于无障碍扫不到时的兜底点击） |
| `fixedButtonPos` | `{ x: 630, y: 2320 }` | 广告底部主 CTA 按钮位置 |

> 💡 **非一加 Ace 5 坐标获取方法**：  
> 打开手机 `系统设置` -> `开发者选项` -> 开启 `指针位置`。打开任意广告，点击右上角 `X` 记录屏幕顶部显示的 X/Y 像素坐标，填入 `fixedCloseXPos` 即可。

---

## 📱 测试验证环境

- **运行环境**：Autox.js v7.2.2 (内置 Paddle-OCR)
- **目标应用**：起点读书 Android 7.9.450 ~ 7.9.460
- **测试机型**：一加 Ace 5 / Ace 5 至尊版 (ColorOS 15 / 分辨率 1264×2780)

---

## 🛠️ 常见问题排查 (FAQ)

1. **控制台窗口频繁闪烁？**  
   - **属于正常现象**。脚本在进行 Paddle-OCR 识别底层文字时，会主动隐藏控制台避免图层遮挡关键按钮，识别完毕后自动恢复。
2. **卡在广告或者落地页未返回？**  
   - 脚本内置了看护超时机制（约 25 秒强制拉回起点），若卡在系统权限弹窗或特殊内嵌落地页，看护线程会自动唤醒起点并退回主界面。
3. **提示“无 Paddle 识图功能”？**  
   - 原版 Auto.js 4.x 不支持 PaddleOCR，请更换为 **Autox.js v7** 系列版本或关闭脚本重新启动。

---

## 📝 更新日志

### 261025 (2026-10-25)
- ✨ 升级 CTA 按钮样本库，补齐「了解更多」、「查看更多」等高频词汇识别。
- 🚀 新增初次识别 3.5s 浮层滑出缓冲与二次 OCR 补偿机制，彻底告别盲目死等与伪续看。
- 🛡️ 优化京东热卖等外部唤醒弹窗熔断策略，消除倒计时阻断。
- 🧩 坐标参数与核心逻辑解耦，开放顶部独立坐标配置区，便于多机型快速微调。
