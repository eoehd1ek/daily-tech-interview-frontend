# 프로젝트 목적

혼자 기술 면접을 준비하는 사용자를 위한 1일 1 기술면접 학습 플랫폼이다.

사용자는 기술 질문에 주관식으로 답변하고,
LLM이 사전에 정의된 평가 기준을 바탕으로 답변을 분석한다.

평가 결과로 다음 정보를 사용자에게 제공한다.

- 잘 설명한 부분
- 부족하거나 잘못 설명한 부분
- 개선할 부분
- 평가 점수

현재 IT 경진대회 제출을 위한 MVP를 개발하고 있다.
기능 범위 확대보다 핵심 사용자 흐름의 완성도와 안정성을 우선한다.

# Core User Flow

핵심 사용자 흐름은 다음과 같다.

질문 조회
→ 답변 작성
→ 답변 제출
→ LLM 평가
→ 점수 및 피드백 표시

이 흐름의 구현과 안정화를 다른 부가 기능보다 우선한다.

핵심 흐름이 완성되기 전에는 다음 기능을 임의로 추가하지 않는다.

- 복잡한 인증/인가
- 불필요한 캐싱
- 새로운 상태관리 라이브러리
- 디자인 시스템 구축
- RAG / Embedding / Vector Store
- 불필요한 성능 최적화

# MVP Scope

## 사용자

- 기술 질문 목록 조회
- 기술 질문 상세 조회
- 주관식 답변 제출
- LLM 기반 답변 평가
- 평가 결과 조회
- 로그인 사용자의 학습 기록 조회

## 관리자

- 기술 질문 관리
- 평가 기준 관리
- 사용자 평가 기록 조회

인증/인가는 핵심 기능 구현 이후 Spring Security를 사용하여 구현한다.

# Architecture

프론트엔드와 백엔드는 별도의 repository로 개발한다.

## Frontend

- React
- TypeScript
- Vite
- MUI
- React Router
- axios

# 개발 원칙

- 경진대회 MVP이므로 확장성보다 구현 완성도를 우선한다.
- 한 번에 하나의 기능만 구현한다.
- 기존 프로젝트 구조와 코딩 스타일을 최대한 유지한다.
- 성능보다 코드 가독성과 유지보수성을 우선한다.
- 과도한 추상화를 만들지 않는다.
- 현재 요구사항에 필요하지 않은 기능을 미리 구현하지 않는다.
- 요청하지 않은 대규모 리팩터링을 하지 않는다.

핵심 사용자 흐름이 완성되기 전에는 다음 기능을 임의로 추가하지 않는다.

- RAG
- Embedding
- Vector Store
- Redis
- 복잡한 캐싱
- 새로운 상태 관리 라이브러리
- 별도의 디자인 시스템
- Microservice 구조
- 불필요한 성능 최적화

# 의존성 규칙

- 새로운 라이브러리와 dependency는 반드시 필요한 경우에만 추가한다.
- 새로운 dependency를 추가하기 전에 기존 기술 스택으로 해결 가능한지 확인한다.
- dependency가 필요한 경우 추가 이유를 먼저 설명한다.
- 기존 dependency의 버전을 임의로 변경하지 않는다.
- 사용하지 않는 dependency를 추가하지 않는다.

# Frontend Rules

- TypeScript를 사용한다.
- UI는 MUI를 사용한다.
- Bootstrap, Tailwind CSS 등 다른 UI framework를 추가하지 않는다.
- React Router를 routing에 사용한다.
- HTTP 요청에는 axios를 사용한다.
- 가능한 한 MUI 컴포넌트를 활용하고 직접 작성하는 CSS를 최소화한다.
- API request/response 구조를 TypeScript 타입으로 정의한다.
- 페이지 컴포넌트가 지나치게 커지는 경우에만 하위 컴포넌트로 분리한다.
- 불필요한 global state를 만들지 않는다.
- mock data를 사용하는 경우 실제 API 데이터와 명확하게 구분한다.

# Frontend Testing

## 도구와 위치

- 테스트 도구는 기존 Vitest, React Testing Library, user-event, jest-dom, jsdom, MSW를 사용한다. 새로운 테스트 도구를 임의로 추가하지 않는다.
- Vitest는 테스트 실행/assertion/spy, Testing Library는 화면 요소 조회, user-event는 사용자 조작, jest-dom은 DOM assertion을 담당한다.
- jsdom은 Node의 DOM 실행 환경이며, MSW는 테스트용 HTTP 요청 가로채기와 응답 대체를 담당한다.
- 테스트 파일은 대상 코드 가까이에 `*.test.ts` 또는 `*.test.tsx`로 작성한다.
- 공통 설정은 `vitest.config.ts`, HTTP mock 서버와 정리는 `src/test/server.ts`, `src/test/setup.ts`를 사용한다.
- `npm run test:run`은 전체 테스트를 한 번 실행한다. 특정 파일은 `npm run test:run -- src/pages/QuestionAnswerPage.test.tsx`처럼 실행한다.

## 검증 원칙

- 컴포넌트 내부 상태나 MUI CSS 클래스보다 사용자에게 보이는 role, label, 텍스트, 입력값, 버튼 활성화 상태를 기준으로 검증한다.
- 정상 사용자 조작은 user-event를 우선 사용한다. 즉시 중복 제출 같은 경계 조건은 필요한 경우에만 fireEvent로 재현한다.
- 핵심 검증은 API 계약에 맞는 요청/표시, 입력 검증, 분석 대기, 중복 제출 방지, 오류 후 답변 보존, 성공 이동, 취소/오래된 응답 무시다.
- 비동기 화면은 `findByRole`, `waitFor` 등으로 기다린다. 임의의 sleep이나 실제 180초 대기로 테스트를 느리게 만들지 않는다.
- 실패하거나 변경되는 핵심 동작에는 회귀 테스트를 추가한다. 테스트만을 위한 대규모 리팩터링, 과도한 snapshot, 불필요한 coverage 목표는 도입하지 않는다.

## HTTP Mock과 격리

- 기본 자동 테스트는 실제 백엔드/LLM을 호출하지 않는다. API 응답은 백엔드 `docs/API.md` 계약에 맞춰 MSW handler로 명시한다.
- 테스트 API Origin은 `http://api.test`다. 실제 `.env`, 실행 중인 서버, API 키에 의존하지 않는다.
- 미등록 HTTP 요청은 공통 setup에서 차단하고 테스트를 실패시킨다. 경고/bypass로 완화하거나 앱이 오류를 잡았다는 이유로 통과시키지 않는다.
- mock은 테스트에서만 사용한다. 운영 앱에 MSW 초기화, 가짜 성공 응답 또는 오류 시 mock 데이터 대체를 넣지 않는다.
- 각 테스트 뒤 화면, MSW handler, spy, 환경변수, 타이머를 정리하고 테스트 실행 순서에 의존하지 않는다.
- 평가 대기시간은 HTTP timeout이 아닌 화면 타이머다. MSW 응답을 보류하고 테스트 타이머로 대기 종료, 답변 보존, 잠금 해제, 수동 재제출 및 늦은 응답 무시를 검증한다. 시간 만료/화면 이탈 시 평가 POST를 강제로 취소하거나 자동 재전송하지 않는다. 기존 GET 취소 동작은 유지하고 GET timeout은 추가하지 않는다.

## 검증 범위

- mock 테스트 성공은 실제 API/CORS/LLM 연동 성공을 의미하지 않는다. 실제 연동 검증은 별도 요청 범위에서 수행하고 결과를 구분해 기록한다.
- jsdom은 실제 레이아웃을 계산하지 않는다. PC/모바일 배치, 브라우저 CORS, Cloudflare Pages 직접 URL 접근/새로고침은 실제 브라우저 또는 배포 환경에서 별도로 확인한다.
- 구현 변경 후 `npm run test:run`, `npm run lint`, `npm run build`를 실행한다. 실패/경고나 실행하지 못한 검증은 명확하게 보고한다.

# API Contract

- 프론트엔드와 백엔드 사이의 API 형식은 백엔드 레포지토리의 docs/API.md를 기준으로 한다.
- API 구현을 변경하면서 request 또는 response 형식이 변경되는 경우 docs/API.md도 함께 수정한다.
- AI는 기존 API contract를 임의로 변경하지 않는다.

# AI Coding Rules

작업을 시작하기 전에:

1. 관련 파일과 기존 구현을 먼저 확인한다.
2. 구현하려는 기능의 현재 구조를 파악한다.
3. 변경하거나 생성할 파일을 확인한다.
4. 기존 구조와 충돌하지 않는지 확인한다.

구현할 때:

1. 요청받은 기능의 범위만 수정한다.
2. 관련 없는 파일을 수정하지 않는다.
3. 기존 동작을 불필요하게 변경하지 않는다.
4. 과도한 abstraction이나 미래 확장용 코드를 추가하지 않는다.
5. 확실하지 않은 요구사항을 임의로 확대 해석하지 않는다.

작업 후:

1. 빌드 오류를 확인한다.
2. 구현 변경 후 `npm run test:run`, `npm run lint`, `npm run build`를 실행한다. 실행하지 못하면 이유를 기록한다.
3. 변경된 파일과 구현 내용을 요약한다.
4. 불필요하게 변경된 코드가 없는지 확인한다.
5. 남아 있는 문제나 검증하지 못한 부분이 있다면 명확하게 설명한다.
6. 빌드 또는 테스트 실패를 숨기거나 임의로 무시하지 않는다.

# Documentation

- AGENTS.md: AI coding agent가 따라야 하는 프로젝트 규칙
- TODO.md: 구현해야 할 작업과 우선순위
- docs/API.md: 백엔드 레포지토리의 API contract

불필요한 문서 수정을 하지 않는다.
