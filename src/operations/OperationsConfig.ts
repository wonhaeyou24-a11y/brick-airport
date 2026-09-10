/**
 * OperationsConfig — tuning numbers for the V0.7 operations layer
 * (service score, passenger satisfaction, on-time rate, events, reputation).
 *
 * Pure constants: zero imports, no Three.js, no game logic. Everything that
 * needs to be rebalanced later lives here so the calc modules stay stable.
 */
export const OPERATIONS_CONFIG = {
  /** Every operations metric is clamped to this range. */
  minScore: 0,
  maxScore: 100,

  // --------------------------------------------------------- service score ---
  /** Service score with no facilities built. */
  baseServiceScore: 50,
  /**
   * Service-score points the FIRST facility of each kind contributes. Extra
   * facilities of the same kind add less (facilityStackFalloff), capped at
   * facilityStackCap copies — so spamming one facility can't run away (§27, §55).
   */
  serviceBonusPerFacility: {
    CHECK_IN: 10,
    SECURITY: 10,
    BAGGAGE: 10,
    LOUNGE: 15,
  } as Record<string, number>,

  // ------------------------------------------------- passenger satisfaction ---
  /**
   * Satisfaction a passenger starts from before any bonuses / penalties.
   * Tuned so a facility-less airport sits around ~70 and a fully-equipped one
   * reaches the low 90s, leaving headroom for event penalties.
   */
  baseSatisfaction: 66,
  /** Satisfaction points the FIRST facility of each kind contributes (§31). */
  satisfactionBonusPerFacility: {
    CHECK_IN: 5,
    SECURITY: 5,
    BAGGAGE: 5,
    LOUNGE: 10,
  } as Record<string, number>,
  /** Each further same-kind facility adds this fraction of the previous one. */
  facilityStackFalloff: 0.5,
  /** Never count more than this many facilities of one kind. */
  facilityStackCap: 4,

  /** Route time (game-seconds) considered normal — no wait penalty below this. */
  normalRouteSeconds: 12,
  /** Satisfaction lost per second of route time over normal… */
  waitPenaltyPerSecond: 1.5,
  /** …never more than this in total. */
  maxWaitPenalty: 15,
  /** Deterministic per-passenger spread so one flight's pax aren't identical. */
  satisfactionJitter: 6,

  /** Flight-average adjustment when the flight was on-time / delayed (§30). */
  onTimeSatisfactionBonus: 4,
  delaySatisfactionPenalty: 12,

  // --------------------------------------------------------------- on-time ---
  /** On-time rate shown before any flight has completed. */
  baseOnTimeRate: 90,
  /** Recent COMPLETED flights averaged for airport satisfaction + on-time (§34). */
  recentFlightWindow: 8,

  // ---------------------------------------------------------------- events ---
  /** Seconds after game start before the first event may fire (§40). */
  eventInitialDelay: 45,
  /** Minimum seconds between events (§40). */
  eventCooldown: 60,
  /** How long each event stays active. 0 = instantaneous / one-shot effect. */
  eventDuration: {
    FLIGHT_DELAY: 0,
    PASSENGER_SURGE: 0,
    SERVICE_BONUS: 30,
  } as Record<string, number>,
  /** Game-seconds added to a flight struck by FLIGHT_DELAY (§41). */
  flightDelaySeconds: 55,
  /** Extra flight requests a PASSENGER_SURGE fires (capacity is still respected). */
  passengerSurgeFlights: 3,
  /** Flat bonus to service + satisfaction while SERVICE_BONUS is active (§43). */
  serviceBonusAmount: 8,

  // ------------------------------------------------------------ reputation ---
  /** Fraction of the gap to the quality target closed per completed flight. */
  reputationLerp: 0.05,
  /** Hard cap on how far reputation moves in one flight (§45). */
  reputationMaxStep: 1.5,
  /** Weights of the quality target reputation drifts toward. Sum to 1. */
  reputationWeights: { satisfaction: 0.5, onTime: 0.3, service: 0.2 },

  // ----------------------------------------------------- ground operations ---
  ground: {
    /** Order turnaround tasks run in — every one must finish before departure. */
    sequence: [
      "BAGGAGE",
      "CLEANING",
      "REFUELING",
      "BOARDING_SERVICE",
    ] as const,
    /** Work time (game-seconds) each task needs. Short, testable (spec §26). */
    duration: {
      BAGGAGE: 1.8,
      CLEANING: 1.3,
      REFUELING: 1.8,
      BOARDING_SERVICE: 1.0,
    } as Record<string, number>,
    /** Which vehicle type performs each task. */
    vehicleForType: {
      BAGGAGE: "BAGGAGE_CART",
      CLEANING: "CLEANING_VEHICLE",
      REFUELING: "FUEL_TRUCK",
      BOARDING_SERVICE: "SERVICE_VEHICLE",
    } as Record<string, string>,
    /** A task PENDING longer than this (game-seconds) counts as delayed (§35). */
    pendingDelayThreshold: 4,
    /** Recent finished operations kept for the efficiency calc (§38). */
    recentWindow: 10,
    /** Satisfaction points a flight loses if its turnaround had a delayed task (§39). */
    turnaroundDelayPenalty: 6,
  },

  // ------------------------------------------------------ ground efficiency ---
  groundEfficiency: {
    /** Efficiency with no facilities / vehicles and no history. */
    base: 55,
    /** Points per ground vehicle in the fleet… */
    perVehicle: 4,
    /** …counting at most this many. */
    vehicleCap: 8,
    /** Most the "recent operations ran clean" bonus can add. */
    completedBonusMax: 18,
    /** Most the "recent operations were delayed" penalty can subtract. */
    delayPenaltyMax: 25,
  },

  // ------------------------------------------------------- ground vehicles ---
  vehicles: {
    /** Starting fleet — one of each (spec §18). */
    initialFleet: {
      BAGGAGE_CART: 1,
      CLEANING_VEHICLE: 1,
      FUEL_TRUCK: 1,
      SERVICE_VEHICLE: 1,
    } as Record<string, number>,
    /** Units per second a vehicle drives (defaultGroundVehicles seeds this). */
    speed: 12,
    /** Concurrent operations a vehicle can handle — 1 for now (spec §37). */
    capacity: 1,
  },
} as const;
