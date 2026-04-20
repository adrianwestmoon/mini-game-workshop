# Mini Game Workshop

一个专门拿来做网页小游戏原型的轻量项目。

现在这个项目是零依赖方案，不需要 `npm`、`pnpm` 或 `yarn`，直接靠本机 `node` 就能启动静态服务器，适合先把玩法快速跑起来。

## 现在有什么

- 一个风格化的小游戏工作台首页
- 五个可玩的 Canvas 示例游戏 `Comet Dash`、`Moo Mission`、`恶人谷黑店`、`猫头鹰与魔术师金声` 和 `金声与奶龙`
- 一个可直接开玩的 `剧情模式` 第一版，已串起五章主线
- 可扩展的 `src/games/` 目录结构，方便继续加新游戏
- 一个内置静态服务器 `serve.mjs`

## 启动方式

```bash
node serve.mjs
```

默认地址：

```text
http://localhost:4173
```

也可以直接双击打开：

```text
index.html
```

如果只是试玩，直接在浏览器打开本地文件也能运行；如果要对外分享链接，建议用下面的部署方式。

## 项目结构

```text
.
├── index.html
├── serve.mjs
├── styles.css
└── src
    ├── games
    │   ├── comet-dash.js
    │   ├── evil-valley-inn.js
    │   ├── milk-dragon-brawl.js
    │   ├── moo-mission.js
    │   ├── owl-magician.js
    │   └── index.js
    └── main.js
```

## 当前示例游戏

`Comet Dash`

- 拖动飞船或用键盘移动
- 自动射击，击落敌机并吃强化
- 带音效、爆炸粒子和命中反馈

`Moo Mission`

- 以阿凯小牛为主角的横版闯关
- 收集四叶草后打开终点门
- 支持键盘和底部触控按钮

`恶人谷黑店`

- 以金声为主角的俯视角闯关动作 demo
- 对抗喷火岳、需求仙师、荔枝头陀并救出阿凯小牛
- 三个房间三种机制，收集线索后解锁出口

`猫头鹰与魔术师金声`

- 月夜守灯动作玩法，金声和猫头鹰并肩作战
- 收集星羽充能，用月光脉冲点亮并稳住三座月灯
- 夜影会扑向玩家和灯火，需要边走位边补灯

`金声与奶龙`

- 横版擂台格斗玩法，金声对战奶龙
- 轻拳、跳跃和奶光飞踢三种核心节奏
- 三回合递进，奶龙会越来越凶

`剧情模式`

- 已串起 `Moo Mission -> 恶人谷黑店 -> 猫头鹰与魔术师金声 -> 金声与奶龙 -> Comet Dash`
- 带章节解锁、开场对白、通关过场和章节目标
- 通关进度保存在本地浏览器里

## 后续怎么加新游戏

1. 在 `src/games/` 新建一个模块，例如 `neon-runner.js`
2. 导出一个带 `id`、`title`、`description`、`controls`、`create()` 的对象
3. 在 `src/games/index.js` 里把它注册进数组

现有的 `Comet Dash` 就是一份最小可运行模板，我们可以直接照着继续扩。

## 部署为在线网页版

这个项目是纯静态站点，已经带好了部署配置。

### 方式一：Vercel

项目根目录已经包含 `vercel.json`，导入仓库后可直接部署，无需构建命令。

适合：

- 想尽快拿到一个可分享链接
- 不想配置构建环境

### 方式二：GitHub Pages

项目已经包含 GitHub Actions 工作流 `.github/workflows/deploy-pages.yml`。

使用步骤：

1. 把当前目录初始化为一个 Git 仓库并推到 GitHub
2. 默认分支使用 `main`
3. 在 GitHub 仓库的 Pages 设置中启用 `GitHub Actions`
4. 之后每次 push 到 `main` 都会自动发布

### 最简上线建议

如果你想最快拿到外网链接，优先用 `Vercel`。
