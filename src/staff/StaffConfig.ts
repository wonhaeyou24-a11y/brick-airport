import type { GroundOperationType, StaffRole } from "../core/GameState";
import { CURRENT_LOCALE, type Locale } from "../i18n/strings";

/**
 * StaffConfig — tuning numbers for the V0.9 staff layer (spec §4).
 *
 * Pure constants, no Three.js, no game logic. Balance values live here so the
 * managers stay stable.
 */
export interface StaffRoleConfig {
  /** Player-facing name. */
  label: string;
  /** The ground operation this role performs (spec §1). */
  operation: GroundOperationType;
  /** Base skill for a fresh hire (0–100). */
  skill: number;
  /** Wage — charged periodically via Economy.paySalaries() (V2.2). */
  salary: number;
  /** One-off cost to hire another of this role (spec §B.3). */
  hiringCost: number;
}

export const STAFF_CONFIG = {
  role: {
    GROUND_AGENT: {
      label: "Ground Agent",
      operation: "BOARDING_SERVICE",
      skill: 70,
      salary: 80,
      hiringCost: 700,
    },
    CLEANING_AGENT: {
      label: "Cleaning Agent",
      operation: "CLEANING",
      skill: 70,
      salary: 70,
      hiringCost: 550,
    },
    FUEL_OPERATOR: {
      label: "Fuel Operator",
      operation: "REFUELING",
      skill: 75,
      salary: 100,
      hiringCost: 850,
    },
    BAGGAGE_AGENT: {
      label: "Baggage Agent",
      operation: "BAGGAGE",
      skill: 70,
      salary: 75,
      hiringCost: 600,
    },
  } as Record<StaffRole, StaffRoleConfig>,

  /** Walking speed, units per second (defaultStaff / hireStaff seed this). */
  speed: 6,

  /**
   * Skill → operation-duration modifier (spec §D.3). skill 50 ≈ 1.0 (normal),
   * 70 ≈ 0.9 (a little faster), 90 ≈ 0.8 (faster). Deliberately gentle.
   */
  skillNeutral: 50,
  skillDivisor: 200,
  skillModMin: 0.78,
  skillModMax: 1.12,
  /** Deterministic per-hire skill spread so staff of a role differ a little. */
  skillJitter: 12,

  /** Name pool for new hires. */
  names: [
    "Kim",
    "Lee",
    "Park",
    "Choi",
    "Jung",
    "Han",
    "Yoon",
    "Oh",
    "Seo",
    "Lim",
    "Bae",
    "Shin",
  ] as readonly string[],

  ROLES: [
    "GROUND_AGENT",
    "CLEANING_AGENT",
    "FUEL_OPERATOR",
    "BAGGAGE_AGENT",
  ] as readonly StaffRole[],
} as const;

const OP_TO_ROLE: Record<string, StaffRole> = {
  BAGGAGE: "BAGGAGE_AGENT",
  CLEANING: "CLEANING_AGENT",
  REFUELING: "FUEL_OPERATOR",
  BOARDING_SERVICE: "GROUND_AGENT",
};

/** The role that performs a ground operation of this type (spec §1, §C.1). */
export function roleForOperation(type: GroundOperationType): StaffRole {
  return OP_TO_ROLE[type] ?? "GROUND_AGENT";
}

export function staffRoleConfig(role: StaffRole): StaffRoleConfig {
  return STAFF_CONFIG.role[role];
}

/** Korean player-facing role names (V1.4-i18n) — kept beside the English `label`. */
const STAFF_ROLE_KO: Record<StaffRole, string> = {
  GROUND_AGENT: "지상 요원",
  CLEANING_AGENT: "청소 요원",
  FUEL_OPERATOR: "급유 요원",
  BAGGAGE_AGENT: "수하물 요원",
};

export function staffRoleLabel(role: StaffRole, locale: Locale = CURRENT_LOCALE): string {
  return locale === "ko" ? STAFF_ROLE_KO[role] : STAFF_CONFIG.role[role].label;
}

/** Multiplier applied to an operation's duration for a given staff skill. */
export function staffSkillModifier(skill: number): number {
  const raw = 1 - (skill - STAFF_CONFIG.skillNeutral) / STAFF_CONFIG.skillDivisor;
  return Math.max(
    STAFF_CONFIG.skillModMin,
    Math.min(STAFF_CONFIG.skillModMax, raw),
  );
}
