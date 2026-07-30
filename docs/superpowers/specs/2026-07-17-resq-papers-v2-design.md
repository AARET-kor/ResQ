# ResQ — Papers v2 설계: 풀텍스트 리포트 (성형외과 파일럿)

> 초록 요약 → **논문 전체를 읽고 한/영 병기 구조화 리포트를 생성·보관**. 성형외과부터.
> 작성일: 2026-07-17 · 전제: Slice 5(papers 기본형) 완료.

## 1. 요구 (사용자)
- 매주/매달 전공 최신 논문 + **학회지**(Thieme 등) 수집·업데이트.
- 초록만이 아니라 **논문 전반을 읽고 분석한 최종 레포트**.
- **영어 + 한글 번역 병기**로 바로 읽히게.
- 성형외과 하나만 먼저.

## 2. 소스 전략 (합법 경로만)
| 경로 | 커버 | 방식 |
|---|---|---|
| PubMed 메타데이터 | 모든 저널의 서지+초록 | 기존 esearch/efetch + **저널 필터**(`[ta]`) + **기간 필터**(reldate 7/30일) |
| **PMC 풀텍스트** | 오픈액세스 논문 전문 | efetch(db=pmc) XML → 본문 섹션 추출 → 리포트 |
| **PDF 업로드** | 기관구독 등 사용자가 가진 논문 | PDF를 Edge Function으로 → Claude가 문서 통째로 읽고 리포트 |

**성형외과 저널 레지스트리** (`src/lib/sources.ts`, config):
PRS · **Archives of Plastic Surgery (대한성형외과학회지, Thieme, OA)** · JPRAS · Aesthetic Plastic Surgery · Aesthetic Surgery Journal · Arch Craniofac Surg (OA) · J Reconstr Microsurg (Thieme).
→ Thieme 요구는 APS/JRM을 PubMed 메타데이터+PMC로 커버. 유료지 본문 스크래핑은 하지 않음(명시적 제외).

## 3. 리포트 형식 (Edge Function v2, 한/영 병기)
각 섹션 한국어 본문 + 영어 요약 병기:
요약(3줄) / 연구 배경 / 방법 / 핵심 결과 / 고찰·임상적 의의 / 한계 / **전공의 관점 포인트**.
- 입력 모드: `abstract`(기존) | `report`(fulltext 텍스트 or PDF base64).
- 모델 claude-sonnet-5, 키는 서버측. 미배포 시 기존 fallback 유지.

## 4. 데이터
`paper_analyses` 확장(0006): `kind`('abstract'|'report'), `has_fulltext`, `source`(저널/‘pdf’).
저장된 리포트 = **내 레포트 라이브러리**(목록에서 재열람). PDF는 `pmid='pdf-<ts>'` 서러게이트 키.

## 5. UI (PapersSection v2)
- 컨트롤: **기간(최근 7일/30일)** + **저널 칩 필터**(전공 레지스트리 있을 때) + 새로 불러오기.
- 카드: OA/원문분석가능 배지.
- 드로어: 구조화 리포트(한/영), **.md 다운로드**, 원문 링크.
- **PDF 업로드 카드** → 리포트 생성.
- **내 레포트** 목록(저장본 재열람).

## 6. 로드맵/제외
- 주간 **자동** 수집·리포트(서버 cron) → pg_cron+scheduled function, 다음 slice (기간 필터로 수동 주간/월간 업데이트는 이번에 제공).
- 유료지 본문 스크래핑 ❌ (확정 제외). 타 전공 저널 레지스트리 확장은 config 추가만.
- 마스코트: 성형외과 = **공작**(🦚) 추가.
