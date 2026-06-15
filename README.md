# Smart Ledger 📊

个人智能记账应用，支持自然语言输入、AI 分析、预算管理和多维度报表。

## 功能特性

### 记账管理
- **自然语言输入**：直接输入「午饭35」「打车25」自动识别分类和金额
- **分类标签**：餐饮、交通、购物、娱乐、住房、医疗、教育、通讯、服饰、礼物、其他
- **收入/支出**：支持收入和支出两种类型
- **编辑/删除**：所有交易记录可修改或删除

### 数据可视化
- **趋势图表**：折线图/柱状图切换，支持日/月/年维度
- **分类饼图**：消费结构分析，支持日/月/年切换
- **动画效果**：图表切换淡入淡出、折线绘制动画、柱状图拔地而起

### 预算管理
- **预算设置**：按分类设置月度预算
- **超支提醒**：实时监控预算使用情况
- **储蓄目标**：设定储蓄目标并追踪进度

### 报表分析
- **月度报表**：收支明细、分类统计、环比分析
- **热力图**：每日消费热力图
- **AI 聊天**：自然语言查询财务数据

## 技术栈

| 组件 | 技术 |
|------|------|
| 后端 | Python Flask + SQLite |
| 前端 | React 18 + TypeScript + Vite |
| UI | Tailwind CSS + 自定义组件 |
| 图表 | 纯 SVG 实现（折线/柱状/饼图） |
| 国际化 | 中文支持 |

## 快速开始

### 环境要求
- Python 3.10+
- Node.js 18+

### 安装

```bash
# 克隆仓库
git clone git@github.com:young-nights/smart-ledger.git
cd smart-ledger

# 后端
pip install -r requirements.txt
cp smart_ledger/.env.example smart_ledger/.env
# 编辑 .env 配置 API Key

# 前端
cd web
npm install
```

### 运行

```bash
# 启动后端（端口 5000）
python api.py

# 启动前端（端口 5173）
cd web
npm run dev
```

访问 http://localhost:5173

## 项目结构

```
smart-ledger/
├── api.py                 # Flask API 入口
├── requirements.txt       # Python 依赖
├── smart_ledger/          # 后端核心模块
│   ├── parser.py          # 自然语言解析器
│   ├── storage.py         # SQLite 数据存储
│   ├── models.py          # 数据模型
│   ├── budget.py          # 预算管理
│   ├── report.py          # 报表生成
│   └── chat.py            # AI 聊天
├── web/                   # 前端 React 应用
│   ├── src/
│   │   ├── pages/         # 页面组件
│   │   ├── components/    # UI 组件
│   │   ├── hooks/         # 自定义 Hooks
│   │   └── lib/           # 工具函数
│   └── package.json
└── tests/                 # 测试用例
```

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/transactions` | 获取交易列表 |
| POST | `/api/transactions` | 添加交易 |
| PUT | `/api/transactions/:id` | 更新交易 |
| DELETE | `/api/transactions/:id` | 删除交易 |
| GET | `/api/transactions/summary` | 获取统计摘要 |
| GET | `/api/transactions/trend` | 获取趋势数据 |
| POST | `/api/chat` | AI 聊天查询 |

## License

MIT
