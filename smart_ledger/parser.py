"""Natural language parser for Smart Ledger.

Parses user text like "午饭35" or "收到工资8000" into structured Transaction objects.
"""

import re
from datetime import datetime, timedelta
from typing import Optional, Tuple, Dict, List, Any

from .models import Transaction

# ── Category keyword dictionary ──────────────────────────────────
# Structure: { category: { subcategory: [keywords] } }
# Positive amount = income, negative = expense.

CATEGORY_KEYWORDS: Dict[str, Dict[str, List[str]]] = {
    "餐饮": {
        "餐饮": ["餐饮", "吃饭"],
        "早餐": ["早餐", "早饭", "早点"],
        "午餐": ["午餐", "午饭", "中饭", "中午饭"],
        "晚餐": ["晚餐", "晚饭", "夜宵", "宵夜"],
        "零食饮料": ["零食", "饮料", "奶茶", "咖啡", "果汁", "可乐", "矿泉水", "小吃"],
        "外卖": ["外卖", "美团", "饿了么"],
        "聚餐": ["聚餐", "请客", "宴请", "下馆子"],
        "食材": ["买菜", "蔬菜", "水果", "肉", "鸡蛋", "牛奶", "面包"],
    },
    "交通": {
        "公交地铁": ["公交", "地铁", "轻轨", "公共交通", "坐车"],
        "打车": ["打车", "出租车", "滴滴", "快车", "专车", "优步"],
        "加油": ["加油", "汽油", "柴油", "充电桩"],
        "停车": ["停车", "停车费"],
        "高铁火车": ["高铁", "火车", "动车", "火车票", "12306"],
        "飞机": ["飞机", "机票", "航班", "航空"],
        "共享单车": ["共享单车", "骑车", "摩拜", "哈啰", "青桔"],
    },
    "购物": {
        "日用品": ["日用品", "纸巾", "洗衣液", "牙膏", "洗发水", "沐浴露"],
        "衣物鞋帽": ["衣服", "裤子", "鞋", "帽子", "外套", "T恤", "袜子", "内衣"],
        "数码电子": ["手机", "电脑", "耳机", "充电器", "数据线", "键盘", "鼠标", "平板"],
        "家居家电": ["家电", "冰箱", "洗衣机", "空调", "电视", "家具", "沙发", "床"],
        "化妆品": ["化妆品", "口红", "粉底", "护肤品", "面膜", "防晒"],
    },
    "住房": {
        "房租": ["房租", "租金", "租房"],
        "水费": ["水费", "水"],
        "电费": ["电费", "电"],
        "燃气费": ["燃气", "天然气", "煤气"],
        "物业费": ["物业", "物业费", "管理费"],
        "装修": ["装修", "翻新", "维修"],
    },
    "娱乐": {
        "电影演出": ["电影", "演出", "演唱会", "话剧", "音乐会", "票"],
        "游戏": ["游戏", "充值", "皮肤", "Steam", "点券"],
        "运动健身": ["健身", "瑜伽", "游泳", "跑步", "球", "运动", "健身房"],
        "旅行": ["旅行", "旅游", "景点", "门票", "酒店", "住宿", "民宿"],
        "书籍学习": ["书", "书籍", "教材", "课程", "培训", "学费"],
    },
    "医疗": {
        "看病": ["看病", "挂号", "门诊", "医院", "急诊"],
        "药品": ["药", "药品", "处方", "药店"],
        "体检": ["体检", "检查"],
        "保险": ["保险", "社保", "医保"],
    },
    "教育": {
        "学费": ["学费", "培训费", "课程费"],
        "教材": ["教材", "课本", "参考书"],
        "考试": ["考试", "报名费", "考证"],
    },
    "通讯": {
        "话费": ["话费", "流量", "电话费", "宽带"],
        "会员": ["会员", "VIP", "订阅"],
    },
    "服饰": {
        "衣物": ["衣服", "裤子", "外套", "裙子"],
        "鞋帽": ["鞋", "帽子", "袜子"],
        "配饰": ["饰品", "手表", "眼镜", "包"],
    },
    "社交": {
        "红包": ["红包", "转账"],
        "份子钱": ["份子钱", "随礼", "喜酒"],
    },
    "礼物": {
        "礼物": ["礼物", "礼品", "送礼"],
    },
    "其他": {
        "其他支出": ["其他", "杂项", "零花", "支出"],
    },
}

# Income keywords (positive amount)
INCOME_KEYWORDS: Dict[str, List[str]] = {
    "工资": ["工资", "薪水", "薪资", "月薪", "发工资"],
    "奖金": ["奖金", "年终奖", "绩效", "提成", "分红"],
    "兼职": ["兼职", "副业", "外快"],
    "投资收益": ["利息", "股息", "分红", "理财收益", "基金收益"],
    "退款": ["退款", "返现", "退货"],
    "红包收入": ["收红包", "收到红包"],
    "转账收入": ["收转账", "收到转账", "到账"],
    "报销": ["报销"],
}

# Flat keyword → (category, subcategory) mapping (built at import time)
# Sorted by keyword length descending so longer keywords match first.
_KEYWORD_MAP: Dict[str, Tuple[str, str]] = {}
for _cat, _subs in CATEGORY_KEYWORDS.items():
    for _sub, _kws in _subs.items():
        for _kw in _kws:
            _KEYWORD_MAP[_kw.lower()] = (_cat, _sub)
_KEYWORD_SORTED = sorted(_KEYWORD_MAP.items(), key=lambda x: len(x[0]), reverse=True)

# Flat income keyword → income category
_INCOME_MAP: Dict[str, str] = {}
for _incat, _kws in INCOME_KEYWORDS.items():
    for _kw in _kws:
        _INCOME_MAP[_kw.lower()] = _incat
_INCOME_SORTED = sorted(_INCOME_MAP.items(), key=lambda x: len(x[0]), reverse=True)


def _parse_date(text: str) -> Tuple[str, str]:
    """Extract a date from text, return (date_str, remaining_text).

    Supports: 今天/昨天/前天/大前天, 上个月, YYYY-MM-DD, MM-DD, X月X日.
    """
    today = datetime.now()
    date = today
    remaining = text

    # Relative days
    relative_map = {"大前天": -3, "前天": -2, "昨天": -1, "今天": 0, "明天": 1, "后天": 2}
    for word, delta in relative_map.items():
        if word in remaining:
            date = today + timedelta(days=delta)
            remaining = remaining.replace(word, "", 1)
            return date.strftime("%Y-%m-%d"), remaining.strip()

    # 上个月
    if "上个月" in remaining:
        first_of_this_month = today.replace(day=1)
        last_month = first_of_this_month - timedelta(days=1)
        remaining = remaining.replace("上个月", "", 1)
        return last_month.strftime("%Y-%m-%d"), remaining.strip()

    # YYYY-MM-DD
    m = re.search(r"(\d{4})[-/](\d{1,2})[-/](\d{1,2})", remaining)
    if m:
        try:
            date = datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)))
            remaining = remaining[:m.start()] + remaining[m.end():]
            return date.strftime("%Y-%m-%d"), remaining.strip()
        except ValueError:
            pass

    # MM-DD
    m = re.search(r"(\d{1,2})[-/](\d{1,2})(?!\d)", remaining)
    if m:
        try:
            date = datetime(today.year, int(m.group(1)), int(m.group(2)))
            remaining = remaining[:m.start()] + remaining[m.end():]
            return date.strftime("%Y-%m-%d"), remaining.strip()
        except ValueError:
            pass

    # X月X日 / X月X号
    m = re.search(r"(\d{1,2})月(\d{1,2})[日号]?", remaining)
    if m:
        try:
            date = datetime(today.year, int(m.group(1)), int(m.group(2)))
            remaining = remaining[:m.start()] + remaining[m.end():]
            return date.strftime("%Y-%m-%d"), remaining.strip()
        except ValueError:
            pass

    # Default: today
    return today.strftime("%Y-%m-%d"), remaining.strip()


def _parse_amount(text: str) -> Tuple[Optional[float], str, bool]:
    """Extract amount from text. Returns (amount, remaining_text, is_expense).

    Patterns: 35, 35.5, ¥35, $10, 35块, 35元, 35元钱.
    Negative amounts indicate expense by default; income keywords flip the sign.
    """
    remaining = text
    is_expense = True

    # Match amount patterns - prefer amount at end or after space
    # First try: match amount at end of string (most reliable)
    m = re.search(r"[¥￥$]?\s*(\d+(?:\.\d{1,2})?)\s*(?:块|元|块钱|元钱|刀)?\s*$", remaining)
    if not m:
        # Fallback: match amount after whitespace (not within words like ESP32)
        m = re.search(r"(?<=\s)[¥￥$]?\s*(\d+(?:\.\d{1,2})?)\s*(?:块|元|块钱|元钱|刀)?", remaining)
    if m:
        amount = float(m.group(1))
        before = remaining[:m.start()].rstrip()
        after = remaining[m.end():].lstrip()
        remaining = f"{before} {after}".strip() if before and after else before + after
        return amount, remaining, is_expense

    return None, remaining.strip(), is_expense


def _detect_direction(text: str) -> Tuple[bool, str]:
    """Detect if the transaction is income or expense.

    Returns (is_expense, matched_category).
    """
    lowered = text.lower()

    # Check income keywords first
    for keyword, incat in _INCOME_SORTED:
        if keyword in lowered:
            return False, incat

    # Check expense subcategory keywords
    for keyword, (cat, sub) in _KEYWORD_SORTED:
        if keyword in lowered:
            return True, cat

    # Fallback: check top-level category names
    for cat in CATEGORY_KEYWORDS:
        if cat in lowered:
            return True, cat

    return True, "其他"


def _match_category(text: str) -> Tuple[str, str]:
    """Match text against category keywords. Returns (category, subcategory)."""
    lowered = text.lower()

    # Check expense subcategory keywords first (more specific)
    for keyword, (cat, sub) in _KEYWORD_SORTED:
        if keyword in lowered:
            return cat, sub

    # Fallback: check top-level category names directly
    for cat in CATEGORY_KEYWORDS:
        if cat in lowered:
            return cat, ""

    return "其他", "其他支出"


def parse_input(text: str, txn_type: Optional[str] = None) -> Transaction:
    """Parse a natural language input into a Transaction.

    Args:
        text: Natural language input.
        txn_type: Explicit type override ("expense" or "income"). When provided,
                  bypasses keyword-based direction detection and uses this type
                  directly to determine the amount sign.

    Examples:
        "午饭35" → expense, 餐饮/午餐, 35
        "收到工资8000" → income, 工资, 8000
        "昨天打车25" → expense, 交通/打车, 25
    """
    text = text.strip()
    if not text:
        return Transaction(raw_input=text, date=datetime.now().strftime("%Y-%m-%d"))

    # Parse date
    date, remaining = _parse_date(text)

    # Detect direction (income/expense)
    is_expense, direction_cat = _detect_direction(remaining)

    # Override direction if explicit txn_type provided (from frontend)
    if txn_type in ("income", "expense"):
        is_expense = txn_type == "expense"

    # Parse amount
    amount, remaining, _ = _parse_amount(remaining)

    # Match category from the original text (before amount removal) for better accuracy
    category, subcategory = _match_category(text)

    # If income keyword matched, override category
    if not is_expense:
        category = direction_cat
        subcategory = ""

    # If txn_type is provided but no income keyword matched, use the matched
    # category only if it is an income category; otherwise keep it as-is.
    # The caller (api.py) may further override category via formData.

    # Build description from remaining text, removing matched category keywords
    description = remaining.strip()
    # Remove category and subcategory keywords from description
    for keyword in [category, subcategory]:
        if keyword and keyword in description:
            description = description.replace(keyword, "", 1).strip()

    # Determine final amount sign
    if amount is None:
        amount = 0.0
    if is_expense and amount > 0:
        amount = -amount
    elif not is_expense and amount < 0:
        amount = abs(amount)

    return Transaction(
        date=date,
        amount=amount,
        currency="CNY",
        category=category,
        subcategory=subcategory,
        description=description,
        raw_input=text,
    )


def parse_query_params(text: str) -> Dict[str, Any]:
    """Parse query text into filter parameters.

    Supports:
        "餐饮" → category filter
        "上个月" → month filter
        "上个月 餐饮" → both
    """
    params: Dict[str, Any] = {}
    remaining = text.strip()

    # Extract month
    today = datetime.now()
    if "上个月" in remaining:
        first = today.replace(day=1)
        last_month = first - timedelta(days=1)
        params["month"] = last_month.strftime("%Y-%m")
        remaining = remaining.replace("上个月", "")
    elif "本月" in remaining or "这个月" in remaining:
        params["month"] = today.strftime("%Y-%m")
        remaining = remaining.replace("本月", "").replace("这个月", "")

    # Extract YYYY-MM
    m = re.search(r"(\d{4})[-/](\d{1,2})", remaining)
    if m:
        params["month"] = f"{m.group(1)}-{int(m.group(2)):02d}"
        remaining = remaining[:m.start()] + remaining[m.end():]

    # Extract category keyword
    remaining = remaining.strip()
    if remaining:
        for keyword, (cat, sub) in _KEYWORD_SORTED:
            if keyword in remaining:
                params["category"] = cat
                break
        # Also check top-level category names directly
        for cat in CATEGORY_KEYWORDS:
            if cat in remaining:
                params["category"] = cat
                break

    # Keyword search fallback
    if remaining and "category" not in params:
        params["keyword"] = remaining.strip()

    return params
