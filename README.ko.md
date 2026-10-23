<p align="center"><a href="https://bitefoundry.github.io/retrieviewer/?lang=ko"><img src="https://raw.githubusercontent.com/BiteFoundry/retrieviewer/main/docs/assets/preview.png" alt="흑백 점자 도트로 그린 보송한 리트리버 Retrieviewer" width="960"></a></p>
<h1 align="center">Retrieviewer</h1>
<p align="center">일하는 화면에, 작은 친구 하나.</p>
<p align="center"><a href="https://bitefoundry.github.io/retrieviewer/?lang=ko">직접 만나 보기</a> · <a href="README.md">English</a> · <a href="https://www.npmjs.com/package/@bitefoundry/retrieviewer">npm</a> · <a href="https://github.com/BiteFoundry/retrieviewer/issues">피드백</a></p>

앱 창 위에서 혼자 걷고, 뛰고, 앉아서 쉬는 보송한 점자 도트 리트리버예요.
가끔 공을 던져주고 간식을 주세요. 나머지 시간에는 각자의 일을 하면 돼요.
[BiteFoundry](https://github.com/BiteFoundry)가 만듭니다.
런타임에는 계정, 모델 API, 텔레메트리가 필요하지 않아요.

## 데려오기

**앱 화면이 보이는 컴퓨터**의 터미널에서 실행하세요.
Node.js/npm이 없다면 [먼저 설치](PREREQUISITES.md)해 주세요.

1. 설치 또는 업데이트:

   ```sh
   npm install -g @bitefoundry/retrieviewer@latest
   ```

2. 실행한 뒤, 선택창에서 강아지를 붙일 앱 창을 고르세요.

   ```sh
   retrieviewer desktop
   ```

다음부터는 `retrieviewer desktop`만 실행하면 돼요. 앱을 개조하거나 MCP로
그림을 주입하지 않아요. 별도의 투명 네이티브 창으로 따라다니며 일반 클릭은
통과시킵니다. 앱 창 단위로 동작하고, 대상 창이 비활성화·최소화되면 숨습니다.
자동 시작이나 셸 래퍼는 등록하지 않아요.

> **Cursor / VS Code Remote SSH 사용자:** 원격 서버의 터미널이 아닌,
> Cursor 화면이 떠 있는 **로컬 PC의 PowerShell/터미널**에 설치하세요.
> 서버의 `DISPLAY=:1`은 서버 쪽 X11 화면을 뜻합니다. VNC로 그 화면을 보고
> 있다면 그 안에서 쓸 수 있지만, 로컬 Cursor 창에 자동으로 붙는 것은 아니에요.

<details>
<summary>npx로 한 번 써보기 / 명령을 찾을 수 없을 때</summary>

```sh
npx --yes --package @bitefoundry/retrieviewer@latest retrieviewer desktop
```

`npx`는 영구 명령 등록이 아니에요. 이후 짧은 명령으로 실행하려면 위의 전역
설치를 해주세요. 전역 설치 후에도 command not found라면 npm 실행 경로를
PATH에 넣어야 해요. [bash·csh/tcsh·Windows별 안내](PREREQUISITES.md#command-not-found).
무조건 sudo npm으로 해결하지 마세요.

</details>

## Node.js가 없다면

- **Windows:** [공식 Node.js 설치 페이지](https://nodejs.org/en/download)의
  Windows 설치 파일을 쓰세요. npm·PATH 추가 옵션을 유지하고 PowerShell을 새로 여세요.
- **macOS:** 같은 공식 페이지의 macOS 설치 파일을 쓰세요. 다만 강아지의 macOS
  오버레이는 아직 실기 검증 전인 실험적 지원이에요.
- **AlmaLinux8:** 관리자와 Node22 모듈 사용을 확인하세요. 기존 Node 스트림이 없는
  환경이라면 `sudo dnf module install nodejs:22`를 사용할 수 있어요.
  회사 관리 환경의 모듈을 임의로 reset하거나 바꾸지 마세요.
- `node --version`, `npm --version`으로 확인하세요. 패키지는 Node20+를 요구하고,
  Alma8에서는 Node22.23.4를 검증했어요. [자세한 의존 도구·PATH 안내](PREREQUISITES.md).

## 지원 환경

| 환경 | 상태와 필요 조건 |
| --- | --- |
| Windows10/11 x64 | 실제 실행 검증. Node + .NET Framework4 컴파일러. 처음 실행 시 헬퍼 자동 빌드. |
| Linux X11 | AlmaLinux8 / GLIBC2.28 / Python3.6.8 / Node22.23.4를 격리된 GUI에서 검증. Python3.6+, X11/Xrender/Xext, compositor 필요. |
| macOS | **실험적 지원. 실제 Mac 실행 미검증.** 기본 osascript/AppKit 사용. |
| 네이티브 Wayland·화면 없는 SSH | 데스크톱 오버레이 미지원. 세션·보안 설정을 자동 변경하지 않아요. |

Linux는 저사양 기본값인 16px 셀·15fps, Windows는 8px 셀·30fps여서 Linux의
점이 더 거칠게 보일 수 있어요. 그림 원본은 같은 Q5 자산입니다.
무부하·초경량 도구는 아니에요. npm 압축본은 약21MB, 작은 Alma8 테스트의 Node
RSS는 약180MiB였고 Python 헬퍼 메모리는 별도예요.
[지원 범위와 검증 내용](DESKTOP-PLATFORMS.md).

## 쉽게 종료하고 제거하기

컨트롤에서 종료하거나 `retrieviewer desktop-stop`을 실행하세요.
자체 캐시와 패키지를 제거하려면:

```sh
retrieviewer desktop-remove --yes
npm uninstall -g @bitefoundry/retrieviewer
```

데스크톱 동반자는 에이전트 인증정보·실행 파일·셸 프로필을 수정하지 않아요.
별도로 [OpenCode 네이티브 등록](INSTALLING.md)을 했다면 해당 등록을 disconnect한
뒤 제거하세요. Codex/Claude/Cursor 등에 MCP만 연결해 내부 그림을 띄우는 기능은 없어요.

## 직접 만든 TUI에 붙이기

JS 플러그인과 JSONL 브리지를 제공해요. 화면·입력·시간 제어는 호스트가 소유합니다.
[English 예제](README.md#put-it-inside-your-own-tui) · [플러그인 수명주기](PLUGIN.md) ·
[코어와 브리지](EMBEDDING.md) · [기여하기](CONTRIBUTING.md).

## 코드와 그림의 라이선스는 달라요

**코드 MIT / 그림 CC BY-SA4.0.** 각 조건에 따른 상업적 재사용이 가능해요.
그림은 출처 표시와 해당하는 동일조건변경허락 의무를 지켜주세요.
패키지 전체가 MIT인 것은 아닙니다.
[그림 조건](ASSETS-LICENSE.md) · [필수 크레딧](ATTRIBUTION.md) ·
[서드파티 고지](THIRD-PARTY-NOTICES.md) · [브랜드 안내](TRADEMARKS.md).

AI로 생성한 그림에 자세 정렬·접지·프레임 처리를 적용한 애니메이션입니다.
실제 모션 캡처나 자의식이 있는 강아지라고 주장하지 않아요.
