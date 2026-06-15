# AI Chat Feature Architecture

## 一、功能概述

在记账本中集成 AI 对话助手，用户可以通过自然语言进行账务管理：
- 记账："午饭花了35块"
- 查询："这个月花了多少钱"
- 预算："设置餐饮预算2000"
- 分析："我的消费结构怎么样"
- 建议："给我一些理财建议"

## 二、技术方案

### 2.1 LLM 接入

支持 OpenAI 兼容 API（可对接 Ollama、OpenAI、DeepSeek 等）：

```python
# 配置
LLM_BASE_URL = "http://localhost:11434/v1"  # Ollama 默认
LLM_MODEL = "qwen2.5"  # 或 gpt-4o-mini 等
LLM_API_KEY = ""  # Ollama 不需要
```

### 2.2 System Prompt 设计

```
你是 Smart Ledger 的 AI 财务助手。你可以帮用户：
1. 记账：解析自然语言输入，提取金额、分类、日期
2. 查询：查询历史交易、月度汇总、分类统计
3. 预算：设置、查看、修改预算
4. 分析：分析消费结构、储蓄率、异常消费
5. 建议：根据历史数据给出理财建议

当前时间：{current_time}
当前月份：{current_month}

可用工具：
- add_transaction(raw_input): 添加交易
- query_transactions(month, category): 查询交易
- get_summary(month): 获取月度汇总
- set_budget(category, amount): 设置预算
- get_report(month): 获取月度报告

请用 JSON 格式返回工具调用，格式：
{"tool": "tool_name", "params": {...}, "message": "给用户的回复"}

如果不需要调用工具，直接回复用户。
```

### 2.3 工具调用流程

```
用户输入 → LLM 分析 → 决定是否调用工具
                        ├── 调用工具 → 获取结果 → LLM 生成回复
                        └── 直接回复 → 返回给用户
```

## 三、API 设计

### 3.1 Chat 端点

```
POST /api/chat
{
  "message": "午饭花了35块",
  "history": [...]  # 可选，对话历史
}

Response:
{
  "reply": "已记录：餐饮.午餐 -35.00 CNY",
  "tool_calls": [...],  # 执行的工具调用
  "transaction": {...}  # 如果添加了交易
}
```

### 3.2 Chat History 端点

```
GET /api/chat/history?limit=50
Response: [...messages]

DELETE /api/chat/history
Response: {"ok": true}
```

## 四、前端设计

### 4.1 Chat 页面

新增一个「AI 助手」页面或侧边栏面板：
- 聊天气泡样式
- 支持 Markdown 渲染
- 工具调用结果卡片显示
- 快捷命令按钮

### 4.2 快捷命令

```
记账: 午饭35       → 快速记账
查询: 本月餐饮      → 查询分类
预算: 设置餐饮2000  → 设置预算
报告: 本月报告      → 生成报告
建议: 给我建议      → 获取建议
```

## 五、目录结构变化

```
smart_ledger/
├── chat.py          # 新增：Chat 管理器
├── tools.py         # 新增：工具函数定义
├── api.py           # 修改：添加 /api/chat 端点
web/src/
├── pages/Chat.tsx   # 新增：Chat 页面
├── components/chat/
│   ├── ChatWindow.tsx
│   ├── ChatMessage.tsx
│   └── QuickCommands.tsx
```

## 六、支持的 LLM 后端

| 后端 | Base URL | 说明 |
|------|----------|------|
| Ollama | http://localhost:11434/v1 | 本地运行，免费 |
| OpenAI | https://api.openai.com/v1 | 需要 API Key |
| DeepSeek | https://api.deepseek.com | 国内可用 |
| 任意 OpenAI 兼容 | 自定义 | 通用接口 |
