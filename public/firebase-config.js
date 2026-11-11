/* 이 파일만 본인 값으로 채우면 됩니다. (Firebase 콘솔 → 프로젝트 설정 → 일반 → 내 앱 → 웹 앱의 SDK 설정)
   apiKey 등은 공개되어도 괜찮은 값입니다. 데이터 보호는 로그인 + firestore.rules 가 담당합니다. */
window.FIREBASE_CONFIG = {
  apiKey: "여기에_apiKey",
  authDomain: "여기에_프로젝트ID.firebaseapp.com",
  projectId: "여기에_프로젝트ID",
  appId: "여기에_appId"
};
/* 로그인을 허용할 구글 계정 이메일 (firestore.rules 의 이메일과 똑같이 맞추세요) */
window.ALLOWED_EMAIL = "여기에_내_구글_이메일";
/* (선택) 기초자산 시세 조회용 Cloud Function 주소. 비워 두면 시세는 표시되지 않습니다. 자세한 내용은 README 참고 */
window.PRICE_API_URL = "";
