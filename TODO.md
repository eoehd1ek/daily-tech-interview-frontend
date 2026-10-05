# 프론트엔드 MVP TODO

## 1. 목표와 범위

기준 문서는 프론트엔드 `AGENTS.md`와 백엔드 `../back/docs/API.md`다. API 경로, 필드, 오류 형식을 임의로 변경하지 않는다. 이 문서는 구현 계획이며 이번 작업에서는 React 코드나 설정을 변경하지 않는다.

목표 흐름: 메인 소개 및 질문 목록 → 질문 선택 → 질문 상세 및 답변 작성 → 제출 → **답변을 분석중입니다.** → 평가 결과.

각 번호는 한 번의 AI 작업 또는 하나의 작은 PR로 완료하는 단위다. 순서대로 하나씩 구현하며, 체크박스는 해당 완료 기준을 검증한 뒤 표시한다. 현재 백엔드의 네 API와 공통 오류 처리는 구현되어 있으며, 구현 여부와 프론트 연결 검증 여부는 구분한다.

이번 범위에서 제외: 인증/인가, 사용자 기록 목록, 관리자 기능, 새로운 상태 관리 라이브러리, React Query 등 추가 데이터 라이브러리, 별도 디자인 시스템, 복잡한 캐싱, 페이지네이션, 불필요한 추상화/최적화, 대규모 리팩터링.

### 현재 확정한 후속 범위 (2026-10-05)

- 이번 완료 목표는 로컬 연동이다. 이 TODO에 없는 새로운 기능은 추가하지 않는다. GET 대기시간 제한도 추가하지 않는다.
- 실제 LLM 호출, 공급자 호환성과 평가 품질 검증은 백엔드 책임이다. 프론트는 백엔드 계약이 정상 동작함을 가정하고 기존 MSW로 성공/실패/지연 응답을 테스트한다. 로컬 실제 HTTP/CORS 검증도 실제 LLM을 호출하지 않는 백엔드 테스트 환경 또는 백엔드가 준비한 저장 결과를 사용한다.
- 기술 질문과 평가 기준은 기능 구현 완료 후 하나씩 추가하며 평가 품질을 측정한다. 이번 작업에서는 시연 데이터를 추가하지 않는다.
- 배포 예정 주소는 프론트 `https://tech.eoehd1ek.com`(Cloudflare Pages), 백엔드 `https://techapi.eoehd1ek.com`(Cloudflare 프록시)이다. 주소는 확정하되 배포/프록시 검증은 로컬 연동 이후 별도 작업으로 남긴다.
- 평가 대기시간은 `VITE_EVALUATION_TIMEOUT_MS=180000`(180초)을 유지한다. 지정 시간이 지나면 서버 응답 지연 오류 안내, 답변 보존, 입력/제출 잠금 해제 및 수동 재시도를 제공한다. 시간 만료나 화면 이탈을 이유로 평가 POST를 강제로 끊지 않고, 자동 재전송하지 않는다.
- 대기 종료는 실제 HTTP 500 수신이나 서버 처리 실패/취소 확정이 아니다. 이전 요청이 계속 처리될 수 있고 수동 재제출은 별도 평가/기록을 만들 수 있다. 현재 SDK 기본 timeout/retry는 백엔드 책임이며 전체 180초 종료 보장이 없다.
- SSE 완료 추적은 향후 성능 개선 단계다. 지금은 SSE, polling, 상태 조회 API, 중복 제거, 범용 작업 관리 구조를 추가하지 않는다.

## 2. 초기 계획 당시 확인한 프로젝트

| 항목 | 현재 상태 및 유지할 설정 |
| --- | --- |
| 진입점 | `src/main.tsx`: `createRoot`, `StrictMode`, `App` 렌더링 |
| 화면 | `src/App.tsx`: Vite 소개 및 카운터 예제. 업무 페이지와 API 연동은 아직 없음 |
| 스타일 | `src/App.css`, `src/index.css`: 예제 전용 스타일. 고정 root 너비, 가운데 정렬, OS 다크 모드 규칙이 있어 MUI 화면 전환 시 충돌 확인 필요 |
| 빌드 | `vite.config.ts`: React 플러그인만 설정. 개발 API proxy 없음 |
| 환경변수 예시 | `.env.example`: `VITE_API_BASE_URL=http://localhost:8080` |
| TypeScript | `tsconfig.app.json`: Vite 타입, 미사용 변수 검사, `verbatimModuleSyntax` 설정. 타입 전용 import는 `import type` 사용 |
| 품질 도구 | ESLint 및 React Hooks 규칙, Vitest/jsdom/Testing Library/MSW 자동 테스트. `npm run test:run`으로 실행 |
| 패키지 관리 | `package-lock.json`이 있는 npm 프로젝트. 기존 dependency 버전 및 lockfile 유지 |

`package.json`에 선언된 dependency 범위는 다음과 같다. 정확한 설치 버전은 lockfile을 기준으로 하며 이번 TODO 때문에 업그레이드하지 않는다.

| 라이브러리 | 선언 버전 | 역할과 선택 이유 |
| --- | --- | --- |
| React / React DOM | `^19.2.8` | 데이터와 입력 상태가 바뀌면 화면을 다시 그리는 도구. DOM을 직접 수정하지 않고 상태에 맞는 UI를 선언한다 |
| TypeScript | `~6.0.2` | 백엔드 DTO처럼 요청/응답 구조를 타입으로 표현해 잘못된 필드 사용을 빌드 전에 찾는다 |
| Vite | `^8.3.0` | 개발 서버 및 배포용 정적 파일 빌드. 백엔드 서버나 API 구현 도구가 아니다 |
| MUI | `@mui/material ^9.4.0` | 입력창, 버튼, 목록, 오류 안내 등 기존 컴포넌트 활용. 별도 UI framework 불필요 |
| Emotion | `@emotion/react ^11.14.0`, `@emotion/styled ^11.14.1` | MUI의 스타일 기반. 이미 설치되어 있으므로 별도 CSS 도구를 추가하지 않는다 |
| React Router | `react-router ^8.4.0` | URL에 맞는 페이지 표시와 화면 이동. 기존 패키지를 사용하고 `react-router-dom`을 임의로 추가하지 않는다 |
| axios | `^1.20.0` | HTTP 요청, 응답, 오류 및 취소 처리. 새 HTTP/데이터 라이브러리 불필요 |

## 3. API와 화면 연결

| 사용자 기능 | HTTP API | 응답 및 화면 처리 |
| --- | --- | --- |
| 메인 질문 목록 | `GET /api/questions` | `200`, `{ id, title }[]`. 제목만 표시하고 `[]`은 빈 목록 안내 |
| 질문 상세 | `GET /api/questions/{questionId}` | `200`, `{ id, title, content }`. 질문 제목/본문 표시 |
| 답변 제출 | `POST /api/questions/{questionId}/evaluation-attempts` | 본문 `{ answer: string }`, `201` 응답의 평가 `id`로 결과 화면 이동 |
| 결과 표시/복원 | `GET /api/evaluation-attempts/{attemptId}` | `200`, 저장된 평가 결과. 새로고침/직접 접근도 이 GET으로 복원 |

성공 응답에 `data` 같은 wrapper는 없다. axios의 `response.data`는 HTTP 본문을 담는 클라이언트 속성이며 백엔드 JSON의 `data` 필드를 의미하지 않는다.

평가 결과 타입은 `id`, `questionId`, `questionTitle`, `answer`, `score`, `result`, `strengths`, `weaknesses`, `improvements`, `createdAt`을 모두 포함한다. ID/점수는 `number`, 판정은 `'PASS' | 'RETRY' | 'FAIL'`, 나머지는 `string`이다. 피드백 세 필드는 배열이 아닌 문자열이다. 공개 평가 기준이나 항목별 점수는 없으므로 이를 요청하거나 만들어 표시하지 않는다.

## 4. 구현 순서

### 0. 기존 lint 실행 장애 해결

목적: 이후 작은 PR의 품질 검증이 실제로 실행될 수 있도록 현재 확인된 도구 문제만 해결한다. 화면 기능 작업과 분리한 작은 설정 작업이다.

예상 파일: 기존 `eslint.config.js`만 필요한 범위에서 수정.

- [x] `npm run lint`가 `.kilo/worktrees/alder-rhinoceros`까지 검사하며 `No tsconfigRootDir was set, and multiple candidate TSConfigRootDirs are present`로 실패하는 현상을 확인한다.
- [x] 현재 레포 검사에서 관리용 worktree를 제외하고, 필요 시 설치된 typescript-eslint 방식에 맞게 설정 파일 위치 기준의 `tsconfigRootDir`를 명시한다. 규칙 비활성화나 worktree 파일 변경으로 우회하지 않는다.

완료 기준: 현재 레포의 `npm run lint`와 `npm run build`가 통과한다.

완료 결과: `eslint.config.js`의 `globalIgnores`에 `.kilo/worktrees/**`를 추가한 것만으로 lint와 빌드가 모두 통과했다. `tsconfigRootDir` 추가는 필요하지 않았다. 현재 앱 소스의 TypeScript/React Hooks/React Refresh 규칙이 유지되고 프론트 설정에서 관리용 worktree가 제외되는 것도 확인했다. worktree 내부 파일, React 코드, dependency는 변경하지 않았다.

### 1. API 통신 기반과 계약 타입

목적: 화면마다 URL과 DTO를 중복 작성하지 않도록 최소한의 통신 기반을 마련한다.

예상 파일: 신규 `src/api/client.ts`, `src/api/types.ts`. 필요한 경우에만 기존 `.env.example`의 안내를 보완한다.

- [x] 질문 목록/상세, 제출 요청, 평가 결과, `{ code: string, message: string }` 오류 타입을 계약 그대로 정의한다. POST/결과 GET에 같은 평가 결과 타입을 사용한다.
- [x] axios 인스턴스 하나에 `import.meta.env.VITE_API_BASE_URL`을 `baseURL`로 설정한다. `.env.example`의 값은 서버 주소이며 각 요청 경로에 `/api`를 포함한다. `/api/api`가 되지 않도록 주소 규칙을 통일한다.
- [x] 환경변수 누락/잘못된 주소는 명확히 알리고 임의의 운영 주소로 대체하지 않는다. 환경변수 변경 후 개발 서버를 재시작해야 함을 확인한다.
- [x] 질문 조회 요청은 취소용 `signal`을 받을 수 있게 한다. 공통 재시도 interceptor, 인증 토큰, `withCredentials`는 추가하지 않는다.
- [x] axios 오류는 `axios.isAxiosError`로 확인하고 HTTP 상태와 `code`로 구분한다. 네트워크 오류 등 응답 본문이 없거나 형식이 다른 경우에는 기본 사용자 안내를 사용한다. 반복되는 작은 오류 처리만 필요할 때 공유하고 범용 오류 framework는 만들지 않는다.
- [x] 실제 프론트 Origin과 백엔드 주소를 확인한다. 다른 Origin으로 직접 호출하는 현재 방식에는 백엔드 CORS 허용이 필요하며, 허용 설정은 백엔드 협의 사항으로 남긴다.

설정 이유: `VITE_` 환경변수는 브라우저 번들에 공개된다. 서버 주소만 두고 API 키, OpenRouter 키 등 비밀을 넣지 않는다. TypeScript 타입은 컴파일 시 도움일 뿐 실제 서버 JSON을 자동 검증하지는 않는다. 별도 스키마 라이브러리를 추가하지 않는다.

완료 기준: 계약의 네 API에 필요한 타입이 준비되고 `npm run build`, `npm run lint`를 통과한다. 개발 서버에서 통신 주소가 기대한 `/api/...`로 조합됨을 확인한다. 아직 화면 기능은 구현하지 않는다.

완료 결과: `src/api/types.ts`에 계약 타입을, `src/api/client.ts`에 `apiClient`와 `getApiError`를 추가했다. 서버 주소는 `/api` 없는 HTTP/HTTPS Origin으로 제한하고 누락, 경로, 인증 정보, query/fragment를 포함한 설정은 명확히 거부한다. `.env.example`에 주소 규칙, 재시작, 공개 환경변수 주의사항을 기록했다. 화면 연결, API별 요청 함수, 평가 timeout 수치는 후속 단계에서 구현한다.

검증 결과: lint와 빌드를 통과했다. 기존 Vite/axios 및 외부 임시 검증 스크립트로 12개 환경에서 네 API 주소 조합, 잘못된 설정, HTTP 상태/코드 오류, 비정상 본문, 네트워크/timeout 오류, GET `signal` 취소, 자동 재시도 없음을 확인했다. 오류/GET 검증은 axios adapter와 구성한 오류 객체를 사용했으며 실제 백엔드 연동 검증은 아니다. GET `signal`은 클라이언트에서 사용 가능하며 질문별 요청 함수의 인자 연결은 3~4단계에서 수행한다. 기존 React 화면은 수정하지 않았고 평가 POST도 보내지 않았다.

CORS 확인 범위: `.env`의 API 주소는 `http://localhost:8080`이며, 검증용 Vite 서버의 `http://127.0.0.1:<임시 포트>`와 다른 Origin이었다. 기존 Vite 설정은 개발 서버 Origin을 고정하지 않으므로 실제 개발 실행 시 출력 주소를 확인해야 한다. 확인 시점의 백엔드 `src/main`에는 공개 API Controller/CORS 설정이 없었다. 백엔드 CORS 허용과 배포 Origin 확정은 아직 미검증 협의 사항이며, 7단계의 실제 연동 검증에 남긴다.

### 2. 세 페이지의 라우팅과 MUI 기본 틀

목적: URL과 화면의 대응을 먼저 확정해 이후 기능을 페이지 단위로 추가한다.

변경 파일: 기존 `src/main.tsx`, `src/App.tsx`, `index.html`; 신규 `src/pages/HomePage.tsx`, `QuestionAnswerPage.tsx`, `EvaluationResultPage.tsx`. 사용자 요청에 따라 Vite 예제 CSS와 기본 에셋도 제거한다.

- [x] 기존 `react-router` 패키지의 `BrowserRouter`, `Routes`, `Route`, `Link`, `useParams`를 사용한다. 설치 버전의 export와 타입을 확인하며 다른 버전의 예제를 무작정 복사하지 않는다. `useNavigate`는 제출 성공 이동이 필요한 6단계에서 추가한다.
- [x] `/`는 메인, `/questions/:questionId`는 질문/답변, `/results/:attemptId`는 결과 페이지로 연결한다. 아직 각 페이지는 제목 수준의 틀만 만든다.
- [x] 알 수 없는 화면 경로에는 페이지 없음 안내와 메인 이동 링크를 제공한다. 프론트 URL과 `/api/...` API URL을 혼동하지 않는다.
- [x] MUI `CssBaseline`, `Container`, `Box` 또는 `Stack`을 활용해 기본 여백과 읽기 가능한 너비를 만든다. 별도 테마/디자인 시스템은 구축하지 않는다.
- [x] 예제 화면을 대체하고 관련 CSS/import 및 기본 에셋을 제거한다. `App.css`, `index.css`, `src/assets`의 React/Vite 로고와 hero 이미지, `public`의 icons/favicon을 삭제하고 `index.html`의 favicon 참조도 제거한다. 무관한 파일은 정리하지 않는다.
- [x] `StrictMode`를 유지한다. API 호출을 컴포넌트 본문에서 수행하지 않는다.

선택 이유: 라우터는 백엔드 Controller와 달리 브라우저 URL에 맞는 컴포넌트를 고른다. `Link`/`useNavigate`는 전체 페이지를 재로딩하지 않고 화면을 바꾼다. URL의 ID는 페이지를 새로 열어도 API로 데이터를 조회할 수 있게 한다.

완료 기준: 세 경로와 알 수 없는 경로가 표시되고 메인으로 이동할 수 있다. 화면 너비가 모바일에서 넘치지 않으며 빌드/lint를 통과한다.

완료 결과: `main.tsx`에서 `BrowserRouter`를 연결하고 `App.tsx`에 공통 header/main 및 세 경로와 `*` 안내를 구성했다. 페이지는 각각 `h1` 하나와 준비 안내만 표시하며 질문/평가 ID는 URL에서 읽는다. ID 검증, API 조회, 답변 입력, 제출은 후속 단계에 남긴다. 공통 메인 링크는 MUI `Link`와 Router `Link`를 연결해 전체 재로딩 없이 이동한다.

스타일 규칙: MUI 기본 라이트 스타일과 기본 폰트를 사용한다. `CssBaseline`으로 기본 스타일을 정리하고 `Container maxWidth="lg"`, `Stack spacing`, 최소 `sx`로 반응형 여백/헤더 배치/긴 문자열 줄바꿈을 처리한다. 별도 CSS 파일, 외부 폰트, 커스텀 테마, 새 dependency는 추가하지 않았다. `index.html`은 한국어 `lang="ko"`와 `기술 면접 연습` 제목을 사용한다.

검증 결과: `npm run lint`, `npm run build`를 통과했다. 기존 Edge의 headless 모드와 외부 임시 스크립트로 375px/1280px에서 네 경로의 직접 접근/새로고침, 메인 링크의 SPA 이동, 뒤로 가기, 페이지별 단일 h1, 모바일 가로 넘침 없음, 긴 ID 줄바꿈, MUI 스타일 적용, API 요청 및 런타임 예외 없음을 확인했다. 첫 검증은 Vite 초기 dependency 최적화에 따른 재로딩으로 중단됐으며 재실행에서 8개 경로/너비 조합 모두 통과했다. 예제 에셋/CSS 참조가 남지 않았고 빌드 결과에도 기본 에셋이 없다.

배포 전제: Cloudflare Pages에서 `npm run build`의 `dist`를 배포하고 최상위 `404.html`을 추가하지 않아 기본 SPA fallback을 사용한다. 별도 `_redirects`나 Pages Function은 추가하지 않는다. API는 별도 HTTPS 백엔드의 Origin을 빌드 환경변수 `VITE_API_BASE_URL`에 설정한다. 이번 검증은 로컬 Vite 환경이며 Cloudflare 배포의 직접 URL 접근과 API/CORS는 7단계에서 실제 확인한다.

### 3. 메인 소개와 질문 목록 조회

목적: 사용자가 서비스 목적을 이해하고 답변할 질문을 선택할 수 있게 한다.

예상 파일: `src/pages/HomePage.tsx`, 신규 `src/api/questions.ts`.

- [x] 상단에 기술 질문 답변과 AI 피드백을 통한 면접 연습이라는 짧은 소개문을 표시한다. 실제 계약에 없는 일일 제출 제한이나 로그인 기능을 약속하지 않는다.
- [x] 소개문 아래에서 `GET /api/questions`를 호출하고 MUI `List`/`ListItemButton` 등으로 제목을 표시한다. `id`를 React 목록의 `key`와 이동 경로에 사용한다.
- [x] 질문 선택 시 `/questions/{id}`로 이동한다. 상세 본문은 목록에서 추측하거나 미리 요청하지 않는다.
- [x] 목록 로딩, 정상 목록, 빈 목록, 오류 안내 및 사용자가 누르는 재조회 버튼을 구분한다. 계약에 없는 정렬/검색/페이지네이션을 추가하지 않는다.
- [x] 페이지의 `useState`로 목록/로딩/오류를 보관한다. `useEffect`로 화면 진입 시 조회하고 정리 함수에서 GET을 취소하거나 오래된 응답 반영을 막는다. 취소는 사용자 오류로 표시하지 않는다.

선택 이유: 상태(state)는 현재 화면을 그리는 데 필요한 값이다. 예를 들어 로딩 상태가 바뀌면 React가 목록 대신 진행 표시를 렌더링한다. 목록은 다른 페이지가 공유할 필요가 없으므로 전역 store나 캐시 없이 페이지 안에서 관리한다. `useEffect`는 화면 표시 이후 API 같은 외부 작업을 연결하는 수단이며, 개발 `StrictMode`의 재실행에도 정리가 안전해야 한다.

완료 기준: 실제 목록 응답의 제목 클릭으로 상세 경로로 이동한다. `[]`, 서버 오류, 네트워크 오류, 재조회가 구분되고 키보드로 질문을 선택할 수 있다. 백엔드 미구현 시 명시적인 fixture/mock 검증만 수행하고 실제 연동 완료로 표시하지 않는다.

구현 결과: `src/api/questions.ts`에 `getQuestions(signal?)`을 추가해 목록 본문 `QuestionSummary[]`를 반환한다. `HomePage.tsx`에 소개문과 MUI 질문 목록/진행 표시/오류 Alert/수동 재조회 버튼을 구현했다. 응답 순서 그대로 제목만 표시하며 Router 링크로 상세 화면에 이동한다. 목록·로딩·오류는 페이지 내부 상태로 함께 관리하고, 재조회 때 초기화한 뒤 effect를 다시 실행한다. effect 정리에서 GET을 취소하고 취소된 요청의 성공/오류를 반영하지 않는다. 개발 StrictMode는 유지하며 실제 화면에서 mock 데이터로 대체하지 않는다.

검증 결과: `npm run lint`, `npm run build`를 통과했다. 첫 빌드에서 MUI `Stack`의 직접 `alignItems` 속성이 설치 버전에서 지원되지 않아 `sx`로 수정 후 빌드를 통과했다. 기존 Edge headless 및 외부 임시 CDP 스크립트로 API 응답을 명시적으로 mock해 375px/1280px의 정상 목록/응답 순서/긴 제목 줄바꿈, 키보드 상세 이동과 SPA 이동, 빈 목록, 500 오류, 수동 재조회 한 번만 발생, 네트워크 오류 및 재시도 복구, 느린 요청의 로딩, 화면 이탈/StrictMode의 요청 취소와 오래된 응답 무시를 확인했다. 상세 사전 조회/POST 및 앱 런타임 예외는 없었다. 테스트 도구/dependency나 mock 서버를 프로젝트에 추가하지 않았다.

- [x] 실제 백엔드 실행 후 질문 목록 조회, 브라우저 CORS 허용, 실제 목록 제목에서 상세 경로 이동을 확인한다. 3단계 당시에는 연결이 거부됐으나 5단계 검증에서 `http://localhost:5173` 브라우저로 `http://localhost:8080/api/questions`의 실제 `자기 소개` 목록을 읽고 상세 페이지로 이동했다. 배포 Origin의 CORS는 7단계에서 별도로 확인한다.

### 4. 질문 상세와 반응형 답변 작성

목적: 선택한 질문을 읽으며 답변을 작성하는 화면을 완성한다. 이 단계에서는 제출 API를 호출하지 않는다.

예상 파일: `src/pages/QuestionAnswerPage.tsx`, `src/api/questions.ts`.

- [x] URL의 `questionId`는 문자열이므로 양의 정수 형태와 `Number.isSafeInteger` 및 계약 범위 `1~9,007,199,254,740,991`를 검증한다. 잘못된 ID는 요청하지 않고 안내한다. 단순 `parseInt`로 `1abc`를 허용하지 않는다.
- [x] `GET /api/questions/{questionId}`로 제목/본문을 조회한다. 로딩, 잘못된 요청, `QUESTION_NOT_FOUND`, 서버/네트워크 오류를 구분하고 메인 이동/재조회 수단을 제공한다.
- [x] MUI `Stack`의 반응형 값으로 `xs`에서는 질문 위/답변 아래, `md` 이상에서는 동일 비율로 질문 왼쪽/답변 오른쪽에 배치한다. 기본 `md` 기준은 900px이며 이는 API 정책이 아닌 UI 기준이다.
- [x] MUI `TextField`의 `multiline`, `fullWidth`, 명확한 label을 사용한다. 입력값은 페이지의 `answer` 상태로 관리하고 줄바꿈을 보존한다.
- [x] 공백 검사에는 `answer.trim()`을 사용하되 상태와 추후 제출 원문을 trim하지 않는다. 포커스 이탈 후 빈 답변 안내를 제공한다. 사용자 지정에 따라 최대 3,000자 입력 제한과 글자 수 안내를 적용한다.
- [x] 제출 기능이 없는 단계에서는 버튼을 비활성화하고 준비 중임을 명확히 표시한다. 개인정보 입력을 유도하지 않고 민감한 정보는 작성하지 말라는 짧은 안내를 둔다.
- [x] 질문 ID가 바뀌면 이전 질문의 데이터/오류/답변을 새 질문에 섞지 않도록 초기화한다. 이전 GET 응답이 새 질문 화면을 덮지 못하게 한다.

선택 이유: 입력창의 `value`를 `answer`에 연결하고 `onChange`로 상태를 갱신하는 방식을 제어 입력이라고 한다. 답변은 화면의 상태에 남으므로 이후 제출 오류가 나더라도 삭제하지 않으면 유지된다. CSS 반응형 설정으로 배치만 바꾸면 충분하며 화면 크기 감지용 JS 상태나 별도 모바일 컴포넌트는 필요 없다.

완료 기준: 375px 화면에서 상하, 1280px 화면에서 좌우로 보이고 긴 본문/입력에도 가로 스크롤이 생기지 않는다. 제목/본문/입력 label이 명확하며 잘못된 ID와 없는 질문을 처리한다. 답변 입력 중 불필요한 재조회로 입력이 사라지지 않는다.

구현 결과: `getQuestion(questionId, signal?)`을 기존 질문 API 파일에 추가했다. 페이지 진입 전 URL ID를 검증하고 같은 파일의 `QuestionAnswerContent`에 질문 ID를 `key`로 전달해 질문이 바뀌면 조회/오류/답변/공백 안내 상태가 즉시 초기화되게 했다. GET의 정리 함수는 요청을 취소하고 취소된 응답의 상태 반영을 막는다. 400/404는 안내와 공통 메인 링크를, 서버/네트워크 오류는 수동 재조회를 제공한다. 입력 상태는 GET effect의 의존성에 포함하지 않는다.

입력 정책: 사용자 결정에 따라 HTML `maxLength=3000`과 JS `answer.length`로 입력 제한/카운터를 제공한다. UTF-16 코드 단위 기준이므로 일부 이모지는 2자 이상으로 계산된다. 검증은 원문을 trim하거나 임의로 잘라 저장하지 않으며, 공백만 입력한 경우 blur 후 안내한다. 제출은 비활성화하고 페이지 이탈/새로고침 시 초안이 사라짐을 명시한다. 현재 백엔드 API 문서는 최대 길이가 아직 미확정이므로 백엔드/계약의 3,000자 제한 및 계산 기준 정합성은 6단계 전에 확인한다. 백엔드 파일은 수정하지 않았다.

검증 결과: `npm run lint`, `npm run build`를 통과했다. 빌드는 JS 번들 약 536kB(압축 전)로 500kB 초과 경고를 출력하며 오류는 아니다. 경고를 숨기거나 이번 단계에서 최적화 범위를 확대하지 않았다. 기존 Edge headless와 외부 임시 CDP mock으로 375px/1280px의 상하/동일 너비 좌우 배치, 긴 본문/줄바꿈, label, 원문 유지, 입력 중 GET 없음, 3,001자 입력 시 3,000자 제한, blur 공백 안내, 잘못된 ID 요청 차단 및 안전 정수 상한, 400/404/500/네트워크 오류와 복구, 로딩, 취소/응답 경합, SPA 질문 전환 후 초안 초기화, 목록에서 상세 이동, 새로고침을 확인했다. 첫 검증의 새로고침 시나리오는 오래된 응답 fixture를 초기화하지 않아 실패했으며, 검증 스크립트 수정 후 통과했다. 앱 런타임 예외나 POST는 없었다.

- [x] 실제 질문 상세 GET 및 브라우저 CORS 연동을 확인한다. 4단계는 mock 검증만 수행했으나 5단계 검증에서 `http://localhost:5173` 브라우저로 실제 질문 목록을 선택하고 `GET /api/questions/1`의 제목/본문과 답변 입력창이 표시됨을 확인했다. 서버는 별도 백엔드 작업에서 실행되었으며 이번 작업에서 시작하거나 수정하지 않았다.

### 5. 저장된 평가 결과 조회 화면

목적: 제출 기능보다 먼저 이동 목적지를 완성하고 결과 URL의 새로고침을 지원한다.

예상 파일: `src/pages/EvaluationResultPage.tsx`, 신규 `src/api/evaluationAttempts.ts`.

- [x] `attemptId`를 질문 ID와 같은 안전 정수 규칙으로 검증하고 `GET /api/evaluation-attempts/{attemptId}`를 호출한다. GET 취소/오래된 응답 방지는 목록/상세와 같은 원칙을 따른다.
- [x] 총점 `score`를 100점 기준으로 표시하고 백엔드 `result`의 `PASS / RETRY / FAIL` 텍스트를 표시한다. 프론트에서 점수 구간으로 판정을 재계산하지 않는다.
- [x] `strengths`는 잘 설명한 부분, `weaknesses`는 부족하거나 잘못 설명한 부분, `improvements`는 개선할 부분이라는 구분된 제목 아래 표시한다.
- [x] 질문 제목과 제출 답변 원문도 보여주어 피드백의 대상을 알 수 있게 한다. 줄바꿈/긴 단어를 처리하고 문자열을 일반 텍스트로 렌더링한다. HTML 삽입이나 Markdown 라이브러리를 추가하지 않는다.
- [x] 로딩, 잘못된 ID, `EVALUATION_ATTEMPT_NOT_FOUND`, 서버/네트워크 오류 및 수동 재조회를 처리한다. 공통 상단 링크로 질문 목록에 돌아갈 수 있다.
- [x] 결과 조회는 항상 URL의 ID와 GET을 기준으로 한다. 라우터 state나 전역 상태에만 의존하지 않는다. 조회 실패가 제출 실패를 의미하지 않으므로 POST를 다시 보내지 않는다.

선택 이유: POST 응답을 페이지 사이에 전달해 즉시 보여줄 수도 있지만, MVP에서는 결과 GET을 한 번 더 호출하는 방식이 더 단순하다. 새로고침과 직접 URL 접근이 동일하게 동작하고, 상태 전달/캐시/저장소 복원 코드가 필요 없다. 결과 GET은 저장된 기록 조회이며 LLM 재평가가 아니다.

완료 기준: 유효한 결과 URL 직접 접근 및 새로고침에서 최소 다섯 결과 항목이 표시된다. 판정은 색상뿐 아니라 텍스트로 구분한다. 없는 결과와 조회 오류를 처리한다. 저장된 실제 평가가 없으면 계약 형식 fixture로 확인하고 실제 연동은 보류 상태로 남긴다.

구현 결과: 신규 `getEvaluationAttempt(attemptId, signal?)`과 결과 페이지를 연결했다. ID를 먼저 검증하고 ID별 `key`로 조회/오류 상태를 초기화하며 effect 정리에서 GET을 취소한다. 결과는 MUI 기본 스타일의 총점, 판정 Chip(success/warning/error), 세 종류 피드백, 질문 제목, 제출 답변으로 표시한다. 문자열은 일반 텍스트 및 `pre-wrap`으로 처리한다. 400/404는 안내하고 서버/네트워크 오류는 수동 재조회를 제공한다. 현재 공통 메인 링크를 유지하고 POST, 캐시, 전역 상태, 새 dependency는 추가하지 않았다.

검증 결과: lint와 빌드를 통과했다. 빌드 번들은 약 551kB(압축 전)이며 기존 500kB 초과 경고는 남아 있다. Edge headless의 명시적 CDP API mock으로 375px/1280px에서 PASS/RETRY/FAIL의 텍스트/색상, 총점 및 모든 피드백/답변 원문, 긴 문자열/줄바꿈/HTML 일반 텍스트 처리, 직접 접근과 새로고침 GET, 잘못된 ID 요청 차단과 안전 정수 상한, 400/404/500/네트워크 오류, 단일 수동 재조회, 로딩, ID 전환/요청 취소/오래된 결과 무시, 메인 이동을 확인했다. 서버 판정을 점수로 재계산하지 않는 것도 검증했다. 초기 브라우저 검증은 임시 Vite localhost 서버가 연결되지 않아 중단됐으며 IPv4 바인딩으로 재시작해 localhost 접근 확인 후 통과했다. 앱 런타임 예외나 POST는 없었다.

실제 API 확인: 작업 시작 때는 백엔드 연결이 거부됐으나 이후 서버가 응답하기 시작했다. `http://localhost:5173`에 대한 CORS 헤더와 실제 브라우저의 질문 목록/상세 조회가 통과했다. 결과 `/api/evaluation-attempts/1`은 CORS를 포함한 404지만 본문이 계약의 `code/message` 대신 Spring 기본 `timestamp/status/error/path` 형식이었다. 프론트는 기존 오류 해석의 기본 안내로 안전하게 처리했고, 이는 계약의 `EVALUATION_ATTEMPT_NOT_FOUND`나 저장된 평가 조회 성공을 확인한 것이 아니다. 백엔드/API 계약은 수정하지 않았다.

- [ ] 저장된 실제 평가 ID로 결과 GET 성공 및 결과 URL 직접 접근/새로고침을 확인한다. 실제 결과 endpoint와 계약 형식의 404 응답 준비 여부도 확인한다. 이번에는 결과 생성 POST 없이 mock으로 성공 화면을 검증했으며 실제 결과 연동 성공은 미검증이다.

### 6. 답변 제출, 분석 대기, 실패 복구 연결

목적: 작성 화면과 결과 화면을 연결하여 핵심 흐름을 완성한다.

변경 파일: `src/pages/QuestionAnswerPage.tsx`, `src/api/evaluationAttempts.ts`, `.env.example`. 로컬 `.env`에도 승인한 timeout 설정을 추가한다.

- [x] form의 제출 이벤트에서 기본 페이지 재로딩을 막고 `{ answer }` 원문을 POST한다. 공백뿐인 답변과 3,000자 초과 답변은 로컬에서 거부하며 서버 검증도 유지한다.
- [x] `isSubmitting` 상태로 제출 버튼과 입력창을 비활성화하고 클릭/키보드 제출을 같은 handler로 처리한다. 6-1단계에서 초기 `AbortController` 잠금을 요청 취소 없는 현재 제출 ref로 변경했다.
- [x] 평가 대기 동안 **답변을 분석중입니다.** 문구와 MUI 진행 표시를 답변 영역에 표시한다. `role="status"`로 상태를 알리고 진행률/남은 시간은 추측하지 않는다.
- [x] API는 동기식 완료 응답을 사용한다. 화면은 응답 또는 지정 대기시간까지 기다리며 polling, 상태 조회 endpoint, 백그라운드 job ID, `202` 처리를 추가하지 않는다.
- [x] `201` 성공 응답의 안전한 양의 정수 `id`로 `/results/{id}`에 이동한다. 다른 성공 상태나 잘못된 ID는 완료로 처리하지 않는다. 결과 GET 실패는 결과 페이지에서 다루고 성공한 답변을 다시 제출하지 않는다.
- [x] `400 INVALID_REQUEST`, `404 QUESTION_NOT_FOUND`, `502 LLM_EVALUATION_FAILED`, `500 INTERNAL_SERVER_ERROR`를 상태/코드로 구분해 안내한다. 서버 메시지가 정상 형식이면 사용자에게 표시하고 메시지 내용으로 분기하지 않는다.
- [x] 실패 시 `answer`를 그대로 유지하고 오류를 입력 근처에 표시한다. `finally`로 대기/잠금을 해제해 사용자가 명시적으로 다시 제출할 수 있게 한다. 질문이 없어진 경우 답변은 유지하되 질문 목록 이동을 안내한다.
- [x] 네트워크 단절/화면 대기시간 만료는 서버 처리/저장이 완료됐을 수도 있음을 안내하고 POST를 자동 재전송하지 않는다. 프론트는 평가 POST를 강제로 취소하지 않는다.
- [x] 제출 중 화면 이탈 이후의 완료 응답이 다른 화면을 강제로 이동시키지 않게 처리한다. 새로고침/이탈에 대한 답변 영구 저장, 이탈 방지 시스템은 이번 범위에 추가하지 않는다.
- [x] `VITE_EVALUATION_TIMEOUT_MS=180000`을 HTTP 요청 취소가 아닌 화면 대기시간으로 사용한다. 6-1단계에서 axios POST timeout을 제거했다. 양의 안전 정수와 브라우저 타이머 상한 2,147,483,647ms 검증을 유지하고 잘못된 설정은 POST 전에 거부한다. GET 설정은 변경하지 않는다.

선택 이유: `isSubmitting`은 현재 요청을 기다리는지 나타내는 화면 상태다. `useRef`는 화면을 다시 그리지 않아도 유지되는 값이므로 필요할 때 즉시 중복 요청을 잠그는 용도로만 쓴다. 둘 다 기본 React 기능이고 전역 상태 관리가 아니다. POST를 `useEffect`에 넣지 않고 사용자 제출 이벤트에 연결해야 화면 재실행/새로고침으로 평가가 만들어지지 않는다.

완료 기준: 한 번 제출하면 대기 안내가 보이고 화면 대기 중 중복 클릭/키보드 제출에도 POST가 하나만 발생한다. 대기시간 내 성공 시 해당 결과 URL로 이동한다. 오류/대기시간 만료 뒤 원문과 줄바꿈이 유지되고 대기 표시가 종료된다. 사용자가 다시 제출하기 전 자동 POST가 없다. 답변 유지의 보장 범위는 현재 작성 페이지의 제출 실패이며 새로고침/페이지 이탈 후 복원은 포함하지 않는다.

초기 구현 결과(6-1단계 변경 전의 과거 기록): `submitEvaluationAttempt`를 추가하고 답변 영역을 form으로 연결했다. POST는 제출 이벤트에서만 수행하며 textarea Enter는 줄바꿈으로 유지한다. 조회 오류와 제출 오류를 분리해 제출 실패가 질문/초안을 지우지 않도록 했다. 초기 ref의 controller와 unmount cleanup은 POST를 취소했으나 6-1단계에서 제거했다. 네트워크/timeout과 비정상 성공 응답은 서버 저장 가능성을 알렸다. 앱에는 mock 성공이나 LLM 미연결을 우회하는 코드를 넣지 않았다.

초기 검증 결과(과거 timeout/취소 정책): lint와 빌드를 통과했다. 기존 약 553kB 번들 경고는 남기고 최적화로 범위를 확대하지 않았다. Edge headless CDP에서 모든 API POST를 가로채 원문 전송, 공백 거부, Enter 줄바꿈, 모바일/PC 대기 UI와 입력/버튼 비활성화, 빠른 중복 form 제출/클릭 시 단일 POST, 201 성공 후 결과 GET, 400/404/502/500 답변 보존과 잠금 해제, 네트워크 오류 후 수동 재제출 성공, timeout 복구, 잘못된 성공 ID/202 거부, 결과 GET 실패/재조회 시 POST 재전송 없음, 화면 이탈/질문 변경 후 이전 요청 취소와 이동 차단을 확인했다. POST timeout 120000 설정을 확인하고 별도의 테스트 전용 로컬 HTTP endpoint에서 20ms override로 실제 axios timeout을 검증했다. Vite 모듈/adapter 검증으로 7개 잘못된 timeout 설정은 POST 전에 차단되며 GET은 영향을 받지 않음을 확인했다. 외부 임시 스크립트만 사용했고 dependency나 테스트 framework를 추가하지 않았다. 실제 백엔드에는 POST를 보내지 않았다.

- [ ] 실제 LLM을 호출하지 않는 백엔드 테스트 환경에서 평가 생성부터 결과 GET/새로고침까지 로컬 연결을 확인한다. 프론트 mock 검증은 실제 HTTP/CORS 검증과 구분하고 실모델 성공/품질 검증은 백엔드에 맡긴다.
- [x] 3,000 UTF-16 코드 단위 제한은 백엔드 Request DTO와 API 계약에 반영되어 프론트 `answer.length`/`maxLength` 기준과 일치한다. 전체 JSON 본문 바이트 제한은 별도 백엔드/인프라 사항이다.
- [ ] 배포 단계에서 Cloudflare Pages 빌드 환경의 `VITE_EVALUATION_TIMEOUT_MS=180000`과 프록시 제한을 별도로 확인한다. 화면 대기 종료 시각과 프록시 HTTP 제한은 별개다. 환경변수 변경 후 다시 빌드/배포해야 한다.

### 6-1. 평가 대기시간 정책 단순화

목적: 기존 timeout 기능을 사용자 결정에 맞춰 수정한다. 새 기능을 추가하지 않고 요청 취소와 화면 대기 종료를 분리한다.

변경 파일: `src/pages/QuestionAnswerPage.tsx`, `src/api/evaluationAttempts.ts`, 관련 제출/API 테스트, `.env.example`, `AGENTS.md`, 이 TODO. 환경변수 이름과 180000 값은 유지한다.

- [x] 평가 POST에 설정된 axios timeout과 취소용 signal 전달을 제거하고 화면 대기 타이머로 변경한다. POST는 시간 만료/화면 이탈 때 `abort()`하지 않는다. 기존 GET 취소 처리는 유지하며 GET timeout은 추가하지 않는다.
- [x] 시간 만료 시 분석 표시를 종료하고 서버 응답 지연을 오류로 안내한다. 답변 원문을 보존하고 입력/제출 잠금을 해제해 사용자가 수동 재시도할 수 있게 한다. 안내: `서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요. 이전 요청은 계속 처리될 수 있으며 다시 제출하면 별도 평가가 생성될 수 있습니다.` HTTP 500 응답을 받았다고 표현하지 않는다.
- [x] 현재 화면의 제출을 식별하는 최소한의 ref로 즉시 중복 제출을 막는다. 대기 종료/새 제출/화면 이탈 이후 도착한 이전 응답은 화면 이동, 오류 표시, 새 제출 잠금 해제를 수행하지 않도록 무시한다. 사용자가 재제출하지 않아도 대기 종료 후 이전 성공 응답은 무시한다.
- [x] 정상 성공/실패, 시간 만료, 화면 이탈 시 화면 타이머와 현재 제출 식별만 정리한다. 자동 POST 재전송, 백그라운드 완료 추적, 범용 hook/state machine은 추가하지 않는다.
- [x] MSW 지연 응답과 제어 가능한 테스트 타이머로 시간 만료 안내/원문 보존/잠금 해제/수동 재제출을 검증한다. 만료/이탈 시 POST 신호를 취소하지 않는 것과 늦은 성공/실패/정리 처리가 현재 화면이나 새 제출을 덮지 않는 것도 확인한다. 실제 180초 대기나 LLM 호출은 하지 않는다.
- [x] 기존 201 성공 이동, 400/404/502/500 실패 복구, 즉시 중복 제출 방지, 결과 GET 재조회 시 POST 없음 테스트를 유지한다. 이전 axios timeout 설정/취소 기대 테스트는 새 화면 대기 정책에 맞춰 수정한다.
- [x] `npm run test:run`, `npm run lint`, `npm run build`를 실행하고 결과를 기록한다.

완료 기준: 지정 시간이 지나면 서버 응답 지연 안내와 수동 재시도가 가능하고 답변이 유지된다. 프론트가 POST를 강제로 취소하지 않으며 이전 요청의 늦은 응답이 새 요청/다른 화면에 영향을 주지 않는다.

구현 결과: `getEvaluationWaitTime()`에서 기존 환경변수를 검증하고 화면 제출 전에 읽는다. POST에는 timeout/signal을 전달하지 않는다. 작성 페이지는 타이머가 있는 현재 제출 객체 하나로 즉시 잠금과 응답 반영 여부를 관리한다. 타이머 만료는 해당 객체를 무효화하고 대기 UI만 종료한다. 정상 응답과 이탈 시 타이머를 정리하며, 이전 요청의 성공/실패/finally는 새 제출 상태를 변경하지 않는다. GET/백엔드/API 계약/의존성은 변경하지 않았다.

검증 결과: 제출/API 대상 50개와 전체 6개 파일/108개 테스트, lint, build가 통과했다. MSW 응답 보류와 가상 타이머로 179999ms 대기 유지/180000ms 만료, 원문 보존/잠금 해제, 만료 후 늦은 성공/502 무시, 재제출 중 이전 응답/finally 격리 및 새 결과 이동을 확인했다. 화면 이탈/질문 변경/unmount의 POST 비취소와 타이머 정리, 잘못된 환경변수의 POST 차단, GET 독립성, 기존 중복 제출/오류/결과 조회 회귀도 통과했다. 첫 전체 실행은 테스트의 가상 타이머와 window 타이머 spy 복원 충돌로 7개가 시간 초과 실패했다. 정리 검증을 실제 타이머의 clearTimeout 호출 확인으로 수정한 뒤 전체 재실행에서 통과했다. 빌드는 JS 약 553.39kB로 기존 500kB 초과 경고를 유지한다.

검증 범위: 모든 HTTP 응답은 테스트 전용 mock이며 실제 백엔드/LLM/DB 요청은 하지 않았다. 실제 브라우저 타이머, 모바일 배치, CORS/결과 URL 새로고침 및 Cloudflare 배포는 7단계에 남긴다. 프론트 코드에서 POST를 취소하지 않는 것이며 브라우저 새로고침/종료, 네트워크 또는 프록시의 연결 종료를 방지하거나 서버 완료를 보장하지 않는다.

### 7. 실제 API 핵심 흐름 및 배포 접근 검증

목적: 6-1단계 이후 기능을 추가하지 않고 로컬 연결/오류/반응형 동작을 확인한다. 배포 접근 검증은 후속 단계로 분리하며 실제 LLM 호출/품질은 프론트 검증 범위가 아니다.

예상 변경 범위: 검증에서 발견된 문제의 해당 페이지/API 파일만 최소 수정. 백엔드 코드나 무관한 설정은 임의로 변경하지 않는다.

- [ ] 기존 MSW로 네 API 계약의 정상/실패/지연 흐름을 검증한다. 실제 LLM을 호출하지 않는 로컬 백엔드 테스트 환경이 준비되면 기존 질문으로 소개 → 목록 → 상세 → 답변 → 분석 대기 → 결과의 실제 URL/요청 본문/응답 상태와 CORS를 개발자 도구 Network에서 확인한다. 프론트 작업에서 실모델 호출을 유발하는 POST는 보내지 않는다.
- [ ] 빈 목록, 잘못된 경로 ID, 없는 질문/결과, 각 API의 500, 제출 400/502, 네트워크 단절/timeout, 결과 GET 실패를 확인한다. 안전하게 재현할 수 없는 오류는 fixture/mock임을 명시하고 실제 확인과 구분한다.
- [ ] 느린 응답에서 대기 표시와 단일 제출, 실패 후 답변 원문 유지, 재시도 성공을 확인한다. 네트워크 재연결 시 자동 POST가 없어야 한다.
- [ ] 결과 직접 접근/새로고침, 화면 이동 중 GET 응답 경합, 개발 StrictMode 재실행, 질문 ID 변경 시 이전 답변 초기화를 확인한다.
- [ ] 375px/1280px 및 긴 질문/답변/피드백에서 레이아웃, 키보드 접근, input label, 진행/오류 안내를 확인한다.
- [ ] 로컬 연동 이후 별도 배포 작업에서 `https://tech.eoehd1ek.com`의 `/questions/...`, `/results/...` 직접 접근/새로고침과 Cloudflare Pages SPA fallback을 확인한다. API는 `https://techapi.eoehd1ek.com/api/...`로 직접 호출한다. Vite 개발 서버에서 성공했다고 배포도 성공으로 간주하지 않는다.
- [ ] 배포 단계에서 `VITE_API_BASE_URL=https://techapi.eoehd1ek.com`, 백엔드 허용 Origin `https://tech.eoehd1ek.com`, HTTPS/OPTIONS 및 Cloudflare 프록시 제한을 확인한다. 로컬 연동 작업에서는 운영 설정을 적용하거나 배포하지 않는다.
- [ ] 각 작은 PR과 최종 통합에서 `npm run test:run`, `npm run build`, `npm run lint`를 실행한다. 테스트는 실제 API 검증을 대신하지 않는다.
- [ ] 실제 검증 결과, 확인하지 못한 조건, 남은 합의 사항을 작업 결과에 기록한다. 빌드 성공만으로 사용자 흐름 검증을 대신하지 않는다.

로컬 완료 기준: mock 회귀 테스트와 PC/모바일 표시, 실패 복구 및 결과 복원을 확인하고, 실모델 호출 없는 백엔드 테스트 환경에서 실제 HTTP/CORS와 결과 URL 새로고침을 검증한다. 테스트 환경이 준비되지 않으면 해당 연결 항목은 완료 체크하지 않고 조건을 남긴다. 배포와 실모델 품질 검증은 로컬 완료 판정에서 분리한다.

## 5. 확정 설정과 후속 확인 사항

| 항목 | 관련 단계 | 프론트 처리 원칙 |
| --- | --- | --- |
| 답변 최대 길이/요청 크기 | 4, 6 | 3,000 UTF-16 코드 단위는 프론트/백엔드 계약에서 일치. 전체 JSON 본문 크기 제한은 별도 백엔드/인프라 사항 |
| 평가 화면 대기시간 | 6-1 | 180초 후 서버 응답 지연 안내/답변 유지/잠금 해제/수동 재시도. POST 강제 취소와 자동 재전송 없음. 늦은 응답은 재제출 여부와 관계없이 무시 |
| 백엔드 처리 시간/GET 대기 | 6-1, 7 | 백엔드 전체 180초 종료 보장 없음. SDK timeout/retry는 백엔드 책임. GET 대기시간 제한은 추가하지 않음 |
| 개발/배포 API 주소 및 프론트 Origin | 1, 7 | 로컬 `http://localhost:5173` → `http://localhost:8080`. 배포 예정 `https://tech.eoehd1ek.com` → `https://techapi.eoehd1ek.com`. 배포 CORS/HTTPS/프록시 검증은 로컬 이후 |
| 실제 LLM/질문 및 평가 기준 데이터 | 3~7 | 프론트는 계약 응답을 mock으로 검증. 실모델 연결/품질은 백엔드 책임. 기능 완료 후 질문/기준을 하나씩 추가하며 품질 측정 |

## 6. 상태와 파일 구조를 작게 유지하는 기준

| 값 | 보관 위치 | 이유 |
| --- | --- | --- |
| 목록, 상세, 조회 로딩/오류 | 해당 페이지 `useState` | 그 화면에만 필요. 다른 페이지와 동기화할 필요 없음 |
| 답변, 제출 로딩/오류 | 작성 페이지 `useState` | 실패 시 화면을 유지하며 입력값을 보존 |
| 질문 ID, 평가 ID | Router URL | 페이지 직접 접근/새로고침의 조회 기준 |
| 평가 결과 | 결과 페이지 `useState` + GET | 서버가 저장한 기록이 원본. 전역 store나 localStorage 불필요 |

예정 구조는 기존 `src` 안에 `pages`와 `api`만 추가하는 수준이다. API 파일은 axios 설정/DTO와 질문/평가 요청을 구분하는 정도로 제한한다. 처음부터 `hooks`, `store`, `services`, `repositories`, 범용 form framework를 만들지 않는다. 컴포넌트가 지나치게 커질 때에만 실제 중복이나 화면 역할을 기준으로 분리한다. `useMemo`/`useCallback`, 캐싱, React Query는 핵심 흐름에 필요하지 않으므로 선제 도입하지 않는다.

## 7. 자동 테스트 기반

아래 완료 기록은 초기 axios timeout/POST 취소 구현 당시의 과거 검증 이력이다. 현재 화면 대기시간 정책의 구현/검증 결과는 6-1단계를 기준으로 하며, 과거 테스트 통과를 새 정책의 검증 완료로 간주하지 않는다.

- [x] 테스트 전용 devDependency로 Vitest, jsdom, React Testing Library, user-event, jest-dom, MSW와 필수 peer `@testing-library/dom`을 추가한다. 기존 dependency의 선언/설치 버전은 유지한다.
- [x] `vitest.config.ts`에서 jsdom과 공통 setup을 연결하고 테스트 API Origin을 `http://api.test`, POST timeout을 `180000`으로 고정한다. `.env`나 실행 중인 백엔드에 의존하지 않는다. 테스트 검색은 `src/**/*.test.{ts,tsx}`로 제한해 관리용 worktree를 포함하지 않는다.
- [x] `src/test/server.ts`의 MSW Node interceptor는 테스트에만 사용한다. 미등록 요청은 `onUnhandledRequest`에서 통과시키지 않고 오류 처리하며, 앱이 예외를 잡더라도 afterEach에서 해당 테스트를 실패시킨다. 각 테스트 뒤 화면/handler/spy/환경변수를 정리한다.
- [x] `QuestionAnswerPage.test.tsx`에서 실제 React/Router/axios와 사용자 입력을 사용해 공백 차단, 원문 POST, 분석 대기, 즉시 중복 form 제출 차단, 201 성공 후 결과 GET/화면 이동, 400/404/502/500 및 네트워크/timeout 후 답변 보존, 수동 재제출, 결과 GET 실패 시 POST 재전송 없음, 화면 이탈/질문 변경 후 이전 응답 무시를 검증한다. StrictMode를 유지한다.
- [x] `client.test.ts`에서 정상 오류 코드/메시지, 비정상 본문, 공백 메시지, 네트워크/timeout, 취소, 내부 메시지 비노출을 검증한다. `evaluationAttempts.test.ts`에서 180초 POST 설정/GET 영향 없음, 잘못된 timeout 차단, 잘못된 성공 ID와 202 거부를 검증한다.

검증 결과: 3개 파일의 43개 테스트, lint, build가 통과했다. 임시 미등록 요청 probe는 앱처럼 예외를 잡아도 MSW 차단 및 afterEach 검사로 실패하는 것을 확인하고 제거했다. 실제 서버/LLM으로 요청하지 않았다. 기존 React/MUI/axios 등 설치 버전은 변경하지 않았고 운영 소스도 수정하지 않았다. 프로덕션 번들은 기존과 동일하며 기존 약 553kB 크기 경고는 남아 있다.

라이브러리 선택: Vitest는 현재 Vite 설정/TypeScript와 연결되는 실행 및 assertion 도구다. React Testing Library는 사용자에게 보이는 role/label로 화면을 검사하고, DOM peer는 요소 조회/waitFor를 제공한다. user-event는 입력/클릭 등 사용자 이벤트를 재현한다. jest-dom은 `toHaveValue`, `toBeDisabled` 등의 화면 assertion을 추가하며 별도 Jest runner는 필요 없다. jsdom은 Node에서 DOM을 제공하지만 실제 레이아웃/브라우저 CORS는 검증하지 않는다. MSW는 HTTP 계층을 가로채 앱 요청 코드를 유지하면서 계약 응답만 대체한다.

호환성과 한계: MSW 3의 설정 API/axios XMLHttpRequest 조합으로 초기 검증이 실패해 새 테스트 dependency를 XMLHttpRequest를 가로채는 MSW 2.15.0으로 선택했다. MSW의 합성 XHR은 실제 timeout 시계를 모델링하지 않으므로 timeout 화면 복구 테스트만 axios의 `ECONNABORTED`를 test spy로 주입하며, 180000ms 설정 자체는 별도 API 테스트로 확인한다. 실제 timeout 경계, 모바일 배치, 배포 URL 새로고침, 실제 API/CORS/LLM 성공은 브라우저/통합 검증으로 별도 수행해야 한다. 이번 테스트 도입은 7단계 실제 연동 완료를 의미하지 않는다.

### 조회 화면 회귀 테스트 보강

- [x] `HomePage.test.tsx`: 소개/로딩/정상 목록/응답 순서/빈 목록, 키보드 질문 선택과 상세 URL 이동, 500/네트워크 오류 및 수동 재조회, 이탈 후 조회 취소와 늦은 오류 비표시를 검증한다.
- [x] `QuestionAnswerPage.query.test.tsx`: 잘못된 ID의 GET 차단/안전 정수 상한, 상세 로딩/제목/본문/label, 400/404/500/네트워크 오류와 재조회, 원문 입력 중 GET 없음, 질문 변경 시 초안/공백 안내 초기화, 3,000자 붙여넣기 제한과 카운터, 이전 조회 취소/늦은 응답 무시를 검증한다. 기존 제출 테스트는 수정하지 않는다.
- [x] `EvaluationResultPage.test.tsx`: POST state 없는 결과 URL 진입, 총점/세 판정/피드백/답변 원문, 서버 판정 유지, HTML 문자열의 일반 텍스트 처리, 잘못된 ID와 안전 정수 상한, 로딩/400/404/500/네트워크 오류 및 GET만 사용하는 재조회, ID 변경 시 기존 결과 초기화와 이전 조회 취소/늦은 응답 무시를 검증한다.

보강 결과: 기존 43개에 조회 테스트 41개를 추가해 총 6개 파일/84개 테스트를 구성했다. 모든 HTTP 응답은 테스트 전용 MSW handler로 처리하고 미등록 요청 차단을 유지한다. 조회 경합은 명시적 Promise gate로 응답을 보류/완료하며 임의 sleep은 사용하지 않는다. 초기 취소 assertion 3개는 MSW 합성 `Request.signal`이 원래 axios 취소 신호를 반영하지 않아 실패했다. HTTP 응답은 계속 MSW로 처리하고, 원래 axios GET을 그대로 실행하는 spy로 실제 전달 `AbortSignal`을 관찰하도록 테스트만 수정했다. 운영 코드, 기존 테스트, dependency, 백엔드는 수정하지 않았다.

검증 결과: `npm run test:run`에서 6개 파일/84개 테스트, `npm run lint`, `npm run build`, `git diff --check`가 모두 통과했다. 프로덕션 번들은 기존과 동일하며 약 553kB 크기 경고는 유지된다.

검증 범위: user-event의 붙여넣기/추가 입력과 DOM `maxLength`/카운터는 검증하지만 실제 브라우저 입력이나 레이아웃 검증을 대신하지 않는다. MemoryRouter의 결과 URL 시작은 URL ID로 독립 조회하는 구조의 검증이며 실제 브라우저 새로고침/Cloudflare SPA fallback 검증은 아니다. 실제 API/CORS/LLM 요청이나 DB 변경은 수행하지 않았고 7단계 실제 연동 완료 표시도 하지 않는다.
