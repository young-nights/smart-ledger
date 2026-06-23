# Smart Ledger 项目需求文档

> 基于代码实际实现编写 | 版本 1.0.0 | 更新日期：2026-06-17

---

## 1. 项目概述

### 1.1 产品定位

Smart Ledger 是一款支持多币种的智能记账 Web 应用，提供自然语言记账、预算管理、储蓄目标追踪、消费热力图、月度财务报告以及 AI 财务助手等功能。采用 Flask + React 技术栈，支持中英文双语界面。

### 1.2 技术架构

```
┌─────────────────────────────────────────────────┐
│                  Frontend (React)                │
│  Vite + React + TypeScript + Tailwind CSS       │
│  端口: 5173 (开发)                               │
└─────────────────┬───────────────────────────────┘
                  │ /api 代理
┌─────────────────▼───────────────────────────────┐
│               Backend (Flask)                    │
│  Python 3.12+ / Flask 3.0+ / flask-cors         │
│  端口: 5050                                      │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│          Storage (SQLite)                        │
│  ~/.smart_ledger/ledger.db                      │
│  WAL 模式 / 外键约束 / 自动迁移                   │
└─────────────────────────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│          外部服务                                 │
│  · OpenAI 兼容 API（小米 MiLM / DeepSeek / ...） │
│  · open.er-api.com 实时汇率                       │
└─────────────────────────────────────────────────┘
```

### 1.3 依赖清单

| 层级 | 技术 | 版本要求 |
|------|------|---------|
| 后端 | Flask | ≥ 3.0 |
| 后端 | flask-cors | ≥ 4.0 |
| 后端 | openai | ≥ 1.0 |
| 后端 | requests | ≥ 2.31 |
| 前端 | React | 18+ |
| 前端 | Vite | 5+ |
| 前端 | TypeScript | 5+ |
| 前端 | Tailwind CSS | 4+ |
| 前端 | react-router-dom | 6+ |
| 前端 | lucide-react | 图标库 |

---

## 2. 功能需求

### 2.1 自然语言记账模块

**核心能力：** 将中文自然语言输入自动解析为结构化交易记录。

#### 2.1.1 日期解析

| 输入模式 | 示例 | 解析结果 |
|---------|------|---------|
| 相对日期 | "今天"、"昨天"、"前天"、"大前天" | 自动计算日期 |
| 未来日期 | "明天"、"后天" | 自动计算日期 |
| 上个月 | "上个月" | 上月1日 |
| 绝对日期 | "2024-03-15"、"2024/3/15" | 直接解析 |
| 短格式 | "3-15"、"3/15" | 当年对应日期 |
| 中文格式 | "3月15日"、"3月15号" | 当年对应日期 |
| 默认 | 未提供日期 | 今天 |

#### 2.1.2 金额解析

| 模式 | 示例 | 说明 |
|------|------|------|
| 纯数字 | "35" | 支持小数点后1-2位 |
| 货币符号 | "¥35"、"$10" | ¥ ￥ $ |
| 中文单位 | "35块"、"35元"、"35块钱"、"35元钱" | 自动识别 |
| 美元口语 | "10刀" | 识别为美元 |

#### 2.1.3 收支方向检测

- **支出关键词优先匹配：** 餐饮、交通、购物、住房、娱乐、医疗、教育、通讯、服饰、社交、礼物等类别下的子关键词
- **收入关键词匹配：** 工资、奖金、兼职、投资收益、退款、红包收入、转账收入、报销
- **前端覆盖：** 前端可通过 `type` 参数（"expense" / "income"）强制覆盖方向

#### 2.1.4 分类自动匹配

内置 **12 个一级分类** 和 **40+ 个二级分类**，通过关键词字典匹配：

| 一级分类 | 二级分类（部分） | 关键词示例 |
|---------|----------------|-----------|
| 餐饮 | 早餐、午餐、晚餐、零食饮料、外卖、聚餐、食材 | 午饭、奶茶、美团、买菜 |
| 交通 | 公交地铁、打车、加油、停车、高铁火车、飞机、共享单车 | 滴滴、地铁、加油 |
| 购物 | 日用品、衣物鞋帽、数码电子、家居家电、化妆品 | 纸巾、手机、护肤品 |
| 住房 | 房租、水费、电费、燃气费、物业费、装修 | 租金、电费 |
| 娱乐 | 电影演出、游戏、运动健身、旅行、书籍学习 | 电影、健身、酒店 |
| 医疗 | 看病、药品、体检、保险 | 挂号、药店 |
| 教育 | 学费、教材、考试 | 培训、考证 |
| 通讯 | 话费、会员 | 流量、VIP |
| 服饰 | 衣物、鞋帽、配饰 | 外套、手表 |
| 社交 | 红包、份子钱 | 转账、随礼 |
| 礼物 | 礼物 | 送礼 |
| 其他 | 其他支出 | 杂项 |

#### 2.1.5 收入分类

| 收入类别 | 关键词示例 |
|---------|-----------|
| 工资 | 工资、薪水、月薪、发工资 |
| 奖金 | 奖金、年终奖、绩效、提成 |
| 兼职 | 兼职、副业、外快 |
| 投资收益 | 利息、股息、理财收益 |
| 退款 | 退款、返现、退货 |
| 红包收入 | 收红包 |
| 转账收入 | 收转账、到账 |
| 报销 | 报销 |

#### 2.1.6 前端增强

- 支持选择交易类型（收入/支出）
- 支持手动覆盖分类（含自定义分类）
- 支持选择日期
- 支持输入时间
- 支持通过自然语言搜索交易（`/api/search`）

### 2.2 交易管理模块

#### 2.2.1 交易 CRUD

| 操作 | 方法 | 端点 | 说明 |
|------|------|------|------|
| 查询 | GET | `/api/transactions` | 支持按月、分类、日期范围、关键词筛选 |
| 新增 | POST | `/api/transactions` | 接收 `raw_input` + 可选覆盖字段 |
| 更新 | PUT | `/api/transactions/{id}` | 完整替换交易字段 |
| 删除 | DELETE | `/api/transactions/{id}` | 按 ID 删除 |

#### 2.2.2 查询筛选参数

| 参数 | 格式 | 说明 |
|------|------|------|
| `month` | "YYYY-MM" | 按月份筛选 |
| `category` | 字符串 | 精确分类匹配 |
| `start_date` | "YYYY-MM-DD" | 起始日期 |
| `end_date` | "YYYY-MM-DD" | 截止日期 |
| `keyword` | 字符串 | 模糊搜索描述和原始输入 |
| `limit` | 整数 | 最大返回条数，默认 500 |

#### 2.2.3 趋势分析

| 端点 | 参数 | 返回 |
|------|------|------|
| `/api/transactions/trend` | `period`（day/month/year）、`count` | 各时间段的收支趋势数组 |

- **日趋势（day）：** 当月每天的收支汇总
- **月趋势（month）：** 当年1-12月的收支汇总
- **年趋势（year）：** 最近 N 年的收支汇总

#### 2.2.4 汇总统计

| 端点 | 参数 | 返回 |
|------|------|------|
| `/api/transactions/summary` | `period`（day/month/year）、具体日期 | 指定周期的收支汇总 + 分类明细 |
| `/api/transactions/summary/all` | 无 | 历史总收支汇总 |

#### 2.2.5 数据导出

| 格式 | 端点 | 说明 |
|------|------|------|
| CSV | `/api/export/csv` | 可按月份、分类筛选 |
| JSON | `/api/export/json` | 可按月份、分类筛选 |

### 2.3 预算管理模块

#### 2.3.1 预算 CRUD

| 操作 | 方法 | 端点 | 说明 |
|------|------|------|------|
| 查询 | GET | `/api/budgets?month=YYYY-MM` | 返回所有预算及使用情况 |
| 新增/更新 | POST | `/api/budgets` | 同一分类+月份+周期自动 upsert |
| 删除 | DELETE | `/api/budgets/{id}` | 按 ID 删除 |

#### 2.3.2 预算周期

| 周期 | 计算方式 |
|------|---------|
| `day` | 当日该分类支出 |
| `month` | 当月该分类支出 |
| `year` | 当年该分类支出 |
| `all` | 历史总支出 |

#### 2.3.3 预算状态

| 状态 | 条件 | 前端显示 |
|------|------|---------|
| `normal` | 使用率 < 80% | 正常 |
| `warning` | 80% ≤ 使用率 < 100% | 预警 |
| `overspent` | 使用率 ≥ 100% | 超支 |

#### 2.3.4 预算字段

| 字段 | 说明 |
|------|------|
| `category` | 分类名称（支持自定义分类名） |
| `amount` | 预算金额 |
| `currency` | 币种，默认 CNY |
| `year` / `month` | 目标月份 |
| `period` | 预算周期 |
| `spent` | 已支出金额（计算字段） |
| `remaining` | 剩余金额（计算字段） |
| `usage_pct` | 使用百分比（计算字段） |
| `status` | 状态（计算字段） |

### 2.4 储蓄目标模块

#### 2.4.1 目标 CRUD

| 操作 | 方法 | 端点 |
|------|------|------|
| 列表 | GET | `/api/savings-goals` |
| 创建 | POST | `/api/savings-goals` |
| 更新 | PUT | `/api/savings-goals/{id}` |
| 删除 | DELETE | `/api/savings-goals/{id}` |

#### 2.4.2 多币种支持

每个储蓄目标可包含多个币种条目，系统自动按实时汇率折算为 CNY 总额：

| 端点 | 说明 |
|------|------|
| `/api/savings-goals/{id}/currencies` | GET/POST 币种条目 |
| `/api/savings-goals/{id}/currencies/{item_id}` | PUT/DELETE 单条币种 |

#### 2.4.3 储蓄历史追踪

| 端点 | 说明 |
|------|------|
| `/api/savings-goals/{id}/history` | GET 历史记录 |
| `/api/savings-goals/{id}/history` | POST 新增历史条目 |

- 同一天的历史记录自动合并（upsert by day）
- 前端展示为 SVG 面积曲线图

#### 2.4.4 目标字段

| 字段 | 说明 |
|------|------|
| `name` | 目标名称 |
| `target_amount` | 目标金额 |
| `current_amount` | 当前金额（自动从币种条目计算） |
| `deadline` | 截止日期（YYYY-MM-DD） |
| `color` | 进度条颜色（6 种可选） |
| `currencies` | 多币种明细数组 |

#### 2.4.5 支持币种

CNY、USD、EUR、GBP、JPY、HKD

### 2.5 多币种支持模块

#### 2.5.1 内置默认汇率

```
CNY: USD 0.138, EUR 0.127, GBP 0.109, JPY 20.5, HKD 1.08
USD: CNY 7.25, EUR 0.92, GBP 0.79, JPY 149.0, HKD 7.82
...（完整的 6×6 交叉汇率矩阵）
```

#### 2.5.2 实时汇率

- 数据源：`open.er-api.com`（免费 API，无需 API Key）
- 以 CNY 为基准获取汇率，前端反转后用于外币→CNY 换算
- API 不可用时自动回退到内置默认汇率

#### 2.5.3 自定义汇率

| 操作 | 方法 | 端点 |
|------|------|------|
| 查询 | GET | `/api/currencies?base=CNY` |
| 设置 | POST | `/api/currencies` |
| 实时汇率 | GET | `/api/exchange-rates?base=CNY` |

#### 2.5.4 汇率存储

自定义汇率持久化到 SQLite `exchange_rates` 表，查询时优先使用数据库汇率。

### 2.6 消费热力图模块

#### 2.6.1 数据获取

| 端点 | 参数 | 说明 |
|------|------|------|
| `/api/heatmap` | `year` | 指定年份的每日支出汇总 |

#### 2.6.2 可视化

- GitHub 风格的年历热力图
- 颜色深浅表示支出金额多寡（5 级色阶）
- 点击某天可查看当日交易明细
- 支持按年份切换查看

#### 2.6.3 数据结构

```json
{
  "date": "2024-03-15",
  "total": 125.50
}
```

### 2.7 月度财务报告模块

#### 2.7.1 报告生成

| 端点 | 参数 | 说明 |
|------|------|------|
| `/api/report` | `month`（YYYY-MM） | 生成指定月份的完整报告 |

#### 2.7.2 报告内容

| 模块 | 说明 |
|------|------|
| 摘要 | 总收入、总支出、净储蓄 |
| 储蓄率 | 净储蓄/总收入 × 100% |
| 储蓄等级 | 优秀（≥40%）、良好（≥20%）、警告（≥10%）、危险（<10%） |
| Top 5 分类 | 按支出金额排序的前 5 个分类 |
| 预算执行 | 各分类预算使用情况（含进度条） |
| 异常检测 | 与上月对比，变化 ≥50% 的分类标记为异常 |
| 理财建议 | 基于储蓄率、分类占比、收支比生成个性化建议 |

#### 2.7.3 异常检测规则

| 类型 | 条件 | 说明 |
|------|------|------|
| 消费增加 | 当月支出较上月增加 ≥50% | 标记为 increase |
| 消费减少 | 当月支出较上月减少 ≥50% | 标记为 decrease |
| 新增分类 | 上月无记录，本月有支出 | 标记为 new |

#### 2.7.4 理财建议规则（FinancialAdvisor）

| 维度 | 规则 |
|------|------|
| 储蓄率 | ≥30% 优秀、≥20% 良好、≥10% 警告、<10% 危险 |
| 分类占比 | 单分类支出 ≥ 总支出 40% 时警告 |
| 收支比 | >100% 危险（入不敷出）、>90% 警告、>70% 提示 |

### 2.8 AI 财务助手模块（Chat）

#### 2.8.1 功能概述

基于 OpenAI 兼容 API 的对话式财务助手，名为"小账"，可执行以下操作：

| 意图 | AI 返回格式 | 自动执行 |
|------|------------|---------|
| 记账 | `{"action": "add_transaction", "raw_input": "..."}` | 调用 parser 解析并保存 |
| 查询 | `{"action": "query", "month": "...", "category": "..."}` | 查询并汇总交易 |
| 设预算 | `{"action": "set_budget", "category": "...", "amount": N}` | 创建预算 |
| 报告 | `{"action": "report", "month": "..."}` | 生成月度报告 |
| 自由对话 | 纯文本回复 | 直接返回 |

#### 2.8.2 支持的模型

| 前端 ID | 提供商 | 模型名称 | 基础 URL |
|---------|--------|---------|---------|
| `xiaomi` | 小米 | mimo-v2.5-pro | api.xiaomimimo.com/v1 |
| `deepseek` | DeepSeek | deepseek-chat | api.deepseek.com/v1 |
| `openai` | OpenAI | gpt-4o-mini | api.openai.com/v1 |
| `ollama` | 本地 Ollama | qwen2.5 | localhost:11434/v1 |

#### 2.8.3 API Key 管理

| 端点 | 说明 |
|------|------|
| `GET /api/config/api-key` | 获取脱敏后的 API Key 状态 |
| `PUT /api/config/api-key` | 更新 API Key（写入 `.env` 文件） |

- API Key 存储在 `smart_ledger/.env` 文件中
- 支持前端 UI 直接配置

#### 2.8.4 对话历史

- 保留最近 20 条消息作为上下文
- 支持清空历史
- 历史存储在内存中（进程重启后清空）

#### 2.8.5 系统提示词

AI 助手接收包含当前财务数据的系统提示词，包括当前月份、总收入、总支出、净储蓄。

### 2.9 搜索模块

| 端点 | 参数 | 说明 |
|------|------|------|
| `/api/search` | `q` | 自然语言查询参数 |

解析逻辑复用 `parse_query_params`：

| 输入 | 解析结果 |
|------|---------|
| "餐饮" | 分类筛选 |
| "上个月" | 月份筛选 |
| "上个月 餐饮" | 组合筛选 |
| "午饭" | 关键词搜索 |

### 2.10 分类管理模块

| 端点 | 说明 |
|------|------|
| `GET /api/categories` | 获取所有分类（含子分类、关键词） |

- 首次启动时自动从 parser 关键词字典种子化分类数据
- 前端支持本地分类管理（localStorage 缓存 + 后端分类合并）
- 自定义分类可在预算模块中使用

---

## 3. 非功能需求

### 3.1 国际化（i18n）

- 支持中文（zh）和英文（en）双语
- 使用 React Context 实现全局语言切换
- 语言偏好持久化到 localStorage
- 覆盖所有导航、页面标题、按钮文本、空状态提示

### 3.2 主题系统

- 支持浅色/深色/跟随系统三种主题模式
- 使用 CSS 自定义属性（CSS Variables）实现主题切换
- 侧边栏使用深色渐变背景，内容区域跟随主题

### 3.3 数据存储

- **数据库：** SQLite，WAL 模式，文件路径 `~/.smart_ledger/ledger.db`
- **外键约束：** 启用
- **自动迁移：** 首次创建表后自动执行 schema 变更
- **索引：** transactions(date)、transactions(category)、budgets(year, month)

### 3.4 前端性能

- Vite 构建，开发模式热更新
- API 代理配置避免跨域
- React hooks 实现数据缓存和乐观更新
- 图表组件支持动画过渡（crossfade）

### 3.5 错误处理

- 全局 ErrorBoundary 组件捕获前端渲染错误
- API 统一错误响应格式：`{"error": "message"}`
- 400（参数错误）、404（资源不存在）标准 HTTP 状态码

### 3.6 布局设计

- 侧边栏导航，支持折叠/展开
- 编辑器风格（editorial）布局，大量留白和间距
- 卡片组件统一风格（elevated-card）
- 表格行 hover 效果

---

## 4. API 接口清单

### 4.1 交易相关

| 方法 | 端点 | 说明 | 请求体/参数 |
|------|------|------|------------|
| GET | `/api/transactions` | 查询交易列表 | month, category, keyword, start_date, end_date |
| POST | `/api/transactions` | 新增交易 | raw_input, type, category, date, time |
| PUT | `/api/transactions/{id}` | 更新交易 | date, amount, currency, category, subcategory, description, raw_input |
| DELETE | `/api/transactions/{id}` | 删除交易 | — |
| GET | `/api/transactions/trend` | 收支趋势 | period (day/month/year), count |
| GET | `/api/transactions/summary` | 指定周期汇总 | period, month, day, year |
| GET | `/api/transactions/summary/all` | 历史总汇总 | — |
| GET | `/api/search` | 搜索交易 | q (自然语言) |
| GET | `/api/heatmap` | 消费热力图数据 | year |
| GET | `/api/recurring` | 检测周期性交易 | — |

### 4.2 预算相关

| 方法 | 端点 | 说明 | 请求体/参数 |
|------|------|------|------------|
| GET | `/api/budgets` | 查询预算列表 | month (YYYY-MM) |
| POST | `/api/budgets` | 创建/更新预算 | category, amount, currency, year, month, period |
| DELETE | `/api/budgets/{id}` | 删除预算 | — |

### 4.3 储蓄目标相关

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/savings-goals` | 查询所有目标 |
| POST | `/api/savings-goals` | 创建目标 |
| PUT | `/api/savings-goals/{id}` | 更新目标 |
| DELETE | `/api/savings-goals/{id}` | 删除目标 |
| GET | `/api/savings-goals/{id}/history` | 查询历史 |
| POST | `/api/savings-goals/{id}/history` | 新增历史 |
| GET | `/api/savings-goals/{id}/currencies` | 查询币种条目 |
| POST | `/api/savings-goals/{id}/currencies` | 新增币种条目 |
| PUT | `/api/savings-goals/{id}/currencies/{item_id}` | 更新币种条目 |
| DELETE | `/api/savings-goals/{id}/currencies/{item_id}` | 删除币种条目 |

### 4.4 多币种相关

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/currencies` | 查询支持的币种和汇率 |
| POST | `/api/currencies` | 设置自定义汇率 |
| GET | `/api/exchange-rates` | 获取实时汇率（反转后） |

### 4.5 AI 聊天相关

| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/api/chat` | 发送消息（支持切换模型） |
| GET | `/api/chat/history` | 获取聊天历史 |
| DELETE | `/api/chat/history` | 清空聊天历史 |

### 4.6 报告相关

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/report` | 生成月度报告 |

### 4.7 分类与导出

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/categories` | 获取所有分类 |
| GET | `/api/export/csv` | 导出 CSV |
| GET | `/api/export/json` | 导出 JSON |

### 4.8 系统相关

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/api/health` | 健康检查 |
| GET | `/api/config/api-key` | 获取 API Key 状态 |
| PUT | `/api/config/api-key` | 更新 API Key |

---

## 5. 数据模型

### 5.1 Transaction（交易记录）

```
id              INTEGER PRIMARY KEY AUTOINCREMENT
date            TEXT NOT NULL              -- "YYYY-MM-DD"
amount          REAL NOT NULL              -- 正数=收入, 负数=支出
currency        TEXT NOT NULL DEFAULT 'CNY'
category        TEXT NOT NULL DEFAULT ''   -- 一级分类
subcategory     TEXT NOT NULL DEFAULT ''   -- 二级分类
description     TEXT NOT NULL DEFAULT ''   -- 解析后的描述
raw_input       TEXT NOT NULL DEFAULT ''   -- 用户原始输入
created_at      TEXT DEFAULT (datetime('now','localtime'))
```

**衍生字段（to_dict）：** is_income, is_expense, abs_amount

### 5.2 Budget（预算）

```
id              INTEGER PRIMARY KEY AUTOINCREMENT
category        TEXT NOT NULL
amount          REAL NOT NULL
currency        TEXT NOT NULL DEFAULT 'CNY'
year            INTEGER NOT NULL
month           INTEGER NOT NULL
period          TEXT NOT NULL DEFAULT 'month'  -- day/month/year/all
created_at      TEXT DEFAULT (datetime('now','localtime'))
UNIQUE(category, year, month, period)
```

### 5.3 SavingsGoal（储蓄目标）

```
id              INTEGER PRIMARY KEY AUTOINCREMENT
name            TEXT NOT NULL
target_amount   REAL NOT NULL DEFAULT 0
current_amount  REAL NOT NULL DEFAULT 0
deadline        TEXT                        -- "YYYY-MM-DD"
color           TEXT NOT NULL DEFAULT '#0d7377'
created_at      TEXT DEFAULT (datetime('now','localtime'))
```

### 5.4 SavingsGoalCurrency（储蓄目标币种条目）

```
id              INTEGER PRIMARY KEY AUTOINCREMENT
goal_id         INTEGER NOT NULL → savings_goals(id) ON DELETE CASCADE
currency        TEXT NOT NULL DEFAULT 'CNY'
amount          REAL NOT NULL DEFAULT 0
created_at      TEXT DEFAULT (datetime('now','localtime'))
```

### 5.5 SavingsHistory（储蓄历史）

```
id              INTEGER PRIMARY KEY AUTOINCREMENT
goal_id         INTEGER NOT NULL → savings_goals(id) ON DELETE CASCADE
amount          REAL NOT NULL DEFAULT 0
recorded_at     TEXT DEFAULT (datetime('now'))
```

### 5.6 Category（分类）

```
id              INTEGER PRIMARY KEY AUTOINCREMENT
name            TEXT NOT NULL UNIQUE
parent_id       INTEGER → categories(id) ON DELETE SET NULL
keywords        TEXT NOT NULL DEFAULT ''
icon            TEXT NOT NULL DEFAULT ''
```

### 5.7 ExchangeRate（汇率）

```
id              INTEGER PRIMARY KEY AUTOINCREMENT
from_currency   TEXT NOT NULL
to_currency     TEXT NOT NULL
rate            REAL NOT NULL
date            TEXT NOT NULL
```

---

## 6. 页面清单

| 路径 | 页面组件 | 说明 |
|------|---------|------|
| `/` | Dashboard | 仪表盘：关键指标、趋势图、分类饼图、储蓄率、储蓄目标、最近交易 |
| `/transactions` | Transactions | 记账页：自然语言输入、交易列表（多维筛选、可拖拽列头、日期选择器） |
| `/budgets` | Budgets | 预算管理：总预算进度、分类预算卡片、添加/删除预算 |
| `/savings` | SavingsGoals | 储蓄目标：目标列表、进度环、多币种编辑、历史曲线图 |
| `/heatmap` | Heatmap | 消费热力图：年历视图、颜色编码、点击查看当日交易 |
| `/report` | Report | 月度报告：摘要、异常检测、理财建议、预算执行表 |
| `/chat` | Chat | AI 助手：对话界面、模型切换、API Key 配置、消息操作（复制/重新生成） |

### 6.1 页面详细描述

#### Dashboard（仪表盘）

- **英雄区（Hero）：** 4 个关键指标卡片（总收入、总支出、总储蓄、储蓄率），支持 hover 动画和环比趋势
- **趋势图：** 折线/柱状图切换，支持日/月/年三种时间粒度
- **分类饼图：** 饼图/环形图展示消费结构，支持日/月/年周期切换
- **储蓄率仪表：** 圆环进度指示器 + 等级标签（优秀/良好/一般/需提升/超支）
- **储蓄目标：** 卡片列表展示所有储蓄目标进度
- **最近交易：** 最近 10 笔交易列表

#### Transactions（记账页）

- **顶部摘要：** 总支出、总收入、交易笔数
- **输入表单：** 自然语言输入框 + 类型选择（收入/支出）+ 分类选择 + 日期选择
- **筛选器：** 分类标签、年/月/日三级日期筛选（日级使用日历弹窗）
- **交易列表：** 可拖拽调整列宽的表格，支持删除和更新操作
- **乐观更新：** 删除/新增操作立即反映在 UI 上

#### Budgets（预算页）

- **总预算区：** 总预算进度条 + 已用/总额
- **分类预算列表：** 每个预算独立卡片，含进度条和删除按钮
- **添加表单：** 分类选择（含自定义分类）+ 周期选择（天/月/年/全部）+ 金额输入

#### SavingsGoals（储蓄目标页）

- **目标列表：** 进度环 + 名称 + 金额 + 进度条 + 操作按钮
- **多币种编辑：** 支持为每个目标添加多个币种条目，自动按汇率折算
- **历史图表：** 展开后显示 SVG 面积曲线图 + 目标线 + hover tooltip
- **新建/编辑表单：** 目标名称 + 目标金额 + 多币种输入 + 截止日期 + 颜色选择

#### Heatmap（热力图页）

- **年历视图：** GitHub 风格热力图，5 级颜色编码
- **年份切换：** 自动检测有数据的年份
- **日交易明细：** 点击某天展开当日交易列表

#### Report（报告页）

- **月度摘要：** 总收入、总支出、净储蓄、储蓄率、等级徽章
- **异常提醒：** 左侧橙色边框标记，列出消费异常
- **理财建议：** 左侧蓝色边框标记，列出个性化建议
- **预算执行表：** 分类预算使用情况表格

#### Chat（AI 助手页）

- **模型选择器：** 下拉菜单选择 AI 模型
- **API Key 配置：** 模态框输入/更新 API Key
- **对话界面：** 用户/AI 消息气泡，支持复制和重新生成
- **空状态引导：** 功能卡片展示（记账、查询、预算、报告、建议、储蓄目标）

---

## 7. 前端组件结构

```
web/src/
├── App.tsx                          # 路由配置
├── main.tsx                         # 入口
├── pages/
│   ├── Dashboard.tsx                # 仪表盘
│   ├── Transactions.tsx             # 记账页
│   ├── Budgets.tsx                  # 预算管理
│   ├── SavingsGoals.tsx             # 储蓄目标
│   ├── Heatmap.tsx                  # 消费热力图
│   ├── Report.tsx                   # 月度报告
│   └── Chat.tsx                     # AI 助手
├── components/
│   ├── layout/
│   │   ├── AppShell.tsx             # 主布局壳
│   │   ├── Sidebar.tsx              # 侧边栏导航
│   │   └── TopBar.tsx               # 顶部栏
│   ├── dashboard/
│   │   ├── BarChart.tsx             # 柱状图
│   │   ├── DonutChart.tsx           # 环形图
│   │   ├── LineChart.tsx            # 折线图
│   │   ├── PieChart.tsx             # 饼图
│   │   ├── SpendingChart.tsx        # 消费图表
│   │   ├── StatCard.tsx             # 统计卡片
│   │   ├── QuickActions.tsx         # 快捷操作
│   │   ├── RecentTransactions.tsx   # 最近交易
│   │   └── CategoryManager.tsx      # 分类管理
│   ├── transactions/
│   │   ├── TransactionForm.tsx      # 交易输入表单
│   │   ├── TransactionList.tsx      # 交易列表
│   │   ├── TransactionRow.tsx       # 交易行
│   │   └── DraggableHeader.tsx      # 可拖拽表头
│   ├── budget/
│   │   ├── BudgetCard.tsx           # 预算卡片
│   │   └── BudgetProgress.tsx       # 预算进度条
│   ├── report/
│   │   └── MonthlyReport.tsx        # 月度报告组件
│   └── ui/
│       ├── Badge.tsx                # 徽章
│       ├── Button.tsx               # 按钮
│       ├── Calendar.tsx             # 日历
│       ├── ErrorBoundary.tsx        # 错误边界
│       └── ThemeToggle.tsx          # 主题切换
├── hooks/
│   └── useLedger.ts                 # 数据获取 hooks
├── lib/
│   ├── api.ts                       # API 封装
│   ├── types.ts                     # TypeScript 类型定义
│   ├── categoryStore.ts             # 本地分类存储
│   └── export.ts                    # 导出工具
├── i18n/
│   ├── index.tsx                    # i18n 上下文和翻译
│   └── LanguageToggle.tsx           # 语言切换组件
```

---

## 8. 部署与运行

### 8.1 后端启动

```bash
cd smart-ledger
pip install -r requirements.txt
python api.py
# 启动在 0.0.0.0:5050
```

### 8.2 前端开发

```bash
cd smart-ledger/web
npm install
npm run dev
# 开发服务器在 5173，自动代理 /api 到 5050
```

### 8.3 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `LLM_BASE_URL` | LLM API 基础 URL | `https://api.xiaomi.com/v1` |
| `LLM_MODEL` | LLM 模型名称 | `MiLM` |
| `LLM_API_KEY` | LLM API 密钥 | 空（需前端配置） |

### 8.4 数据文件

| 文件 | 路径 | 说明 |
|------|------|------|
| SQLite 数据库 | `~/.smart_ledger/ledger.db` | 主数据存储 |
| LLM 配置 | `smart_ledger/.env` | API Key 存储 |

---

## 9. 已知限制与待改进项

1. **聊天历史持久化：** 当前对话历史仅存储在内存中，进程重启后丢失
2. **汇率缓存：** 实时汇率每次请求都调用外部 API，无缓存机制
3. **并发支持：** SQLite + Flask 单线程模式，不适合高并发场景
4. **用户认证：** 当前为单用户应用，无多用户支持
5. **定期备份：** 无自动数据备份机制
6. **周期性交易检测：** 仅提供检测接口（`/api/recurring`），前端未集成展示
7. **分类管理：** 前端分类管理（CategoryManager）已实现但未在主导航中集成
