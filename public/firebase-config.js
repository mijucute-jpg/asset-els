/* 이 파일만 본인 값으로 채우면 됩니다. (Firebase 콘솔 → 프로젝트 설정 → 일반 → 내 앱 → 웹 앱의 SDK 설정)
   apiKey 등은 공개되어도 괜찮은 값입니다. 데이터 보호는 로그인 + firestore.rules 가 담당합니다. */
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyDp9a9As3J_ctaNcumfQ8nzXSIDZMSOSNI",
  authDomain: "miju-els.firebaseapp.com",
  projectId: "miju-els",
  appId: "1:145680720137:web:bb60eae1e6c13da9db73d8"
};
/* 로그인을 허용할 구글 계정 이메일 (firestore.rules 의 이메일과 똑같이 맞추세요) */
window.ALLOWED_EMAIL = "mijucute@gmail.com";
/* (선택) 기초자산 시세 조회용 Cloud Function 주소. 비워 두면 시세는 표시되지 않습니다. 자세한 내용은 README 참고 */
window.PRICE_API_URL = "https://script.google.com/macros/s/AKfycbwhXa99dETHtZVkO-vsr31kW4FCvut2aJPxh8ODDBEddLEs9jfwM-JAhHTCDXzozCwCUw/exec";
