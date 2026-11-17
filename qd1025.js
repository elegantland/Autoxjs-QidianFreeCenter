/**
 * ==================== Auto.js 起点自动任务架构速查索引 ====================
 * [配置常量]  : 用户配置项、固定坐标 (fixedCloseXPos)、屏幕比例预计算 (SCREEN)
 * [页面识别]  : wherePage() 页面类型精准判定 (index / freecenter / adframe 等)
 * [导航跳转]  : launchQidian(), openQidian() 起点唤醒与前台保障
 * [账号与入口]: enterMe() 导航至“我”界面；enterFreeCenter() 物理点击进入福利中心
 * [任务子模块]: exchange() 兑换, lottery() 抽奖, runGameTask() 游戏
 * [广告处理]  : video_look() 广告核心状态机（初次识别、倒计时、续看、点X与挽留弹窗）
 * [广告点击]  : clickAdButton() 广告CTA按钮物理穿透点击与避坑
 * [工具函数]  : read_book(), cappad(), ocrTopRegion(), robustClick(), getTextOfView()
 * [任务主流程]: 看护线程, 优先限时加点任务, 常规看视频任务, 领奖励结算
 * =========================================================================
 */

    var title = "261025起点自动";
    var logFile = false; // 是否将日志保存到文件中

    // --- 用户配置项 ---
    var targetBookName = "盖世双谐"; // 去阅读任务需要搜索的书名
    var readDurationSeconds = 120;   // 阅读任务持续时长（单位：秒，默认 120 秒，可在此直接修改）
    var enableGameTask = false;      // 是否执行玩游戏任务（true: 开启, false: 关闭）
    var enableLottery = false;       // 是否执行转盘抽奖（true: 开启, false: 关闭）
    // -----------------

    var closeButtonBottom = 550; // 新广告右上角的X的下沿高度，控制台也放这么高
    
    // ==================== 核心机型适配坐标 ====================
    // 右上角广告关闭X按钮固定坐标（默认适配：一加Ace 5）
    // 【机型适配说明】：
    // 若在其他手机上运行未点中右上角X，请在手机【开发者选项】中开启【指针位置】，
    // 触摸广告右上角 X 获取您的屏幕 X, Y 坐标，并修改下方数值：
    var fixedCloseXPos = { x: 1182, y: 280 };
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
    var ADReceive = {};
    var ad_raw = -1, ad_clicknewpage = -1; // 广告识别结果（供调用方判断是否识别成功）
    var thisLable = "ysun.QidianFreeCenter";
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
    // 确保起点在前台（若在外部应用或桌面则强制拉回，返回是否执行了切换）
    function ensureInQidian() {
        if (currentPackage() != qidianPackageName) {
            launchQidian(true);
            sleep(1500);
            return true;
        }
        return false;
    }

    // 专注检测顶部标题栏一小块区域（如“京东验证”、“京东热卖”所在的小标题条，严格限制在屏幕顶端 10% 以内）
    function isTopJdTitle() {
        let maxTitleY = SCREEN.h10;
        // 1. 无障碍节点检测：检查顶部标题栏一小块区域内是否有“京东”文字
        try {
            let nodes = textMatches(/.*京东.*/).find();
            for (let i = 0; i < nodes.length; i++) {
                let b = nodes[i].bounds();
                if (b && b.bottom > 0 && b.top < maxTitleY && b.bottom <= maxTitleY + 50) {
                    let t = nodes[i].text() || "";
                    if (t.indexOf("想要打开") == -1) return true;
                }
            }
        } catch (e) {}

        // 2. OCR 仅截取顶部标题栏一小块区域 [0, 2%, width, 8%]
        try {
            if (typeof cappad === "function") {
                let resTitle = cappad([0, SCREEN.h02, device.width, SCREEN.h08]);
                for (let i = 0; i < resTitle.length; i++) {
                    let t = resTitle[i].text;
                    if (t.indexOf("想要打开") == -1 && t.indexOf("京东") > -1) return true;
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

        // 优先判断是否跳出起点 App
        if (isExternalApp(cp)) {
            return "isNotQidain";
        }

        // 广告 Activity 识别（最快）
        if (ca.indexOf("RewardvideoPortraitADActivity") > -1 || ca.indexOf("RewardVideoActivity") > -1 || ca.indexOf("AdActivity") > -1) {
            return "adframe";
        }

        // 1. 福利中心精准判定
        let isFree = textMatches(/完成任务得奖励|积分商城|本周收益|激励任务|.*连续签到.*|恭喜获得|获得加点|加点成功/).findOnce();
        if (isFree && !textMatches(/我的账户|卡牌广场/).findOnce()) {
            return "freecenter";
        }

        // 2. 首页 / “我” 界面判断
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

        // 网页/内嵌广告特征
        if (ca.indexOf("Web") > -1 || ca.indexOf("Browser") > -1 || ca.indexOf("H5") > -1 || ca.indexOf("LandPage") > -1 || ca.indexOf("AdLandingPage") > -1) {
            return "internal_web";
        }

        // 广告页面特征合并判断
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
        if (isExternalApp(p)) {
            let appN = safeGetAppName(p);
            if (appN.indexOf("桌面") == -1 && appN.indexOf("Launcher") == -1 && p.indexOf("launcher") == -1) {
                l_info("正在从外部应用 [" + appN + "] 切回起点...");
                home();
                sleep(500);
            }
        }
        app.launchPackage(qidianPackageName);
        
        waitUntil(() => {
            if (currentPackage() == qidianPackageName) return true;
            app.launchPackage(qidianPackageName);
            return false;
        }, 500, 6);
        sleep(500);
    }

    function openQidian() {
        let wp_init = wherePage();
        if (wp_init == "freecenter" || wp_init == "signdetail") {
            l_info("当前已在已知页面：" + wp_init);
            l_info("起点已就绪");
            return true;
        }

        launchQidian();

        let n = 0, wp = "";
        do {
            n++;
            wp = wherePage();
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
            }
            sleep(500);
            closeDialogs();
            if (n > 20 && currentPackage() != qidianPackageName) break;
        } while (wp == "" || wp == "isNotQidain" || wp == "permission");
        
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
        for (let attempt = 1; attempt <= 3; attempt++) {
            // 1. 若当前屏幕已经处于“我”界面，直接读取昵称返回，无需重复点击底栏与冗余等待
            if (text("福利中心").exists() || text("我的账户").exists() || text("卡牌广场").exists()) {
                let tv = id("tvName").findOne(300);
                if (tv) {
                    nickname = tv.text();
                    l_log("当前账号：", nickname);
                }
                return true;
            }

            closeDialogs();

            // 2. 优先精准定位底栏的“我”标签（屏幕底部区域，放宽超时至 1200ms）
            let me = text("我").boundsInside(0, device.height * 0.78, device.width, device.height).findOne(1200);
            if (me) {
                let b = me.bounds();
                if (!me.click() && me.parent()) me.parent().click();
                if (b.width() > 0 && b.height() > 0) {
                    press(b.centerX(), b.centerY(), 120);
                }
            } else {
                let oldMe = id("view_tab_title_title").className("android.widget.TextView").text("我").findOne(400);
                if (oldMe && oldMe.parent() && oldMe.parent().clickable()) {
                    oldMe.parent().click();
                } else {
                    // 安全盲点坐标：抬高至 height - 120，彻底避开系统手势导航条
                    press(device.width * 0.9, device.height - 120, 120);
                }
            }

            // 3. 快速检测“福利中心”按钮是否出现（最长等待 4 秒）
            let entered = waitUntil(() => {
                closeDialogs();
                return text("福利中心").exists() || text("我的账户").exists();
            }, 300, 13);

            if (entered) {
                let tv = id("tvName").findOne(300);
                if (tv) {
                    nickname = tv.text();
                    l_log("当前账号：", nickname);
                }
                return true;
            }

            // 首次未进补救：back 一次关闭可能存在的遮罩弹窗再试
            if (attempt < 3) {
                l_warn("第 " + attempt + " 次未能进入‘我’界面，尝试 back() 关闭潜在遮罩并重试...");
                back();
                sleep(800);
            }
        }
        return false;
    }

    function enterFreeCenter() {
        if (wherePage() == "freecenter") {
            l_info("当前已在福利中心");
            return;
        }
        for (let n = 0; n < 3 && wherePage() != "freecenter"; n++) {
            l_verbose("正在进入福利中心 (" + (n + 1) + "/3)...");
            if (!textMatches(/我的账户|卡牌广场/).exists()) {
                enterMe();
                sleep(400);
            }

            let fc = text("福利中心").findOne(800);
            if (fc) {
                let b = fc.bounds();
                if (!fc.click() && fc.parent()) fc.parent().click();
                if (b.width() > 0 && b.height() > 0) press(b.centerX(), b.centerY(), 100);
            } else {
                click("福利中心", 0);
            }

            if (waitUntil(() => !!textMatches(/完成任务得奖励|积分商城|本周收益|激励任务|.*连续签到.*/).findOnce(), 200, 10)) {
                break;
            }
        }
        if (wherePage() == "freecenter" || textMatches(/完成任务得奖励|本周收益/).findOnce()) {
            l_info("已成功进入福利中心");
            sleep(600);
        } else {
            l_warn("超时未识别到福利中心，跳过等待，继续下个步骤");
            l_warn("当前页面：", wherePage(), currentPackage(), currentActivity());
        }
    }

    function returnToFreeCenterFromReading() {
        l_info("阅读完成，正在返回福利中心...");
        ensureInQidian();

        if (wherePage() == "read") {
            l_verbose("正在从阅读正文返回书架...");
            back();
            sleep(800);
        }

        closeDialogs();
        if (text("加入书架").exists() && text("取消").exists()) {
            let c = text("取消").findOne(500);
            if (c) { c.click(); sleep(500); }
        }

        if (wherePage() == "freecenter") {
            l_info("已在福利中心");
            return true;
        }

        l_info("从主页通过底栏导航返回：点击‘我’ -> 进入‘福利中心’...");
        enterMe();
        sleep(300);
        enterFreeCenter();
        sleep(300);
        return true;
    }

    // 通用：确保回到福利中心（支持多层 back 退回 + 弹窗处理 + 导航兜底）
    function ensureBackToFreeCenter(waitMs, maxBacks) {
        waitMs = waitMs || 1000;
        maxBacks = maxBacks || 1;
        clickIknown();
        for (let i = 0; i < maxBacks && wherePage() != "freecenter"; i++) {
            back();
            sleep(waitMs);
            clickIknown();
        }
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
        enterSignCalendar(1000);
        scrollShowButton(device.height, 0); // 进入后它会自动向下滚，滚回
        sleep(500);
        let d = className("android.widget.Button").text("去兑换 今日").findOne(1000);
        if (d) {
            l_verbose(shortdash);
            l_log(d.text());
            d.click();
            sleep(1200);
            let btns = className("android.widget.TextView").text("兑换").find();
            if (btns.length > 0) {
                let bigIndex = -1, max = 0;
                for (let i = 0; i < btns.length; i++) {
                    if (btns[i].bounds().width() < 10 || btns[i].bounds().height() < 10) continue; 
                    let n1 = getDescriptionOnLeft(btns[i]).replace(/[^\d.]/g, "") * 1;
                    if (n1 > max) {
                        bigIndex = i;
                        max = n1;
                    }
                }
                if (bigIndex > -1) {
                    let n1 = 0, r1 = "";
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

        // 从兑换子页与签到日历彻底退回福利中心
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
        let result = 0, cb = null;
        l_verbose("准备进入抽奖流程，等待页面稳定...");
        sleep(1000);
        
        if (enterSignCalendar(1500)) {
            let b = className("android.widget.Button").text("领奖励").findOne(1000);
            if (b) {
                l_log(b.text());
                b.click();
                sleep(1500);
                clickIknown();
            }
            if (className("android.widget.ListView").findOne(500)) scrollShowButton(device.height, 0);
            sleep(1000);
            cb = className("android.widget.TextView").textContains("抽奖机会 ×").findOne(1000) ||
                 className("android.widget.TextView").text("做任务可抽奖").findOne(1000);
        }
        if (cb && (cb.text().indexOf("×") < 0 || cb.text().replace(/[^\d.]/g, "") * 1 > 0)) {
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
                        l_log(refV.text());
                        refV.click();
                        sleep(2000);
                        video_look(refV);
                        sleep(1000);
                        c = className("android.widget.TextView").text("抽奖").findOne(500);
                        if (c) break;
                        refV = refreshView(v);
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
                l_warn("未发现抽奖关闭按钮，尝试返回");
                back();
            }
        }
        back();
        sleep(1500);
        return result;
    }

    function runGameTask() {
        let gamebtntext = "去完成", gameremain = "再玩";
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

    function jumpMarket() {
        sleep(1000);
        launchQidian();
    }

    function video_look(btn, isLimitTask) {
        adCount++;
        l_verbose("广告", adCount, "开始" + (isLimitTask ? "【限时任务】" : ""));
        
        let isSlideTask = false;
        let has_slide_reset = false;
        let hasExitedToFree = false;

        try {
            ad_main_loop: while (true) {
                ad_raw = -1; ad_clicknewpage = -1;
                let m = 0;
                has_slide_reset = false;
                let hasClickedInAppAd = false;
                let failedCoords = [];
                let isWechatMiniGame = false;
                let hasReturnedHomeForWechat = false;

                function clickAdButton(isResume, onlyExactMatch) {
                    let stageTag = isResume ? "续看阶段" : "初次识别";
                    let clicked = false;
                    let lastTappedPoint = null;
                    l_verbose(stageTag + "开始识别并点击激活按钮...");

                    let isDeadCoord = function(x, y) {
                        return failedCoords.some(pt => Math.hypot(x - pt.x, y - pt.y) < 80);
                    };

                    // 优先扫描底部 62% 以下区域，无结果自动扩大至 50%
                    let res_new = ocrBottomRegion(SCREEN.h62, true);

                    let robustTapCTA = function(tag, txt, posX, posY) {
                        l_log(stageTag + tag + "：", txt, "@ (" + posX + "," + posY + ")");
                        lastTappedPoint = { x: posX, y: posY };
                        if (/微信|小游戏/.test(txt)) {
                            isWechatMiniGame = true;
                        }
                        try {
                            let accNode = text(txt).find().filter(n => n.bounds().top >= SCREEN.h55)[0];
                            if (accNode && (accNode.click() || (accNode.parent() && accNode.parent().click()))) {
                                sleep(200);
                            }
                        } catch (e) {}

                        let centerX = SCREEN.centerX;
                        press(centerX, posY, 120);
                        sleep(80);
                        if (Math.abs(posX - centerX) > 80) {
                            press(posX, posY, 100);
                        }
                    };

                    let exactBtnPattern = /^(点击去浏览|继续浏览|继续观看|去微信.*|查看详情|立即体验|立即试玩|立即玩|开始玩|马上玩|试玩小游戏|畅玩小游戏|在线玩|立即下载|立即获得|去完成|立即抢购|立即购买|立即查看|免费领取|立即领取|立即打开|去看看|立即参与|立即秒杀|了解详情|了解更多|查看更多|查看商品)$/;
                    let invalidPattern = /[\d\.\-\!\！\[\]\(\)\（\）\,\，\。\、\:\：\?\？\<\>\《\》\￥\¥\+\/]|1\.新下载|京东小游戏|京东生鲜|3亿玩家|在玩10万|人气榜|仅需¥|包邮|帮宝适|评判标准|活动仅限/;
                    let blacklistPattern = /点击后|任务中|已成功|获得奖励|可得奖励|秒后|看完|抽奖机会|详情页|第三方|广告|版权|用户|新人|活动|规则|标准|评判|下载App|京东|淘宝|拼多多|包邮|谁懂|限一单|购买后|商品|当场|享受|福利|复购|单人|秒杀|立减|可获得|玩家|推荐|极品|条目|人气|排行榜|在玩|榜|箱|斤/;

                    let isInvalidBtn = function(clean, bounds) {
                        if (!clean || (bounds && bounds.top < SCREEN.h55)) return true;
                        if (exactBtnPattern.test(clean)) return false;
                        if (invalidPattern.test(clean) || blacklistPattern.test(clean)) return true;
                        if (clean.length < 2 || clean.length > 12) return true;
                        if (clean.indexOf("游戏") > -1 && !/去微信|试玩|畅玩|在线|玩/.test(clean)) return true;
                        return false;
                    };

                    // 通用：在屏幕下半部分寻找最靠下且非死坐标的匹配按钮
                    let findLowestBtn = function(ocrResults, testFn) {
                        let best = null;
                        for (let i = 0; i < ocrResults.length; i++) {
                            let clean = ocrResults[i].text.replace(/\s+/g, "");
                            let b = ocrResults[i].bounds;
                            if (b.top >= SCREEN.h55 && !isDeadCoord(b.centerX(), b.centerY()) && testFn(clean, b)) {
                                if (!best || b.top > best.bounds.top) best = { text: clean, bounds: b };
                            }
                        }
                        return best;
                    };

                    let matchAndTapCTA = function(ocrResults, tagPrefix) {
                        if (!ocrResults || ocrResults.length == 0) return false;
                        let pTag = tagPrefix || "";

                        // 策略1：精确匹配完整的典型CTA按钮文本
                        let matchedBtn = findLowestBtn(ocrResults, clean => exactBtnPattern.test(clean));
                        if (matchedBtn) {
                            robustTapCTA(pTag + "策略1-精准匹配按钮（命中成功样本库）", matchedBtn.text, matchedBtn.bounds.centerX(), matchedBtn.bounds.centerY());
                            return true;
                        }

                        // 策略2：前缀动词短语匹配
                        let prefixBtn = findLowestBtn(ocrResults, (clean, b) => !isInvalidBtn(clean, b) && /^(立即|去微信|去|开始|点击|免费|了解)/.test(clean));
                        if (prefixBtn) {
                            robustTapCTA(pTag + "策略2-前缀动词匹配", prefixBtn.text, prefixBtn.bounds.centerX(), prefixBtn.bounds.centerY());
                            return true;
                        }

                        if (onlyExactMatch) return false;

                        // 策略3：距离标准底部大按钮黄金位置最近的候选文本
                        let candidates = [];
                        let targetX = SCREEN.centerX, targetY = SCREEN.h85;
                        for (let i = 0; i < ocrResults.length; i++) {
                            let clean = ocrResults[i].text.replace(/\s+/g, "");
                            let b = ocrResults[i].bounds;
                            if (isInvalidBtn(clean, b) || isDeadCoord(b.centerX(), b.centerY())) continue;
                            if (Math.abs(b.centerY() - targetY) > 120) continue;
                            if (!/[查看点去领玩试抢开享下购参完解]/.test(clean)) continue;

                            candidates.push({ text: clean, bounds: b, dist: Math.hypot(b.centerX() - targetX, b.centerY() - targetY) });
                        }

                        if (candidates.length > 0) {
                            candidates.sort((a, b) => a.dist - b.dist);
                            let best = candidates[0];
                            robustTapCTA(pTag + "策略3-严格空间邻近动词匹配", best.text, best.bounds.centerX(), best.bounds.centerY());
                            return true;
                        }

                        return false;
                    };

                    clicked = matchAndTapCTA(res_new);

                    // 策略4：保底固定大按钮按压与二次等待识别
                    if (!clicked && !onlyExactMatch) {
                        if (isResume) {
                            let centerX = SCREEN.centerX, centerCardY = SCREEN.h635, bottomBtnY = SCREEN.h845;
                            let offsetCandidates = isLimitTask ? [
                                { x: centerX, y: centerCardY, desc: "居中卡片大按钮(限时)" },
                                { x: centerX, y: bottomBtnY, desc: "底部常驻大按钮" },
                                { x: centerX - 180, y: centerCardY, desc: "居中卡片左半部" },
                                { x: centerX + 180, y: centerCardY, desc: "居中卡片右半部" }
                            ] : [
                                { x: centerX, y: bottomBtnY, desc: "底部常驻大按钮" },
                                { x: centerX - 180, y: bottomBtnY, desc: "底部按钮左半部" },
                                { x: centerX + 180, y: bottomBtnY, desc: "底部按钮右半部" },
                                { x: centerX, y: centerCardY, desc: "居中卡片大按钮备选" }
                            ];

                            let chosen = offsetCandidates.find(c => !isDeadCoord(c.x, c.y)) || offsetCandidates[0];
                            l_log(stageTag + "策略4-保底固定大按钮位置按压 [" + chosen.desc + "] @ (" + chosen.x + "," + chosen.y + ")");
                            press(chosen.x, chosen.y, 150);
                            lastTappedPoint = { x: chosen.x, y: chosen.y };
                            clicked = true;
                        } else {
                            l_log("初次识别暂未匹配到CTA按钮，等待 3.5 秒缓冲（等待浮层滑出）并二次识别...");
                            sleep(3500);
                            if (ad_clicknewpage > -1) ad_clicknewpage -= 3.5;

                            let res_retry = ocrBottomRegion(SCREEN.h55, false);
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

                        if (raw_pkg == "com.tencent.mm" || safeGetAppName(raw_pkg).indexOf("微信") > -1) {
                            isWechatMiniGame = true;
                        }

                        if (isWechatMiniGame && !hasReturnedHomeForWechat) {
                            l_info("检测到去微信/小游戏任务，已等待3.5秒，继续等待1.5秒（满5秒）...");
                            sleep(1500);
                            l_info("已在微信/小游戏中停留5秒，立即执行返回桌面(home())防止起点/脚本被杀后台...");
                            home();
                            sleep(500);
                            hasReturnedHomeForWechat = true;
                            if (ad_clicknewpage > -1) ad_clicknewpage = Math.max(0, ad_clicknewpage - 5);
                        } else if (isTopJdTitle() && isPermDialog) {
                            hasClickedInAppAd = true;
                            l_log("检测到顶部【京东】标题栏且下方弹出打开App弹窗（阻断计时），执行 back() 关闭弹窗恢复浏览...");
                            back();
                            sleep(1000);
                        } else if (isPermDialog) {
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

                // 广告识别状态机：最多识别 7 轮
                let maxOcrRounds = 7;
                for (let round = 0; round < maxOcrRounds; round++) {
                    sleep(600);
                    let wp = wherePage();
                    
                    // 全局验证码检测
                    let res_chap = cappad([0, 110, device.width, 740]);
                    let hasCaptcha = res_chap.some(r => strHasArr(r.text, CAPTCHA_KEYWORDS));
                    
                    if (hasCaptcha) {
                        let c_count = 0;
                        while (hasCaptcha) {
                            c_count++;
                            l_log("检测到安全验证，请手动完成 (" + c_count + ")");
                            device.vibrate(500);
                            sleep(2000);
                            hasCaptcha = cappad([0, 110, device.width, 740]).some(r => strHasArr(r.text, CAPTCHA_KEYWORDS));
                            if (c_count > 30) {
                                l_error("验证超时，跳过此任务");
                                return;
                            }
                        }
                        l_info("验证已完成，继续任务");
                        round = 0;
                        continue;
                    }

                    let curPkg = currentPackage();
                    if (isExternalApp(curPkg)) {
                        let isWechat = curPkg == "com.tencent.mm" || safeGetAppName(curPkg).indexOf("微信") > -1;
                        if (isWechat) {
                            isWechatMiniGame = true;
                            l_info("检测到已直接进入微信/小游戏：[" + safeGetAppName(curPkg) + "]，停留5秒后返回桌面防止被杀后台...");
                            sleep(5000);
                            home();
                            sleep(500);
                            hasReturnedHomeForWechat = true;
                            ad_clicknewpage = 10;
                            break;
                        } else {
                            l_info("检测到已直接进入外部应用/小游戏：[" + safeGetAppName(curPkg) + "]，按试玩跳转类广告处理");
                            ad_clicknewpage = 15;
                            break;
                        }
                    }

                    if (wp == "freecenter" && round < 3) {
                        l_verbose("等待进入广告页面... (" + (round + 1) + ")");
                        sleep(600);
                        continue;
                    }

                    let res_fast = ocrTopRegion();
                    for (let i = 0; i < res_fast.length; i++) {
                        let txt = res_fast[i].text;
                        let fast_match = txt.match(/(\d+(?:\.\d+)?)\s*秒/);
                        if (fast_match) {
                            let fast_sec = parseFloat(fast_match[1]);
                            if (fast_sec > 0 && fast_sec < 200) {
                                // 1. 先行特征判断：文案明确为“观看广告/观看视频/后可获得奖励/后可得”时，直接确认为纯观看类型，严禁盲目触发点击按钮
                                if (/观看广告|观看视频|后可获得|后可得/.test(txt)) {
                                    l_log("识别到纯【观看类型】广告（" + txt + "），时长：" + fast_sec + "秒，静默等待完成，不触发点击");
                                    ad_raw = fast_sec;
                                    break;
                                }

                                // 2. 若文案明确包含“点击/浏览/开玩/小游戏”，直接归类为点击类
                                if (/点击|玩|开玩|小游戏|浏览/.test(txt)) {
                                    l_log("识别到【点击后看】广告（" + txt + "），时长：" + fast_sec + "秒，尝试激活CTA按钮...");
                                    if (/微信|小游戏/.test(txt)) isWechatMiniGame = true;
                                    ad_clicknewpage = fast_sec;
                                    clickAdButton();
                                    break;
                                }

                                // 3. 模棱两可场景：等待 4.5 秒确认倒计时是否自然递减
                                l_log("核心区识别到时长：" + fast_sec + "秒（" + txt + "），等待4.5秒确认类型...");
                                sleep(4500);
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
                                    l_log("倒计时自然递减（" + fast_sec + "→" + sec_after + "），确认为纯观看类型，无需点击");
                                    ad_raw = fast_sec;
                                } else {
                                    l_log("倒计时未变（" + fast_sec + "→" + sec_after + "），确认为点击后看类型，执行点击激活");
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

                        if (/点击|玩|开玩|小游戏/.test(txt)) {
                            let sec = txt.replace(/[^\d.]/g, "") * 1 || 15;
                            l_log("点/玩/小游戏类型：", sec);
                            if (/微信|小游戏/.test(txt)) isWechatMiniGame = true;
                            ad_clicknewpage = sec;
                            clickAdButton();
                            break;
                        }
                    }

                    if (ad_raw > -1 || ad_clicknewpage > -1) break;

                    if (textContains("秒").exists() && textMatches(/.*(奖励|得).*/).exists()) {
                        l_log("无障碍兜底识别到广告特征文字");
                        ad_raw = 15;
                        break;
                    }
                }

                if (ad_raw == -1 && ad_clicknewpage == -1) {
                    l_warn("未能通过倒计时识别广告类型，尝试判断是否处于旧版视频播放页");
                }

                if (ad_raw > -1 || ad_clicknewpage > -1) {
                    let sec = (ad_clicknewpage > -1 ? ad_clicknewpage : ad_raw) + 2;
                    isClickNewPage = ad_clicknewpage > -1;
                    if (isClickNewPage) l_log("跳转类任务，预计等待 " + sec + " 秒...");

                    let checkJdDialog = () => isTopJdTitle() && hasBottomDialog();
                    if (checkJdDialog()) {
                        l_log("检测到顶部【京东】标题栏且下方弹出打开App弹窗，执行 back() 关闭以恢复计时...");
                        back();
                        sleep(1000);
                    }

                    debugDelay = 3;
                    while (sec > 0) {
                        sleep(1000);

                        let curPkgNow = currentPackage();
                        let isWechatNow = curPkgNow == "com.tencent.mm" || safeGetAppName(curPkgNow).indexOf("微信") > -1;
                        if ((isWechatNow || isWechatMiniGame) && !hasReturnedHomeForWechat) {
                            if (isWechatNow) {
                                l_info("检测到处于微信小游戏，等待5秒后返回桌面防止起点被杀后台...");
                                sleep(5000);
                                sec = Math.max(0, sec - 5);
                            }
                            home();
                            sleep(500);
                            hasReturnedHomeForWechat = true;
                            l_info("已执行返回桌面(home())，继续在后台静默等待倒计时...");
                        }

                        if (isClickNewPage) {
                            if (sec % 3 == 0 && checkJdDialog()) {
                                l_log("检测到京东授权弹窗阻断倒计时，执行 back() 关闭弹窗...");
                                back();
                                sleep(800);
                            }
                        } else if (isSlideTask) {
                            if (sec % 3 == 0) {
                                swipe(device.width * 0.85, device.height / 2, device.width * 0.15, device.height / 2, 400);
                                l_verbose("执行滑动", sec);
                            }
                        } else if (sec % 5 == 0) {
                            if (currentPackage() == qidianPackageName) {
                                click(random(10, 20), random(10, 20));
                            }
                        }
                        sec--;
                    }
                    l_verbose("应该看完");
                    debugDelay = 1;
                    sleep(1000);

                    if (isSlideTask) {
                        l_verbose("滑动任务结束，最后滑一次");
                        swipe(device.width * 0.85, device.height / 2, device.width * 0.15, device.height / 2, 400);
                        sleep(1000);
                    }

                    if (isClickNewPage || hasClickedInAppAd || hasReturnedHomeForWechat) {
                        sleep(1000);
                        let curPkg = currentPackage();
                        if (isPermissionPkg(curPkg)) {
                            l_verbose("广告结束，检测到权限管理弹窗，直接 back 关闭");
                            back();
                            sleep(800);
                        } else if (curPkg != qidianPackageName) {
                            l_verbose("点击/小游戏试玩或后台等待结束，执行强制切换回起点");
                            ensureInQidian();
                        }
                        let wpCur = wherePage();
                        if (wpCur != "freecenter") {
                            l_log("广告结束，执行 back() 关闭落地页/广告浮层 (" + wpCur + ")...");
                            back();
                            sleep(1000);
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

                    // ==================== 1. 先识别是否需要续看/滑动 ====================
                    let resumeLoops = 0;
                    while (resumeLoops < 2) {
                        resumeLoops++;

                        if (textMatches(/.*(已获得奖励|恭喜获得).*/).exists()) {
                            l_info("检测到【已获得奖励】，无需续看，直接准备点X退出");
                            break;
                        }

                        if (isTopJdTitle()) {
                            l_warn("检测到仍处于京东内嵌页面，禁止续看与二次点击，直接关闭落地页");
                            back();
                            sleep(800);
                            break;
                        }

                        let res_kw = ocrTopRegion(1000);
                        if (res_kw.some(r => /已获得|恭喜/.test(r.text))) {
                            l_info("OCR确认【已获得奖励】，直接跳出续看");
                            break;
                        }

                        let needResume = false, resumeSec = 0;
                        for (let i = 0; i < res_kw.length; i++) {
                            let txt = res_kw[i].text;
                            if (txt.indexOf("秒杀") > -1) continue;

                            if (txt.indexOf("滑动") > -1) {
                                l_log("检测到滑动指令，立即执行滑动切换...");
                                swipe(device.width * 0.85, device.height / 2, device.width * 0.15, device.height / 2, 400);
                                sleep(2000);
                                isSlideTask = false;
                                has_slide_reset = true;
                                break;
                            }

                            if (/秒|观看|点击后/.test(txt) || (txt.indexOf("继续") > -1 && txt.indexOf("滑动") == -1)) {
                                let sec_tmp = txt.replace(/[^\d.]/g, "") * 1;
                                if (sec_tmp > 10 && sec_tmp < 200) {
                                    resumeSec = sec_tmp;
                                    needResume = true;
                                    break;
                                } else if (/观看|点击后/.test(txt)) {
                                    resumeSec = 15;
                                    needResume = true;
                                    break;
                                }
                            }
                        }

                        if (has_slide_reset) continue ad_main_loop;

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

                            if (isClickNewPage || hasClickedInAppAd) {
                                ensureInQidian();
                                if (wherePage() != "freecenter") {
                                    back();
                                    sleep(1000);
                                }
                                isClickNewPage = false;
                                hasClickedInAppAd = false;
                            }
                        } else {
                            break;
                        }
                    }

                    // ==================== 2. 确认无需续看后，执行点X退出 ====================
                    if (wherePage() != "freecenter") {
                        l_log("广告播放结束，点X前执行一次 back()...");
                        back();
                        sleep(500);
                    }

                    let n = 0, max_click_rounds = 6;
                    hasExitedToFree = false;

                    while (n < max_click_rounds) {
                        n++;
                        if (checkBackToFree(btn)) {
                            hasExitedToFree = true;
                            break;
                        }

                        if (!ensureInQidian()) closeWebIfOpen();

                        let skipBtn = textMatches(/^(跳过|关闭)$/).findOnce() || textMatches(/跳过|关闭/).findOnce();
                        if (skipBtn) {
                            l_verbose("点击无障碍按钮: " + skipBtn.text());
                            robustClick(skipBtn);
                            sleep(600);
                        }

                        l_log("点击关闭X坐标 (" + fixedCloseXPos.x + ", " + fixedCloseXPos.y + ")");
                        click(fixedCloseXPos.x, fixedCloseXPos.y);

                        if (waitUntil(() => checkBackToFree(btn), 300, 4)) {
                            hasExitedToFree = true;
                            break;
                        }

                        if (n >= 2) {
                            l_warn("提示: 当前点击X坐标 (" + fixedCloseXPos.x + ", " + fixedCloseXPos.y + ")。若未点中关闭按钮，请在脚本开头修改 fixedCloseXPos");
                        }

                        // ==================== 3. 点X后挽留弹窗快速处理 ====================
                        let btnBrowse = textMatches(/.*(点击去浏览|去浏览).*/).findOnce();
                        let confirmLeave = textMatches(/坚持退出|放弃奖励|残忍离开|现在退出/).findOnce();
                        if (btnBrowse || confirmLeave) {
                            if (btnBrowse) {
                                l_log("点X后触发挽留弹窗，点击【点击去浏览】继续完成...");
                                robustClick(btnBrowse);
                                sleep(15000);
                                click(fixedCloseXPos.x, fixedCloseXPos.y);
                                sleep(800);
                            } else if (confirmLeave) {
                                l_log("点击弹窗离开: " + confirmLeave.text());
                                robustClick(confirmLeave);
                                sleep(800);
                            }
                            if (checkBackToFree(btn)) {
                                hasExitedToFree = true;
                                break;
                            }
                        }
                    }

                    if (!hasExitedToFree && wherePage() != "freecenter") {
                        l_error("【机型适配提示】多次点击固定坐标 (" + fixedCloseXPos.x + ", " + fixedCloseXPos.y + ") 未能关闭广告！");
                        l_warn(">> 不同机型分辨率不同，请开启手机【开发者选项->指针位置】获取右上角X坐标，并在脚本开头修改 fixedCloseXPos");
                        enterFreeCenter();
                    }

                    if (has_slide_reset) {
                        l_log("因滑动任务重置，重回主识别流程...");
                        continue ad_main_loop; 
                    }
                    
                    isClickNewPage = false;
                    break ad_main_loop;
                } else {
                    // 检查是否已处于外部应用/小游戏
                    let curPkgOld = currentPackage();
                    if (isExternalApp(curPkgOld)) {
                        let isWechat = curPkgOld == "com.tencent.mm" || safeGetAppName(curPkgOld).indexOf("微信") > -1;
                        if (isWechat) {
                            l_info("检测到当前已处于微信小游戏：[" + safeGetAppName(curPkgOld) + "]，试玩5秒后返回桌面防止被杀后台...");
                            sleep(5000);
                            home();
                            sleep(500);
                            l_info("已返回桌面，继续在后台静默等待剩余 10 秒...");
                            sleep(10000);
                        } else {
                            l_info("检测到当前已处于外部应用/小游戏：[" + safeGetAppName(curPkgOld) + "]，按跳转试玩处理，试玩 15 秒后切回起点");
                            sleep(15000);
                        }
                        ensureInQidian();
                        closeWebIfOpen();
                        click(fixedCloseXPos.x, fixedCloseXPos.y);
                        sleep(1000);
                        if (wherePage() != "freecenter") enterFreeCenter();
                        break ad_main_loop;
                    }

                    // 兜底校验：确认是否真的在旧版视频广告播放界面
                    let isOldVideoAd = currentActivity().indexOf("Rewardvideo") > -1 || textMatches(/.*(获得奖励|跳过).*/).exists();
                    if (!isOldVideoAd) {
                        l_warn("未能识别广告且非旧版播放界面，执行兜底返回福利中心");
                        ensureBackToFreeCenter(1000);
                        break ad_main_loop;
                    }

                    // 旧广告同步处理
                    let m1 = 0, video_flag = "", v = -1;
                    let x1 = 1, x2 = 1, y1 = 1, y2 = 1;
                    do {
                        let rewardNode = textContains("获得奖励").findOnce() || textContains("有声书").findOnce();
                        if (rewardNode) {
                            video_flag = rewardNode.text();
                            if (x1 == x2 && video_flag.indexOf("可获得奖励") > -1) {
                                let b = rewardNode.bounds();
                                x1 = 0; x2 = b.left; y1 = b.top; y2 = b.bottom;
                            }
                            let v1 = video_flag.replace(/[^\d.]/g, "") * 1;
                            if (v1 != v) {
                                l_verbose(video_flag);
                                if (v1 == 0) {
                                    l_log("结束");
                                    sleep(1200);
                                    break;
                                }
                                v = v1;
                            }
                        } else if (video_flag.includes("观看完视频")) {
                            l_log("看完结束");
                            sleep(1100);
                            break;
                        } else {
                            sleep(1000);
                            m1++;
                        }

                        clickContinueIfExists();
                        if (m1 > 20) {
                            l_log("已看20秒");
                            break;
                        }
                    } while (!video_flag.includes("已"));
                    l_verbose("应该已获得奖励");

                    if (wherePage() != "freecenter") {
                        l_log("视频播放结束，点X前执行一次 back()...");
                        back();
                        sleep(1000);
                    }
                    let n = 0, maxOldRounds = 8;
                    do {
                        n++;
                        if (wherePage() == "freecenter") {
                            l_log("已回到福利中心");
                            break;
                        }
                        ensureInQidian();

                        if (n == 1 && x1 != x2 && y1 != y2) {
                            click(parseInt((x1 + x2) / 2), parseInt((y1 + y2) / 2));
                        } else if (textContains("可获得奖励").exists()) {
                            l_log("退出失败，重新获取退出坐标");
                            let skipNode = textContains("跳过").findOne(500);
                            if (skipNode) {
                                skipNode.click();
                            } else {
                                let quitNode = textContains("可获得奖励").findOne(500);
                                if (quitNode) {
                                    let b = quitNode.bounds();
                                    x1 = 0; x2 = b.left; y1 = b.top; y2 = b.bottom;
                                }
                                do {
                                    let x = random(x1, x2), y = random(y1, y2);
                                    l_verbose("区域随机点击", x, y);
                                    click(x, y);
                                    clickContinueIfExists();
                                } while (textContains("可获得奖励").exists());
                            }
                        } else {
                            l_log("点击关闭X坐标 (" + fixedCloseXPos.x + ", " + fixedCloseXPos.y + ")");
                            click(fixedCloseXPos.x, fixedCloseXPos.y);
                            sleep(500);
                            closeWebIfOpen();
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
                if (ad_raw == -1 && ad_clicknewpage == -1) ad_raw = 0;
                break ad_main_loop;
            }
            if (ad_raw == -1 && ad_clicknewpage == -1) ad_raw = 0;
            if (!hasExitedToFree) clickIknown();
        } finally {
            isClickNewPage = false;
            debugDelay = 1;
        }
        l_verbose("广告", adCount, "结束");
        sleep(100);
    }

    function read_book(min) {
        let defaultSec = (typeof readDurationSeconds === "number" && readDurationSeconds > 0) ? readDurationSeconds : 120;
        let second = typeof min === "number" && min > 0 ? Math.floor(min * 60) : defaultSec;
        if (second < defaultSec) second = defaultSec;
        let st = new Date().getTime();
        for (let i = 0; i < 2; i++) {
            swipe(device.width * 3 / 4 + i, device.height / 2 + 105 + i, device.width / 4 + i, device.height / 2 + 100 + i, 500);
            sleep(900);
        }
        debugDelay = 30;
        do {
            if (text("跳转").exists() && text("取消").exists()) {
                let c = text("取消").findOne(500);
                if (c) {
                    l_verbose(c.text());
                    c.click();
                    if (c.parent()) c.parent().click();
                }
            }
            if (second % 20 == 0 && second > 0) {
                l_log("阅读倒计时剩余：" + second + " 秒");
            }
            if (second % 8 == 0 && second > 0) {
                l_verbose("执行活跃滑动 (上下滚动，剩余" + second + "s)");
                let swipeX = Math.floor(device.width * 0.75);
                swipe(swipeX, Math.floor(device.height * 0.75), swipeX, Math.floor(device.height * 0.45), 600);
                sleep(600);
                swipe(swipeX, Math.floor(device.height * 0.45), swipeX, Math.floor(device.height * 0.75), 600);
                sleep(300);
            } else {
                sleep(1000);
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
                l_warn("似乎有实名认证，请先自行认证");
                sleep(2000);
                back();
                return 2;
            }
            if (second % 60 == 0) l_verbose("倒计时" + (second / 60) + "分钟");
            if (second % 5 == 0) click(random(10, 20), random(10, 20));
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
        console.show();
        cmdIsDisplay = true;
        setConPos(0);
    }

    function setConPos(n) {
        if (n * 1 !== n || n > c_pos.length - 1) n = 0;
        console.setPosition(c_pos[n][0], c_pos[n][1]);
    }

    function cappad(region) {
        let needHide = cmdIsDisplay && !(region && region[1] > closeButtonBottom + 200);
        if (needHide) {
            console.hide();
            cmdIsDisplay = false;
            sleep(50);
        }
        
        let capimg = captureScreen();
        let res;
        if (region) {
            let rx = Math.max(0, region[0]), ry = Math.max(0, region[1]);
            let rw = Math.min(device.width - rx, region[2]), rh = Math.min(device.height - ry, region[3]);
            let clip = images.clip(capimg, rx, ry, rw, rh);
            res = paddle.ocr(clip);
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

    // 优先扫描底部指定起始高度以下区域，无结果时自动扩大到下半屏 50% 兜底
    function ocrBottomRegion(startY, logRetry) {
        let res = cappad([0, startY, device.width, device.height - startY]);
        if (!res || res.length == 0) {
            if (logRetry) {
                l_verbose("首次OCR未识别到文字，稍微扩大区域重试...");
                sleep(400);
            }
            res = cappad([0, SCREEN.h50, device.width, SCREEN.h50]);
        }
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

    // 日志函数声明（保持 function 提升特性）
    function _log(type, s) {
        console[type].apply(console, s);
        if (logFile || debug) writeLog.apply(null, s);
    }
    function l_log(...s)     { _log("log", s); }
    function l_verbose(...s) { _log("verbose", s); }
    function l_info(...s)    { _log("info", s); }
    function l_warn(...s)    { _log("warn", s); }
    function l_error(...s)   { _log("error", s); }

    function strHasArr(s, a) {
        return a.some(item => s.indexOf(item) > -1);
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
        let top1 = v.bounds().top, bottom1 = v.bounds().bottom;
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
        let btn_top = (typeof btn === "number" && !isNaN(btn)) ? btn : btn.bounds().top;
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
        depth = depth || 0;
        if (depth > 15) return ""; 

        if (v.className() == "android.widget.TextView") {
            let txt = v.text();
            if (txt != "") return txt;
        }
        let v1 = v.children();
        if (v1.length > 0) {
            let t = [];
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
        let cur = targetObj;
        for (let i = 0; i < 3; i++) {
            if (!cur) break;
            if (cur.click()) return true;
            cur = cur.parent();
        }
        let b = targetObj.bounds();
        if (b.width() > 0 && b.height() > 0) {
            click(b.centerX(), b.centerY());
            return true;
        }
        return false;
    }

    function getDescriptionOnLeft(b) {
        let curr = b;
        for (let depth = 0; depth < 4; depth++) {
            if (!curr) break;
            let p = curr.parent();
            if (!p || p.className().endsWith("RecyclerView") || p.className().endsWith("ListView")) break;
            
            let j = curr.indexInParent();
            let t = curr.bounds().top;
            let c = p.children();
            let r = [];
            
            for (let i = 0; i < c.length; i++) {
                if (c[i] && i != j && Math.abs(c[i].bounds().top - t) < 200) {
                    let t1 = getTextOfView(c[i]);
                    if (t1 != "") r.push(t1);
                }
            }
            if (r.length > 0) return r.join("\n");
            curr = p;
        }
        return "";
    }

    // ========== 公用工具函数 ==========
    function waitUntil(condFn, intervalMs, maxTries) {
        for (let i = 0; i < maxTries; i++) {
            if (condFn()) return true;
            sleep(intervalMs);
        }
        return condFn();
    }

    function checkBackToFree(btn) {
        if (clickIknown()) return true;
        if (btn && btn.parent()) return true;
        if (wherePage() == "freecenter") return true;
        return false;
    }

    function closeWebIfOpen() {
        let wp = wherePage();
        if (wp == "browser" || wp == "internal_web") {
            l_verbose("关闭内嵌落地页");
            back();
            sleep(800);
            return true;
        }
        return false;
    }

    function clickContinueIfExists() {
        let btn = textContains("继续观看").findOnce() || textContains("继续听完").findOnce();
        if (btn) { btn.click(); sleep(1500); return true; }
        return false;
    }

    function enterSignCalendar(waitAfterMs) {
        let e = className("android.widget.ListView").findOne(1000);
        if (e && e.parent() && e.parent().clickable()) {
            freeCenterScrolled = scrollShowButton(freeCenterScrolled, e);
            e.parent().click();
            l_verbose("点进签到日历");
            sleep(waitAfterMs || 1000);
            return true;
        }
        l_error("没找到链接，无法进入签到日历");
        return false;
    }

    function getCardContext(btn) {
        let p = btn ? btn.parent() : null;
        let s = p ? getTextOfView(p) : "";
        if (!s || s.length < 2) s = getDescriptionOnLeft(btn);
        return s;
    }

    function getTaskCategory(btn) {
        if (!btn) return 0;
        let s = getCardContext(btn);
        if (/充值|更新提醒|分享/.test(s)) return 0;
        if (/广告|限时|加点/.test(s)) return 1;
        if (s.indexOf("市场") > -1) return 2;
        return 0;
    }

    // 统一封装：观看视频广告及识别失败时的自动重试
    function watchAdWithRetry(btn, btnText, isLimit, maxRetries) {
        video_look(btn, isLimit);
        let retry = 0;
        while (ad_raw == -1 && ad_clicknewpage == -1 && retry < maxRetries) {
            retry++;
            l_warn((isLimit ? "限时" : "") + "广告识别未完成，第" + retry + "次重试：关闭广告重新进入...");
            ensureBackToFreeCenter(1000, 1);
            sleep(500);
            let reBtn = null;
            if (isLimit) {
                reBtn = text(btnText).findOne(1000);
            } else {
                let reBtns = text(btnText).find();
                for (let i = 0; i < reBtns.length; i++) {
                    if (getTaskCategory(reBtns[i]) == 1) { reBtn = reBtns[i]; break; }
                }
            }
            if (reBtn) {
                robustClick(reBtn);
                sleep(1000);
                video_look(reBtn, isLimit);
            } else {
                l_error("重试失败：未找到任务按钮");
                break;
            }
        }
        return !(ad_raw == -1 && ad_clicknewpage == -1);
    }

    function showReceived(r) {
        if (r.indexOf("章节卡") > -1 || r.indexOf("点币") > -1 || r.substring(r.length - 1) == "点") l_info(r);
        else l_log(r);
    }

    function addReceived(r) {
        r = r.replaceAll(" ", "").replace(/^\++/, "");
        if (r.indexOf("满") > -1 && r.indexOf("-") > -1) {
            let t = r.split("-");
            t[0] = t[0].replace(/[^\d.]/g, "");
            r = t.join("-");
        }
        ADReceive[r] = (ADReceive[r] || 0) + 1;
    }

    function clickIknown() {
        let tmp = textContains("恭喜").findOnce();
        if (tmp) {
            let t1 = tmp.text() || "";
            if (t1.indexOf("限时加点") == -1 && t1.indexOf("做任务") == -1) {
                showReceived(t1);
                let a = "恭喜获得";
                let idx = t1.indexOf(a);
                addReceived(idx > -1 ? t1.substring(idx + a.length) : t1);

                let iknow = textMatches(/^(知道了|开心收下|我知道了|确定|确认|领取)$/).findOne(1200);
                if (iknow) {
                    l_verbose("点击弹窗按钮: " + iknow.text());
                    robustClick(iknow);
                    sleep(150);
                }
                return 1;
            }
        }

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
        let rmBracket = s => s.replace(/[(\（][^)\）]*[)\）]$/, "");
        let groups = {};
        Object.keys(ADReceive).forEach(k => {
            let k1 = rmBracket(k.replace("×", ""));
            let m = k1.match(/(\d+)([^\d]*)$/);
            let groupKey = m ? ("0" + (m[2] || k1.substring(0, m.index))) : k1;
            if (!groups[groupKey]) groups[groupKey] = [];
            groups[groupKey].push(k);
        });
        let getNum = s => {
            let clean = rmBracket(s).replace(/^.*-/, "");
            let m = clean.match(/\d+/);
            return m ? Number(m[0]) : 0;
        };
        let res = [];
        Object.keys(groups).sort().forEach(gk => {
            groups[gk].sort((a, b) => getNum(b) - getNum(a)).forEach(n => {
                res.push(" " + ADReceive[n] + " × " + n + "\n");
            });
        });
        return res;
    }

    function formatTime(t) {
        let s = Math.floor(t / 1000);
        if (s < 60) return s + "秒";
        let m = Math.floor(s / 60);
        s = s % 60;
        if (m < 60) return m + "分" + s + "秒";
        let h = Math.floor(m / 60);
        m = m % 60;
        return h + "时" + m + "分" + s + "秒";
    }

    function reviewResults() {
        let r = ["当前账号：", nickname + "\n", "本次总用时" + formatTime(new Date().getTime() - startTime) + "\n"];
        let stats = [
            [exchangeCount, "兑换 " + exchangeCount + " 次\n"],
            [adCount, "看 " + adCount + " 个广告\n"],
            [lotteryCount, "抽奖 " + lotteryCount + " 次\n"],
            [readTime, "阅读 " + formatTime(readTime) + "\n"],
            [gamePlayTime, "玩游戏 " + formatTime(gamePlayTime) + "\n"]
        ];
        stats.forEach(item => { if (item[0] > 0) r.push(item[1]); });
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
    var outPackageStartTime = 0;

    // 包名看护线程，始终开启
    var debugLoop = threads.start(function () {
        let n = 0, a = 1000, b = 0;
        while (debugDelay > 0) {
            b = 0;
            n++;
            let p = currentPackage();
            if (isExternalApp(p)) {
                let wpGuard = wherePage();
                if (wpGuard != "adframe" && wpGuard != "freecenter") {
                    if (isClickNewPage && adCount > 0) {
                        outPackageStartTime = 0;
                    } else if (outPackageStartTime == 0) {
                        outPackageStartTime = new Date().getTime();
                    } else {
                        let outTime = (new Date().getTime() - outPackageStartTime) / 1000;
                        if (outTime > 25) {
                            l_warn("在起点外停留超过25秒(" + Math.floor(outTime) + "s)，正在尝试返回...");
                            launchQidian();
                            outPackageStartTime = 0;
                        }
                    }
                } else {
                    outPackageStartTime = 0;
                }
            } else {
                outPackageStartTime = 0;
            }

            if (n >= debugDelay) {
                let st = new Date().getTime();
                if (debug) writeLog(p, getAppName(p), currentActivity(), wherePage());
                n = 0;
                b = new Date().getTime() - st;
            }
            if (b < a) sleep(a - b);
        }
    });

    // 打开起点并进入福利中心
    let alreadyInFreeCenter = openQidian();
    l_log(longdash);
    if (!alreadyInFreeCenter) {
        enterFreeCenter();
    } else {
        l_info("当前已在福利中心");
    }
    l_log(longdash);
    sleep(500);

    try {
        // 周日签到兑换
        if (new Date().getDay() == 0) {
            l_log("开始兑换");
            if (exchange() == 0) l_log("无兑换");
            l_log(longdash);
            sleep(1000);
        }

        // ==================== 1. 优先检查【限时加点】任务 ====================
        l_log("检查【限时加点】任务...");
        let limitTaskLoop = 0, maxLimitLoops = 12;

        while (limitTaskLoop < maxLimitLoops) {
            limitTaskLoop++;
            let checkStartTime = new Date().getTime();
            let limitNode = textContains("加点").findOnce();
            let checkElapsed = new Date().getTime() - checkStartTime;

            if (!limitNode) {
                l_info(limitTaskLoop == 1
                    ? "当前无【限时加点】任务，继续后续流程 (检测耗时: " + checkElapsed + "ms)"
                    : "【限时加点】任务已全部完成或消失 (检测耗时: " + checkElapsed + "ms)");
                break;
            }

            // 向上追溯至卡片容器
            let cardItem = limitNode;
            while (cardItem && cardItem.parent()) {
                let p = cardItem.parent();
                let pCls = (p.className() || "").toString();
                if (pCls.endsWith("RecyclerView") || pCls.endsWith("ListView") || pCls.endsWith("ScrollView") || pCls.endsWith("ViewPager")) {
                    break;
                }
                cardItem = p;
            }

            // 内存极速遍历卡片内部所有文本与按钮
            let cardTexts = [], limitActionBtn = null;
            (function walk(node, depth) {
                if (!node || depth > 6) return;
                try {
                    let txt = node.text();
                    if (txt) {
                        cardTexts.push(txt);
                        if (!limitActionBtn && /^(去完成|去阅读|看视频|看广告)$/.test(txt)) limitActionBtn = node;
                    }
                    let desc = node.desc();
                    if (desc) cardTexts.push(desc);
                    let kids = node.children();
                    if (kids) for (let k = 0; k < kids.length; k++) walk(kids[k], depth + 1);
                } catch (e) {}
            })(cardItem, 0);
            let cardText = cardTexts.join(" ");

            if (/今日福利已领完|已领完|明日可继续|已领取|今日已完成|已完成|明日再来/.test(cardText)) {
                l_info("【限时加点】检测到已领完状态（今日福利已领完/已完成），退出限时任务阶段 (耗时: " + (new Date().getTime() - checkStartTime) + "ms)");
                break;
            }

            if (!limitActionBtn) {
                l_info("当前【限时加点】卡片无未完成的操作按钮，退出限时流程 (耗时: " + (new Date().getTime() - checkStartTime) + "ms)");
                break;
            }

            let limitBtnText = limitActionBtn.text() || "";
            let isReadType = limitBtnText == "去阅读" || (cardText.indexOf("阅读") > -1 && cardText.indexOf("广告") == -1);

            l_info("执行第 " + limitTaskLoop + " 轮【限时加点】，类型：" + (isReadType ? ("阅读 (" + readDurationSeconds + "秒)") : "广告视频") + "，按钮：" + limitBtnText);

            freeCenterScrolled = scrollShowButton(freeCenterScrolled, limitActionBtn);
            limitActionBtn = refreshView(limitActionBtn);

            if (limitActionBtn) {
                if (isReadType) {
                    robustClick(limitActionBtn);
                    sleep(2000);
                    let wp = wherePage();
                    if (wp == "index") {
                        l_info("跳转到了主页/书架，识别书籍《" + targetBookName + "》");
                        let book = text(targetBookName).findOne(2000);
                        if (book) {
                            l_log("找到《" + targetBookName + "》，开始阅读 " + readDurationSeconds + " 秒");
                            robustClick(book);
                            sleep(1000);
                        } else {
                            l_warn("未在主页找到《" + targetBookName + "》，默认随机翻阅");
                        }
                        read_book(readDurationSeconds / 60);
                        returnToFreeCenterFromReading();
                    } else if (wp == "read") {
                        l_info("已直接进入阅读界面，开始阅读 " + readDurationSeconds + " 秒");
                        read_book(readDurationSeconds / 60);
                        returnToFreeCenterFromReading();
                    } else {
                        l_warn("点击去阅读后未检测到阅读界面(当前页面:" + (wp || "未知") + ")，立即放弃并退出限时流程");
                        if (wherePage() != "freecenter") enterFreeCenter();
                        break;
                    }
                } else {
                    robustClick(limitActionBtn);
                    sleep(1200);
                    if (wherePage() == "freecenter" && !textMatches(/跳过|观看视频|后看广告|秒后获取奖励|点击后看|恭喜你已获得奖励/).findOnce()) {
                        l_warn("点击【限时加点】按钮后未检测到广告启动（可能是非任务按钮或已失效），立即退出限时流程");
                        break;
                    }
                    watchAdWithRetry(limitActionBtn, limitBtnText, true, 1);
                }
            }
            sleep(400);
            if (freeCenterScrolled > 0) {
                freeCenterScrolled = scrollShowButton(freeCenterScrolled, 0);
                sleep(300);
            }
        }
        l_info("【限时加点】所有轮次处理完毕");
        freeCenterScrolled = scrollShowButton(freeCenterScrolled, 0);
        l_log(longdash);
        sleep(1000);

        // ==================== 2. 开始常规广告任务 ====================
        let scrollCount = 0;
        let gameTaskDone = false;
        let totalAdLoops = 0;
        let noProgressCount = 0;

        while (totalAdLoops < 40) {
            totalAdLoops++;
            let foundOnThisScreen = false;
            let currentTaskSuccess = true;

            let aa = textMatches(/看视频|去完成/).find();
            for (let ii = aa.length - 1; ii >= 0; ii--) {
                let btn = aa[ii];
                let c = getTaskCategory(btn);
                if (c == 0) continue;

                let target = btn.text();
                freeCenterScrolled = scrollShowButton(freeCenterScrolled, btn);

                let isClicked = robustClick(btn);
                if (isClicked && target == "去完成" && isFirstGoComplete) {
                    l_log("点击成功，开始强制等待 10 秒供处理验证码...");
                    device.vibrate(500);
                    for (let t = 10; t > 0; t--) {
                        l_verbose("等待中... " + t);
                        sleep(1000);
                    }
                    l_info("等待结束，继续任务");
                    isFirstGoComplete = false;
                }

                sleep(500);
                if (c == 1) {
                    if (!watchAdWithRetry(btn, target, false, 2)) {
                        l_error("广告识别失败，已重试2次，放弃此任务");
                        currentTaskSuccess = false;
                    }
                }
                if (c == 2) jumpMarket();
                foundOnThisScreen = true;
                if (currentTaskSuccess) {
                    scrollCount = 0;
                    noProgressCount = 0;
                } else {
                    noProgressCount++;
                    if (noProgressCount >= 2) {
                        l_warn("连续任务异常，尝试滑动跳过当前卡点...");
                        scrollCount++;
                    }
                }
                sleep(400);
                break; 
            }

            if (foundOnThisScreen && noProgressCount < 2) continue; 

            if (scrollCount < 3) {
                l_verbose("当前屏幕未发现新广告，尝试向下滑动寻找...");
                swipe(device.width / 2, device.height * 0.8, device.width / 2, device.height * 0.3, 500);
                freeCenterScrolled += (device.height * 0.5);
                scrollCount++;
                if (enableGameTask && !gameTaskDone && textMatches(/.*(再玩|玩游戏).*/).exists()) {
                    l_log("检测到游戏任务，直接执行");
                    gameTaskDone = true;
                    runGameTask();
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
        sleep(1000);

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
            if (!waitUntil(() => !!clickIknown(), 300, 2)) {
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
