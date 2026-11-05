/**
 * ==================== Auto.js 起点自动任务架构速查索引 ====================
 * [配置常量]  L35~L75   : 用户配置项、固定坐标 (fixedCloseXPos)、持久化存储 (storage)
 * [页面识别]  L115~L185 : wherePage() 页面类型精准判定 (index / freecenter / adframe 等)
 * [导航跳转]  L190~L285 : launchQidian(), openQidian() 起点唤醒与前台保障
 * [账号与入口] L285~L380 : enterMe() 导航至“我”界面；enterFreeCenter() 物理点击进入福利中心
 * [广告处理]  L700~L1220: video_look() 广告核心状态机（初次识别、倒计时、无障碍监控）
 * [广告点击]  L720~L1025: clickAdButton() 广告CTA按钮物理穿透点击与避坑
 * [广告退出]  L1200~L1530: 点X循环、自动back()关闭落地页浮层、续看(Resume)与拦截弹窗处理
 * [任务子模块] L430~L690 : exchange() 兑换, lottery() 抽奖, runGameTask() 游戏
 * [工具函数]  L1700~L2250: read_book(), cappad(), ocrTopRegion(), robustClick(), getTextOfView()
 * [任务主流程] L2300~L2660: 看护线程, 优先限时加点任务, 常规看视频任务, 领奖励结算
 * =========================================================================
 */

    var title = "261025起点自动";
    var logFile = false; // 是否将日志保存到文件中

    // --- 用户配置项 ---
    var targetBookName = "盖世双谐"; // 去阅读任务需要搜索的书名
    var enableGameTask = false;      // 是否执行玩游戏任务（true: 开启, false: 关闭）
    var enableLottery = false;       // 是否执行转盘抽奖（true: 开启, false: 关闭）
    var enableAdBufferWait = false;  // 是否开启无障碍缓冲等待（true: 开启5秒无障碍等待, false: 默认关闭，直接走OCR识别）
    // -----------------

    var closeButtonBottom = 550; // 新广告右上角的X的下沿高度，控制台也放这么高
    
    // ==================== 核心机型适配坐标 ====================
    // 右上角广告关闭X按钮固定坐标（默认适配：一加Ace 5）
    // 【机型适配说明】：
    // 若在其他手机上运行未点中右上角X，请在手机【开发者选项】中开启【指针位置】，
    // 触摸广告右上角 X 获取您的屏幕 X, Y 坐标，并修改下方数值：
    var fixedCloseXPos = { x: 1182, y: 280 };

    // 广告底部居中主CTA按钮点击坐标（默认适配居中大胶囊按钮）
    var fixedButtonPos = { x: 630, y: 2320 };
    // ==========================================================

    // 屏幕核心比例坐标预计算（避免在热点循环中频繁重新计算）
    var SCREEN = {
        centerX: parseInt(device.width / 2),
        h02: parseInt(device.height * 0.02),
        h08: parseInt(device.height * 0.08),
        h10: parseInt(device.height * 0.10),
        h45: parseInt(device.height * 0.45),
        h50: parseInt(device.height * 0.50),
        h55: parseInt(device.height * 0.55),
        h62: parseInt(device.height * 0.62),
        h635: parseInt(device.height * 0.635),
        h845: parseInt(device.height * 0.845),
        h85: parseInt(device.height * 0.85)
    };

    var startTime = new Date().getTime();
    var debug = false; // 开启debug循环
    var CAPTCHA_KEYWORDS = ["验证", "依次点击", "安全"]; // 验证码关键词
    var FLOATING_KEYWORDS = ["李跳跳", "游戏助手", "悬浮", "输入法", "SystemUI", "systemui", "Gboard", "录屏", "助手", "弹窗"];
    var c_pos = [[0, closeButtonBottom], [device.width / 2, device.height - 500]]; // 控制台位置切换
    var qidianPackageName = "com.qidian.QDReader";
    var autojsPackage = currentPackage();
    var longdash = "————————————";
    var shortdash = "——————";
    var freeCenterScrolled = 0;
    var adCount = 0, lotteryCount = 0, exchangeCount = 0, readTime = 0, gamePlayTime = 0;
    var ADReceive = new Object();
    var ad_raw = -1, ad_clicknewpage = -1; // 广告识别结果（供调用方判断是否识别成功）
    var thisLable = "ysun.QidianFreeCenter";
    var storage = storages.create(thisLable);
    // 日志存放位置
    var logFilePath = files.cwd() + "/log/" + thisLable + "/";
    if (logFile || debug) files.createWithDirs(logFilePath);
    var nickname = "";
    var isFirstGoComplete = true; // 标记是否为第一次点击“去完成”
    var isClickNewPage = false;   // 全局标记：当前是否正在进行会跳转页面的任务

    auto.waitFor();
    var cmdIsDisplay = false;
    showCon();
    console.setTitle(title);
    console.setSize(device.width / 2, device.width / 2);
    l_log("\n\n" + title);
    if (auto.service == null) {
        l_error("请先开启无障碍服务！");
        l_exit();
    }
    l_info("无障碍服务已开启");
    if (!requestScreenCapture()) {
        l_error("请求截图权限失败");
        l_exit();
    }
    l_log("请求截图权限成功");
    try {
        if (paddle) l_log("有Paddle识图功能");
    } catch (error) {
        l_error("无Paddle识图功能，推荐安装Autox.js v7！");
        l_exit();
    }
    console.verbose("建议Autox.js开启“稳定模式”、“前台服务”、“使用情况访问权限”。");
    console.verbose("建议重启手机或清理手机后再运行。");
    l_log(longdash);

    // 判断包名是否为系统权限管理类
    function isPermissionPkg(pkg) {
        return pkg.indexOf("permission") > -1 || pkg.indexOf("packageinstaller") > -1;
    }
    function isIgnoredOrFloatingApp(pkg) {
        if (!pkg) return false;
        if (pkg == qidianPackageName || pkg == autojsPackage || pkg == "android" || pkg == "com.android.settings") return true;
        if (isPermissionPkg(pkg)) return true;
        let appName = safeGetAppName(pkg);
        return strHasArr(appName, FLOATING_KEYWORDS) || strHasArr(pkg, FLOATING_KEYWORDS);
    }
    // 判断当前/指定包名是否属于起点外部的真实应用（非悬浮/系统辅助）
    function isExternalApp(pkg) {
        let p = pkg || currentPackage();
        return p != qidianPackageName && !isIgnoredOrFloatingApp(p);
    }
    // 安全获取应用名（防止 getAppName 异常崩溃，找不到时回退为包名）
    function safeGetAppName(pkg) {
        try { return getAppName(pkg) || pkg; } catch (e) { return pkg; }
    }
    // 确保起点在前台（若在外部应用则强制拉回，返回是否执行了切换）
    function ensureInQidian() {
        if (isExternalApp()) {
            launchQidian(true);
            sleep(1500);
            return true;
        }
        return false;
    }

    // 专注检测顶部标题栏一小块区域（如“京东验证”、“京东热卖”所在的小标题条，严格限制在屏幕顶端 10% 以内）
    // 专用于看广告倒计时中配合底部弹窗判定，支持无障碍+顶部微型OCR双重兜底
    function isTopJdTitle() {
        let maxTitleY = SCREEN.h10; // 严格限制在顶部标题栏一小块区域（通常在 260px 以内）
        // 1. 无障碍节点检测：检查顶部标题栏一小块区域内是否有“京东”文字
        try {
            let nodes = textMatches(/.*京东.*/).find();
            for (let i = 0; i < nodes.length; i++) {
                let b = nodes[i].bounds();
                // 必须严格落在屏幕顶端标题栏区域内
                if (b && b.bottom > 0 && b.top < maxTitleY && b.bottom <= maxTitleY + 50) {
                    let t = nodes[i].text() || "";
                    if (t.indexOf("想要打开") == -1) {
                        return true;
                    }
                }
            }
        } catch (e) {}

        // 2. OCR 仅截取顶部标题栏一小块区域 [0, 2%, width, 8%]（杜绝下方海报、广告图或视频内容）
        try {
            if (typeof cappad === "function") {
                let startY = SCREEN.h02;
                let titleHeight = SCREEN.h08;
                let resTitle = cappad([0, startY, device.width, titleHeight]);
                for (let i = 0; i < resTitle.length; i++) {
                    let t = resTitle[i].text;
                    if (t.indexOf("想要打开") > -1) continue;
                    if (t.indexOf("京东") > -1) {
                        return true;
                    }
                }
            }
        } catch (e) {}

        return false;
    }

    // 检测下方是否存在系统权限/打开应用弹窗
    function hasBottomDialog() {
        return textContains("想要打开").exists() || 
               (text("仅本次允许").exists() && text("30天内允许").exists()) ||
               (textContains("允许").exists() && text("取消").exists());
    }

    function wherePage() {
        let cp = currentPackage();
        let ca = currentActivity() || "";
        
        // 权限管理弹窗与系统跳转授权弹窗快速识别
        if (isPermissionPkg(cp) || hasBottomDialog()) {
            return "permission";
        }

        // 优先判断是否跳出起点 App：若已在前台其他应用（如微信、淘宝、浏览器等），绝不误判为起点界面
        if (isExternalApp(cp)) {
            return "isNotQidain";
        }

        // 广告 Activity 识别（最快）
        if (ca.indexOf("RewardvideoPortraitADActivity") > -1 || ca.indexOf("RewardVideoActivity") > -1 || ca.indexOf("AdActivity") > -1) {
            return "adframe";
        }

        // ==================== 1. 福利中心精准判定 ====================
        // 核心独占特征：完成任务得奖励、积分商城、本周收益、激励任务、连续签到，或前台正处于奖励结算弹窗
        let isFree = textMatches(/完成任务得奖励|积分商城|本周收益|激励任务|.*连续签到.*/).findOnce() || textMatches(/恭喜获得|获得加点|加点成功/).findOnce();
        if (isFree && !textMatches(/我的账户|卡牌广场/).findOnce()) {
            return "freecenter";
        }

        // ==================== 2. 首页 / “我” 界面判断 ====================
        let isMainTab = (text("书架").findOnce() && textMatches(/精选|我|发现/).findOnce());
        if (isMainTab || textMatches(/我的账户|卡牌广场/).findOnce()) {
            return "index";
        }

        // 签到详情 / 签到日历 / 兑换子页面
        if (textMatches(/签到详情|连签有礼|签到日历|去兑换|兑换记录/).findOnce()) {
            return "signdetail";
        }

        // 游戏中心
        if (text("阅游戏").findOnce() && text("在线玩").findOnce()) {
            return "gamecenter";
        }

        // 阅读页面
        if (ca.indexOf("QDReader") > -1 || ca.indexOf("chapter") > -1 || ca.indexOf("ReadActivity") > -1) {
            return "read";
        }

        // 网页/内嵌广告特征（在起点内部打开了商品落地页、H5网页、内置浏览器、广告落地页等）
        if (ca.indexOf("Web") > -1 || ca.indexOf("Browser") > -1 || ca.indexOf("H5") > -1 || ca.indexOf("LandPage") > -1 || ca.indexOf("AdLandingPage") > -1) {
            return "internal_web";
        }

        // 广告页面特征合并判断（通过单次正则合并取代原本8重深度exists遍历）
        if (textMatches(/跳过|观看视频|后看广告|秒后获取奖励|点击后看|恭喜你已获得奖励/).findOnce() || (textContains("秒").findOnce() && textContains("奖励").findOnce())) {
            return "adframe";
        }

        // 浏览器容器
        if (id("browser_container").findOnce()) {
            return "browser";
        }

        return "";
    }
    function launchQidian(force) {
        let p = currentPackage();
        if (!force && p == qidianPackageName) {
            let wp = wherePage();
            if (wp == "adframe" || wp == "freecenter" || wp == "index" || wp == "signdetail") {
                return;
            }
        }

        // 离开起点且不是悬浮窗辅助软件时，退回桌面重新拉起
        let isExternal = isExternalApp(p);
        if (isExternal) {
            let name = safeGetAppName(p);
            l_info("正在从外部应用 [" + name + "] 切回起点...");
            home();
            sleep(500);
        }
        app.launchPackage(qidianPackageName);
        
        // 如果是从外部应用强切回起点，等待确认起点已到前台
        let waitCount = 0;
        while (waitCount < 6) {
            sleep(500);
            let cur = currentPackage();
            if (cur == qidianPackageName) {
                break;
            }
            waitCount++;
            if (waitCount == 3) {
                // 1.5秒仍未切换成功，再次拉起
                app.launchPackage(qidianPackageName);
            }
        }
        sleep(500);
    }
    function openQidian() {
        // 如果已在福利中心/签到页，直接跳过启动逻辑
        let wp_init = wherePage();
        if (wp_init == "freecenter" || wp_init == "signdetail") {
            l_info("当前已在已知页面：" + wp_init);
            l_info("起点已就绪");
            return true;
        }

        launchQidian();

        let n = 0;
        let wp = "";
        do {
            n++;
            wp = wherePage();
            // 如果已经到了首页、福利中心或签到页，就不用再折腾启动逻辑了
            if (wp == "index" || wp == "freecenter" || wp == "signdetail") {
                l_info("当前已在已知页面：" + wp);
                break;
            }

            if (currentPackage() != qidianPackageName) {
                launchQidian();
                sleep(500);
            }
            let a = currentActivity();
            if (a.indexOf("Splash") > -1) {
                n = 0;
            } else if (a.indexOf("activity.QDReader") > -1 || a.indexOf("chapter") > -1 || a.indexOf("new_msg") > -1) {
                l_verbose("非主页Activity，尝试返回");
                back();
            } else if (wp == "permission") {
                l_verbose("检测到权限弹窗，尝试返回");
                back();
            } else if (wp == "isNotQidain") {
                l_verbose("不在起点App内，尝试拉起");
                launchQidian();
            } else {
                l_verbose("正在等待页面加载 (" + n + "/20)");
                // 如果已经在起点内且不是已知干扰页面，不轻易执行 back()，防止退出
            }
            sleep(500);
            closeDialogs();
            if (n > 20 && currentPackage() != qidianPackageName) break;
        } while (wp == "" || wp == "isNotQidain" || wp == "permission");
        
        // 如果已经在福利中心相关页面，跳过等待和后续逻辑
        if (wp == "freecenter" || wp == "signdetail") {
            l_info("起点已就绪");
            return true;
        }

        sleep(600);

        if (!enterMe()) {
            l_error("无法进入‘我’界面，请手动复原到首页");
            l_warn(wherePage(), currentPackage(), currentActivity());
            l_exit();
        }
        l_info("起点已就绪");
        return false;
    }
    function enterMe() {
        // 1. 若当前屏幕已经处于“我”界面，直接读取昵称返回，无需重复点击底栏与冗余等待
        if (text("福利中心").exists() || text("我的账户").exists()) {
            let tv = id("tvName").findOne(200);
            if (tv) {
                nickname = tv.text();
                l_log("当前账号：", nickname);
            }
            return true;
        }

        closeDialogs();

        // 2. 优先精准定位底栏的“我”标签（屏幕底部区域）
        let me = text("我").boundsInside(0, device.height * 0.8, device.width, device.height).findOne(500);
        if (me) {
            let b = me.bounds();
            click(b.centerX(), b.centerY());
        } else {
            let oldMe = id("view_tab_title_title").className("android.widget.TextView").text("我").findOne(300);
            if (oldMe && oldMe.parent() && oldMe.parent().clickable()) {
                oldMe.parent().click();
            } else {
                click(device.width * 0.875, device.height - 50);
            }
        }

        // 3. 快速检测“福利中心”按钮是否出现（最长等待 2.5 秒，出现立即进入下一步）
        let waited = 0;
        while (!text("福利中心").exists() && waited < 12) {
            sleep(200);
            waited++;
            if (waited % 4 == 0) closeDialogs();
        }
        if (!text("福利中心").exists()) return false;

        let tv = id("tvName").findOne(300);
        if (tv) {
            nickname = tv.text();
            l_log("当前账号：", nickname);
        }
        return true;
    }
    function enterFreeCenter() {
        if (wherePage() == "freecenter") {
            l_info("当前已在福利中心");
            return;
        }
        let n = 0;
        do {
            l_verbose("正在进入福利中心 (" + (n + 1) + "/3)...");
            // 确保当前在“我”界面
            if (!text("我的账户").exists() && !text("卡牌广场").exists()) {
                enterMe();
                sleep(400);
            }

            let fc = text("福利中心").findOne(800);
            if (fc) {
                let b = fc.bounds();
                // 1. 无障碍穿透点击
                if (!fc.click() && fc.parent()) fc.parent().click();
                // 2. 真实物理中心点击
                if (b.width() > 0 && b.height() > 0) {
                    press(b.centerX(), b.centerY(), 100);
                }
            } else {
                click("福利中心", 0);
            }

            // 极速等待进入福利中心（轮询 8 次，只要进入立即跳出，最多 2 秒）
            // 优先使用极速轻量特征判定（2毫秒），杜绝任何多余开销
            let m = 0;
            while (m < 8) {
                sleep(250);
                let inFc = textMatches(/完成任务得奖励|积分商城|本周收益|激励任务/).findOnce();
                if (inFc && !text("我的账户").exists()) break;
                if (wherePage() == "freecenter") break;
                m++;
            }
            if (wherePage() == "freecenter" || (textMatches(/完成任务得奖励|本周收益/).findOnce() && !text("我的账户").exists())) break;
            n++;
        } while (n < 3 && wherePage() != "freecenter");
        if (wherePage() != "freecenter" && !textMatches(/完成任务得奖励|本周收益/).findOnce()) {
            l_warn("超时未识别到福利中心，跳过等待，继续下个步骤");
            l_warn("当前页面：", wherePage(), currentPackage(), currentActivity());
        } else {
            l_info("已成功进入福利中心");
        }
    }
    function returnToFreeCenterFromReading() {
        l_info("阅读完成，正在返回福利中心...");
        // 1. 保障起点在前台
        ensureInQidian();

        // 2. 若当前仍在正文阅读页，仅执行 1 次 back() 返回书架/主页
        if (wherePage() == "read") {
            l_verbose("正在从阅读正文返回书架...");
            back();
            sleep(800);
        }

        // 3. 关闭阅读退出时可能出现的弹窗（如加入书架、签到提醒等）
        closeDialogs();
        if (text("加入书架").exists() && text("取消").exists()) {
            let c = text("取消").findOne(500);
            if (c) { c.click(); sleep(500); }
        }

        // 4. 若已直接在福利中心，无需重新导航
        if (wherePage() == "freecenter") {
            l_info("已在福利中心");
            return true;
        }

        // 5. 坚决禁止在主页/书架执行多次 back() 导致退出App！
        // 按照规范导航路径：点击底栏“我” -> 点击“福利中心”稳定进入
        l_info("从主页通过底栏导航返回：点击‘我’ -> 进入‘福利中心’...");
        enterMe();
        sleep(600);
        enterFreeCenter();
        sleep(800);

        return wherePage() == "freecenter";
    }
    // 通用：确保回到福利中心（先 back，再按需 enterFreeCenter 兜底）
    function ensureBackToFreeCenter(waitMs) {
        waitMs = waitMs || 1000;
        if (wherePage() == "freecenter") return;
        back();
        sleep(waitMs);
        if (wherePage() != "freecenter") enterFreeCenter();
    }
    function closeDialogs() {
        if (textContains("青少年模式").findOnce()) {
            l_verbose("青少年模式");
            let k = textMatches(/我知道了|知道了/).findOnce();
            if (k) k.click(); else click("我知道了", 0);
            sleep(500);
        }
        let unresp = text("确定").findOnce();
        if (unresp && textContains("无响应").findOnce()) {
            l_verbose("处理无响应弹窗");
            unresp.click();
            sleep(500);
        }
        let closeIdBtn = idMatches(/.*(upgrade_dialog_close_btn|btnClose|imgClose).*/).findOnce();
        if (closeIdBtn) {
            l_verbose("点击常见弹窗关闭按钮");
            closeIdBtn.click();
            sleep(500);
        }
    }
    function exchange() {
        let result = 0;
        let e = className("android.widget.ListView").findOne(500);
        if (e && e.parent() && e.parent().clickable()) {
            freeCenterScrolled = scrollShowButton(freeCenterScrolled, e);
            e.parent().click();
            l_verbose("点进签到日历");
            sleep(1000);
            scrollShowButton(device.height, 0); // 进入后它会自动向下滚，滚回
            sleep(500);
        } else {
            l_error("没找到链接，无法进入签到日历");
        }
        let d = className("android.widget.Button").text("去兑换 今日").findOne(1000);
        if (d) {
            // 今日是周日兑换
            l_verbose(shortdash);
            l_log(d.text());
            d.click();
            sleep(1200);
            let btns = className("android.widget.TextView").text("兑换").find();
            if (btns.length > 0) {
                let bigIndex = -1;
                let max = 0;
                for (let i = 0; i < btns.length; i++) {
                    // 确保只点击列表中的“兑换”按钮，避免误点到其他地方
                    if (btns[i].bounds().width() < 10 || btns[i].bounds().height() < 10) continue; 
                    let t1 = getDescriptionOnLeft(btns[i]);
                    let n1 = t1.replace(/[^\d.]/g, "") * 1;
                    if (n1 > max) {
                        bigIndex = i;
                        max = n1;
                    }
                }
                if (bigIndex > -1) {
                    let n1 = 0;
                    let r1 = "";
                    do {
                        let targetBtn = refreshView(btns[bigIndex]);
                        if (!targetBtn) break;
                        l_verbose(getDescriptionOnLeft(targetBtn));
                        targetBtn.click();
                        sleep(2000);
                        let p2 = className("android.widget.Button").text("兑换").findOne(1000);
                        if (p2) {
                            let t1 = getTextOfView(p2.parent());
                            r1 = t1.split("\n")[0];
                            l_verbose(t1);
                            sleep(1000);
                            p2.click();
                            sleep(1000);
                        } else {
                            l_error("未找到二次确认兑换按钮");
                            break;
                        }
                        if (textContains("拼图").exists()) {
                            let c1 = 0;
                            while (textContains("拼图").exists()) {
                                c1++;
                                setConPos(c1 % 2);
                                //toastLog
                                l_log("请手动过一下");
                                sleep((1 + c1 % 2) * 800);
                            }
                            if (c1 > 0) setConPos(0);
                        }
                        n1++;
                    } while (refreshView(btns[bigIndex]) && refreshView(btns[bigIndex]).text() == btns[bigIndex].text() && n1 < 5);
                    if (!refreshView(btns[bigIndex]) || refreshView(btns[bigIndex]).text() != btns[bigIndex].text()) {
                        showReceived(r1);
                        addReceived(r1.replace("兑换", ""));
                        result |= 0b10;
                        l_info("兑换成功");
                    } else {
                        l_error("似乎兑换失败");
                    }
                    exchangeCount++;
                } else {
                    l_warn("有兑换按钮，没找到对应说明");
                }
            }
        }

        // 兑换成功后可能弹出“兑换成功/恭喜获得”弹窗，先处理弹窗
        clickIknown();

        // 页面层级恢复：从“兑换子页”与“签到日历”双层彻底退回福利中心
        // 第一层：退出兑换子页回到签到日历
        l_verbose("退出兑换页面，返回签到日历...");
        back();
        sleep(800);
        clickIknown();

        // 第二层：退出签到日历回到福利中心
        l_verbose("退出签到日历，返回福利中心...");
        back();
        sleep(1000);
        clickIknown();

        // 强校验兜底：只要当前页面不是福利中心，持续返回并确认
        let backCount = 0;
        while (wherePage() != "freecenter" && backCount < 4) {
            let curWp = wherePage();
            l_warn("当前仍偏离福利中心(当前:" + (curWp || "未知") + ")，补充执行返回 (" + (backCount + 1) + "/4)...");
            back();
            sleep(1000);
            clickIknown();
            backCount++;
        }

        if (wherePage() != "freecenter") {
            l_warn("返回福利中心失败，尝试通过导航重新进入福利中心");
            enterFreeCenter();
        } else {
            l_info("已成功确认回到福利中心");
        }

        return result;
    }
    function lottery() {
        let result = 0;
        let cb = null;
        
        // 增加等待时间，确保福利中心页面在广告刷完后稳定
        l_verbose("准备进入抽奖流程，等待页面稳定...");
        sleep(1000);
        
        let e = className("android.widget.ListView").findOne(1000);
        if (e && e.parent() && e.parent().clickable()) {
            freeCenterScrolled = scrollShowButton(freeCenterScrolled, e);
            e.parent().click();
            l_verbose("点进签到日历");
            sleep(1500); // 增加进入后的等待时间
            
            let b = className("android.widget.Button").text("领奖励").findOne(1000);
            if (b) { 
                l_log(b.text());
                b.click();
                sleep(1500);
                clickIknown();
            }
            
            // 重新获取容器，防止滚动后失效
            let e_recheck = className("android.widget.ListView").findOne(500);
            if (e_recheck) scrollShowButton(device.height, 0); 
            sleep(1000);
            
            cb = className("android.widget.TextView").textContains("抽奖机会 ×").findOne(1000);
            if (!cb) cb = className("android.widget.TextView").text("做任务可抽奖").findOne(1000);
        } else {
            l_error("没找到链接或链接不可点击，无法进入签到日历");
            // 尝试兜底点击位置
            l_log("尝试坐标点击进入签到日历");
            click(500, 500); // 根据实际情况调整
            sleep(2000);
        }
        if (cb && (cb.text().indexOf("×") < 0 || (cb.text().indexOf("×") > 0 && cb.text().replace(/[^\d.]/g, "") * 1 > 0))) {
            // 有抽奖机会
            l_verbose(cb.text());
            scrollShowButton(0, cb);
            cb.click();
            sleep(1000);
            let n = 0;
            while (n < 5) {
                l_verbose(shortdash);
                let c = className("android.widget.TextView").text("抽奖").findOne(500);
                if (!c) {
                    let v = className("android.widget.TextView").text("做任务抽奖机会+1").findOne(500);
                    let refV = refreshView(v);
                    while (v != null && refV != null && v.text() == refV.text()) {
                        l_log(v.text());
                        v.click();
                        sleep(2000);
                        video_look(v);
                        sleep(1000);
                        c = className("android.widget.TextView").text("抽奖").findOne(500);
                    }
                }
                if (c) {
                    l_log(c.text());
                    let r = "";
                    c.click();
                    lotteryCount++;
                    sleep(800);
                    let n1 = 0;
                    while (n1 < 8) {
                        l_verbose("转");
                        sleep(1000);
                        n1++;
                        // 彻底修复：重新寻找按钮对象，防止旧对象 c 彻底失效导致的 parent() 为 null
                        let c_now = className("android.widget.TextView").text("抽奖").findOnce();
                        if (!c_now || !c_now.parent()) {
                            l_warn("抽奖按钮或父容器已消失");
                            break;
                        }
                        let p = c_now.parent();
                        let idx = c_now.indexInParent();
                        let r1 = (idx >= 1 && p.childCount() > idx - 1) ? getLotteryReceive(p.child(idx - 1)) : "";
                        let r2 = (idx >= 2 && p.childCount() > idx - 2) ? getLotteryReceive(p.child(idx - 2)) : "";
                        let r3 = (idx >= 3 && p.childCount() > idx - 3) ? getLotteryReceive(p.child(idx - 3)) : "";
                        if (r1 != "" && r1 == r2 && r2 == r3) {
                            if (r != "") {
                                if (r == r1) {
                                    addReceived(r);
                                    showReceived(r);
                                    result |= 0b01;
                                    break;
                                } else {
                                    r = "";
                                }
                            } else {
                                r = r3;
                            }
                        } else {
                            r = "";
                        }
                    }
                    if (n1 == 8) l_verbose("未获取到抽奖结果");
                    n = 0;
                    sleep(1000);
                } else {
                    break;
                }
                n++;
            }
            if (result & 0b01) l_info("抽奖完成");
            let closeBtn = className("android.widget.TextView").text("").findOne(1000);
            if (closeBtn) {
                closeBtn.click();
            } else {
                // 兜底方案：如果找不到特定字符，尝试点击右上角或按返回键
                l_warn("未发现抽奖关闭按钮，尝试返回");
                back();
            }
        }
        back();
        sleep(1500);
        return result;
    }
    function runGameTask() {
        // 执行玩游戏任务（支持多轮）
        let gamebtntext = "去完成";
        let gameremain = "再玩";
        do {
            let playLabel = textContains(gameremain).findOne(500);
            if (!playLabel) break;
            l_log(playLabel.text());
            let min = playLabel.text().replace(/[^\d.]/g, "") * 1;
            let b = null;
            let aa = text(gamebtntext).find();
            for (let i = 0; i < aa.length; i++) {
                let s = getDescriptionOnLeft(aa[i]);
                if (s && s.indexOf(gameremain) > -1) {
                    b = aa[i];
                    break;
                }
            }
            if (b != null) {
                robustClick(b);
                sleep(1500);
                let res = game_play(min);
                if (res == 1) back();
                sleep(1000);
                if (wherePage() == "gamecenter") back();
                sleep(1500);
                if (res > 1) break;
            } else {
                l_error("没找到对应的'去完成'按钮");
                break;
            }
        } while (textContains(gameremain).exists());
        l_info("结束玩游戏");
        freeCenterScrolled = 0;
    }
    function jumpMarket(btn) {
        sleep(1000);
        launchQidian();
    }

    function video_look(btn, isLimitTask) {
        adCount++;
        l_verbose("广告", adCount, "开始" + (isLimitTask ? "【限时任务】" : ""));
        
        let isSlideTask = false; // 是否为滑动任务
        let has_slide_reset = false; // 标记是否发生了滑动重置
        let hasExitedToFree = false; // 标记是否已确认返回福利中心或已处理完奖励弹窗

        try {
            // 引入外层大循环：用于处理滑动任务后的状态重置
            // 当发生滑动任务需要重新识别时，通过 continue ad_main_loop; 跳回这里
            ad_main_loop: while (true) {
            ad_raw = -1; ad_clicknewpage = -1; // 每次循环重置
            let m = 0;
            has_slide_reset = false; // 每次进入主循环重置标记
            let hasClickedInAppAd = false; // 标记是否在起点内部触发了广告点击/落地页
            let failedCoords = []; // 记录本广告内已点击但未跳转的无效死坐标（防止死磕同一个点）

            function clickAdButton(isResume, onlyExactMatch) {
                let stageTag = isResume ? "续看阶段" : "初次识别";
                let clicked = false;
                let lastTappedPoint = null;
                l_verbose(stageTag + "开始识别并点击激活按钮...");

                // 辅助函数：判断坐标是否落在历史失败死穴附近（80像素内）
                let isDeadCoord = function(x, y) {
                    for (let i = 0; i < failedCoords.length; i++) {
                        if (Math.hypot(x - failedCoords[i].x, y - failedCoords[i].y) < 80) return true;
                    }
                    return false;
                };
                
                // 1. 区域限制：底部浮层卡片通常在屏幕 62% 以下，优先扫描底部区间，彻底避开上方活动规则背景
                let startY = SCREEN.h62;
                let res_new = cappad([0, startY, device.width, device.height - startY]);
                
                // 如果未扫到文字，再向下稍微扩大到 50%
                if (!res_new || res_new.length == 0) {
                    l_verbose("首次OCR未识别到文字，稍微扩大区域重试...");
                    sleep(400);
                    startY = SCREEN.h50;
                    res_new = cappad([0, startY, device.width, device.height - startY]);
                }

                // 辅助函数：强化版穿透点击（解决防作弊过滤、手势遮挡、坐标偏移）
                let robustTapCTA = function(tag, txt, posX, posY) {
                    l_log(stageTag + tag + "：", txt, "@ (" + posX + "," + posY + ")");
                    lastTappedPoint = { x: posX, y: posY };
                    
                    // 1. 无障碍节点原生点击尝试（穿透能力最强）
                    try {
                        let accNode = text(txt).find().filter(n => n.bounds().top >= SCREEN.h55)[0];
                        if (accNode && (accNode.click() || (accNode.parent() && accNode.parent().click()))) {
                            sleep(200);
                        }
                    } catch (e) {}

                    // 2. 真实物理触摸模拟（持续按压120ms，绕过广告SDK防自动化脚本的0ms过滤）
                    // 优先点击屏幕水平绝对中心（device.width / 2），完全避开右下角摇摆的手势动画图层干扰
                    let centerX = SCREEN.centerX;
                    press(centerX, posY, 120);
                    sleep(80);

                    // 3. 如果识别到的坐标偏离中心，在原坐标处补按一次，形成双保险
                    if (Math.abs(posX - centerX) > 80) {
                        press(posX, posY, 100);
                    }
                };

                // 2. 文本有效性检测（过滤非按钮文字：几何门槛、错误样本库拦截、标点数字过滤、黑名单）
                let exactBtnPattern = /^(点击去浏览|继续浏览|继续观看|去微信.*|查看详情|立即体验|立即试玩|立即玩|开始玩|马上玩|试玩小游戏|畅玩小游戏|在线玩|立即下载|立即获得|去完成|立即抢购|立即购买|立即查看|免费领取|立即领取|立即打开|去看看|立即参与|立即秒杀|了解详情|了解更多|查看更多|查看商品)$/;
                let invalidPattern = /[\d\.\-\!\！\[\]\(\)\（\）\,\，\。\、\:\：\?\？\<\>\《\》\￥\¥\+\/]|1\.新下载|京东小游戏|京东生鲜|3亿玩家|在玩10万|人气榜|仅需¥|包邮|帮宝适|评判标准|活动仅限/;
                let blacklistPattern = /点击后|任务中|已成功|获得奖励|可得奖励|秒后|看完|抽奖机会|详情页|第三方|广告|版权|用户|新人|活动|规则|标准|评判|下载App|京东|淘宝|拼多多|包邮|谁懂|限一单|购买后|商品|当场|享受|福利|复购|单人|秒杀|立减|可获得|玩家|推荐|极品|条目|人气|排行榜|在玩|榜|箱|斤/;

                let isInvalidBtn = function(clean, bounds) {
                    if (!clean) return true;
                    // 核心几何门槛：真正的底部/中间卡片CTA大胶囊按钮在屏幕 55% 以下
                    if (bounds && bounds.top < SCREEN.h55) return true;
                    // 白名单优先通过
                    if (exactBtnPattern.test(clean)) return false;
                    // 正则拦截
                    if (invalidPattern.test(clean) || blacklistPattern.test(clean)) return true;
                    if (clean.length < 2 || clean.length > 12) return true;
                    if (clean.indexOf("游戏") > -1 && !/去微信|试玩|畅玩|在线|玩/.test(clean)) return true;
                    return false;
                };

                // 3. 优先级匹配（提取公共匹配逻辑，支持初次扫描与卡片滑出缓冲后的二次重试）
                let matchAndTapCTA = function(ocrResults, tagPrefix) {
                    if (!ocrResults || ocrResults.length == 0) return false;
                    let pTag = tagPrefix || "";

                    // 策略1：精确匹配完整的典型CTA按钮文本
                    // 注意：要求在屏幕 55% 以下，并选最靠下且非死坐标的真实大按钮
                    let matchedBtn = null;
                    for (let i = 0; i < ocrResults.length; i++) {
                        let clean = ocrResults[i].text.replace(/\s+/g, "");
                        let b = ocrResults[i].bounds;
                        if (exactBtnPattern.test(clean)) {
                            if (b.top >= SCREEN.h55 && !isDeadCoord(b.centerX(), b.centerY())) {
                                if (!matchedBtn || b.top > matchedBtn.bounds.top) {
                                    matchedBtn = { text: clean, bounds: b };
                                }
                            }
                        }
                    }
                    if (matchedBtn) {
                        let b = matchedBtn.bounds;
                        robustTapCTA(pTag + "策略1-精准匹配按钮（命中成功样本库）", matchedBtn.text, b.centerX(), b.centerY());
                        return true;
                    }

                    if (onlyExactMatch) return false;

                    // 策略2：前缀动词短语匹配（以“立即/去微信/去/开始/点击/免费/了解”开头且通过严格过滤与负样本比对）
                    let prefixes = ["立即", "去微信", "去", "开始", "点击", "免费", "了解"];
                    let prefixBtn = null;
                    for (let i = 0; i < ocrResults.length; i++) {
                        let clean = ocrResults[i].text.replace(/\s+/g, "");
                        let b = ocrResults[i].bounds;
                        if (isInvalidBtn(clean, b)) continue;
                        if (isDeadCoord(b.centerX(), b.centerY())) continue;
                        
                        let hasPrefix = false;
                        for (let p = 0; p < prefixes.length; p++) {
                            if (clean.startsWith(prefixes[p])) {
                                hasPrefix = true;
                                break;
                            }
                        }
                        if (hasPrefix) {
                            if (b.top >= SCREEN.h55) {
                                if (!prefixBtn || b.top > prefixBtn.bounds.top) {
                                    prefixBtn = { text: clean, bounds: b };
                                }
                            }
                        }
                    }
                    if (prefixBtn) {
                        let b = prefixBtn.bounds;
                        robustTapCTA(pTag + "策略2-前缀动词匹配", prefixBtn.text, b.centerX(), b.centerY());
                        return true;
                    }

                    // 策略3：距离标准底部大按钮黄金位置最近的候选文本（严格限制距离 < 120px 且必须含动词动作，杜绝帮宝适等商品名）
                    let candidates = [];
                    let targetX = SCREEN.centerX;
                    let targetY = SCREEN.h85; // 胶囊按钮黄金高度，一加ace5的位置就是这样（0.85更准，其他机型先不管）
                    let actionKeywords = ["查", "看", "点", "去", "领", "玩", "试", "抢", "开", "享", "下", "购", "参", "完", "解"];

                    for (let i = 0; i < ocrResults.length; i++) {
                        let clean = ocrResults[i].text.replace(/\s+/g, "");
                        let b = ocrResults[i].bounds;
                        if (isInvalidBtn(clean, b)) continue;
                        if (isDeadCoord(b.centerX(), b.centerY())) continue;

                        // 距离门槛：垂直差距必须在 120 像素以内，严禁把几百像素外的品牌词当按钮
                        if (Math.abs(b.centerY() - targetY) > 120) continue;

                        // 词性门槛：必须包含动作意向词
                        let hasActionWord = false;
                        for (let k = 0; k < actionKeywords.length; k++) {
                            if (clean.indexOf(actionKeywords[k]) > -1) {
                                hasActionWord = true;
                                break;
                            }
                        }
                        if (!hasActionWord) continue;

                        let dist = Math.hypot(b.centerX() - targetX, b.centerY() - targetY);
                        candidates.push({ text: clean, bounds: b, dist: dist });
                    }

                    if (candidates.length > 0) {
                        candidates.sort((a, b) => a.dist - b.dist);
                        let best = candidates[0];
                        robustTapCTA(pTag + "策略3-严格空间邻近动词匹配", best.text, best.bounds.centerX(), best.bounds.centerY());
                        return true;
                    }

                    return false;
                };

                // 执行策略1~3识别
                clicked = matchAndTapCTA(res_new);

                // 策略4：保底固定大按钮按压与多点动态偏移避让（若中心死穴则自动偏移）
                // 关键修正：初次识别阶段若未扫到CTA按钮，不盲点浮层黄金位；
                // 而是缓冲等待 3.5 秒（等待卡片滑出并扣减3.5秒）后二次OCR识别；若仍没有，交由剩余倒计时（约11.5秒）等待续看补偿
                if (!clicked && !onlyExactMatch) {
                    if (isResume) {
                        let centerX = SCREEN.centerX;
                        let centerCardY = SCREEN.h635; // 居中小游戏弹窗按钮位置（约1778）
                        let bottomBtnY = SCREEN.h845;  // 底部常驻大按钮黄金位置（一加Ace 5约2365px）

                        // 多点动态偏移候选（按任务场景决定谁优先）
                        let offsetCandidates = [];
                        if (isLimitTask) {
                            offsetCandidates = [
                                { x: centerX, y: centerCardY, desc: "居中卡片大按钮(限时)" },
                                { x: centerX, y: bottomBtnY, desc: "底部常驻大按钮" },
                                { x: centerX - 180, y: centerCardY, desc: "居中卡片左半部" },
                                { x: centerX + 180, y: centerCardY, desc: "居中卡片右半部" }
                            ];
                        } else {
                            offsetCandidates = [
                                { x: centerX, y: bottomBtnY, desc: "底部常驻大按钮" },
                                { x: centerX - 180, y: bottomBtnY, desc: "底部按钮左半部" },
                                { x: centerX + 180, y: bottomBtnY, desc: "底部按钮右半部" },
                                { x: centerX, y: centerCardY, desc: "居中卡片大按钮备选" }
                            ];
                        }

                        let chosen = null;
                        for (let c = 0; c < offsetCandidates.length; c++) {
                            if (!isDeadCoord(offsetCandidates[c].x, offsetCandidates[c].y)) {
                                chosen = offsetCandidates[c];
                                break;
                            }
                        }
                        if (!chosen) chosen = offsetCandidates[0]; // 全试过则重试

                        l_log(stageTag + "策略4-保底固定大按钮位置按压 [" + chosen.desc + "] @ (" + chosen.x + "," + chosen.y + ")");
                        press(chosen.x, chosen.y, 150);
                        lastTappedPoint = { x: chosen.x, y: chosen.y };
                        clicked = true;
                    } else {
                        l_log("初次识别暂未匹配到CTA按钮，等待 3.5 秒缓冲（等待浮层滑出）并二次识别...");
                        sleep(3500);
                        if (ad_clicknewpage > -1) ad_clicknewpage -= 3.5;

                        // 再次扫描底部区域（扩大至 55% 区间）
                        let res_retry = cappad([0, SCREEN.h55, device.width, SCREEN.h45]);
                        if (!res_retry || res_retry.length == 0) {
                            res_retry = cappad([0, SCREEN.h50, device.width, SCREEN.h50]);
                        }

                        clicked = matchAndTapCTA(res_retry, "二次识别-");
                        if (!clicked) {
                            l_verbose("二次识别仍未明确匹配到CTA按钮，交由剩余倒计时等待续看补偿");
                        }
                    }
                }

                if (clicked) {
                    l_verbose("等待 3.5 秒检测跳转状态...");
                    sleep(3500);

                    let raw_pkg = currentPackage();
                    let wp_now = wherePage();
                    let isPermDialog = wp_now == "permission" || hasBottomDialog() || isPermissionPkg(raw_pkg);

                    // 1. 顶部标题栏是京东，且下方出现弹窗：必须 back 关闭弹窗以恢复计时
                    if (isTopJdTitle() && isPermDialog) {
                        hasClickedInAppAd = true;
                        l_log("检测到顶部【京东】标题栏且下方弹出打开App弹窗（阻断计时），执行 back() 关闭弹窗恢复浏览...");
                        back();
                        sleep(1000);
                        // 弹窗阻断期间不计入有效倒计时，不扣除 3.5 秒
                    } else if (isPermDialog) {
                        // 普通系统权限/跳转弹窗正常后台计时，无需 back，保持继续等待
                        l_log("检测到系统权限/跳转授权弹窗（正常计时中），继续等待广告倒计时结束");
                        if (ad_clicknewpage > -1) ad_clicknewpage -= 3.5;
                    } else if (raw_pkg == qidianPackageName || isIgnoredOrFloatingApp(raw_pkg)) {
                        hasClickedInAppAd = true;
                        if (wp_now == "adframe" || wp_now == "freecenter") {
                            l_log("仍留在起点 App 主界面内（已记录应用内点击，广告结束后将执行 back() 退回）");
                            if (lastTappedPoint) failedCoords.push(lastTappedPoint);
                        } else {
                            l_info("检测到已打开起点内嵌落地页/商详页(" + (wp_now || "活动页") + ")，激活成功");
                        }
                        if (ad_clicknewpage > -1) ad_clicknewpage -= 3.5;
                    } else {
                        l_info("检测到已成功跳转至第三方应用：", getAppName(raw_pkg));
                        if (ad_clicknewpage > -1) ad_clicknewpage -= 3.5;
                    }
                }
                return clicked;
            }
            // 广告识别状态机：最多识别 7 轮（约 5-6 秒），彻底避免因页面残留“完成/任务”导致单次退出
            let maxOcrRounds = 7;
            for (let round = 0; round < maxOcrRounds; round++) {
                sleep(600);
                let wp = wherePage();
                
                // 全局验证码检测：任何一轮检测到验证码立即暂停供用户处理
                let hasCaptcha = false;
                let res_chap = cappad([0, 110, device.width, 740]); // 850-110=740
                hasCaptcha = res_chap.some(r => strHasArr(r.text, CAPTCHA_KEYWORDS));
                
                if (hasCaptcha) {
                    let c_count = 0;
                    while (hasCaptcha) {
                        c_count++;
                        l_log("检测到安全验证，请手动完成 (" + c_count + ")");
                        device.vibrate(500); // 震动提醒
                        sleep(2000);
                        let res_recheck = cappad([0, 110, device.width, 740]);
                        hasCaptcha = res_recheck.some(r => strHasArr(r.text, CAPTCHA_KEYWORDS));
                        if (c_count > 30) {
                            l_error("验证超时，跳过此任务");
                            return;
                        }
                    }
                    l_info("验证已完成，继续任务");
                    round = 0;
                    continue;
                }

                // 若检测到已直接跳转到第三方应用（如微信 com.tencent.mm、小游戏、外部应用等），按跳转/试玩类任务处理
                let curPkg = currentPackage();
                if (isExternalApp(curPkg)) {
                    l_info("检测到已直接进入外部应用/小游戏：[" + safeGetAppName(curPkg) + "]，按试玩跳转类广告处理");
                    ad_clicknewpage = 15; // 微信小游戏/外部跳转任务试玩15秒
                    break;
                }

                // 若刚点击后还在福利中心，多等一会儿过渡进入广告
                if (wp == "freecenter" && round < 3) {
                    l_verbose("等待进入广告页面... (" + (round + 1) + ")");
                    sleep(600);
                    continue;
                }

                // 核心区域快速识别
                let res_fast = ocrTopRegion();
                for (let i = 0; i < res_fast.length; i++) {
                    let txt = res_fast[i].text;
                    let fast_match = txt.match(/(\d+(?:\.\d+)?)\s*秒/);
                    if (fast_match) {
                        let fast_sec = parseFloat(fast_match[1]);
                        if (fast_sec > 0 && fast_sec < 200) {
                            l_log("核心区识别到时长：", txt, fast_sec, "秒，等待3.5秒确认类型...");
                            sleep(3500);
                            let res_check = ocrTopRegion();
                            let sec_after = -1;
                            for (let k = 0; k < res_check.length; k++) {
                                let match2 = res_check[k].text.match(/(\d+(?:\.\d+)?)\s*秒/);
                                if (match2) {
                                    sec_after = parseFloat(match2[1]);
                                    break;
                                }
                            }
                            if (sec_after >= 0 && sec_after < fast_sec) {
                                l_log("倒计时递减（" + fast_sec + "→" + sec_after + "），确认为观看类型");
                                ad_raw = fast_sec;
                            } else {
                                l_log("倒计时未变（" + fast_sec + "→" + sec_after + "），确认为点击后看类型");
                                ad_clicknewpage = fast_sec;
                                clickAdButton();
                            }
                            break;
                        }
                    }
                    
                    if (txt.indexOf("滑动") > -1 && res_fast[i].bounds.top < 1000) {
                        let sec = txt.replace(/[^\d.]/g, "") * 1 || 15;
                        l_log("优先识别到滑动任务：", sec);
                        isSlideTask = true;
                        ad_raw = sec;
                        break;
                    }

                    if (txt.indexOf("点击") > -1 || txt.indexOf("玩") > -1 || txt.indexOf("开玩") > -1 || txt.indexOf("小游戏") > -1) {
                        let sec = txt.replace(/[^\d.]/g, "") * 1 || 15;
                        l_log("点/玩/小游戏类型：", sec);
                        ad_clicknewpage = sec;
                        clickAdButton();
                        break;
                    }
                }

                if (ad_raw > -1 || ad_clicknewpage > -1) {
                    break;
                }

                // 无障碍兜底检测
                if (textContains("秒").exists() && (textContains("奖励").exists() || textContains("得").exists())) {
                    l_log("无障碍兜底识别到广告特征文字");
                    ad_raw = 15;
                    break;
                }
            }

            // 识别结果处理
            if (ad_raw == -1 && ad_clicknewpage == -1) {
                l_warn("未能通过倒计时识别广告类型，尝试判断是否处于旧版视频播放页");
            }

        if (ad_raw > -1 || ad_clicknewpage > -1) {
            // 新广告
            let sec = ad_clicknewpage;
            if (sec == -1) sec = ad_raw;
            sec += 2; // 多等两秒，应对严格的 15 秒限制
            let adSec = sec; // 保存广告原始时长，供续看遇到权限弹窗时使用
            isClickNewPage = ad_clicknewpage > -1; // 标记是否为"点击/玩"类型（会跳转新页面）
            if (isClickNewPage) {
                l_log("跳转类任务，预计等待 " + sec + " 秒...");
            }

            // 仅当屏幕最顶上“京东验证/热卖”标题栏一小块区域为京东，且下方出现弹窗时，才触发 back 关闭以恢复计时
            let checkJdDialog = function() {
                return isTopJdTitle() && hasBottomDialog();
            };
            if (checkJdDialog()) {
                l_log("检测到顶部【京东】标题栏且下方弹出打开App弹窗，执行 back() 关闭以恢复计时...");
                back();
                sleep(1000);
            }

            debugDelay = 3;
            while (sec > 0) {
                sleep(1000);

                if (isClickNewPage) {
                    // 跳转类任务若中途弹出“想要打开”跳转阻断弹窗，立即 back 关闭
                    if (sec % 3 == 0) {
                        if (checkJdDialog()) {
                            l_log("检测到京东授权弹窗阻断倒计时，执行 back() 关闭弹窗...");
                            back();
                            sleep(800);
                        }
                    }
                } else if (isSlideTask) {
                    // 滑动任务：每3秒滑动一次
                    if (sec % 3 == 0) {
                        swipe(device.width * 0.85, device.height / 2, device.width * 0.15, device.height / 2, 400);
                        l_verbose("执行滑动", sec);
                    }
                } else {
                    if (sec % 5 == 0) click(random(10, 20), random(10, 20));
                }
                sec--;
            }
            l_verbose("应该看完");
            debugDelay = 1;
            sleep(1000);

            // 滑动任务结束后再滑一次确保任务完成
            if (isSlideTask) {
                l_verbose("滑动任务结束，最后滑一次");
                swipe(device.width * 0.85, device.height / 2, device.width * 0.15, device.height / 2, 400);
                sleep(1000);
            }

            // "点击/玩"类型广告或在起点内部触发过点击，优先执行切换/返回操作
            if (isClickNewPage || hasClickedInAppAd) {
                sleep(1000);
                let curPkg = currentPackage();
                // 权限管理弹窗：直接 back 关闭
                if (isPermissionPkg(curPkg)) {
                    l_verbose("广告结束，检测到权限管理弹窗，直接 back 关闭");
                    back();
                    sleep(800);
                } else if (isExternalApp(curPkg)) {
                    l_verbose("点击/小游戏试玩结束，执行强制切换回起点");
                    ensureInQidian();
                }
                // 关键修复：不管是外部切回还是留在起点内部（打开了落地页/商详页/EndCard卡片）
                // 只要当前未回到福利中心，必须执行 back() 退回广告主界面或福利中心
                let wpCur = wherePage();
                if (wpCur != "freecenter") {
                    l_log("广告结束，执行 back() 关闭落地页/广告浮层 (" + wpCur + ")...");
                    back();
                    sleep(1000);
                    // 落地页彻底退净兜底：若顶上标题栏仍在京东验证/热卖等内嵌网页中，再次执行 back() 彻底退回
                    if (isTopJdTitle()) {
                        l_log("仍停留在京东内嵌页，再次执行 back() 彻底退出落地页...");
                        back();
                        sleep(1000);
                    }
                }

                if (isSlideTask) {
                    l_verbose("滑动任务，执行切换");
                    swipe(device.width * 0.8, device.height / 2, device.width * 0.2, device.height / 2, 500);
                    sleep(1500);
                }
            }

            // ==================== 1. 先识别是否需要续看/滑动（彻底看完整段广告，绝不提前盲点X） ====================
            let resumeLoops = 0;
            while (resumeLoops < 2) {
                resumeLoops++;

                // 极速拦截：若无障碍已明确检测到“已获得奖励”，彻底消灭伪续看
                if (textContains("恭喜已获得奖励").exists() || textContains("已获得奖励").exists() || textContains("恭喜获得").exists()) {
                    l_info("检测到【已获得奖励】，无需续看，直接准备点X退出");
                    break;
                }

                // 页面隔离：若当前顶上标题栏仍处于京东等落地页中，绝不当作续看，严防将商品流误当CTA按钮点击
                if (isTopJdTitle()) {
                    l_warn("检测到仍处于京东内嵌页面，禁止续看与二次点击，直接关闭落地页");
                    back();
                    sleep(800);
                    break;
                }

                let res_kw = ocrTopRegion(1000);
                // OCR二次校验：若扫到“已获得”或“恭喜”，直接跳出续看
                let alreadyRewarded = false;
                for (let i = 0; i < res_kw.length; i++) {
                    if (res_kw[i].text.indexOf("已获得") > -1 || res_kw[i].text.indexOf("恭喜") > -1) {
                        alreadyRewarded = true;
                        break;
                    }
                }
                if (alreadyRewarded) {
                    l_info("OCR确认【已获得奖励】，直接跳出续看");
                    break;
                }

                let needResume = false;
                let resumeSec = 0;

                for (let i = 0; i < res_kw.length; i++) {
                    let txt = res_kw[i].text;
                    if (txt.indexOf("秒杀") > -1) continue;

                    // 优先识别滑动指令
                    if (txt.indexOf("滑动") > -1) {
                        l_log("检测到滑动指令，立即执行滑动切换...");
                        swipe(device.width * 0.85, device.height / 2, device.width * 0.15, device.height / 2, 400);
                        sleep(2000);
                        isSlideTask = false;
                        has_slide_reset = true;
                        break;
                    }

                    // 识别续看指令（秒、观看、点击后、继续）
                    if (txt.indexOf("秒") > -1 || txt.indexOf("观看") > -1 || txt.indexOf("点击后") > -1 || (txt.indexOf("继续") > -1 && txt.indexOf("滑动") == -1)) {
                        let sec_tmp = txt.replace(/[^\d.]/g, "") * 1;
                        if (sec_tmp > 10 && sec_tmp < 200) {
                            resumeSec = sec_tmp;
                            needResume = true;
                            break;
                        } else if (txt.indexOf("观看") > -1 || txt.indexOf("点击后") > -1) {
                            resumeSec = 15;
                            needResume = true;
                            break;
                        }
                    }
                }

                if (has_slide_reset) {
                    continue ad_main_loop; // 重回主循环
                }

                if (needResume) {
                    if (resumeSec > 22) resumeSec = 15;
                    resumeSec += 2;
                    l_log("需续看 " + resumeSec + " 秒，开始续看...");
                    clickAdButton(true);

                    debugDelay = 3;
                    while (resumeSec > 0) {
                        sleep(1000);
                        resumeSec--;
                    }
                    l_verbose("续看完成");
                    debugDelay = 1;

                    // 续看结束后处理落地页返回
                    if (isClickNewPage || hasClickedInAppAd) {
                        let curPkgResume = currentPackage();
                        if (isExternalApp(curPkgResume)) {
                            ensureInQidian();
                        }
                        if (wherePage() != "freecenter") {
                            back();
                            sleep(1000);
                        }
                        isClickNewPage = false;
                        hasClickedInAppAd = false;
                    }
                } else {
                    break; // 无需续看，跳出进入点X退出阶段
                }
            }

            // ==================== 2. 确认无需续看后，执行点X退出 ====================
            if (wherePage() != "freecenter") {
                l_log("广告播放结束，点X前执行一次 back()...");
                back();
                sleep(500);
            }

            let n = 0;
            let max_click_rounds = 6;
            hasExitedToFree = false;

            while (n < max_click_rounds) {
                n++;

                // 核心极速通道 1：优先检测奖励弹窗（弹窗出现即100%证明已关闭广告并回到福利中心）
                if (clickIknown()) {
                    l_log("检测到奖励弹窗并已领取，直接确认回到福利中心");
                    hasExitedToFree = true;
                    break;
                }

                // 核心极速通道 2：福利中心底层特征识别
                if (wherePage() == "freecenter") {
                    l_log("已回到福利中心，跳出点X循环");
                    hasExitedToFree = true;
                    break;
                }

                let curPkgN = currentPackage();
                let wpN = wherePage();
                if (isExternalApp(curPkgN)) {
                    ensureInQidian();
                } else if (wpN == "browser" || wpN == "internal_web") {
                    back();
                    sleep(800);
                }

                // 优先点击无障碍直接识别到的“跳过”或“关闭”控件
                let skipBtn = textMatches(/^(跳过|关闭)$/).findOnce() || textMatches(/跳过|关闭/).findOnce();
                if (skipBtn) {
                    l_verbose("点击无障碍按钮: " + skipBtn.text());
                    robustClick(skipBtn);
                    sleep(600);
                }

                // 点击固定X坐标退出
                l_log("点击关闭X坐标 (" + fixedCloseXPos.x + ", " + fixedCloseXPos.y + ")");
                click(fixedCloseXPos.x, fixedCloseXPos.y);

                // 极速脉冲侦测：点X后以 300ms 间隔快速轮询，弹窗一出现瞬间秒点秒关（1~1.5秒内搞定）
                for (let poll = 0; poll < 4; poll++) {
                    sleep(300);
                    if (clickIknown()) {
                        l_log("点X后极速捕获奖励弹窗并已领取，成功回到福利中心");
                        hasExitedToFree = true;
                        break;
                    }
                    if (wherePage() == "freecenter") {
                        l_log("已回到福利中心，跳出点X循环");
                        hasExitedToFree = true;
                        break;
                    }
                }
                if (hasExitedToFree) break;

                if (n >= 2) {
                    l_warn("提示: 当前点击X坐标 (" + fixedCloseXPos.x + ", " + fixedCloseXPos.y + ")。若未点中关闭按钮，请在脚本开头修改 fixedCloseXPos");
                }

                // ==================== 3. 点X后挽留弹窗快速处理 ====================
                let btnBrowse = textMatches(/.*(点击去浏览|去浏览).*/).findOnce();
                let hasLeaveDialog = btnBrowse || textMatches(/现在退出|坚持退出|放弃奖励|残忍离开/).findOnce();
                if (hasLeaveDialog) {
                    if (btnBrowse) {
                        l_log("点X后触发挽留弹窗，点击【点击去浏览】继续完成...");
                        let b = btnBrowse.bounds();
                        if (b.width() > 0 && b.height() > 0) {
                            click(b.centerX(), b.centerY());
                        } else {
                            robustClick(btnBrowse);
                        }
                        sleep(15000); // 浏览 15 秒
                        click(fixedCloseXPos.x, fixedCloseXPos.y); // 浏览完再次点X退出
                        sleep(800);
                    } else {
                        let confirmLeave = textMatches(/坚持退出|放弃奖励|残忍离开|现在退出/).findOnce();
                        if (confirmLeave) {
                            l_log("点击弹窗离开: " + confirmLeave.text());
                            robustClick(confirmLeave);
                            sleep(800);
                        }
                    }
                    if (clickIknown() || wherePage() == "freecenter") {
                        hasExitedToFree = true;
                        break;
                    }
                }
            }

            // 仅在未成功退出时，才做二次判定与报错兜底
            if (!hasExitedToFree && wherePage() != "freecenter") {
                l_error("【机型适配提示】多次点击固定坐标 (" + fixedCloseXPos.x + ", " + fixedCloseXPos.y + ") 未能关闭广告！");
                l_warn(">> 不同机型分辨率不同，请开启手机【开发者选项->指针位置】获取右上角X坐标，并在脚本开头修改 fixedCloseXPos");
                enterFreeCenter();
            }

            // 判断是否因为滑动任务重置而跳出
            if (has_slide_reset) {
                l_log("因滑动任务重置，重回主识别流程...");
                continue ad_main_loop; 
            }
            
            isClickNewPage = false; // 任务结束，重置标记
            break ad_main_loop;     // 正常看完并点X退回福利中心，直接结束广告流程
        } else {
            // 检查是否已处于外部应用/小游戏
            let curPkgOld = currentPackage();
            if (isExternalApp(curPkgOld)) {
                l_info("检测到当前已处于外部应用/小游戏：[" + safeGetAppName(curPkgOld) + "]，按跳转试玩处理，试玩 15 秒后切回起点");
                sleep(15000);
                ensureInQidian();
                let wpAfter = wherePage();
                if (wpAfter == "browser" || wpAfter == "internal_web") {
                    back();
                    sleep(800);
                }
                click(fixedCloseXPos.x, fixedCloseXPos.y);
                sleep(1000);
                if (wherePage() != "freecenter") enterFreeCenter();
                break ad_main_loop;
            }

            // 兜底校验：确认是否真的在旧版视频广告播放界面
            let isOldVideoAd = textContains("可获得奖励").exists() || textContains("获得奖励").exists() || textContains("跳过").exists() || currentActivity().indexOf("Rewardvideo") > -1;
            if (!isOldVideoAd) {
                l_warn("未能识别广告且非旧版播放界面，执行兜底返回福利中心");
                ensureBackToFreeCenter(1000);
                break ad_main_loop;
            }

            // 旧广告，用旧方法
            if (className("android.widget.TextView").textContains("跳过").exists()) {
                let thread1 = threads.start(
                    function t() {
                        sleep(1000);
                        if (!className("android.widget.TextView").textContains("跳过").exists()) {
                            thread1.interrupt();
                            m = 0;
                            l_log("“跳过”2字没了");
                        }
                    }
                );
            }
            //获取退出坐标
            let video_quit = null;
            let x1 = 1, x2 = 1, y1 = 1, y2 = 1;
            let thread = threads.start(
                function coordinate() {
                    sleep(3000);
                    if (textContains("可获得奖励").exists() && !video_quit) {
                        video_quit = textContains("可获得奖励").findOne(500).bounds();
                        x1 = 0;
                        x2 = video_quit.left;
                        y1 = video_quit.top;
                        y2 = video_quit.bottom;
                        l_verbose("退出坐标", parseInt((x1 + x2) / 2), parseInt((y1 + y2) / 2));
                    } else {
                        l_verbose("计算退出坐标失败，稍后重新获取");
                        return;
                    }
                }
            );
            let m1 = 0;
            let video_flag = ""; //视频文字信息
            //判断视频是否播放到满足领取奖励条件
            let v = -1;
            do {
                if (textContains("获得奖励").exists()) {
                    video_flag = textContains("获得奖励").findOne(500).text();
                    if (textContains("有声书").exists()) {
                        video_flag = textContains("有声书").findOne(500).text();
                    }
                    let v1 = video_flag.replace(/[^\d.]/g, "") * 1;
                    if (v1 != v) {
                        l_verbose(video_flag);
                        if (v1 == 0) {
                            l_log('结束');
                            sleep(1200);
                            break;
                        } else {
                            v = v1;
                        }
                    }
                } else if (video_flag.includes("观看完视频")) {
                    l_log("看完结束");
                    sleep(1100);
                    break;
                } else {
                    sleep(1000);
                    m1++;
                }

                if (textContains("继续观看").exists()) {
                    textContains("继续观看").click();
                    sleep(1500);
                }
                if (textContains("继续听完").exists()) {
                    textContains("继续听完").click();
                    sleep(1500);
                }
                if (m1 > 20) {
                    l_log("已看20秒");
                    break;
                }
            } while (!(video_flag.includes("已") || m == 0));
            l_verbose("应该已获得奖励");
            thread.interrupt();

                    // 退出视频
                    if (wherePage() != "freecenter") {
                        l_log("视频播放结束，点X前执行一次 back()...");
                        back();
                        sleep(1000);
                    }
                    let n = 0;
                    let maxOldRounds = 8;
                    do {
                        n++;
                        if (wherePage() == "freecenter") {
                            l_log("已回到福利中心");
                            break;
                        }
                        let curPkgExit = currentPackage();
                        if (isExternalApp(curPkgExit)) {
                            l_verbose("检测到离开起点，执行强制切换回起点");
                            ensureInQidian();
                        }

                        if (n == 1 && x1 != x2 && y1 != y2) {
                            click(parseInt((x1 + x2) / 2), parseInt((y1 + y2) / 2));
                        } else if (textContains("可获得奖励").exists()) {
                            l_log("退出失败，重新获取退出坐标");
                            if (textContains("跳过").exists()) {
                                textContains("跳过").findOne(500).click();
                            } else {
                                if (textContains("可获得奖励").exists()) {
                                    video_quit = textContains("可获得奖励").findOne(500).bounds();
                                }
                                x1 = 0;
                                x2 = video_quit.left;
                                y1 = video_quit.top;
                                y2 = video_quit.bottom;
                                do {
                                    let x = random(x1, x2);
                                    let y = random(y1, y2);
                                    l_verbose("区域随机点击", x, y);
                                    click(x, y);
                                    if (textContains("继续观看").exists()) {
                                        textContains("继续观看").click();
                                        sleep(1500);
                                    }
                                    if (textContains("继续听完").exists()) {
                                        textContains("继续听完").click();
                                        sleep(1500);
                                    }
                                } while (textContains("可获得奖励").exists());
                            }
                        } else {
                            // 尝试点击固定X坐标退出
                            l_log("点击关闭X坐标 (" + fixedCloseXPos.x + ", " + fixedCloseXPos.y + ")");
                            click(fixedCloseXPos.x, fixedCloseXPos.y);
                            sleep(500);

                            // 若仍未退出且页面是网页落地页，尝试back
                            let wpExit = wherePage();
                            if (wpExit == "browser" || wpExit == "internal_web") {
                                l_verbose("关闭内嵌落地页");
                                back();
                                sleep(800);
                            }
                        }

                        if (n >= maxOldRounds) {
                            l_error("【机型适配提示】多次点击坐标 (" + fixedCloseXPos.x + ", " + fixedCloseXPos.y + ") 未能退出广告！");
                            l_warn(">> 不同机型分辨率不同，请开启手机【开发者选项->指针位置】获取右上角X坐标，并在脚本开头修改 fixedCloseXPos");
                            enterFreeCenter();
                            break;
                        }
                        sleep(1000);
                    } while (!btn.parent());
            }
            // 旧广告结束退出 ad_main_loop
            if (ad_raw == -1 && ad_clicknewpage == -1) ad_raw = 0; // 标记已完成，防止落入异常重试
            break ad_main_loop;
        } 
        if (ad_raw == -1 && ad_clicknewpage == -1) ad_raw = 0; // 标记广告已完成
        if (!hasExitedToFree) {
            clickIknown();
        }
        } finally {
            isClickNewPage = false; // 无论正常结束还是异常退出，强制重置标记
            debugDelay = 1;         // 恢复看护线程正常检测频率
        }
        l_verbose("广告", adCount, "结束");
        sleep(100);
    }
    function read_book(min) {
        let second = Math.floor(min * 60); // 确保是整数，使取模 % 逻辑生效
        let st = new Date().getTime();
        for (let i = 0; i < 2; i++) {
            // 确保进正文
            swipe(device.width * 3 / 4 + i, device.height / 2 + 105 + i, device.width / 4 + i, device.height / 2 + 100 + i, 500);
            sleep(900);
        }
        debugDelay = 30;
        let n = 0;
        do {
            if (text("跳转").exists() && text("取消").exists()) {
                let c = text("取消").findOne(500);
                if (c) {
                    l_verbose(c.text());
                    c.click(); // 不能点
                    c.parent().click();
                }
            }
            let a = 1000;
            if (second % 60 == 0) {
                l_log("阅读倒计时：" + (second / 60) + "分钟");
            }
            
            // 每 8 秒进行一次活跃滑动
            // 在屏幕靠右侧干净区域执行（远离左侧可能残留的悬浮控件），并且避开顶部通知栏
            if (second % 8 == 0 && second > 0) {
                l_log("执行活跃滑动 (上下滚动，剩余" + second + "s)");
                let swipeX = Math.floor(device.width * 0.75); // 靠右侧区域滑动
                // 向上滑动浏览（从下 75% 处滑到中上 45% 处）
                swipe(swipeX, Math.floor(device.height * 0.75), swipeX, Math.floor(device.height * 0.45), 600);
                sleep(600);
                // 向下滑动回位（从 45% 处滑回 75% 处，全程在屏幕中下部，绝不碰顶部任何悬浮窗区域）
                swipe(swipeX, Math.floor(device.height * 0.45), swipeX, Math.floor(device.height * 0.75), 600);
                sleep(300);
            } else {
                sleep(a);
            }
            second--;
        } while (second > -2);
        l_verbose("时间到");
        readTime += new Date().getTime() - st;
        debugDelay = 1;
        sleep(300);
        back();
        sleep(600);
    }
    function game_play(min) {
        let second = min * 60;
        swipe(device.width - 50, device.height / 3, device.width - 55, device.height / 2, 900);
        let num = 0;
        do {
            num++;
            l_verbose("缓冲……");
            sleep(1000);
            if (num > 8) {
                l_error("没成功获取到游戏中心");
                return 1;
            }
        } while (wherePage() != "gamecenter" && wherePage() != "browser");
        if (wherePage() == "gamecenter") {
            l_info("成功打开游戏中心");
            sleep(1000);
            if (text("在线玩").find().length < 2) {
                l_warn("未识别到“在线玩”");
                return 1;
            }
            let play_btn = text("在线玩").findOnce(0);
            scrollShowButton(0, play_btn);
            play_btn.click();
            l_log("在线玩");
            sleep(2000);
        }
        if (wherePage() == "browser") l_info("应该直接打开游戏了");
        l_verbose(shortdash);
        sleep(1000);

        debugDelay = 30;
        let st = new Date().getTime();
        do {
            if (textContains("实名认证").exists()) {
                //身份信息仅用于实名认证使用
                l_warn("似乎有实名认证，请先自行认证");
                sleep(2000);
                back();
                return 2;
            }
            if (second % 60 == 0) {
                l_verbose("倒计时" + (second / 60) + "分钟");
            }
            if (second % 5 == 0) {
                click(random(10, 20), random(10, 20));
            }
            sleep(1000);
            second--;
        } while (second > -5);
        debugDelay = 1;
        gamePlayTime += new Date().getTime() - st;
        l_log("时间到");
        let n = 0;
        do {
            if (currentPackage() != qidianPackageName) {
                launchQidian();
                sleep(2000);
            } else {
                back();
                sleep(800);
            }
            n++;
        } while (wherePage() == "" && n < 10);
        return 0;
    }
    function showCon() {
        //l_verbose("显示控制台");
        console.show();
        cmdIsDisplay = true;
        setConPos(0);
    }
    function setConPos(n) {
        if (n * 1 !== n) n = 0;
        if (n > c_pos.length - 1) n = 0;
        console.setPosition(c_pos[n][0], c_pos[n][1]);
    }
    function cappad(region) {
        let cid = cmdIsDisplay;
        // 只有当识别区域可能被控制台遮挡时，才隐藏控制台
        // 默认控制台位置 c_pos[0] 在顶部，c_pos[1] 在底部
        let needHide = cid;
        if (region && cid) {
            // 如果识别区域在底部 (y > 2000)，而控制台在顶部 (closeButtonBottom 附近)，则无需隐藏
            if (region[1] > closeButtonBottom + 200) { 
                needHide = false; 
            }
        }

        if (needHide) {
            console.hide();
            cmdIsDisplay = false;
            sleep(50);
        }
        
        let capimg = captureScreen();
        let res;
        if (region) {
            // region: [x, y, width, height]
            // 确保不越界
            let rx = Math.max(0, region[0]), ry = Math.max(0, region[1]);
            let rw = Math.min(device.width - rx, region[2]), rh = Math.min(device.height - ry, region[3]);
            let clip = images.clip(capimg, rx, ry, rw, rh);
            res = paddle.ocr(clip);
            // 将坐标偏移还原回全屏坐标
            res.forEach(item => {
                item.bounds.left += rx;
                item.bounds.top += ry;
                item.bounds.right += rx;
                item.bounds.bottom += ry;
            });
            clip.recycle();
        } else {
            res = paddle.ocr(capimg);
        }
        
        if (needHide) showCon();
        return res;
    }
    // 先识别中上部核心区域，无结果时扩大到上半部分兜底
    function ocrTopRegion(fallbackHeight) {
        let h = fallbackHeight || 1600;
        let res = cappad([0, 0, device.width, 1000]);
        if (res.length == 0) res = cappad([0, 0, device.width, h]);
        return res;
    }
    function l_exit() {
        debugDelay = -1;
        threads.shutDownAll();
        l_warn("退出");
        exit();
    }
    function myFormatDate(dt) {
        let m = String(dt.getMonth() + 1).padStart(2, '0');
        let d = String(dt.getDate()).padStart(2, '0');
        return "" + dt.getFullYear() + m + d;
    }
    function myFormatTime(dt) {
        let h  = String(dt.getHours()).padStart(2, '0');
        let m1 = String(dt.getMinutes()).padStart(2, '0');
        let s  = String(dt.getSeconds()).padStart(2, '0');
        let ms = String(dt.getMilliseconds()).padStart(3, '0');
        return h + ":" + m1 + ":" + s + "." + ms;
    }
    function writeLog(...a) {
        let dt = new Date();
        files.append(
            logFilePath + "/" + myFormatDate(dt) + ".log",
            myFormatTime(dt) + " " + a.join(" ") + "\n"
        );
    }
    // arguments
    function l_log(...s) {
        console.log.apply(console, s);
        if (logFile || debug) writeLog.apply(null, s);
    }
    function l_verbose(...s) {
        console.verbose.apply(console, s);
        if (logFile || debug) writeLog.apply(null, s);
    }
    function l_info(...s) {
        console.info.apply(console, s);
        if (logFile || debug) writeLog.apply(null, s);
    }
    function l_warn(...s) {
        console.warn.apply(console, s);
        if (logFile || debug) writeLog.apply(null, s);
    }
    function l_error(...s) {
        console.error.apply(console, s);
        if (logFile || debug) writeLog.apply(null, s);
    }
    function strHasArr(s, a) {
        return a.some(item => s.indexOf(item) > -1);
    }
    function textButtonExist(str) {
        let arr = Array.isArray(str) ? str : [str];
        return arr.some(s => text(s).exists());
    }
    function refreshView(v) {
        if (!v) return null;
        try {
            let p = v.parent();
            if (!p) return null;
            let idx = v.indexInParent();
            if (idx < 0 || idx >= p.childCount()) return null;
            return p.child(idx);
        } catch (e) {
            return null;
        }
    }
    function getLotteryReceive(v) {
        let top1 = v.bounds().top;
        let bottom1 = v.bounds().bottom;
        let c = v.child(0).children();
        for (let i = 0; i < c.length; i++) {
            if (c[i].className() == "android.widget.TextView") {
                if (c[i].bounds().top > top1 && c[i].bounds().bottom < bottom1) {
                    return c[i].text();
                }
            }
        }
        return "";
    }
    function scrollShowButton(scrolled, btn) {
        let btn_top = 0;
        if (typeof btn === "number" && !isNaN(btn)) btn_top = btn;
        else btn_top = btn.bounds().top;
        //log(scrolled, btn_top);
        let h4 = device.height / 4;
        let scroll1 = btn_top - scrolled - device.height * 3 / 4;
        if (scroll1 > device.height / 8) {
            let scroll2 = scroll1;
            for (let i = 0; i < Math.floor(scroll1 / h4); i++) {
                swipe(device.width - 50, device.height * 7 / 8, device.width - 60, device.height * 7 / 8 - h4, 300);
                sleep(100);
                scroll2 -= h4;
            }
            swipe(device.width - 50, device.height * 7 / 8, device.width - 60, device.height * 7 / 8 - scroll2, 500);
            sleep(800);
            return scrolled + scroll1;
        }
        if (scrolled > 0 && btn_top - scrolled < 0) {
            scroll1 = scrolled - btn_top;
            let scroll2 = scroll1;
            for (let i = 0; i < Math.floor(scroll1 / h4); i++) {
                swipe(device.width - 50, device.height / 4, device.width - 60, device.height / 4 + h4, 300);
                sleep(100);
                scroll2 -= h4;
            }
            swipe(device.width - 50, device.height / 4, device.width - 60, device.height / 4 + scroll2, 500);
            sleep(800);
            return scrolled - scroll1;
        }
        return scrolled;
    }
    function getTextOfView(v, e, depth) {
        if (v.equals(e)) return "";
        // 增加递归深度限制，防止在极端复杂的 UI 树下导致栈溢出
        depth = depth || 0;
        if (depth > 15) return ""; 

        if (v.className() == "android.widget.TextView") {
            // 每个节点只取一次 text()，减少无障碍 IPC 次数（TextView 空文本时继续看子节点，行为与原版一致）
            let txt = v.text();
            if (txt != "") return txt;
        }
        let v1 = v.children();
        if (v1.length > 0) {
            let t = new Array();
            for (let i = 0; i < v1.length; i++) {
                let t1 = getTextOfView(v1[i], e, depth + 1);
                if (t1 != "") t.push(t1);
            }
            return t.join("\n");
        }
        return "";
    }
    function robustClick(targetObj) {
        if (!targetObj) return false;
        let isClicked = false;
        if (targetObj.click()) {
            isClicked = true;
        } else if (targetObj.parent() && targetObj.parent().click()) {
            isClicked = true;
        } else if (targetObj.parent() && targetObj.parent().parent() && targetObj.parent().parent().click()) {
            isClicked = true;
        } else {
            // 坐标点击兜底
            let b = targetObj.bounds();
            if (b.width() > 0 && b.height() > 0) {
                click(b.centerX(), b.centerY());
                isClicked = true;
            }
        }
        return isClicked;
    }

    function getDescriptionOnLeft(b) {
        // 调试：输出当前按钮的位置信息
        // l_verbose("分析按钮位置: " + b.bounds());
        
        // 尝试在当前层级及向上三层寻找描述文本
        let curr = b;
        for (let depth = 0; depth < 4; depth++) { // 增加到4层
            if (!curr) break;
            let p = curr.parent();
            if (!p) break;
            
            let j = curr.indexInParent();
            let t = curr.bounds().top;
            let c = p.children();
            let r = new Array();
            
            for (let i = 0; i < c.length; i++) {
                if (!c[i]) continue;
                // 寻找水平方向上相近的文本（垂直差距在200像素以内）
                // 且必须在按钮的左侧（bounds.left < b.bounds.left）
                if (i != j && Math.abs(c[i].bounds().top - t) < 200) {
                    let t1 = getTextOfView(c[i]);
                    if (t1 != "") r.push(t1);
                }
            }
            
            if (r.length > 0) {
                let desc = r.join("\n");
                // l_verbose("层级 " + depth + " 找到描述: " + desc);
                return desc;
            }
            curr = p; // 向上找一层
        }
        
        // 如果还没找到，尝试全局寻找距离该按钮最近的 TextView
        // l_verbose("层级搜索失败，尝试坐标邻近搜索");
        return "";
    }
    function getTaskCategory(btn) {
        if (!btn) return 0;
        // 快速提取按钮父卡片及其上下文文本
        let s = "";
        let parent = btn.parent();
        if (parent) s = getTextOfView(parent);
        if (!s || s.length < 2) s = getDescriptionOnLeft(btn);

        // 明确排除无需点击的非广告业务
        if (s.indexOf("充值") > -1 || s.indexOf("更新提醒") > -1 || s.indexOf("分享") > -1) {
            return 0;
        }
        if (s.indexOf("广告") > -1 || s.indexOf("限时") > -1 || s.indexOf("加点") > -1) {
            return 1; // 广告视频/激励任务
        }
        if (s.indexOf("市场") > -1) {
            return 2; // 应用市场任务
        }
        return 0;
    }

    function showReceived(r) {
        if (r.indexOf("章节卡") > -1 || r.indexOf("点币") > -1 || r.substring(r.length - 1) == "点") l_info(r);
        else l_log(r);
    }
    function addReceived(r) {
        r = r.replaceAll(" ", "");
        while (r.substring(0, 1) == "+") r = r.substring(1);
        if (r.indexOf("满") > -1 && r.indexOf("-") > -1) {
            let t = r.split("-");
            t[0] = t[0].replace(/[^\d.]/g, "");
            r = t.join("-");
        }
        if (r in ADReceive) ADReceive[r]++;
        else ADReceive[r] = 1;
    }
    function clickIknown() {
        // 极速匹配：只做 1 次高效子串跨进程检索，耗时仅数十毫秒
        let tmp = textContains("恭喜").findOnce();
        if (tmp) {
            let t1 = tmp.text() || "";
            // 直接由节点自身文本排除“限时加点”，杜绝二次跨进程遍历整树
            if (t1.indexOf("限时加点") == -1 && t1.indexOf("做任务") == -1) {
                showReceived(t1);
                let a = "恭喜获得";
                let idx = t1.indexOf(a);
                if (idx > -1) {
                    addReceived(t1.substring(idx + a.length));
                } else {
                    addReceived(t1);
                }

                // 核心提速：使用单次带短超时的正则等待，按钮一渲染瞬间秒捕获（彻底消灭串行||多轮空扫）
                let iknow = textMatches(/^(知道了|开心收下|我知道了|确定|确认|领取)$/).findOne(1200);
                if (iknow) {
                    l_verbose("点击弹窗按钮: " + iknow.text());
                    robustClick(iknow);
                    sleep(150);
                    return 1;
                }
                return 1;
            }
        }

        // 居中孤立弹窗检测（单次正则快照，杜绝串行 || 扫描）
        let directBtn = textMatches(/^(知道了|开心收下|我知道了)$/).findOnce();
        if (directBtn) {
            let b = directBtn.bounds();
            if (b.centerY() > device.height * 0.35 && b.centerY() < device.height * 0.85) {
                l_verbose("快速点击屏幕中间弹窗按钮: " + directBtn.text());
                robustClick(directBtn);
                sleep(150);
                return 1;
            }
        }
        return 0;
    }
    function sortFormatReceive() {
        function rmBracket(s) {
            if (s.substr(-1) == ")") s = s.substring(0, s.lastIndexOf("("));
            if (s.substr(-1) == "）") s = s.substring(0, s.lastIndexOf("（"));
            return s;
        }
        function indexFirstNotNum(str) {
            for (let i = 0; i < str.length; i++) {
                let n = str.substring(i, i + 1) * 1;
                if (isNaN(n)) return i;
            }
            return -1;
        }
        function indexLastNum(str) {
            for (let i = str.length - 1; i > 0; i--) {
                let n = str.substring(i - 1, i) * 1;
                if (!isNaN(n)) return i;
            }
            return -1;
        }
        function indexLastNotNum(str) {
            for (let i = str.length - 1; i > 0; i--) {
                let n = str.substring(i - 1, i) * 1;
                if (isNaN(n)) return i;
            }
            return -1;
        }
        let s = new Object();
        Object.keys(ADReceive).forEach(k => {
            let k1 = k;
            if (k1.indexOf("×") > -1) k1 = k1.replace("×", "");
            k1 = rmBracket(k1);
            let p = indexLastNum(k1);
            let p1 = indexLastNotNum(k1);
            let a1 = "";
            if (p1 > p) {
                //文字在数字后面 或没数字
                if (p < 0) a1 = k1;
                else a1 = "0" + k1.substring(p);
            } else {
                //文字在数字前
                a1 = "0" + k1.substring(0, p1);
            }
            if (!(a1 in s)) s[a1] = new Object();
            s[a1][k] = ADReceive[k];
        });
        let s1 = new Object();
        let ak = Object.keys(s).sort();
        for (let i = 0; i < ak.length; i++) {
            s1[ak[i]] = new Object();
        }
        Object.keys(s).forEach(k => {
            let t = Object.keys(s[k]).sort((a, b) => {
                a = rmBracket(a);
                b = rmBracket(b);
                let p1 = a.indexOf("-");
                let p2 = b.indexOf("-");
                if (p1 > -1) a = a.substring(p1 + 1);
                if (p2 > -1) b = b.substring(p2 + 1);
                let a1 = a.match(/(\d+)/g);
                let b1 = b.match(/(\d+)/g);
                return b1[0] * 1 - a1[0] * 1;
            });
            for (let i = 0; i < t.length; i++) {
                s1[k][t[i]] = s[k][t[i]];
            }
        });
        let a = new Array();
        Object.keys(s1).forEach(k => {
            Object.keys(s1[k]).forEach(n => {
                a.push((" " + ADReceive[n] + " × ").concat(n).concat("\n"));
            });
        });
        return a;
    }
    function formatTime(t) {
        let s = Math.floor(t / 1000);
        if (s < 60) return "".concat(s) + "秒";
        let m = Math.floor(s / 60);
        s = s % 60;
        if (m < 60) return "".concat(m) + "分" + s + "秒";
        let h = Math.floor(m / 60);
        m = m % 60;
        return "".concat(h) + "时" + m + "分" + s + "秒";
    }
    function reviewResults() {
        let r = new Array();
        r.push("当前账号：");
        r.push(nickname.concat("\n"));
        r.push("本次总用时" + formatTime(new Date().getTime() - startTime) + "\n");
        if (exchangeCount > 0) {
            r.push("兑换");
            r.push(exchangeCount);
            r.push("次\n");
        }
        if (adCount > 0) {
            r.push("看");
            r.push(adCount);
            r.push("个广告\n");
        }
        if (lotteryCount > 0) {
            r.push("抽奖");
            r.push(lotteryCount);
            r.push("次\n");
        }
        if (readTime > 0) {
            r.push("阅读 " + formatTime(readTime) + "\n");
        }
        if (gamePlayTime > 0) {
            r.push("玩游戏 " + formatTime(gamePlayTime) + "\n");
        }
        if (Object.keys(ADReceive).length > 0) {
            r.push("获得：\n");
            r = r.concat(sortFormatReceive());
        } else {
            r.push("未获得奖励");
        }
        return r;
    }

    // 正式开始------------------------------------------------------------------
    var debugDelay = 1;
    var debugLoop = null;
    var outPackageStartTime = 0; // 记录离开起点的时间

    if (true) { // 包名看护线程，始终开启
        debugLoop = threads.start(
            function t() {
                let n = 0, a = 1000, b = 0;
                while (debugDelay > 0) {
                    b = 0;
                    n++;
                    
                    let p = currentPackage();
                    // 包名检测逻辑：仅当真正离开起点 APP 时才进行看护计时，在起点内绝不调用 wherePage 抢占无障碍资源
                    if (isExternalApp(p)) {
                        let wpGuard = wherePage();
                        if (wpGuard != "adframe" && wpGuard != "freecenter") {
                            // 如果是"点击/玩"类型广告正在等待倒计时，跳过自动返回，避免任务中断
                            if (isClickNewPage && adCount > 0) {
                                outPackageStartTime = 0; 
                            } else if (outPackageStartTime == 0) {
                                outPackageStartTime = new Date().getTime();
                            } else {
                                let outTime = (new Date().getTime() - outPackageStartTime) / 1000;
                                if (outTime > 25) {
                                    l_warn("在起点外停留超过25秒(" + Math.floor(outTime) + "s)，正在尝试返回...");
                                    launchQidian();
                                    outPackageStartTime = 0; // 重置
                                }
                            }
                        } else {
                            outPackageStartTime = 0;
                        }
                    } else {
                        outPackageStartTime = 0; // 在起点内，瞬间重置时间，0耗时
                    }

                    if (n >= debugDelay) {
                        let st = new Date().getTime();
                        if (debug) writeLog(p, getAppName(p), currentActivity(), wherePage());
                        n = 0;
                        b = new Date().getTime() - st;
                    }
                    if (b < a) sleep(a - b);
                }
            }
        );
    }


    // 打开起点
    let alreadyInFreeCenter = openQidian();
    l_log(longdash);

    // 进入福利中心
    if (!alreadyInFreeCenter) {
        enterFreeCenter();
    } else {
        l_info("当前已在福利中心");
    }
    l_log(longdash);
    sleep(500);

    try {
        // 签到里面的兑换
        if (new Date().getDay() == 0) {
            l_log("开始兑换");
            if (exchange() == 0) l_log("无兑换");
            l_log(longdash);
            sleep(1000);
        }

        // ==================== 1. 优先检查【限时加点】任务（支持去完成与去阅读多轮交替） ====================
        l_log("检查【限时加点】任务...");
        let limitTaskLoop = 0;
        let maxLimitLoops = 8; // 安全上限防护：最多交替执行 8 轮

        while (limitTaskLoop < maxLimitLoops) {
            limitTaskLoop++;
            // 彻底弃用 findOne(timeout) 轮询机制，采用 findOnce() 单次快照毫秒级检索，彻底消灭假死卡顿
            let limitNode = textContains("广告·加点").findOnce() || text("【限时】").findOnce() || textContains("加点！").findOnce() || textContains("阅读·加点").findOnce();
            if (!limitNode) {
                if (limitTaskLoop == 1) {
                    l_info("当前无【限时加点】任务，继续后续流程");
                } else {
                    l_info("【限时加点】任务已全部完成或消失");
                }
                break;
            }

            let nodeBounds = limitNode.bounds();

            // 1. 优先精准识别“已完成/已领取”状态（杜绝重复做或串读别的任务）
            // 判定条件：卡片范围（垂直偏差 < 160px）内出现“今日福利已领完”、“已领完”、“明日可继续”或按钮显示“已领取”
            let isLimitCompleted = false;
            let finishKeywords = ["今日福利已领完", "已领完", "明日可继续", "已领取"];
            for (let fi = 0; fi < finishKeywords.length; fi++) {
                let fNodes = textContains(finishKeywords[fi]).find();
                for (let fj = 0; fj < fNodes.length; fj++) {
                    let fb = fNodes[fj].bounds();
                    if (Math.abs(fb.centerY() - nodeBounds.centerY()) < 160) {
                        isLimitCompleted = true;
                        break;
                    }
                }
                if (isLimitCompleted) break;
            }

            if (isLimitCompleted) {
                l_info("【限时加点】检测到已领完状态（今日福利已领完/已领取），退出限时任务阶段");
                break;
            }

            // 2. 严格在当前卡片同一行内（垂直偏差 < 130px，且在标题右侧）定位操作按钮，杜绝误抓下方其他任务
            let limitActionBtn = null;
            let limitActionType = "video";
            let limitBtnText = "";
            let limitReadMinutes = 1;

            let candidateBtns = ["去阅读", "看视频", "去完成", "看广告"];
            for (let bi = 0; bi < candidateBtns.length; bi++) {
                let bText = candidateBtns[bi];
                let btns = text(bText).find();
                for (let i = 0; i < btns.length; i++) {
                    let btn = btns[i];
                    let btnB = btn.bounds();
                    // 必须在标题同一卡片行内（纵向距离 < 130px，且在标题右侧）
                    if (Math.abs(btnB.centerY() - nodeBounds.centerY()) < 130 && btnB.left >= nodeBounds.left) {
                        limitActionBtn = btn;
                        limitBtnText = bText;
                        break;
                    }
                }
                if (limitActionBtn) break;
            }

            if (!limitActionBtn) {
                l_info("当前【限时加点】卡片无未完成的操作按钮，退出限时流程");
                break;
            }

            // 获取卡片上下文文本（限制在限时加点卡片范围内，严禁全局跨卡片盲搜）
            let cardText = limitNode.text() || "";
            let btnParent = limitActionBtn.parent();
            if (btnParent) cardText += " " + getTextOfView(btnParent);
            cardText += " " + getDescriptionOnLeft(limitActionBtn);

            // 判断任务类型：若包含“广告”或按钮是“看视频/看广告”，归类为广告；若按钮是“去阅读”或明确含“阅读”，归类为阅读
            if (limitBtnText == "去阅读" || (cardText.indexOf("阅读") > -1 && cardText.indexOf("广告") == -1)) {
                limitActionType = "read";
                // 仅从卡片内部文本中精准提取“再阅读/阅读 X 分钟”
                let m = cardText.match(/(?:再阅读|再读|阅读)\s*(\d+)\s*分钟/);
                if (m && m[1]) {
                    let parsed = parseInt(m[1], 10);
                    if (parsed > 0 && parsed <= 120) limitReadMinutes = parsed;
                }
                limitReadMinutes = Math.min(Math.max(limitReadMinutes, 1), 60);
            } else {
                // 默认“去完成”/“看广告”等归类为广告任务
                limitActionType = "video";
            }

            l_info("执行第 " + limitTaskLoop + " 轮【限时加点】，类型：" + (limitActionType == "read" ? "阅读 (" + limitReadMinutes + "分钟)" : "广告视频") + "，按钮：" + limitBtnText);

            freeCenterScrolled = scrollShowButton(freeCenterScrolled, limitActionBtn);
            limitActionBtn = refreshView(limitActionBtn);

            if (limitActionBtn) {
                if (limitActionType == "read") {
                    robustClick(limitActionBtn);
                    sleep(2000);
                    let wp = wherePage();
                    if (wp == "index") {
                        l_info("跳转到了主页/书架，识别书籍《" + targetBookName + "》");
                        let book = text(targetBookName).findOne(2000);
                        if (book) {
                            l_log("找到《" + targetBookName + "》，开始阅读 " + (limitReadMinutes * 60 + 20) + " 秒");
                            if (book.parent() && book.parent().clickable()) {
                                book.parent().click();
                            } else {
                                click(book.bounds().centerX(), book.bounds().centerY());
                            }
                            sleep(1000);
                            read_book(limitReadMinutes + 0.34);
                        } else {
                            l_warn("未在主页找到《" + targetBookName + "》，默认随机翻阅");
                            read_book(limitReadMinutes);
                        }
                        returnToFreeCenterFromReading();
                    } else if (wp == "read") {
                        l_info("已直接进入阅读界面，开始阅读 " + limitReadMinutes + " 分钟");
                        read_book(limitReadMinutes);
                        returnToFreeCenterFromReading();
                    } else {
                        l_warn("点击去阅读后未检测到阅读界面(当前页面:" + wp + ")，进行安全等待与回退");
                        let safeWaitSec = Math.min(limitReadMinutes * 60, 60); // 兜底最多等待60秒，杜绝死锁
                        sleep(safeWaitSec * 1000);
                        if (wherePage() != "freecenter") enterFreeCenter();
                    }
                } else {
                    // 执行限时视频广告
                    robustClick(limitActionBtn);
                    sleep(1000);
                    adRetryCount = 0;
                    video_look(limitActionBtn, true);
                    while (ad_raw == -1 && ad_clicknewpage == -1 && adRetryCount < 2) {
                        adRetryCount++;
                        l_warn("限时广告识别未完成，第" + adRetryCount + "次重试：重新定位并进入...");
                        ensureBackToFreeCenter(1000);
                        sleep(800);
                        let reBtn = text(limitBtnText).findOne(1000);
                        if (reBtn) {
                            robustClick(reBtn);
                            sleep(1000);
                            video_look(reBtn, true);
                        } else {
                            break;
                        }
                    }
                }
            }
            // 极速等待 400ms 供福利中心卡片状态刷新
            sleep(400);
            if (freeCenterScrolled > 0) {
                freeCenterScrolled = scrollShowButton(freeCenterScrolled, 0);
                sleep(300);
            }
        }
        l_info("【限时加点】所有轮次处理完毕");
        freeCenterScrolled = scrollShowButton(freeCenterScrolled, 0);
        l_log(longdash);
        sleep(1000); // 增加滚回顶部的静止等待时间，避免手势抬起瞬间误触顶部签到等卡片

        // ==================== 2. 开始常规广告任务 ====================
        let scrollCount = 0;
        let gameTaskDone = false; // 广告滚动时检测并执行游戏任务
        let adRetryCount = 0; // 广告识别失败重试计数
        let totalAdLoops = 0; // 总循环防护计数
        let noProgressCount = 0; // 连续无有效进展计数
        while (totalAdLoops < 40) {
            totalAdLoops++;
            let foundOnThisScreen = false;
            let currentTaskSuccess = true;

            // 单次正则快照匹配所有候选任务按钮，杜绝嵌套双层循环
            let aa = textMatches(/看视频|去完成/).find();
            for (let ii = aa.length - 1; ii >= 0; ii--) {
                let btn = aa[ii];
                let c = getTaskCategory(btn);
                if (c == 0) continue;

                let target = btn.text();
                freeCenterScrolled = scrollShowButton(freeCenterScrolled, btn);

                // 使用强化点击逻辑
                let isClicked = robustClick(btn);
                
                // 只有点击成功后才执行验证码等待
                if (isClicked && target == "去完成" && isFirstGoComplete) {
                    l_log("点击成功，开始强制等待 10 秒供处理验证码...");
                    device.vibrate(500); // 震动提醒
                    for (let t = 10; t > 0; t--) {
                        l_verbose("等待中... " + t);
                        sleep(1000);
                    }
                    l_info("等待结束，继续任务");
                    isFirstGoComplete = false; // 标记已处理过
                }

                sleep(500);
                if (c == 1) {
                    adRetryCount = 0; // 每个广告任务独立计数重试次数
                    video_look(btn);
                    // 广告识别失败重试：关闭广告再重新进入，最多重试2次
                    while (ad_raw == -1 && ad_clicknewpage == -1 && adRetryCount < 2) {
                        adRetryCount++;
                        l_warn("广告识别失败，第" + adRetryCount + "次重试：关闭广告重新进入...");
                        back();
                        sleep(1000);
                        // 重新定位并点击任务按钮
                        let reBtns = text(target).find();
                        let reFound = false;
                        for (let ri = 0; ri < reBtns.length; ri++) {
                            if (getTaskCategory(reBtns[ri]) == 1) {
                                robustClick(reBtns[ri]);
                                sleep(1000);
                                video_look(reBtns[ri]);
                                reFound = true;
                                break;
                            }
                        }
                        if (!reFound) {
                            l_error("重试失败：未找到任务按钮");
                            break;
                        }
                    }
                    if (ad_raw == -1 && ad_clicknewpage == -1) {
                        l_error("广告识别失败，已重试" + adRetryCount + "次，放弃此任务");
                        currentTaskSuccess = false;
                    }
                }
                if (c == 2) jumpMarket(btn);
                foundOnThisScreen = true;
                if (currentTaskSuccess) {
                    scrollCount = 0; // 任务成功，重置滚动
                    noProgressCount = 0;
                } else {
                    noProgressCount++;
                    if (noProgressCount >= 2) {
                        l_warn("连续任务异常，尝试滑动跳过当前卡点...");
                        scrollCount++;
                    }
                }
                sleep(400); // 极速缓冲等待列表刷新
                break; 
            }

            if (foundOnThisScreen && noProgressCount < 2) continue; 

            if (scrollCount < 3) {
                l_verbose("当前屏幕未发现新广告，尝试向下滑动寻找...");
                swipe(device.width / 2, device.height * 0.8, device.width / 2, device.height * 0.3, 500);
                freeCenterScrolled += (device.height * 0.5);
                scrollCount++;
                // 滚动后检测并执行游戏任务
                if (enableGameTask && !gameTaskDone) {
                    if (textContains("再玩").exists() || textContains("玩游戏").exists()) {
                        l_log("检测到游戏任务，直接执行");
                        gameTaskDone = true;
                        runGameTask();
                    }
                }
                sleep(700);
            } else {
                break;
            }
        }
        if (adCount > 0) {
            l_verbose(shortdash);
            l_info("结束看广告");
        } else {
            l_log("无广告");
        }
        freeCenterScrolled = scrollShowButton(freeCenterScrolled, 0);
        l_log(longdash);
        sleep(1000); // 增加滚回顶部的静止等待时间，消除手势释放落点误触

        // 签到里面的抽奖
        if (enableLottery) {
            l_log("开始抽奖");
            if (lottery() == 0) l_log("无抽奖");
            freeCenterScrolled = scrollShowButton(freeCenterScrolled, 0);
        } else {
            l_log("抽奖已关闭");
        }
        l_log(longdash);

        // 玩游戏（若已在广告滚动时执行则跳过）
        if (enableGameTask && !gameTaskDone) {
            // 广告结束后页面已滚回顶部，先尝试找到"再玩"
            let playLabel = textContains("再玩").findOne(500);
            if (!playLabel) {
                l_verbose("'再玩'不可见，向下查找");
                swipe(device.width / 2, device.height * 0.8, device.width / 2, device.height * 0.3, 500);
                freeCenterScrolled += (device.height * 0.5);
                sleep(600);
                playLabel = textContains("再玩").findOne(500);
            }
            if (playLabel) {
                l_log("开始玩游戏");
                runGameTask();
                freeCenterScrolled = scrollShowButton(freeCenterScrolled, 0);
            } else {
                l_log("未找到游戏任务");
            }
        }

        // 领游戏与看书时长的奖励
        // 仅当执行了抽奖或游戏可能偏离页面时，才做轻量回退；若抽奖和游戏皆关闭，页面自始至终在福利中心，直接秒查
        if (enableLottery || (enableGameTask && !gameTaskDone)) {
            let recoverTry = 0;
            while (!textMatches(/完成任务得奖励|本周收益/).findOnce() && recoverTry < 2) {
                recoverTry++;
                back();
                sleep(600);
            }
        }

        l_log("有无可领");
        let bonusBtns = textMatches(/领奖励|领积分/).find();
        let bonusNum = 0;
        // 广告滚动已覆盖过页面，这里只需检查当前屏幕（阅读/游戏后新出现的奖励）
        for (let i = 0; i < bonusBtns.length; i++) {
            let btn = bonusBtns[i];
            if (!btn || btn.bounds().width() == 0) continue;
            let btnt = btn.text();
            l_verbose(shortdash);
            freeCenterScrolled = scrollShowButton(freeCenterScrolled, btn);
            let btn_now = refreshView(btn);
            l_log("点击:", btnt);
            robustClick(btn_now);
            bonusNum++;
            let c1 = 0;
            for (let ii = 0; ii < 2; ii++) {
                sleep(300);
                c1 = clickIknown();
                if (c1) break;
            }
            if (!c1) {
                btn_now = refreshView(btn);
                if (btn_now && btn_now.text() == btnt) {
                    l_error("似乎领取失败");
                }
            }
        }
        if (bonusNum == 0) l_log("无");
        l_log(longdash);
        sleep(500);

        l_log.apply(null, reviewResults());
        home();
        l_info("脚本正常结束");
        l_verbose("控制台3秒后自动关闭");
        l_log("记得清理Autox.js后台");
        console.hide();
    } catch (err) {
        l_error(err.message);
        l_warn(err.stack);
        l_log.apply(null, reviewResults());
        l_error("脚本异常");
    } finally {
        engines.stopAllAndToast();
        l_exit();
    }
