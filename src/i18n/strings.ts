/**
 * i18n — display-only string/number formatting (V1.4).
 *
 * GameState never stores a formatted string or a currency symbol — `money`
 * stays a plain number everywhere in the data/logic layers (spec §16's own
 * instruction). This module is the single place that turns numbers and
 * lookup keys into locale text for the HUD to render.
 *
 * Default locale is ko-KR (spec §15). Swapping CURRENT_LOCALE to "en" is all
 * a future language switcher would need to change.
 */
export type Locale = "ko" | "en";

export let CURRENT_LOCALE: Locale = "ko";

export function setLocale(locale: Locale): void {
  CURRENT_LOCALE = locale;
}

/** money: number -> "12,480,000원" (ko) or "$12,480" (en). Never stored back. */
export function formatMoney(amount: number, locale: Locale = CURRENT_LOCALE): string {
  const n = Math.round(amount);
  return locale === "ko"
    ? `${n.toLocaleString("ko-KR")}원`
    : `$${n.toLocaleString("en-US")}`;
}

/** A short "+12,480,000원" / "+$12,480" pop, reusing the same money format. */
export function formatMoneyDelta(amount: number, locale: Locale = CURRENT_LOCALE): string {
  const sign = amount < 0 ? "-" : "+";
  return `${sign}${formatMoney(Math.abs(amount), locale)}`;
}

const DICT: Record<string, Record<Locale, string>> = {
  // Top stat bar
  level: { ko: "레벨", en: "Level" },
  balance: { ko: "잔액", en: "Money" },
  aircraft: { ko: "항공기", en: "Aircraft" },
  gate: { ko: "게이트", en: "Gate" },
  passengers: { ko: "승객", en: "Pax" },
  flights: { ko: "항공편", en: "Flights" },
  staff: { ko: "직원", en: "Staff" },

  // Buttons
  build: { ko: "건설", en: "BUILD" },
  save: { ko: "저장", en: "SAVE" },
  load: { ko: "불러오기", en: "LOAD" },
  grid: { ko: "격자", en: "GRID" },
  reset: { ko: "초기화", en: "RESET" },
  cancel: { ko: "취소", en: "Cancel" },
  expand: { ko: "확장", en: "EXPAND" },

  // Panel titles
  missions: { ko: "임무", en: "Missions" },
  operationalEvent: { ko: "운영 이벤트", en: "Operational Event" },
  recentFlights: { ko: "최근 운항", en: "Recent Flights" },
  activeFlights: { ko: "현재 운항", en: "Current Flights" },
  groundOperations: { ko: "지상조업", en: "Ground Operations" },
  airportStatistics: { ko: "공항 통계", en: "Airport Statistics" },
  operations: { ko: "운영 현황", en: "Operations" },
  selected: { ko: "선택됨", en: "SELECTED" },
  airportExpansion: { ko: "공항 확장", en: "Airport Expansion" },
  locked: { ko: "잠김", en: "LOCKED" },
  buildMode: { ko: "건설 모드", en: "BUILD MODE" },
  facility: { ko: "시설", en: "Facility" },
  serviceFacility: { ko: "서비스 시설", en: "Service facility" },
  cell: { ko: "칸", en: "Cell" },

  // Statistics grid
  statFlights: { ko: "항공편", en: "Flights" },
  statPassengers: { ko: "승객", en: "Passengers" },
  statRevenue: { ko: "수익", en: "Revenue" },
  statBalance: { ko: "잔액", en: "Balance" },
  statAvg: { ko: "평균 승객/항공편", en: "Avg Pax / Flight" },
  statBoarding: { ko: "탑승률", en: "Boarding Rate" },

  // Operations grid
  opService: { ko: "서비스", en: "Service" },
  opSatisfaction: { ko: "만족도", en: "Satisfaction" },
  opOnTime: { ko: "정시율", en: "On-time" },
  opGround: { ko: "지상효율", en: "Ground Eff" },
  opReputation: { ko: "평판", en: "Reputation" },

  // Selection field labels
  flight: { ko: "항공편", en: "Flight" },
  route: { ko: "노선", en: "Route" },
  status: { ko: "상태", en: "Status" },
  state: { ko: "상태", en: "State" },
  aircraftState: { ko: "항공기 상태", en: "Aircraft State" },
  progress: { ko: "진행", en: "Progress" },
  operation: { ko: "작업", en: "Operation" },
  role: { ko: "역할", en: "Role" },
  skill: { ko: "숙련도", en: "Skill" },
  satisfaction: { ko: "만족도", en: "Satisfaction" },
  experience: { ko: "경험", en: "Experience" },
  waiting: { ko: "대기 시간", en: "Waiting" },
  level2: { ko: "레벨", en: "Level" },
  capacity: { ko: "수용 인원", en: "Capacity" },
  comfort: { ko: "쾌적함", en: "Comfort" },
  service: { ko: "서비스", en: "Service" },
  type: { ko: "종류", en: "Type" },
  groundService: { ko: "지상조업 현황", en: "Ground Service" },

  // Save status
  saved: { ko: "저장됨", en: "SAVED" },
  saveError: { ko: "저장 오류", en: "SAVE ERROR" },

  // Airport status indicator (V1.5 §6, extended V1.8 §6-7)
  statusNormal: { ko: "정상 운영", en: "Normal Operations" },
  statusCongested: { ko: "혼잡", en: "Congested" },
  statusGroundDelay: { ko: "지상조업 지연", en: "Ground Delay" },
  statusStaffShortage: { ko: "직원 부족", en: "Staff Shortage" },
  statusFlightBacklog: { ko: "항공편 대기", en: "Flights Waiting" },
  statusEvent: { ko: "이벤트 발생", en: "Event Active" },
  statusAttention: { ko: "운영 주의", en: "Attention" },
  statusCritical: { ko: "운영 문제", en: "Operations Blocked" },

  // Action Center (V1.8 §8) + new Operations-grid summary cards (§4)
  actionCenter: { ko: "확인 필요", en: "Action Center" },
  opAvailableGates: { ko: "게이트 여유", en: "Gates Free" },
  opActiveOperations: { ko: "진행 작업", en: "Active Ops" },
  staffHire: { ko: "직원 채용", en: "Hire Staff" },
};

export function t(key: keyof typeof DICT, locale: Locale = CURRENT_LOCALE): string {
  return DICT[key]?.[locale] ?? String(key);
}

/** Player-facing labels for GameState enum values that reach the HUD as text. */
const ENUM_KO: Record<string, string> = {
  // AircraftState
  PARKED: "주기 중",
  TAXIING: "지상 이동 중",
  TAKEOFF: "이륙 중",
  FLYING: "비행 중",
  LANDING: "착륙 중",
  // FlightState
  SCHEDULED: "예정",
  BOARDING: "탑승 중",
  READY: "준비 완료",
  DEPARTING: "출발 중",
  ARRIVING: "도착 중",
  COMPLETED: "완료",
  CANCELLED: "취소됨",
  // GateStatus
  AVAILABLE: "사용 가능",
  OCCUPIED: "사용 중",
  // PassengerState
  WAITING: "대기 중",
  TO_TERMINAL: "터미널 이동 중",
  CHECK_IN: "체크인 중",
  TO_GATE: "게이트 이동 중",
  BOARDED: "탑승 완료",
  DISEMBARKING: "하기 중",
  TO_TERMINAL_AFTER_ARRIVAL: "터미널 이동 중",
  ARRIVED: "도착 완료",
  // Ground operation / staff / vehicle states
  PENDING: "대기",
  ASSIGNED: "배정됨",
  IN_PROGRESS: "진행 중",
  IDLE: "대기",
  MOVING: "이동 중",
  WORKING: "작업 중",
  RETURNING: "복귀 중",
  BREAK: "휴식",
  UNAVAILABLE: "사용 불가",
  ACTIVE: "진행 중",
  RESOLVED: "해결됨",
  EXPIRED: "만료됨",
  // GroundOperationType (turnaround task names)
  BAGGAGE: "수하물 처리",
  CLEANING: "청소",
  REFUELING: "급유",
  BOARDING_SERVICE: "탑승 서비스",
};

/** Translate one GameState enum value for display; unknown values pass through as-is. */
export function stateLabel(value: string, locale: Locale = CURRENT_LOCALE): string {
  if (locale !== "ko") return value;
  return ENUM_KO[value] ?? value;
}

/**
 * Route city display names (V1.5 spec §31) — internal FlightData.origin /
 * .destination stay "SEOUL" / "TOKYO" / ... exactly as today; this is a
 * display-only label, never written back into GameState.
 */
const CITY_KO: Record<string, string> = {
  SEOUL: "서울",
  TOKYO: "도쿄",
  BUSAN: "부산",
  BANGKOK: "방콕",
  PARIS: "파리",
  // V2.1 content expansion — Lv.4/Lv.5 long-haul destinations.
  NEW_YORK: "뉴욕",
  DUBAI: "두바이",
};

export function cityLabel(id: string, locale: Locale = CURRENT_LOCALE): string {
  if (locale !== "ko") return id;
  return CITY_KO[id] ?? id;
}

/**
 * Mission pool titles (V1.5 §9/§30) — keyed by the English title already
 * stored as MissionTemplate.title (MissionConfig.ts), so the pool itself
 * never duplicates its own key. MissionManager resolves this once, at
 * mission-creation time, into the MissionData it stores — no new field.
 */
const MISSION_TITLE_KO: Record<string, string> = {
  "First Flights": "첫 항공편",
  "Passengers Served": "승객 처리",
  "Grow the Airport": "공항 확장",
  "Ground Crew at Work": "지상조업 가동",
  "Turn a Profit": "흑자 전환",
  "Build the Team": "팀 구성",
  "Busy Skies": "바쁜 하늘",
  "Full Terminals": "만원 터미널",
  "Steady Income": "안정적 수입",
  "Turnaround Machine": "턴어라운드 달인",
  "Fully Staffed": "정원 충원",
  "Terminal Expansion": "터미널 확장",
  "Regional Hub": "지역 허브",
  "Passenger Milestone": "승객 이정표",
  "Airport Fortune": "공항의 부",
  "Passenger Amenities": "승객 편의시설",
  "Happy Travelers": "행복한 여행객",
  "Airport Services": "공항 서비스",
  "Five-Star Airport": "5성급 공항",
};

export function missionTitle(enTitle: string, locale: Locale = CURRENT_LOCALE): string {
  if (locale !== "ko") return enTitle;
  return MISSION_TITLE_KO[enTitle] ?? enTitle;
}

/**
 * Operational-event flavour text (V1.5 §9/§30), keyed by the event type enum
 * — OperationalEventManager resolves this once at event-creation time into
 * the OperationalEventData it stores, same pattern as missionTitle above.
 */
const EVENT_TEXT_KO: Record<string, { title: string; description: string }> = {
  PASSENGER_SURGE: {
    title: "승객 급증",
    description: "공항에 여행객이 몰리고 있습니다 — 계속 이동시키세요.",
  },
  FLIGHT_DEMAND: {
    title: "항공편 수요 증가",
    description: "항공사들이 더 많은 슬롯을 원합니다 — 항공편을 몇 편 더 처리하세요.",
  },
  GROUND_DELAY: {
    title: "지상조업 지연",
    description: "턴어라운드 작업이 밀리고 있습니다 — 지상 작업을 처리하세요.",
  },
  MAINTENANCE_REQUEST: {
    title: "정비 요청",
    description: "다음 턴어라운드 때 게이트 점검이 필요합니다.",
  },
  STAFF_SHORTAGE: {
    title: "직원 부족",
    description: "인력이 부족합니다 — 직원을 추가로 채용하세요.",
  },
  // AirportEventType (V0.7-E flavour events) — a separate enum from
  // OperationalEventType above, but reusing this same lookup: no reason for
  // two dictionaries when the wording fits (V1.9 §22 localization cleanup —
  // these two titles/descriptions had been left in English since V0.7).
  FLIGHT_DELAY: {
    title: "항공편 지연",
    description: "출발이 지연되었습니다.",
  },
  SERVICE_BONUS: {
    title: "서비스 보너스",
    description: "직원들의 컨디션이 좋습니다 — 서비스와 만족도가 상승합니다.",
  },
};

export function eventTitle(type: string, enTitle: string, locale: Locale = CURRENT_LOCALE): string {
  if (locale !== "ko") return enTitle;
  return EVENT_TEXT_KO[type]?.title ?? enTitle;
}

export function eventDescription(
  type: string,
  enDescription: string,
  locale: Locale = CURRENT_LOCALE,
): string {
  if (locale !== "ko") return enDescription;
  return EVENT_TEXT_KO[type]?.description ?? enDescription;
}
