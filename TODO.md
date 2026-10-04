# 프론트엔드 MVP TODO

## 1. 목표와 범위

기준 문서는 프론트엔드 `AGENTS.md`와 백엔드 `../back/docs/API.md`다. API 경로, 필드, 오류 형식을 임의로 변경하지 않는다. 이 문서는 구현 계획이며 이번 작업에서는 React 코드나 설정을 변경하지 않는다.

목표 흐름: 메인 소개 및 질문 목록 → 질문 선택 → 질문 상세 및 답변 작성 → 제출 → **답변을 분석중입니다.** → 평가 결과.

각 번호는 한 번의 AI 작업 또는 하나의 작은 PR로 완료하는 단위다. 순서대로 하나씩 구현하며, 체크박스는 해당 완료 기준을 검증한 뒤 표시한다. 실제 API 구현 여부는 별도로 확인한다. API 문서는 현재 계약이 구현 예정임을 명시한다.

이번 범위에서 제외: 인증/인가, 사용자 기록 목록, 관리자 기능, 새로운 상태 관리 라이브러리, React Query 등 추가 데이터 라이브러리, 별도 디자인 시스템, 복잡한 캐싱, 페이지네이션, 불필요한 추상화/최적화, 대규모 리팩터링.

## 2. 확인한 기존 프로젝트

| 항목 | 현재 상태 및 유지할 설정 |
| --- | --- |
| 진입점 | `src/main.tsx`: `createRoot`, `StrictMode`, `App` 렌더링 |
| 화면 | `src/App.tsx`: Vite 소개 및 카운터 예제. 업무 페이지와 API 연동은 아직 없음 |
| 스타일 | `src/App.css`, `src/index.css`: 예제 전용 스타일. 고정 root 너비, 가운데 정렬, OS 다크 모드 규칙이 있어 MUI 화면 전환 시 충돌 확인 필요 |
| 빌드 | `vite.config.ts`: React 플러그인만 설정. 개발 API proxy 없음 |
| 환경변수 예시 | `.env.example`: `VITE_API_BASE_URL=http://localhost:8080` |
| TypeScript | `tsconfig.app.json`: Vite 타입, 미사용 변수 검사, `verbatimModuleSyntax` 설정. 타입 전용 import는 `import type` 사용 |
| 품질 도구 | ESLint 및 React Hooks 규칙 구성. 테스트 script/테스트 도구는 선언되어 있지 않음 |
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

- [ ] 실제 백엔드 실행 후 질문 목록 조회, 브라우저 CORS 허용, 실제 목록 제목에서 상세 경로 이동을 확인한다. 이번 실행에서는 `http://localhost:8080/api/questions` 연결이 거부되어 실제 연동은 미검증이다. 프론트 구현/mock 검증 완료와 실제 연동 완료를 구분하며 7단계에서도 재확인한다.

### 4. 질문 상세와 반응형 답변 작성

목적: 선택한 질문을 읽으며 답변을 작성하는 화면을 완성한다. 이 단계에서는 제출 API를 호출하지 않는다.

예상 파일: `src/pages/QuestionAnswerPage.tsx`, `src/api/questions.ts`.

- [ ] URL의 `questionId`는 문자열이므로 양의 정수 형태와 `Number.isSafeInteger` 및 계약 범위 `1~9,007,199,254,740,991`를 검증한다. 잘못된 ID는 요청하지 않고 안내한다. 단순 `parseInt`로 `1abc`를 허용하지 않는다.
- [ ] `GET /api/questions/{questionId}`로 제목/본문을 조회한다. 로딩, 잘못된 요청, `QUESTION_NOT_FOUND`, 서버/네트워크 오류를 구분하고 메인 이동/재조회 수단을 제공한다.
- [ ] MUI `Box`/`Stack`의 `sx` 반응형 값으로 `xs`에서는 질문 위/답변 아래, `md` 이상에서는 질문 왼쪽/답변 오른쪽으로 배치한다. 기본 `md` 기준은 900px이며 이는 API 정책이 아닌 UI 기준이다.
- [ ] MUI `TextField`의 `multiline`, `fullWidth`, 명확한 label을 사용한다. 입력값은 페이지의 `answer` 상태로 관리하고 줄바꿈을 보존한다.
- [ ] 공백 검사에는 `answer.trim()`을 사용하되 상태와 추후 제출 원문을 trim하지 않는다. 빈 답변 안내를 제공하고 미확정 최대 길이를 임의로 정하지 않는다.
- [ ] 제출 기능이 없는 단계에서는 버튼을 비활성화하거나 미연결임을 명확히 표시한다. 개인정보 입력을 유도하지 않고 민감한 정보는 작성하지 말라는 짧은 안내를 둔다.
- [ ] 질문 ID가 바뀌면 이전 질문의 데이터/오류/답변을 새 질문에 섞지 않도록 초기화한다. 이전 GET 응답이 새 질문 화면을 덮지 못하게 한다.

선택 이유: 입력창의 `value`를 `answer`에 연결하고 `onChange`로 상태를 갱신하는 방식을 제어 입력이라고 한다. 답변은 화면의 상태에 남으므로 이후 제출 오류가 나더라도 삭제하지 않으면 유지된다. CSS 반응형 설정으로 배치만 바꾸면 충분하며 화면 크기 감지용 JS 상태나 별도 모바일 컴포넌트는 필요 없다.

완료 기준: 375px 화면에서 상하, 1280px 화면에서 좌우로 보이고 긴 본문/입력에도 가로 스크롤이 생기지 않는다. 제목/본문/입력 label이 명확하며 잘못된 ID와 없는 질문을 처리한다. 답변 입력 중 불필요한 재조회로 입력이 사라지지 않는다.

### 5. 저장된 평가 결과 조회 화면

목적: 제출 기능보다 먼저 이동 목적지를 완성하고 결과 URL의 새로고침을 지원한다.

예상 파일: `src/pages/EvaluationResultPage.tsx`, 신규 `src/api/evaluationAttempts.ts`.

- [ ] `attemptId`를 질문 ID와 같은 안전 정수 규칙으로 검증하고 `GET /api/evaluation-attempts/{attemptId}`를 호출한다. GET 취소/오래된 응답 방지는 목록/상세와 같은 원칙을 따른다.
- [ ] 총점 `score`를 100점 기준으로 표시하고 백엔드 `result`의 `PASS / RETRY / FAIL` 텍스트를 표시한다. 프론트에서 점수 구간으로 판정을 재계산하지 않는다.
- [ ] `strengths`는 잘 설명한 부분, `weaknesses`는 부족하거나 잘못 설명한 부분, `improvements`는 개선할 부분이라는 구분된 제목 아래 표시한다.
- [ ] 질문 제목과 제출 답변 원문도 보여주어 피드백의 대상을 알 수 있게 한다. 줄바꿈/긴 단어를 처리하고 문자열을 일반 텍스트로 렌더링한다. HTML 삽입이나 Markdown 라이브러리를 추가하지 않는다.
- [ ] 로딩, 잘못된 ID, `EVALUATION_ATTEMPT_NOT_FOUND`, 서버/네트워크 오류 및 수동 재조회를 처리한다. 질문 목록으로 돌아가는 링크를 제공한다.
- [ ] 결과 조회는 항상 URL의 ID와 GET을 기준으로 한다. 라우터 state나 전역 상태에만 의존하지 않는다. 조회 실패가 제출 실패를 의미하지 않으므로 POST를 다시 보내지 않는다.

선택 이유: POST 응답을 페이지 사이에 전달해 즉시 보여줄 수도 있지만, MVP에서는 결과 GET을 한 번 더 호출하는 방식이 더 단순하다. 새로고침과 직접 URL 접근이 동일하게 동작하고, 상태 전달/캐시/저장소 복원 코드가 필요 없다. 결과 GET은 저장된 기록 조회이며 LLM 재평가가 아니다.

완료 기준: 유효한 결과 URL 직접 접근 및 새로고침에서 최소 다섯 결과 항목이 표시된다. 판정은 색상뿐 아니라 텍스트로 구분한다. 없는 결과와 조회 오류를 처리한다. 저장된 실제 평가가 없으면 계약 형식 fixture로 확인하고 실제 연동은 보류 상태로 남긴다.

### 6. 답변 제출, 분석 대기, 실패 복구 연결

목적: 작성 화면과 결과 화면을 연결하여 핵심 흐름을 완성한다.

예상 파일: `src/pages/QuestionAnswerPage.tsx`, `src/api/evaluationAttempts.ts`.

- [ ] form의 제출 이벤트에서 기본 페이지 재로딩을 막고 `{ answer }` 원문을 POST한다. 공백뿐인 답변은 로컬에서 거부하며 서버 검증도 유지한다.
- [ ] `isSubmitting` 상태로 제출 버튼과 입력창을 비활성화한다. 클릭/키보드 제출을 같은 handler로 처리하고 handler에서도 진행 중 요청을 막는다. 아주 빠른 중복 이벤트에도 요청이 한 번만 나가도록 필요 시 작은 `useRef` 잠금을 사용한다.
- [ ] 평가 대기 동안 **답변을 분석중입니다.** 문구와 MUI 진행 표시를 답변 영역에 표시한다. `role="status"` 또는 `aria-live`로 상태를 알리고 진행률/남은 시간은 추측하지 않는다.
- [ ] API는 동기식이므로 POST 완료까지 대기한다. polling, 상태 조회 endpoint, 백그라운드 job ID, `202` 처리를 추가하지 않는다.
- [ ] `201` 성공 응답의 `id`로 `/results/{id}`에 이동한다. 이때 결과 GET 실패는 결과 페이지에서 다루고 성공한 답변을 다시 제출하지 않는다.
- [ ] `400 INVALID_REQUEST`, `404 QUESTION_NOT_FOUND`, `502 LLM_EVALUATION_FAILED`, `500 INTERNAL_SERVER_ERROR`를 상태/코드로 구분해 안내한다. 서버 메시지가 정상 형식이면 사용자에게 표시하고 메시지 내용으로 분기하지 않는다.
- [ ] 실패 시 `answer`를 그대로 유지하고 오류를 입력 근처에 표시한다. `finally` 등으로 대기/잠금을 해제해 사용자가 명시적으로 다시 제출할 수 있게 한다. 질문이 없어진 경우 답변은 유지하되 질문 목록 이동을 안내한다.
- [ ] 네트워크 단절/타임아웃은 서버 저장이 완료됐을 수도 있음을 안내하고 POST를 자동 재전송하지 않는다. 브라우저 요청 취소가 서버 평가 취소를 보장한다고 표현하지 않는다.
- [ ] 제출 중 화면 이탈 이후의 완료 응답이 다른 화면을 강제로 이동시키지 않게 처리한다. 새로고침/이탈에 대한 답변 영구 저장, 이탈 방지 시스템은 이번 범위에 추가하지 않는다.
- [ ] 평가 POST의 유한 timeout 값을 백엔드 전체 평가 시간 예산과 배포 proxy 제한에 맞춰 확정한다. 근거 없이 짧은 timeout을 하드코딩하거나 무제한 대기를 완료로 간주하지 않는다.

선택 이유: `isSubmitting`은 현재 요청을 기다리는지 나타내는 화면 상태다. `useRef`는 화면을 다시 그리지 않아도 유지되는 값이므로 필요할 때 즉시 중복 요청을 잠그는 용도로만 쓴다. 둘 다 기본 React 기능이고 전역 상태 관리가 아니다. POST를 `useEffect`에 넣지 않고 사용자 제출 이벤트에 연결해야 화면 재실행/새로고침으로 평가가 만들어지지 않는다.

완료 기준: 한 번 제출하면 대기 안내가 보이고 중복 클릭/키보드 제출에도 진행 중 POST가 하나만 발생한다. 성공 시 해당 결과 URL로 이동한다. 오류/timeout 뒤 원문과 줄바꿈이 유지되고 대기 표시가 종료된다. 사용자가 다시 제출하기 전 자동 POST가 없다. 답변 유지의 보장 범위는 현재 작성 페이지의 제출 실패이며 새로고침/페이지 이탈 후 복원은 포함하지 않는다.

### 7. 실제 API 핵심 흐름 및 배포 접근 검증

목적: 기능을 추가하지 않고 연결/오류/반응형 동작을 확인해 MVP 완료 여부를 판정한다.

예상 변경 범위: 검증에서 발견된 문제의 해당 페이지/API 파일만 최소 수정. 백엔드 코드나 무관한 설정은 임의로 변경하지 않는다.

- [ ] 실행 가능한 백엔드와 초기 질문 데이터로 소개 → 목록 → 상세 → 답변 → 분석 대기 → 결과까지 실제 네 API의 URL/요청 본문/응답 상태를 개발자 도구 Network에서 확인한다.
- [ ] 빈 목록, 잘못된 경로 ID, 없는 질문/결과, 각 API의 500, 제출 400/502, 네트워크 단절/timeout, 결과 GET 실패를 확인한다. 안전하게 재현할 수 없는 오류는 fixture/mock임을 명시하고 실제 확인과 구분한다.
- [ ] 느린 응답에서 대기 표시와 단일 제출, 실패 후 답변 원문 유지, 재시도 성공을 확인한다. 네트워크 재연결 시 자동 POST가 없어야 한다.
- [ ] 결과 직접 접근/새로고침, 화면 이동 중 GET 응답 경합, 개발 StrictMode 재실행, 질문 ID 변경 시 이전 답변 초기화를 확인한다.
- [ ] 375px/1280px 및 긴 질문/답변/피드백에서 레이아웃, 키보드 접근, input label, 진행/오류 안내를 확인한다.
- [ ] 배포 정적 서버가 `/questions/...`, `/results/...` 접근을 프론트 `index.html`로 보내는 SPA fallback을 지원하는지 확인한다. `/api/...`는 fallback 대상이 아닌 백엔드로 연결한다. Vite 개발 서버에서 성공했다고 배포도 성공으로 간주하지 않는다.
- [ ] 배포 환경의 API 주소/CORS 및 동기 평가 timeout 예산을 실제로 확인한다. origin이 다르면 backend CORS, HTTPS 화면이면 API의 HTTPS도 확인한다. Vite proxy를 선택할 경우 개발 전용이며 배포 문제를 해결하지 않음을 구분한다.
- [ ] 각 작은 PR과 최종 통합에서 `npm run build`, `npm run lint`를 실행한다. 현재 자동 테스트 도구가 없으므로 존재하지 않는 `npm test`를 완료 기준으로 삼거나 테스트 dependency를 임의로 추가하지 않는다.
- [ ] 실제 검증 결과, 확인하지 못한 조건, 남은 합의 사항을 작업 결과에 기록한다. 빌드 성공만으로 사용자 흐름 검증을 대신하지 않는다.

완료 기준: 실제 백엔드와 PC/모바일 핵심 흐름이 통과하고 실패 복구 및 결과 새로고침이 확인된다. API/배포 준비가 부족한 항목은 완료 체크하지 않고 구체적인 미검증 조건을 남긴다.

## 5. 구현 전 합의할 설정

| 미확정 항목 | 관련 단계 | 프론트 처리 원칙 |
| --- | --- | --- |
| 답변 최대 길이/요청 크기 | 4, 6 | 현재는 공백 검증만 적용. 계약 확정 후 입력 제한/안내를 맞추고 임의 길이로 차단하지 않음 |
| 전체 평가 시간, LLM 재시도 시간, proxy timeout | 6, 7 | 백엔드 전체 시간 예산을 확인해 axios timeout과 인프라 제한을 조율. 숫자를 API 확정값처럼 작성하지 않음 |
| 개발/배포 API 주소 및 프론트 Origin | 1, 7 | `VITE_API_BASE_URL`, backend CORS, HTTPS, 배포 라우팅을 확인. localhost 예시를 운영 주소로 사용하지 않음 |
| 실제 API 구현/초기 질문 및 평가 기준 데이터 | 3~7 | 계약은 구현 완료의 증거가 아님. 필요 시 명시적인 mock으로 작업하고 실제 연동 검증을 별도로 남김 |

## 6. 상태와 파일 구조를 작게 유지하는 기준

| 값 | 보관 위치 | 이유 |
| --- | --- | --- |
| 목록, 상세, 조회 로딩/오류 | 해당 페이지 `useState` | 그 화면에만 필요. 다른 페이지와 동기화할 필요 없음 |
| 답변, 제출 로딩/오류 | 작성 페이지 `useState` | 실패 시 화면을 유지하며 입력값을 보존 |
| 질문 ID, 평가 ID | Router URL | 페이지 직접 접근/새로고침의 조회 기준 |
| 평가 결과 | 결과 페이지 `useState` + GET | 서버가 저장한 기록이 원본. 전역 store나 localStorage 불필요 |

예정 구조는 기존 `src` 안에 `pages`와 `api`만 추가하는 수준이다. API 파일은 axios 설정/DTO와 질문/평가 요청을 구분하는 정도로 제한한다. 처음부터 `hooks`, `store`, `services`, `repositories`, 범용 form framework를 만들지 않는다. 컴포넌트가 지나치게 커질 때에만 실제 중복이나 화면 역할을 기준으로 분리한다. `useMemo`/`useCallback`, 캐싱, React Query는 핵심 흐름에 필요하지 않으므로 선제 도입하지 않는다.
