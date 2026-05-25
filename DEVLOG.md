# 도쿄 AI 가이드 — 개발 로그

**URL**: https://tokyo-ai-guide.vercel.app
**GitHub**: https://github.com/AlexKim90/tokyo-ai-guide
**스택**: Vercel (서버리스) · Anthropic Claude API · Google Maps Platform · 순수 HTML/CSS/JS (번들러 없음)

---

## 프로젝트 구조

```
tokyo-ai-guide/
├── public/
│   └── index.html        # 전체 앱 (단일 파일)
├── api/
│   ├── claude.js         # Anthropic API 프록시
│   └── maps.js           # Google Maps API 프록시
├── package.json          # Node 24.x
└── vercel.json           # outputDirectory: public
```

---

## 환경변수 (Vercel Dashboard)

| 키 | 용도 |
|---|---|
| `ANTHROPIC_API_KEY` | Claude API |
| `GOOGLE_MAPS_KEY` | Places API, Directions API |

Google Cloud Console에서 해당 키에 활성화 필요한 API:
- Maps JavaScript API
- Places API
- Directions API

---

## 탭 구조

### 1. 내 리스트
저장된 장소 목록. localStorage 기반.

**기능:**
- 장소 검색 → Places API textsearch → 저장
- 구글맵 링크 붙여넣기 → 단일 장소 or 저장 리스트 임포트
- 구글 저장 리스트 임포트: `maps.app.goo.gl/` 단축 URL → redirect follow → entitylist API → 장소 파싱
- 선택형 임포트 UI (체크박스, 전체 선택/해제)
- 자동 태그 (`detectTags()`: 라멘/스시/카페/골프 등 한자·카타카나·히라가나 패턴)
- 임포트 후 백그라운드 place_id 보강 (`enrichPlaceIds()`)
- 구글맵 버튼: placeId → place_id URL / 없으면 이름+주소 검색 URL
- 장소 삭제 / 현장 탭으로 이동

**저장 데이터 구조 (localStorage `tokyoPlaces`):**
```json
{
  "name": "一蘭 新宿店",
  "category": "restaurant",
  "address": "東京都...",
  "rating": 4.2,
  "ratingCount": 1500,
  "lat": 35.6895,
  "lng": 139.6917,
  "placeId": "ChIJ...",
  "mapsUrl": "https://www.google.com/maps/place/?q=place_id:ChIJ..."
}
```

---

### 2. 탐색
Google Places 텍스트 검색 + 카테고리 칩 + AI 일정 생성.

**기능:**
- 카테고리 칩 클릭 → 자동 검색 (라멘/스시/이자카야/카페/돈카츠/관광지/쇼핑)
- 검색 결과 카드 → 구글맵 링크, 리스트 저장
- AI 일정 짜기 (접이식): 여행 기간·관심사·숙소 위치 입력 → Claude로 최적화 일정 생성

---

### 3. 현장 도우미
메뉴판 사진 분석 (최대 4장). 세 가지 뷰로 구성.

**View 1 — 입력:**
- 사진 최대 4장 업로드 (캔버스로 JPEG 변환, 1200px 리사이즈)
- 업체명 수동 입력 (선택, AI 추정 보정용)

**View 2 — 분석 결과:**
- Claude에 이미지 블록 + 텍스트 프롬프트 전송
- 응답 파싱 형식:
  ```
  [BIZNAME]: 업체명
  [BIZTYPE]: 식당종류
  [ITEMS]: JP|KR|가격|설명|star (줄 단위)
  [RECOMMEND]: 추천 멘트
  [TIP]: 팁
  ```
- 메뉴 카드 렌더링 (일본어/한국어/가격/추천 뱃지)
- 내 리스트 저장 / 주문 도우미로 이동

**View 3 — 주문 도우미:**
- 현재 업체 컨텍스트 기반으로 주문 표현 6~8개 생성
- 【표현제목】【일본어】【발음】【뜻】 형식 파싱 → 카드 렌더링

---

### 4. 번역·교통

#### 대화 번역

**프리셋 칩 (API 없음, 즉시 렌더):**
| 칩 | DB 키 |
|---|---|
| 🍜 식당 주문 | 8개 표현 |
| 🏪 편의점 | 7개 표현 |
| 🗺️ 길 묻기 | 6개 표현 |
| 🏨 체크인 | 7개 표현 |
| 🏥 응급 | 7개 표현 |
| 💴 쇼핑 | 7개 표현 |

**동적 DB (localStorage `phraseDB`):**
- 커스텀 질문 → `findDBKey()` 키워드 매칭 → DB에 있으면 즉시 렌더
- DB 미스 → Claude 호출 → `parseClaudeToPhrase()` → 2개 이상 파싱 시 자동 저장
- 카테고리 키: 어미 제거 후 15자 이내로 자동 생성

**표현 상세 시트 (카드 탭 시):**
- 큰 일본어 텍스트 + 발음 + 한국어 의미
- 💬 돌아오는 말: `REPLY_DB` (20개 표현 사전 저장)
- DB 미등록 표현: "AI로 답변 예시 보기" → Claude 호출 → 세션 캐시
- 직원 보여주기: 풀스크린 흰 배경에 48px 일본어 표시

#### 교통·길찾기

**인기 구간 6개 (API 없음, `ROUTE_DB` 즉시 렌더):**
| 구간 | 소요 | 요금 |
|---|---|---|
| 나리타공항 → 신주쿠 | 약 80~90분 | ¥1,050~3,070 |
| 하네다공항 → 신주쿠 | 약 30분 | ¥460~ |
| 신주쿠 → 아사쿠사 | 약 35~40분 | ¥210~ |
| 신주쿠 → 도쿄타워 | 약 20분 | ¥210 |
| 신주쿠 → 시부야 | 약 5분 | ¥160 |
| 도쿄역 → 우에노 | 약 8분 | ¥160 |

각 항목: 복수 옵션(빠름/저렴/편리), 단계별 경로 카드(노선 색상 배지·정거장 수), 팁

**커스텀 경로 검색:**
1. `/api/maps?type=directions` → Google Directions API (transit 모드)
2. 실패 시 → Claude 자연어 안내 폴백
3. 구글맵으로 보기 버튼: `maps/dir/?api=1&travelmode=transit`

---

## API 엔드포인트

### `POST /api/claude`
Anthropic API 프록시. `req.body`를 그대로 전달.

```js
// 사용 예
callClaude(systemPrompt, [{ role: 'user', content: '...' }])
// model: 'claude-sonnet-4-6', max_tokens: 1200
```

### `GET /api/maps`

| `type` | 파라미터 | 설명 |
|---|---|---|
| `search` | `query` | Places textsearch |
| `details` | `place_id` | Place details (전화/영업시간/URL 등) |
| `expand` | `url` | 단축 URL 확장 + 리스트 파싱 |
| `directions` | `origin`, `destination` | Directions API (transit) |

**`expand` 동작 흐름:**
```
maps.app.goo.gl/XXX
  → redirect: manual → Location 헤더 확인
  → /maps/@/ + !2s → 저장 리스트
    → Maps HTML fetch → entitylist preload URL 추출
    → 리스트 JSON fetch → 장소 파싱 (regex)
  → 단일 장소 → URL에서 이름 추출
```

---

## 클라이언트 주요 함수

### 내 리스트
| 함수 | 설명 |
|---|---|
| `renderList()` | localStorage → 카드 렌더 (빈 상태 인라인 HTML) |
| `buildPlaceCard(p, i)` | placeId → place_id URL / mapsUrl / 이름 검색 폴백 |
| `detectTags(name, category)` | 한자·히라가나·카타카나 패턴 → #라멘 #카페 등 |
| `importSelected()` | 체크된 항목만 저장 + enrichPlaceIds() 백그라운드 실행 |
| `enrichPlaceIds(names)` | Places API로 place_id 조회 후 mapsUrl 업그레이드 |
| `renderImportUI(places, listName)` | 체크박스 선택 UI 렌더 |

### 번역
| 함수 | 설명 |
|---|---|
| `getFullDB()` | PHRASE_DB + localStorage phraseDB 병합 |
| `findDBKey(query)` | 조사 제거 후 단어 겹침 스코어로 DB 키 매칭 |
| `saveToUserDB(key, phrases)` | localStorage phraseDB에 저장 |
| `parseClaudeToPhrase(text)` | 【일본어】블록 파싱 → [{label,jp,rom,kr,tip}] |
| `showPhraseDetail(idx)` | 바텀 시트: 큰 표시 + REPLY_DB 돌아오는 말 |
| `openShowScreen()` | 풀스크린 직원 보여주기 |

### 교통
| 함수 | 설명 |
|---|---|
| `usePreset(i)` | ROUTE_DB[i] 있으면 즉시 렌더, 없으면 API 호출 |
| `renderStoredRoute(route)` | ROUTE_DB 데이터 → 경로 카드 HTML |
| `searchRoute()` | Directions API → renderDirections() → 실패 시 Claude |
| `renderDirections(data)` | API 응답 → 단계별 카드 (노선 색상·정거장) |

---

## 데이터 업데이트 가이드

### 인기 구간 추가/수정
`public/index.html` 내:
```js
// 1. POPULAR_ROUTES에 항목 추가
const POPULAR_ROUTES = [
  ...
  { icon:'🌊', label:'신주쿠 → 오다이바', hint:'약 30분', from:'新宿駅', to:'お台場' },
];

// 2. ROUTE_DB에 같은 인덱스로 데이터 추가
const ROUTE_DB = [
  ...
  {
    totalTime: '약 30분',
    options: [
      { name:'린카이선 직통', time:'30분', fare:'¥400', tag:'추천' },
    ],
    steps: [
      { type:'transit', icon:'🚇', line:'りんかい線', lineColor:'#00529C',
        lineTextColor:'#fff', from:'新宿', to:'国際展示場', stops:5, duration:'25분' },
      { type:'walk', duration:'5분', desc:'국제전시장역 → 오다이바 해변공원' },
    ],
    tip:'유리카모메선으로 레인보우브릿지 전망 가능. 오다이바 시사이드파크역 하차.'
  },
];
```

### 번역 표현 카테고리 추가
`PHRASE_DB` 객체에 키-배열 추가:
```js
'온천 에티켓': [
  { label:'수건 반입 불가', jp:'タオルを持ち込まないでください。', rom:'타오루오 모치코마나이데 쿠다사이', kr:'수건을 가지고 들어가지 마세요.' },
  ...
],
```

---

## 폰 테스트 방법
1. 브라우저에서 `https://tokyo-ai-guide.vercel.app` 접속
2. iOS: 공유 → 홈 화면에 추가 / Android: 메뉴 → 홈 화면에 추가 (PWA)

## 배포
```bash
git add . && git commit -m "변경사항"
git push
vercel --prod
```
