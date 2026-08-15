from __future__ import annotations

import json
from typing import TYPE_CHECKING, Callable, List

from .sources import SOURCE_TEMPLATES

if TYPE_CHECKING:
    from groq.types.chat import ChatCompletionMessageParam, ChatCompletionToolParam

TOOL_CALL_TIMEOUT = 40


def _tool_schema(name, description, properties, required) -> ChatCompletionToolParam:
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {"type": "object", "properties": properties, "required": required},
        },
    }


WEB_SEARCH_TOOL = _tool_schema(
    "web_search",
    "Search the public web for candidate profiles relevant to the job description. "
    "Use the source's site: operator (e.g. site:github.com) to target a specific source.",
    {
        "query": {
            "type": "string",
            "description": "Full search query including the site: operator. Combine role, seniority and key skills.",
        },
        "source": {
            "type": "string",
            "enum": list(SOURCE_TEMPLATES.keys()),
            "description": "The source category this query targets.",
        },
    },
    ["query", "source"],
)

SCRAPE_PAGE_TOOL = _tool_schema(
    "scrape_page",
    "Fetch a public candidate profile URL and return its readable text so you can assess fit against the job.",
    {"url": {"type": "string", "description": "The public profile URL to scrape."}},
    ["url"],
)

TOOLS: List[ChatCompletionToolParam] = [WEB_SEARCH_TOOL, SCRAPE_PAGE_TOOL]

TOOL_LOOP_SYSTEM = (
    "You are a candidate-sourcing agent for recruiters. Given a job description, find publicly available "
    "candidate profiles on the web and return a RANKED list of the best matches.\n\n"
    "Rules:\n"
    "- Search ONLY public, login-free sources, targeted via the site: operator:\n"
    "  GitHub (site:github.com), LinkedIn X-ray (site:linkedin.com/in, public snippets only - never log in), "
    "Indeed public resumes (site:indeed.com/resumes), Wellfound (site:wellfound.com/profile), and by role: "
    "Stack Overflow users, Kaggle, Behance/Dribbble.\n"
    "- Use web_search to gather results. Use scrape_page on promising profile URLs to confirm fit.\n"
    "- Make queries specific: role + seniority + key skills. Cover multiple sources.\n"
    "- Do NOT fabricate candidates or URLs. Only include candidates actually found in search results or scraped pages.\n"
    "- Do not scrape anything behind a login, paywall or auth wall.\n\n"
    "When you have enough evidence, respond with ONLY a JSON array (no markdown) of ranked candidates, best first:\n"
    '[{"name":"...","role":"...","headline":"...","source":"github","url":"...","location":"...",'
    '"skills":["..."],"experience":"...","relevance_score":0.9,"summary":"..."}]'
)


def _scan(text: str, open_char: str, close_char: str):
    start = text.find(open_char)
    while start != -1:
        depth = 0
        for i in range(start, len(text)):
            ch = text[i]
            if ch == open_char:
                depth += 1
            elif ch == close_char:
                depth -= 1
                if depth == 0:
                    return text[start : i + 1]
        start = text.find(open_char, start + 1)
    return None


def extract_json_array(text: str):
    blob = _scan(text, "[", "]")
    if blob is not None:
        try:
            return json.loads(blob)
        except json.JSONDecodeError:
            pass
    return None


def extract_json_object(text: str):
    blob = _scan(text, "{", "}")
    if blob is not None:
        try:
            return json.loads(blob)
        except json.JSONDecodeError:
            pass
    try:
        return json.loads(text.strip())
    except json.JSONDecodeError:
        return None


def parse_candidates(text: str) -> list:
    array = extract_json_array(text)
    if array is not None:
        if isinstance(array, dict):
            array = array.get("candidates") or []
        return array if isinstance(array, list) else []
    obj = extract_json_object(text)
    if isinstance(obj, dict) and obj.get("candidates"):
        return obj["candidates"]
    return []


class GroqProvider:
    def __init__(self, api_key: str, model: str):
        from groq import Groq

        self.client = Groq(api_key=api_key)
        self.model = model

    def complete(self, messages: List[ChatCompletionMessageParam], json_mode: bool = False, timeout: float = 30.0) -> str:
        if json_mode:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                response_format={"type": "json_object"},
                timeout=timeout,
            )
        else:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                timeout=timeout,
            )
        return response.choices[0].message.content or ""

    def tool_loop(self, user_prompt: str, execute_tool: Callable[[str, dict], object], max_turns: int, timeout: float = 60.0) -> str:
        messages: List[ChatCompletionMessageParam] = [
            {"role": "system", "content": TOOL_LOOP_SYSTEM},
            {"role": "user", "content": user_prompt},
        ]
        for _ in range(max_turns):
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                tools=TOOLS,
                tool_choice="auto",
                timeout=timeout,
            )
            message = response.choices[0].message
            tool_calls = getattr(message, "tool_calls", None)
            if tool_calls:
                messages.append(
                    {
                        "role": "assistant",
                        "content": message.content or "",
                        "tool_calls": [
                            {
                                "id": tc.id,
                                "type": "function",
                                "function": {"name": tc.function.name, "arguments": tc.function.arguments},
                            }
                            for tc in tool_calls
                        ],
                    }
                )
                for tc in tool_calls:
                    try:
                        args = json.loads(tc.function.arguments or "{}")
                    except json.JSONDecodeError:
                        args = {}
                    result = execute_tool(tc.function.name, args)
                    messages.append(
                        {
                            "role": "tool",
                            "tool_call_id": tc.id,
                            "content": json.dumps(result, default=str)[:6000],
                        }
                    )
                continue
            content = message.content or ""
            if content.strip():
                return content
        raise RuntimeError("LLM did not produce a final answer within the turn limit")


class GeminiProvider:
    def __init__(self, api_key: str, model: str = "gemini-2.0-flash"):
        try:
            from google import genai  # type: ignore[import-not-found]
        except ImportError as exc:
            raise RuntimeError("google-genai not installed; run: pip install -r requirements-optional.txt") from exc

        self.client = genai.Client(api_key=api_key)
        self.model = model

    def complete(self, messages, json_mode: bool = False, timeout: float = 30.0) -> str:
        contents = []
        for message in messages:
            role = "model" if message.get("role") == "assistant" else "user"
            contents.append({"role": role, "parts": [{"text": message.get("content") or ""}]})
        config = None
        if json_mode:
            config = {"response_mime_type": "application/json"}
        response = self.client.models.generate_content(
            model=self.model,
            contents=contents,
            config=config,
        )
        return response.text or ""
