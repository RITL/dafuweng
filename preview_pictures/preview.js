(() => {
  const screens = [
    ["01-home","开局首页"],["02-home-rules","首页玩法说明"],["03-iphone-install","iPhone 安装引导"],["04-restore-session","恢复旅程"],["05-game-ready","对局主界面"],["06-first-player","先手揭晓"],["07-onboarding","首次教学"],["08-math-answer","儿童数学答题"],["09-voice-guide","语音主持设置"],["10-cast-guide","投屏引导"],["11-rules-handbook","规则手册"],["12-city-purchase","购买城市"],["13-city-upgrade","升级建筑"],["14-card-reveal","机会卡揭晓"],["15-asset-manager","资产中心"],["16-rescue-center","资产自救"],["17-financial-confirm","资产操作确认"],["18-settlement-confirm","结算确认"],["19-final-ranking","冠军排行"]
  ];
  const current = document.body.dataset.screen;
  const device = document.body.dataset.device;
  const index = screens.findIndex(([id]) => id === current);
  const href = id => `./${id}.html`;
  const button = (label, kind="") => `<button class="${kind}">${label}</button>`;
  const players = `
    <article class="player active"><i>🐼</i><span><b>爸爸</b><small>正在行动</small></span><strong>¥18,600</strong></article>
    <article class="player"><i>🦊</i><span><b>妈妈</b><small>资产第 2 名</small></span><strong>¥16,850</strong></article>
    <article class="player"><i>🐯</i><span><b>多肉</b><small>小朋友 · 第 3 名</small></span><strong>¥14,200</strong></article>
    <article class="player"><i>🐰</i><span><b>喜悦</b><small>小朋友 · 第 4 名</small></span><strong>¥13,900</strong></article>`;
  const topbar = (home=false) => `<header class="topbar"><div class="brand"><i>🌍</i><span><b>环球大富翁</b><small>${home?'我们的家庭旅行局':'家庭旅行指挥台'}</small></span></div>${home?'<span class="ready-dot">● 玩家系统已就绪</span><div><button>♫ 音乐开</button><button>玩法说明</button></div>':'<div class="round"><small>ROUND</small><b>03</b><span>/ 12 轮</span></div><div class="toolbar"><button>♫</button><button>🔔</button><button>🎙️</button><button>📺 投到电视</button><button>📖 规则</button><button>🏆 结算</button></div>'}</header>`;
  const tiles = [
    ['🚩','起点','start'],['🗼','巴黎','city'],['🎈','机会','chance'],['🏛️','罗马','city'],['✈️','机场','airport'],['🌷','阿姆斯特丹','city'],['🎭','命运','destiny'],['🗽','纽约','city'],['🌉','旧金山','city'],['🏖️','休息','rest'],['🌵','墨西哥城','city'],['🎁','奖励','bonus'],['🦙','利马','city'],['🎈','机会','chance'],['⛵','悉尼','city'],['🌋','奥克兰','city'],['✈️','机场','airport'],['🗻','东京','city'],['🏯','京都','city'],['🎭','命运','destiny'],['🏮','北京','city'],['🐼','成都','city'],['🎁','奖励','bonus'],['🐘','内罗毕','city'],['🔺','开罗','city'],['🏖️','休息','rest'],['🌅','开普敦','city'],['🎈','机会','chance']
  ];
  const boardTiles = tiles.map(([icon,name,type],i) => {
    const tileType = type === 'chance' ? 'tile-chance' : type === 'start' ? 'tile-start' : type;
    return `<article class="tile t${i} ${tileType}"><i>${icon}</i><b>${name}</b>${[1,14,18].includes(i)?'<span class="token">🐼</span>':''}</article>`;
  }).join('');
  const rouletteNumbers = Array.from({length:26},(_,i)=>`<span style="--roulette-index:${i}">${i%13}</span>`).join('');
  const roulette = (math=false) => `<div class="roulette-preview" aria-label="双球零到十二轮盘"><div class="roulette-ring">${rouletteNumbers}</div><i class="roulette-ball-preview ball-a"></i><i class="roulette-ball-preview ball-b"></i><strong>${math?'5 + 6 = ?':'? + ?'}</strong></div>`;
  const board = (phase="ready") => `<section class="game-base">${topbar()}<div class="player-rail">${players}</div><div class="game-grid"><aside class="traveler"><small>CURRENT TRAVELER</small><i>🐼</i><h2>爸爸</h2><p>旅行接力棒现在在你手里</p><strong>¥18,600</strong><div><span>现金<b>¥12,800</b></span><span>城市<b>2 座</b></span></div><button>🏦 管理我的资产</button></aside><section class="classic-board">${boardTiles}<div class="board-center"><small>${phase==='math'?'小小数学家时间':'爸爸，到你啦！'}</small><h1>${phase==='math'?'两个小球一共是多少点？':'转动骰子，决定前进步数'}</h1><div class="dice-pair"><i>${phase==='math'?'⚄':'⚀'}</i><span>＋</span><i>${phase==='math'?'⚅':'⚀'}</i><b>${phase==='math'?'＝ ?':''}</b></div>${phase==='math'?'<div class="answers"><button>10</button><button>11</button><button class="primary">12</button><button>13</button></div><p>🎙️ 也可以直接说“十二”</p>':'<button class="dice-button"><i>🎲</i><span>开始前进<b>掷出双骰子 →</b></span></button>'}<em>每回合只生成一次公平随机点数</em></div></section><aside class="log"><h3>旅行动态 <i>✦</i></h3><article>👣<span><b>爸爸抵达巴黎</b><small>第 3 轮 · 20:16</small></span></article><article>🏠<span><b>妈妈买下悉尼</b><small>第 2 轮 · 20:14</small></span></article><article>🪙<span><b>多肉获得旅行金</b><small>第 2 轮 · 20:12</small></span></article><div>💰 经典家庭局<br><small>系统自动记录每一笔资产变化</small></div></aside></div></section>`;
  const home = () => `<section class="home">${topbar(true)}<div class="hero"><div><small>✦ 一块屏幕 · 一起环游</small><h1>今晚，我们去<br><em>环游世界！</em></h1><p>不用数纸币，不怕算错账。叫上家人，挑好旅行伙伴，城市、惊喜和好运都已经在地图上等你。</p><div class="chips"><span>🎯 自动结算</span><span>🎙️ 点名语音</span><span>📺 家庭投屏</span></div></div><div class="globe">✈️<b>🌍</b><span>🗼　🧳　🗻</span></div></div><section class="setup"><header><div><small>STEP 01 · 召集旅伴</small><h2>今天谁一起出发？</h2></div><p>支持 2–6 人同屏，每个人都有自己的名字、颜色和旅行头像。</p></header><div class="setup-players"><article>🐼<b>爸爸</b><span>● ● ● ●</span><small>成人玩家</small></article><article>🦊<b>妈妈</b><span>● ● ● ●</span><small>成人玩家</small></article><article>🐯<b>多肉</b><span>● ● ● ●</span><small>小朋友模式</small></article><article>🐰<b>喜悦</b><span>● ● ● ●</span><small>小朋友模式</small></article></div><div class="settings"><article><b>💰 选择经济节奏</b><label>◉ 经典家庭局 <em>¥15,000</em></label><label>○ 轻松富足局 <em>¥22,000</em></label></article><article><b>⏱️ 选择旅行长度</b><label>◉ 家庭标准局 <em>12 轮</em></label><label>○ 周末长途局 <em>20 轮</em></label></article></div><button class="start">抽取先手 · 开始旅程 →</button></section></section>`;
  const overlay = (content, cls="") => `${board()}<div class="overlay ${cls}">${content}</div>`;
  const dialog = (icon, eyebrow, title, body, actions, cls="") => `<section class="dialog ${cls}"><header><i>${icon}</i><div><small>${eyebrow}</small><h2>${title}</h2></div><button class="close">×</button></header>${body}<footer>${actions}</footer></section>`;
  const cityPoster = (mode) => `<section class="city-dialog"><aside><small>WORLD CITY DEED · 欧洲</small><i>🗼</i><h1>巴黎</h1><p>法国 · 埃菲尔铁塔</p><div class="skyline">▂▅▃▇▂▆▃</div><b>${mode==='buy'?'等待一位新主人':'🐼 爸爸正在建设'}</b></aside><main><header><small>${mode==='buy'?'发现无主城市 · 购买机会':'回到自己的城市 · 建设机会'}</small><h2>${mode==='buy'?'是否投资巴黎？':'是否继续建设？'}</h2></header>${mode==='buy'?'<div class="balance"><span>现有现金<b>¥12,800</b></span><i>− ¥3,200</i><span>购买后余额<b>¥9,600</b></span></div><div class="stats"><span>🏷️ 售价<b>¥3,200</b></span><span>🪙 基础租金<b>¥260</b></span><span>🏗️ 每次建设<b>¥1,000</b></span></div><section class="rent"><b>完整租金成长</b><div><span>🌱<small>空地</small><b>¥260</b></span><span>🏠<small>1 房</small><b>¥520</b></span><span>🏠<small>2 房</small><b>¥850</b></span><span>🏘️<small>3 房</small><b>¥1,300</b></span><span>🏘️<small>4 房</small><b>¥1,950</b></span><span>🏨<small>旅馆</small><b>¥2,600</b></span></div></section>':'<div class="building"><span>🏠 🏠 ◻️ ◻️ 🏨</span><b>当前 2 座房屋</b></div><div class="stats"><span>本次升级<b>¥1,000</b></span><span>当前租金<b>¥850</b></span><span>升级后租金<b>¥1,300</b></span></div><div class="tip">💡 每次回到自己的城市，可以建设一级。旅馆是第 5 次建设。</div>'}<div class="voice">🎙️ ${mode==='buy'?'说“我要购买”':'说“升级”或“结束”'}</div><footer><button>暂时不要</button><button>管理资产</button><button class="primary">${mode==='buy'?'购买巴黎 →':'升级建筑 →'}</button></footer></main></section>`;
  const asset = (rescue=false) => `<section class="asset"><header><div><small>ASSET ${rescue?'RESCUE':'MANAGER'}</small><h2>🐼 爸爸的资产中心</h2><p>现金 ¥${rescue?'1,200 · 还需筹集 ¥1,600':'12,800 · 可自由整理资产'}</p></div><button>×</button></header>${rescue?'<div class="plans"><button class="selected">🪶<b>最少损失</b><small>1 步 · ¥1,700</small></button><button>⚡<b>最快筹款</b><small>1 步 · ¥3,200</small></button><button>🧩<b>保留城市</b><small>2 步 · ¥1,900</small></button><p><b>建议：出售巴黎的一座房屋</b><span>刚好覆盖缺口，同时保留城市所有权。</span><button>卖房 · +¥1,000 →</button></p></div>':''}<main><article class="recommended"><span>🗼</span><div><b>巴黎 · 建筑 2 级</b><small>原价 ¥3,200 · 当前租金 ¥850</small></div><button>卖房<b>+¥1,000</b></button><button>抵押<b>+¥1,600</b></button><button>卖地<b>+¥3,200</b></button></article><article><span>🗽</span><div><b>纽约 · 空地</b><small>原价 ¥4,200 · 当前租金 ¥360</small></div><button>抵押<b>+¥2,100</b></button><button>卖地<b>+¥4,200</b></button></article></main><footer><span>🎙️ 可以说“卖巴黎的房子”</span><div><button>返回</button>${rescue?'<button class="aid">🎁 家庭援助</button><button disabled>仍差 ¥1,600</button>':''}</div></footer></section>`;
  const pages = {
    "01-home": home,
    "02-home-rules": () => `<section class="home">${topbar(true)}<div class="home-fade"></div></section><div class="overlay">${dialog('📖','开局前先看一分钟','环球大富翁怎么玩？','<div class="rule-grid"><article>🎱<b>双球相加向前走</b><small>两个小球都是 0–12，总和就是步数。</small></article><article>🏙️<b>买城市、建房和旅馆</b><small>回到自己的城市可依次升级。</small></article><article>🎈<b>抽机会与命运</b><small>卡牌自动结算，牌袋抽完前不重复。</small></article><article>🏆<b>随时按原价结算</b><small>现金、城市与建筑投入相加。</small></article></div><p class="tip">正式进入对局后还有 4 步图文引导。</p>','<button class="primary wide">明白了 · 去设置玩家 →</button>')}</div>`,
    "03-iphone-install": () => `<section class="home">${topbar(true)}<div class="home-fade"></div></section><div class="overlay">${dialog('📱','IPHONE · 随身家庭版','以后直接从 iPhone 开始游戏','<p>首次打开后，可安装到主屏幕并缓存游戏；以后像普通 App 一样启动。</p><div class="steps"><article><i>1</i><b>用 Safari 打开网址</b><small>第一次需要联网打开完整页面</small></article><article><i>2</i><b>分享 → 添加到主屏幕</b><small>名称保留“环球大富翁”</small></article><article><i>3</i><b>像 App 一样随时点开</b><small>家庭记录只保存在本机</small></article></div><div class="tip">📺 安卓电视可通过 AirPlay 或 AirScreen 接收投屏。</div>','<button>我知道了</button><button class="primary">去设置玩家 →</button>','install')}</div>`,
    "04-restore-session": () => `<section class="home">${topbar(true)}<div class="home-fade"></div></section><div class="overlay">${dialog('🗺️','欢迎回来','发现上次还没走完的旅程','<p class="center">🐼爸爸、🦊妈妈、🐯小宝、🐰大宝 · 第 3 轮</p><div class="tip">对局已安全保存在这台设备，可以从上次轮到的玩家继续。</div>','<button>重新召集旅伴</button><button class="primary">继续上次旅程</button>','compact')}</div>`,
    "05-game-ready": () => board(),
    "06-first-player": () => overlay('<section class="reveal"><small>幸运出发签</small><i>🐼</i><h1>由 爸爸 先出发！</h1><p>好运已经选中第一位环球旅行家</p></section>','dark'),
    "07-onboarding": () => overlay(dialog('🌍','第一次环球旅行','听到名字，再开始前进','<div class="lesson">🎙️<b>爸爸，到你啦！</b></div><p>主持人会说“已经轮到谁谁谁啦”。玩家可以说“前进”，也可以点击大按钮。</p><ul><li>✓ 每回合只产生一次随机结果</li><li>✓ 轮盘动画可跳过，不会改变点数</li><li>✓ 语音听不清时，屏幕按钮永远可用</li></ul>','<span class="dots">● ○ ○ ○</span><button>上一步</button><button class="primary">下一步 →</button>','onboarding')),
    "08-math-answer": () => board('math'),
    "09-voice-guide": () => overlay(dialog('🎙️','TV VOICE HOST','让语音主持人听见全家','<p>第一次使用时，浏览器会询问麦克风权限。允许后，点名、数学答题和城市选择都可以直接说。</p><div class="steps"><article><i>1</i><b>开启麦克风</b><small>选择“允许”</small></article><article><i>2</i><b>等待提示音</b><small>波形跳动再回答</small></article><article><i>3</i><b>说简短句子</b><small>正常音量即可</small></article></div><div class="voice-test">🎙️ <span><b>准备测试麦克风</b><small>语音只用于本机操作，不保存录音</small></span><i>▂▅▇▃▆</i></div>','<button>暂时不用</button><button class="primary">开启并测试麦克风 →</button>','voice-dialog'),'dark'),
    "10-cast-guide": () => overlay(dialog('📺','IPHONE → ANDROID TV · 75 INCH','把环球棋盘搬到客厅电视','<p>游戏留在手边设备上运行，电视只负责显示；语音仍使用手机麦克风。</p><nav class="tabs"><button class="active">iPhone</button><button>安卓设备</button><button>电脑</button></nav><div class="steps vertical"><article><i>1</i><b>确认电视能接收 AirPlay</b><small>没有时可打开 AirScreen 等接收端</small></article><article><i>2</i><b>打开 iPhone“屏幕镜像”</b><small>手机与电视连接同一个 Wi-Fi</small></article><article><i>3</i><b>开启清晰单屏布局并横屏</b><small>自动避开灵动岛，不再上下滑</small></article></div><div class="checks">✓ 同一 Wi-Fi　✓ 电视开启接收　✓ iPhone 不锁屏　✓ 16:9</div>','<button>稍后再投</button><button class="primary">切换为原生清晰单屏 →</button>','cast-dialog'),'dark'),
    "11-rules-handbook": () => overlay(dialog('📖','FAMILY RULE BOOK','环球大富翁家庭规则手册','<nav class="tabs"><button class="active">🎒 快速玩法</button><button>🏙️ 城市租金表</button><button>⚙️ 辅助与开关</button></nav><h3>一个回合怎么走</h3><div class="flow"><span>1<b>点名</b></span>→<span>2<b>轮盘</b></span>→<span>3<b>移动</b></span>→<span>4<b>结算</b></span>→<span>5<b>交接</b></span></div><div class="rule-grid"><article>🏙️<b>城市经营</b><small>空地 → 4 座房屋 → 旅馆</small></article><article>🎈<b>机会与命运</b><small>抽完一轮以前不会重复</small></article><article>🛟<b>现金不足</b><small>资产中心推荐损失较小的方案</small></article><article>🏆<b>随时结算</b><small>所有资产均按购买原价</small></article></div>','<span>按 ? 随时打开</span><button class="primary">看完了，继续游戏 →</button>','rules-dialog')),
    "12-city-purchase": () => overlay(cityPoster('buy'),'dark'),
    "13-city-upgrade": () => overlay(cityPoster('upgrade'),'dark'),
    "14-card-reveal": () => overlay('<section class="chance"><header><span>CHANCE · 机会</span><b>第 1 轮牌袋</b></header><i>🎁</i><small>一份旅途好运</small><h1>城市纪念品热卖</h1><p>你的旅行纪念品受到大家欢迎，获得一笔额外收入。</p><div>✓ <span><small>已自动结算</small><b>爸爸获得 ¥800</b></span></div><p class="limits">单次损失最多现金 12% · 移动不超过 6 格 · 增益最多 3 回合</p><button>收下结果 · 继续旅行 →</button></section>','card-dark'),
    "15-asset-manager": () => overlay(asset(false),'dark'),
    "16-rescue-center": () => overlay(asset(true),'dark'),
    "17-financial-confirm": () => overlay(dialog('🔐','语音与点击均需二次确认','确认这项资产操作？','<div class="tip center">出售巴黎的一座房屋，获得 ¥1,000。<br>操作后建筑等级将从 2 降为 1。</div>','<button>取消</button><button class="primary">确认执行</button>','compact'),'dark'),
    "18-settlement-confirm": () => overlay(dialog('🧮','公平结算','现在查看本局资产排行？','<p class="center">所有城市和建筑均按购买原价计入，不折价、不加价。查看结果后仍可继续游戏。</p><div class="formula"><b>总资产</b><span>现金 ＋ 城市原价 ＋ 建筑原始投入</span></div>','<button>继续旅行</button><button class="primary">查看排行榜</button>','compact')),
    "19-final-ranking": () => `<section class="ranking"><header><i>🏆</i><small>本次环球冠军</small><h1>恭喜 爸爸！</h1><p>你带着最丰厚的旅行资产抵达终点！</p></header><main><div class="rank-head"><span>排名 / 旅行家</span><span>现金</span><span>城市原价</span><span>建筑投入</span><span>总资产</span></div><article class="winner"><span>👑 <b>🐼 爸爸</b></span><span>¥12,800</span><span>¥4,800</span><span>¥1,000</span><strong>¥18,600</strong></article><article><span>#2 <b>🦊 妈妈</b></span><span>¥10,250</span><span>¥5,600</span><span>¥1,000</span><strong>¥16,850</strong></article><article><span>#3 <b>🐯 小宝</b></span><span>¥11,200</span><span>¥3,000</span><span>—</span><strong>¥14,200</strong></article><article><span>#4 <b>🐰 大宝</b></span><span>¥10,700</span><span>¥3,200</span><span>—</span><strong>¥13,900</strong></article></main><footer><button>返回继续游戏</button><button>结束本局 · 返回首页</button></footer></section>`
  };
  const nav = `<nav class="preview-nav"><a href="./index.html">☷ ${device==='mobile'?'手机':'大屏'}目录</a><span>${index+1} / ${screens.length} · ${screens[index]?.[1]||''}</span>${index>0?`<a href="${href(screens[index-1][0])}">←</a>`:'<i></i>'}${index<screens.length-1?`<a href="${href(screens[index+1][0])}">→</a>`:'<i></i>'}</nav>`;
  document.querySelector('#preview-root').innerHTML = `<div class="tv-stage"><div class="artboard">${pages[current]?.() || home()}</div></div>${nav}`;
  document.querySelector('#preview-root').innerHTML = document.querySelector('#preview-root').innerHTML
    .replaceAll('小宝', '多肉')
    .replaceAll('大宝', '喜悦');

  document.querySelectorAll('.board-center').forEach(center => {
    const math = current === '08-math-answer';
    const title = center.querySelector('h1');
    if (title && !math) title.textContent = '转动双球轮盘，决定前进步数';
    const oldDice = center.querySelector('.dice-pair');
    if (oldDice) oldDice.outerHTML = roulette(math);
    const action = center.querySelector('.dice-button');
    if (action) {
      action.classList.add('roulette-button');
      action.innerHTML = '<i>🎱</i><span>开始前进<b>转动双球轮盘 →</b></span>';
    }
  });

  const fitPreview = () => {
    const viewport = window.visualViewport;
    const width = viewport?.width || window.innerWidth;
    const height = viewport?.height || window.innerHeight;
    const pregame = ['01-home','02-home-rules','03-iphone-install','04-restore-session'].includes(current);
    const canvasWidth = device === 'large-screen' ? 1600 : pregame ? 390 : 844;
    const canvasHeight = device === 'large-screen' ? 900 : pregame ? 844 : 390;
    const safeTop = device === 'large-screen' ? 0 : 30;
    const safeBottom = device === 'large-screen' ? 12 : 8;
    const safeSide = device === 'large-screen' ? 0 : 8;
    const availableWidth = Math.max(1, width - safeSide);
    const availableHeight = Math.max(1, height - safeTop - safeBottom);
    const maximumScale = device === 'large-screen' ? Number.POSITIVE_INFINITY : 1;
    const scale = Math.max(.1, Math.min(maximumScale, availableWidth / canvasWidth, availableHeight / canvasHeight));
    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--tv-scale', String(scale));
    rootStyle.setProperty('--preview-canvas-width', `${canvasWidth}px`);
    rootStyle.setProperty('--preview-canvas-height', `${canvasHeight}px`);
    rootStyle.overflow = 'hidden';
    window.scrollTo(0, 0);
  };
  fitPreview();
  window.addEventListener('resize', fitPreview, {passive:true});
  window.visualViewport?.addEventListener('resize', fitPreview, {passive:true});
  window.visualViewport?.addEventListener('scroll', fitPreview, {passive:true});
})();
