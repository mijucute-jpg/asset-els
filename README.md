# asset-els — 통합 자산관리 ELS 탭 (Firebase 복사본)

기존 Apps Script/구글시트 버전의 ELS 탭을 Firebase(Hosting + Firestore + 구글 로그인)로 옮긴 복사본입니다.

## 처음 한 번만 설정
1. Firebase 콘솔에서 **새 프로젝트**(연습용)를 만들고 Authentication → 로그인 방법 → **Google** 사용 설정, Firestore Database 생성.
2. 프로젝트 설정 → 내 앱 → **웹 앱 추가** 후 나오는 설정값을 `public/firebase-config.js` 에 입력. `ALLOWED_EMAIL` 에 본인 구글 이메일 입력.
3. `firestore.rules` 의 `여기에_내_구글_이메일` 을 같은 이메일로 교체.
4. 터미널에서 `firebase use --add` 로 프로젝트 선택 후 `firebase deploy --only hosting,firestore`.
5. Authentication → 설정 → 승인된 도메인에 배포 주소(`프로젝트ID.web.app`)가 들어 있는지 확인.
6. 배포된 화면에서 로그인 → 상단 **시트 CSV 가져오기** 로 기존 ELS 시트(파일 → 다운로드 → CSV)를 올리면 데이터가 이전됩니다.

## 자동배포 (GitHub)
`firebase init hosting:github` 를 한 번 실행하면 저장소에 변경이 올라갈 때마다 자동으로 배포됩니다.

## 시세 조회(선택)
**무료 방법(추천):** 기존 Apps Script 웹앱의 주소(`https://script.google.com/macros/s/…/exec`)를 `public/firebase-config.js` 의 `PRICE_API_URL` 에 넣으면 됩니다. (최신 `Code.gs` 로 교체 후 새 버전 배포 필요, 웹앱 접근 권한은 "모든 사용자")

**Cloud Function 방법:**
기초자산 현재가/전일종가는 외부 사이트 조회가 필요해 Cloud Function(`functions/`)이 필요합니다(Blaze 요금제).
`functions/index.js` 의 이메일을 바꾸고 `firebase deploy --only functions` 후, 나온 `stockPrices` 주소를 `PRICE_API_URL` 에 넣으세요.
(firebase.json 에 `"functions": {"source": "functions"}` 추가 필요) 설정하지 않으면 시세 없이 나머지 기능은 정상 동작합니다.

## 대출 · 부동산 탭
- 데이터는 Firestore(`loans`, `realestate_watch`)에 저장합니다. 각 탭의 **대출 목록 관리 / 관심단지 관리** 버튼으로 추가·수정·삭제하고, 구글시트 해당 탭을 CSV로 내려받아 **CSV 가져오기**로 옮길 수 있습니다.
- 부동산 실거래 조회는 Apps Script(국토부 인증키 보유)를 JSONP로 호출합니다. 최신 `Code.gs`로 교체 후 새 버전 배포가 필요합니다(`PRICE_API_URL` 사용).
- 신규 실거래 메일/문자 알림은 계속 Apps Script가 시트의 관심단지 목록으로 보냅니다. 관심단지를 바꾸면 시트에도 같이 반영해야 알림이 맞습니다.
- `firestore.rules` 가 바뀌었으므로 `firebase deploy --only firestore` 를 한 번 실행해야 합니다.
