from __future__ import annotations

import re


_INJECTION_PATTERNS = (
    re.compile(r"(이전|앞선|위의).{0,16}(지시|명령|규칙).{0,16}(무시|잊어|따르지)", re.IGNORECASE),
    re.compile(r"(시스템|개발자).{0,12}(프롬프트|메시지|지침).{0,16}(출력|공개|보여|알려)", re.IGNORECASE),
    re.compile(r"\b(ignore|disregard|forget)\b.{0,24}\b(previous|above|system|developer)\b.{0,24}\b(instruction|prompt|message)s?\b", re.IGNORECASE),
    re.compile(r"\b(jailbreak|developer mode|do anything now)\b", re.IGNORECASE),
    re.compile(r"\b(role|역할)\s*[:=]\s*(system|developer|시스템|개발자)\b", re.IGNORECASE),
)


def prompt_injection_response(message: str) -> str | None:
    normalized = " ".join(message.split())
    if any(pattern.search(normalized) for pattern in _INJECTION_PATTERNS):
        return "보안상 시스템 지침을 변경하거나 공개하는 요청은 처리할 수 없습니다. 소비 데이터에 관한 질문을 해주세요."
    return None
