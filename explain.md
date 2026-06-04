## 0. 크롬 확장 기능 사용 
- 봇 탐지를 우회할 수 있도록 해서 크롬 확장 프로그램을 활용함 

### 0.1 각 파일들 역할 
- manifest.json
    - 확장 프로그램 이름, 버전, 권한, 어떤 스크립트를 언제 실행하는지 브라우저에게 알려줌 
```javascript
{
  // 크롬 확장 프로그램의 플랫폼 버전을 뜻함 
  "manifest_version": 3,
  // 확장 프로그램 관리자 페이지에 표시되는 이름, 버전, 설명 
  "name": "Instagram Auto Clicker",
  "version": "1.0",
  "description": "인스타그램 특정 버튼을 자동 클릭하는 테스트용 확장 프로그램",
  // 브라우저에서 어떤 행동을 할 수 있는지 권한을 요청함 
  "permissions": [
    "activeTab",
    "scripting"
  ],
  // 백그라운드 스크립트 
  "background": {
    "service_worker": "background.js"
  },
  // 크롬 우측 상단 툴바에 나타나는 확장 프로그램 아이콘 설정 
  "action": {
    "default_title": "클릭하여 매크로 실행"
  }
}
```
- **`background.js`**: 보이지 않는 백그라운드에서 대기하다가, 사용자가 확장 프로그램 아이콘을 클릭하면 활성화된 탭(인스타그램)에 코드를 주입하는 역할을 합니다.
- **`main.js`**: 실제 인스타그램 페이지 화면 안에 주입되어, 원하는 버튼 요소를 찾아 클릭 이벤트를 전송하는 메인 스크립트입니다.


## 1. xpath 로 버튼 클릭 
- xpath 는 다른 요소들과 이름이 겹쳐도 특정 버튼이 있는 정확한 주소를 알려주는 역할을 한다. (05.30 기준으로 다음과 같음)
```plaintext
//*[@id="mount_0_0_nu"]/div/div/div[2]/div/div/div[1]/div[2]/div[2]/section/main/div/div/header/div/section[2]/div/div[3]/div[2]/a/span
```


## 2. 스크롤 내리기
- 이제 해당 xpath 안에서 스크롤 이벤트를 발생시켜서 밑으로 계속 내려야 함 
```plaintext
/html/body/div[6]/div[2]/div/div[1]/div/div[2]/div/div/div/div/div[2]/div/div/div[3]
```