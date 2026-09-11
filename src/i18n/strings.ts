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
  recentFlights: { ko: "최근 항공편", en: "Recent Flights" },
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
