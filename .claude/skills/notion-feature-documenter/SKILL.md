---
name: notion-feature-documenter
description: Use this skill in Claude or Codex whenever the user asks to document a project, feature, implementation, code behavior, debugging flow, or lesson into a provided Notion page link. Always use it when the user gives a Notion URL and asks to 정리, 문서화, 저장, 노션에 올려줘, 기능별로 정리, or explains that documentation should go into that page. The skill documents by feature/function area inside the existing Notion page only; it must not create separate new Notion pages unless the user explicitly changes that rule in the current turn.
---

# Notion Feature Documenter

Use this skill to turn project work into clear, feature-by-feature Notion
documentation. It is written for both Claude and Codex, so use neutral words
like "agent" instead of assuming a specific harness.

The user's standing preference is:

- When they provide a Notion page link, document in that existing page.
- Do not create separate pages by default.
- Split documentation by functional area, not by chat chronology.
- Explain each function slowly and plainly, so the user can understand it later.
- For each feature, explain how this project implements it and why that implementation was chosen.

## Core rule

If the user gives a Notion URL, treat that URL as the destination page. Add or update content inside that page only.

Do not create child pages, sibling pages, databases, or separate documentation pages unless the user explicitly asks for that in the current turn.

If a connector or tool cannot edit the provided page directly, say so clearly and prepare paste-ready Notion content instead of creating a different page.

## Claude and Codex compatibility

Follow the same behavior in both Claude and Codex:

- Use the available Notion connector/tool when one exists.
- If no Notion editing tool is available, prepare paste-ready Markdown for the
  provided page instead of creating a new page elsewhere.
- Do not assume one harness can see pages or files that the other cannot.
- Keep final summaries tool-neutral: say what page/section was updated, or say
  that paste-ready content was prepared.
- Do not mention hidden reasoning, model internals, or harness-specific details
  in the Notion document.

## When documenting

Group content by feature or responsibility.

Good section shapes:

- Network capture
- Data extraction after capture
- Follower collection
- Following collection
- Compare logic
- Evidence classification
- Debug report
- Safe snapshot storage
- Validation and regression checks

Use project-specific names only when they help the user map the explanation back to the real code. Keep the structure reusable and understandable.

## Writing style

Write in Korean unless the user asks otherwise.

Start each feature section with a simple explanation:

- "쉽게 말하면, 이 기능은 ..."
- "왜 필요한가?"
- "어떤 입력을 받나?"
- "어떤 순서로 동작하나?"
- "이 프로젝트에서는 어떻게 구현했나?"
- "왜 이렇게 구현했나?"
- "다른 방식 대신 이 방식을 고른 이유는?"
- "결과는 어디에 쓰이나?"
- "헷갈리기 쉬운 부분"
- "문제가 생기면 어디를 보면 되나?"

Prefer plain language over implementation jargon. If a technical term is needed, define it before using it heavily.

## Implementation explanation

For each feature, include a project-specific implementation explanation, not only a conceptual summary. The user wants to understand both the idea and the actual design choice.

Explain:

- where the feature lives in this project
- which files, functions, modules, settings, commands, or Notion sections are involved
- what happens first, next, and last
- why this implementation was chosen
- what tradeoff this choice accepts
- what alternatives were considered, avoided, or rejected
- how this feature connects to the next feature
- how to verify the implementation works

Keep this explanation easy. Prefer phrases like:

- "이 프로젝트에서는 이 기능을 ... 파일에서 처리합니다."
- "이렇게 구현한 이유는 ... 때문입니다."
- "다른 방법도 가능하지만, 여기서는 ... 때문에 쓰지 않았습니다."
- "확인하려면 ...를 보면 됩니다."

If the implementation detail is uncertain, mark it as uncertain and inspect the project before writing it as fact.

## Notion structure

Use this structure inside the existing page:

```markdown
# <project or topic name>

## 전체 개요

## 기능 1: <feature name>

### 쉽게 말하면
### 왜 필요한가
### 입력과 출력
### 동작 흐름
### 이 프로젝트에서는 어떻게 구현했나
### 왜 이렇게 구현했나
### 선택하지 않은 방식과 이유
### 관련 파일과 함수
### 중요한 규칙
### 확인 방법
### 자주 헷갈리는 부분

## 기능 2: <feature name>
...

## 전체 흐름 요약

## 다음에 보강할 문서
```

For long topics, use a table of contents block or a short index at the top, but keep everything in the same Notion page unless the user explicitly asks for separate pages.

## Feature explanation checklist

For each feature, try to answer:

- What problem does this feature solve?
- What does it read or receive?
- What does it produce?
- How is this feature implemented in this project?
- Which files, functions, modules, settings, or commands are involved?
- Why was this implementation chosen?
- What alternatives were avoided or rejected, and why?
- Which other feature uses its result?
- What can go wrong?
- How can the user verify it worked?
- What should not be confused with this feature?

## Evidence and debugging docs

When documenting reliability, comparison, capture, or debugging behavior, separate:

- raw observation: what the system saw first
- candidate: plausible but not final
- confirmed: safe to use in the final result
- diagnostic: useful for debugging only
- unknown: missing or ambiguous

Explain why a result is trusted, partial, preview-only, or needs rerun.

## Safety and privacy

Do not paste secrets, tokens, cookies, auth headers, private raw payloads, customer data, or account-sensitive dumps into Notion.

If examples are needed, use synthetic examples like `user001`, `item001`, or `candidate001` unless the user explicitly provides public-safe values.

## Before editing Notion

1. Identify the provided Notion URL.
2. Confirm whether the request is to update that exact page.
3. Read enough project/code context to document accurately.
4. Draft by feature area.
5. Write into the existing Notion page only when a Notion editing tool is
   available.
6. Summarize what was added and where.

If the destination page already has related sections, update or append under the matching section instead of duplicating a new section.
