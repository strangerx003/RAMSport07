/**
 * MIL-HDBK-217F (Notice 2) reliability prediction.
 *
 * Implements the parts-stress and parts-count failure-rate models for the
 * electronic part families in the handbook. Every model records the standard
 * equation it applies, its base failure rate (?b or ?g, failures/10^6 h), the
 * Arrhenius activation energy and the ?-factor definitions the user can set.
 *
 * Rates are kept in failures per 10^6 hours (the handbook's unit) inside the
 * engine and converted to failures/hour only at the boundary. This keeps the
 * numbers identical to the standard's worked examples and tables.
 *
 * The ?-factor defaults are the handbook's generic values. Formal predictions
 * should use the exact table values for the part's specification, quality level
 * and environment; every factor is editable in the workbench for that reason.
 */

export const BOLTZMANN_EV = 8.617333262e-5;

export type Mil217fMethod = "stress" | "count";

export type Mil217fFactorOption = { value: string; label: string; factor: number };

export type Mil217fFactorDef = {
  key: string;
  label: string;
  kind: "select" | "number";
  default: string | number;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  /** For numeric factors the handbook often normalises by a reference value. */
  scale?: number;
  hint?: string;
  options?: Mil217fFactorOption[];
};

export type Mil217fValues = Record<string, string | number>;

export type Mil217fContext = {
  /** Junction or part temperature in ?C. */
  temperature: number;
  environment: string;
  environmentFactor: number;
};

export type Mil217fModelDef = {
  id: string;
  category: string;
  name: string;
  /** Handbook section, e.g. "5.3.2". */
  section: string;
  equation: string;
  description: string;
  /** ?b or ?g in failures/10^6 h. */
  baseRate: number;
  /** Parts-count generic rate when it differs from the stress base rate. */
  countBaseRate?: number;
  /** Arrhenius activation energy in eV. */
  activationEnergy: number;
  factors: Mil217fFactorDef[];
  /** Exponents applied to numeric factor values. */
  exponents?: Record<string, number>;
  compute: (values: Mil217fValues, context: Mil217fContext) => number;
};

export type Mil217fPart = {
  id: string;
  /** Data Register asset id when the part originates from the register. */
  assetId?: string;
  reference: string;
  description: string;
  modelId: string;
  quantity: number;
  inputs: Mil217fValues;
};

export type Mil217fOptions = {
  method: Mil217fMethod;
  environment: string;
  ambient: number;
  temperatureRise: number;
  missionTime: number;
};

export type Mil217fFactorResult = {
  key: string;
  label: string;
  raw: string | number;
  effective: number;
  unit?: string;
};

export type Mil217fPartResult = {
  part: Mil217fPart;
  model: Mil217fModelDef;
  temperature: number;
  piT: number;
  lambdaB: number;
  /** ?p in failures/10^6 h. */
  lambdaP: number;
  quantity: number;
  /** Quantity ? ?p in failures/10^6 h. */
  contribution: number;
  factors: Mil217fFactorResult[];
};

export type Mil217fAnalysis = {
  method: Mil217fMethod;
  results: Mil217fPartResult[];
  /** Total failure rate in failures/hour. */
  totalRate: number;
  totalFits: number;
  mtbf: number;
  categories: { category: string; rate: number; count: number }[];
  warnings: string[];
};

export const MIL217F_ENVIRONMENTS: Mil217fFactorOption[] = [
  { value: "GB", label: "GB ? Ground Benign", factor: 1.0 },
  { value: "GF", label: "GF ? Ground Fixed", factor: 2.0 },
  { value: "GM", label: "GM ? Ground Mobile", factor: 4.0 },
  { value: "NS", label: "NS ? Naval Sheltered", factor: 3.0 },
  { value: "NU", label: "NU ? Naval Unsheltered", factor: 8.0 },
  { value: "AIC", label: "AIC ? Airborne Inhabited Cargo", factor: 4.0 },
  { value: "AIF", label: "AIF ? Airborne Inhabited Fighter", factor: 5.0 },
  { value: "AUC", label: "AUC ? Airborne Uninhabited Cargo", factor: 8.0 },
  { value: "AUF", label: "AUF ? Airborne Uninhabited Fighter", factor: 10.0 },
  { value: "ARW", label: "ARW ? Airborne Rotary Wing", factor: 8.0 },
  { value: "SF", label: "SF ? Space Flight", factor: 0.5 },
  { value: "MF", label: "MF ? Missile Flight", factor: 20.0 },
  { value: "ML", label: "ML ? Missile Launch", factor: 50.0 },
  { value: "CL", label: "CL ? Cannon Launch", factor: 100.0 },
  { value: "UL", label: "UL ? Underwater Launch", factor: 100.0 },
];

export const MIL217F_METHODS: { value: Mil217fMethod; label: string; hint: string }[] = [
  { value: "stress", label: "Parts stress", hint: "Part Stress Analysis: ?p from ?b and every ? factor." },
  { value: "count", label: "Parts count", hint: "Parts Count: ?g ? ?Q ? ?E for early estimates." },
];

/** ?T = exp[-Ea/k ? (1/Tj ? 1/298.15)] with Tj in kelvin. */
export function arrheniusPiT(temperatureC: number, activationEnergy: number) {
  const tj = Math.max(1, temperatureC + 273.15);
  return Math.exp((-activationEnergy / BOLTZMANN_EV) * (1 / tj - 1 / 298.15));
}

export function mil217fEnvironment(value: string) {
  return MIL217F_ENVIRONMENTS.find(entry => entry.value === value) ?? MIL217F_ENVIRONMENTS[0];
}

const Q_PASSIVE: Mil217fFactorDef = {
  key: "quality",
  label: "Quality (?Q)",
  kind: "select",
  default: "B",
  options: [
    { value: "S", label: "S ? Space", factor: 0.03 },
    { value: "R", label: "R ? Established reliability", factor: 0.1 },
    { value: "B", label: "B ? Military", factor: 0.3 },
    { value: "C", label: "Commercial", factor: 1.0 },
  ],
};

const Q_SEMI: Mil217fFactorDef = {
  key: "quality",
  label: "Quality (?Q)",
  kind: "select",
  default: "JAN",
  options: [
    { value: "JANTXV", label: "JANTXV", factor: 0.25 },
    { value: "JANTX", label: "JANTX", factor: 0.5 },
    { value: "JAN", label: "JAN", factor: 1.0 },
    { value: "C", label: "Commercial", factor: 10.0 },
  ],
};

const Q_MICRO: Mil217fFactorDef = {
  key: "quality",
  label: "Quality (?Q)",
  kind: "select",
  default: "B",
  options: [
    { value: "S", label: "S ? Space", factor: 0.25 },
    { value: "B", label: "B ? Military", factor: 0.5 },
    { value: "B1", label: "B-1 ? Military", factor: 1.0 },
    { value: "C", label: "Commercial", factor: 10.0 },
  ],
};

const Q_ELECTRO: Mil217fFactorDef = {
  key: "quality",
  label: "Quality (?Q)",
  kind: "select",
  default: "B",
  options: [
    { value: "S", label: "S ? Space", factor: 0.1 },
    { value: "R", label: "R ? Established reliability", factor: 0.3 },
    { value: "B", label: "B ? Military", factor: 1.0 },
    { value: "C", label: "Commercial", factor: 2.0 },
  ],
};

const Q_BOARD: Mil217fFactorDef = {
  key: "quality",
  label: "Quality (?Q)",
  kind: "select",
  default: "B",
  options: [
    { value: "S", label: "S ? Space", factor: 0.1 },
    { value: "R", label: "R ? Established reliability", factor: 0.3 },
    { value: "B", label: "B ? Military", factor: 1.0 },
    { value: "C", label: "Commercial", factor: 2.0 },
  ],
};

const POWER_RATIO: Mil217fFactorDef = {
  key: "powerRatio",
  label: "Power ratio P/Pr",
  kind: "number",
  default: 0.5,
  min: 0.01,
  max: 1.5,
  step: 0.01,
  hint: "Operating power divided by rated power.",
};

const RESISTANCE_RATIO: Mil217fFactorDef = {
  key: "resistanceRatio",
  label: "Resistance ratio R/Rr",
  kind: "number",
  default: 0.5,
  min: 0.01,
  max: 1.5,
  step: 0.01,
  hint: "Operating resistance divided by rated resistance.",
};

const VOLTAGE_RATIO: Mil217fFactorDef = {
  key: "voltageRatio",
  label: "Voltage ratio V/Vr",
  kind: "number",
  default: 0.5,
  min: 0.01,
  max: 1.5,
  step: 0.01,
  hint: "Applied voltage divided by rated voltage.",
};

const CAPACITANCE: Mil217fFactorDef = {
  key: "capacitance",
  label: "Capacitance",
  kind: "number",
  default: 0.1,
  min: 0.0001,
  max: 10000,
  step: 0.01,
  unit: "?F",
  scale: 0.1,
  hint: "?C is normalised to 0.1 ?F by the handbook table.",
};

const DIODE_STRESS: Mil217fFactorDef = {
  key: "stressRatio",
  label: "Stress ratio Vs/Vr",
  kind: "number",
  default: 0.5,
  min: 0.01,
  max: 1.5,
  step: 0.01,
  hint: "Applied reverse voltage divided by rated reverse voltage.",
};

const DIODE_CONSTRUCTION: Mil217fFactorDef = {
  key: "construction",
  label: "Construction (?C)",
  kind: "select",
  default: "metallurgical",
  options: [
    { value: "metallurgical", label: "Metallurgically bonded", factor: 1.0 },
    { value: "spring", label: "Spring contact", factor: 2.0 },
  ],
};

const INDUCTOR_CONSTRUCTION: Mil217fFactorDef = {
  key: "construction",
  label: "Construction (?C)",
  kind: "select",
  default: "fixed",
  options: [
    { value: "fixed", label: "Fixed", factor: 1.0 },
    { value: "variable", label: "Variable / tunable", factor: 2.0 },
  ],
};

const TRANSISTOR_APPLICATION: Mil217fFactorDef = {
  key: "application",
  label: "Application (?A)",
  kind: "select",
  default: "switching",
  options: [
    { value: "switching", label: "Switching", factor: 1.0 },
    { value: "linear", label: "Linear", factor: 1.5 },
    { value: "power", label: "Power", factor: 2.0 },
  ],
};

const RELAY_LOAD: Mil217fFactorDef = {
  key: "load",
  label: "Load (?L)",
  kind: "select",
  default: "resistive",
  options: [
    { value: "resistive", label: "Resistive", factor: 1.0 },
    { value: "inductive", label: "Inductive", factor: 2.0 },
    { value: "motor", label: "Motor", factor: 3.0 },
    { value: "lamp", label: "Lamp", factor: 2.0 },
  ],
};

const RELAY_CONTACT: Mil217fFactorDef = {
  key: "contact",
  label: "Contact rating (?C)",
  kind: "select",
  default: "low",
  options: [
    { value: "dry", label: "Dry circuit", factor: 0.1 },
    { value: "low", label: "Low level", factor: 0.2 },
    { value: "medium", label: "Medium", factor: 0.5 },
    { value: "high", label: "High", factor: 1.0 },
  ],
};

const CONNECTOR_MATING: Mil217fFactorDef = {
  key: "mating",
  label: "Mating cycles (?K)",
  kind: "select",
  default: "6-20",
  options: [
    { value: "1-5", label: "1?5", factor: 0.5 },
    { value: "6-20", label: "6?20", factor: 1.0 },
    { value: "21-50", label: "21?50", factor: 2.0 },
    { value: ">50", label: "> 50", factor: 3.0 },
  ],
};

const LEARNING: Mil217fFactorDef = {
  key: "learning",
  label: "Learning (?L)",
  kind: "select",
  default: "1",
  options: [
    { value: "1", label: "Mature (1.0)", factor: 1.0 },
    { value: "2", label: "2.0", factor: 2.0 },
    { value: "5", label: "5.0", factor: 5.0 },
    { value: "10", label: "10.0", factor: 10.0 },
  ],
};

function factorValue(values: Mil217fValues, def: Mil217fFactorDef): number {
  const raw = values[def.key] ?? def.default;
  if (def.kind === "select") {
    return def.options?.find(option => option.value === raw)?.factor ?? 1;
  }
  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return 0;
  const scale = def.scale ?? 1;
  const value = scale === 0 ? numeric : numeric / scale;
  // ?-factors are always non?negative per MIL?HDBK?217F; clamp to 0 to avoid NaN from even?root exponents.
  return value < 0 ? 0 : value;
}

function standardCompute(
  baseRate: number,
  activationEnergy: number,
  factors: Mil217fFactorDef[],
  exponents: Record<string, number> = {},
) {
  return (values: Mil217fValues, context: Mil217fContext) => {
    let rate = baseRate * arrheniusPiT(context.temperature, activationEnergy) * context.environmentFactor;
    for (const def of factors) {
      rate *= Math.pow(factorValue(values, def), exponents[def.key] ?? 1);
    }
    return rate;
  };
}

function standardModel(config: {
  id: string;
  category: string;
  name: string;
  section: string;
  equation: string;
  description: string;
  baseRate: number;
  countBaseRate?: number;
  activationEnergy: number;
  factors: Mil217fFactorDef[];
  exponents?: Record<string, number>;
}): Mil217fModelDef {
  return {
    ...config,
    compute: standardCompute(config.baseRate, config.activationEnergy, config.factors, config.exponents),
  };
}

function cDef(key: "c1" | "c2", label: string, value: number): Mil217fFactorDef {
  return { key, label, kind: "number", default: value, min: 0, max: 10, step: 0.0001, hint: "Handbook complexity/package coefficient." };
}

function microcircuitModel(id: string, name: string, section: string, description: string, c1: number, c2: number): Mil217fModelDef {
  const factors = [cDef("c1", "C1 ? complexity", c1), cDef("c2", "C2 ? package", c2), Q_MICRO, LEARNING];
  return {
    id,
    category: "Microcircuits",
    name,
    section,
    equation: "?p = (C1 ? ?T + C2 ? ?E) ? ?Q ? ?L",
    description,
    baseRate: 0,
    countBaseRate: 0.01,
    activationEnergy: 0.35,
    factors,
    compute: (values, context) => {
      const c1Value = Number(values.c1 ?? c1);
      const c2Value = Number(values.c2 ?? c2);
      const piT = 0.1 * arrheniusPiT(context.temperature, 0.35);
      const piQ = factorValue(values, Q_MICRO);
      const piL = factorValue(values, LEARNING);
      return (c1Value * piT + c2Value * context.environmentFactor) * piQ * piL;
    },
  };
}

export const MIL217F_MODELS: Mil217fModelDef[] = [
  // ---------------------------------------------------------------- resistors
  standardModel({
    id: "resistor-film",
    category: "Resistors",
    name: "Fixed film resistor",
    section: "5.3.1",
    equation: "?p = ?b ? ?T ? ?P ? ?S ? ?Q ? ?E",
    description: "Metal-film, carbon-film and similar fixed resistors.",
    baseRate: 0.0017,
    activationEnergy: 0.35,
    factors: [POWER_RATIO, RESISTANCE_RATIO, Q_PASSIVE],
    exponents: { powerRatio: 0.5, resistanceRatio: 0.5 },
  }),
  standardModel({
    id: "resistor-composition",
    category: "Resistors",
    name: "Fixed composition resistor",
    section: "5.3.1",
    equation: "?p = ?b ? ?T ? ?P ? ?S ? ?Q ? ?E",
    description: "Carbon-composition fixed resistors.",
    baseRate: 0.0014,
    activationEnergy: 0.35,
    factors: [POWER_RATIO, RESISTANCE_RATIO, Q_PASSIVE],
    exponents: { powerRatio: 0.5, resistanceRatio: 0.5 },
  }),
  standardModel({
    id: "resistor-variable",
    category: "Resistors",
    name: "Variable resistor / potentiometer",
    section: "5.3.1",
    equation: "?p = ?b ? ?T ? ?P ? ?S ? ?Q ? ?E",
    description: "Wirewound, cermet and composition variable resistors.",
    baseRate: 0.0052,
    activationEnergy: 0.35,
    factors: [POWER_RATIO, RESISTANCE_RATIO, Q_PASSIVE],
    exponents: { powerRatio: 0.5, resistanceRatio: 0.5 },
  }),
  standardModel({
    id: "resistor-thermistor",
    category: "Resistors",
    name: "Thermistor",
    section: "5.3.1",
    equation: "?p = ?b ? ?T ? ?Q ? ?E",
    description: "Temperature-sensitive resistive element.",
    baseRate: 0.0005,
    activationEnergy: 0.35,
    factors: [Q_PASSIVE],
  }),

  // --------------------------------------------------------------- capacitors
  standardModel({
    id: "capacitor-ceramic",
    category: "Capacitors",
    name: "Ceramic capacitor",
    section: "5.3.2",
    equation: "?p = ?b ? ?T ? ?C ? ?V ? ?Q ? ?E",
    description: "Multilayer and disc ceramic capacitors.",
    baseRate: 0.0002,
    activationEnergy: 0.35,
    factors: [CAPACITANCE, VOLTAGE_RATIO, Q_PASSIVE],
    exponents: { capacitance: 0.5, voltageRatio: 0.5 },
  }),
  standardModel({
    id: "capacitor-tantalum",
    category: "Capacitors",
    name: "Tantalum capacitor",
    section: "5.3.2",
    equation: "?p = ?b ? ?T ? ?C ? ?V ? ?Q ? ?E",
    description: "Solid and wet tantalum electrolytic capacitors.",
    baseRate: 0.0008,
    activationEnergy: 0.35,
    factors: [CAPACITANCE, VOLTAGE_RATIO, Q_PASSIVE],
    exponents: { capacitance: 0.5, voltageRatio: 0.5 },
  }),
  standardModel({
    id: "capacitor-aluminum",
    category: "Capacitors",
    name: "Aluminium electrolytic capacitor",
    section: "5.3.2",
    equation: "?p = ?b ? ?T ? ?C ? ?V ? ?Q ? ?E",
    description: "Aluminium electrolytic capacitors.",
    baseRate: 0.0003,
    activationEnergy: 0.35,
    factors: [CAPACITANCE, VOLTAGE_RATIO, Q_PASSIVE],
    exponents: { capacitance: 0.5, voltageRatio: 0.5 },
  }),
  standardModel({
    id: "capacitor-film",
    category: "Capacitors",
    name: "Plastic film capacitor",
    section: "5.3.2",
    equation: "?p = ?b ? ?T ? ?C ? ?V ? ?Q ? ?E",
    description: "Polyester, polypropylene and polystyrene film capacitors.",
    baseRate: 0.0002,
    activationEnergy: 0.35,
    factors: [CAPACITANCE, VOLTAGE_RATIO, Q_PASSIVE],
    exponents: { capacitance: 0.5, voltageRatio: 0.5 },
  }),
  standardModel({
    id: "capacitor-mica",
    category: "Capacitors",
    name: "Mica capacitor",
    section: "5.3.2",
    equation: "?p = ?b ? ?T ? ?C ? ?V ? ?Q ? ?E",
    description: "Silver-mica and clamped-mica capacitors.",
    baseRate: 0.0005,
    activationEnergy: 0.35,
    factors: [CAPACITANCE, VOLTAGE_RATIO, Q_PASSIVE],
    exponents: { capacitance: 0.5, voltageRatio: 0.5 },
  }),
  standardModel({
    id: "capacitor-glass",
    category: "Capacitors",
    name: "Glass capacitor",
    section: "5.3.2",
    equation: "?p = ?b ? ?T ? ?C ? ?V ? ?Q ? ?E",
    description: "Glass-dielectric capacitors.",
    baseRate: 0.0005,
    activationEnergy: 0.35,
    factors: [CAPACITANCE, VOLTAGE_RATIO, Q_PASSIVE],
    exponents: { capacitance: 0.5, voltageRatio: 0.5 },
  }),

  // -------------------------------------------------------- inductive devices
  standardModel({
    id: "inductor",
    category: "Inductive devices",
    name: "Fixed inductor",
    section: "5.3.3",
    equation: "?p = ?b ? ?T ? ?C ? ?Q ? ?E",
    description: "Fixed and variable inductors, chokes and coils.",
    baseRate: 0.0002,
    activationEnergy: 0.35,
    factors: [INDUCTOR_CONSTRUCTION, Q_PASSIVE],
  }),
  standardModel({
    id: "transformer",
    category: "Inductive devices",
    name: "Transformer",
    section: "5.3.3",
    equation: "?p = ?b ? ?T ? ?C ? ?Q ? ?E",
    description: "Power, pulse and signal transformers.",
    baseRate: 0.0003,
    activationEnergy: 0.35,
    factors: [INDUCTOR_CONSTRUCTION, Q_PASSIVE],
  }),

  // ---------------------------------------------------- discrete semiconductors
  standardModel({
    id: "diode-lf",
    category: "Discrete semiconductors",
    name: "Low-frequency diode",
    section: "5.2",
    equation: "?p = ?b ? ?T ? ?S ? ?C ? ?Q ? ?E",
    description: "General-purpose and rectifier diodes at low frequency.",
    baseRate: 0.003,
    activationEnergy: 0.35,
    factors: [DIODE_STRESS, DIODE_CONSTRUCTION, Q_SEMI],
    exponents: { stressRatio: 2 },
  }),
  standardModel({
    id: "diode-hf",
    category: "Discrete semiconductors",
    name: "High-frequency diode",
    section: "5.2",
    equation: "?p = ?b ? ?T ? ?S ? ?C ? ?Q ? ?E",
    description: "Switching, Schottky and fast-recovery diodes.",
    baseRate: 0.005,
    activationEnergy: 0.35,
    factors: [DIODE_STRESS, DIODE_CONSTRUCTION, Q_SEMI],
    exponents: { stressRatio: 2 },
  }),
  standardModel({
    id: "diode-zener",
    category: "Discrete semiconductors",
    name: "Zener / voltage-reference diode",
    section: "5.2",
    equation: "?p = ?b ? ?T ? ?S ? ?C ? ?Q ? ?E",
    description: "Voltage-regulating and reference diodes.",
    baseRate: 0.003,
    activationEnergy: 0.35,
    factors: [DIODE_STRESS, DIODE_CONSTRUCTION, Q_SEMI],
    exponents: { stressRatio: 2 },
  }),
  standardModel({
    id: "led",
    category: "Discrete semiconductors",
    name: "Light-emitting diode",
    section: "5.2",
    equation: "?p = ?b ? ?T ? ?Q ? ?E",
    description: "Indicator and display LEDs.",
    baseRate: 0.0005,
    activationEnergy: 0.35,
    factors: [Q_SEMI],
  }),
  standardModel({
    id: "transistor-lf",
    category: "Discrete semiconductors",
    name: "Low-frequency transistor",
    section: "5.2",
    equation: "?p = ?b ? ?T ? ?A ? ?Q ? ?E",
    description: "Bipolar small-signal transistors at low frequency.",
    baseRate: 0.00074,
    activationEnergy: 0.35,
    factors: [TRANSISTOR_APPLICATION, Q_SEMI],
  }),
  standardModel({
    id: "transistor-hf",
    category: "Discrete semiconductors",
    name: "High-frequency transistor",
    section: "5.2",
    equation: "?p = ?b ? ?T ? ?A ? ?Q ? ?E",
    description: "RF and fast-switching bipolar transistors.",
    baseRate: 0.0018,
    activationEnergy: 0.35,
    factors: [TRANSISTOR_APPLICATION, Q_SEMI],
  }),
  standardModel({
    id: "transistor-power",
    category: "Discrete semiconductors",
    name: "Power transistor",
    section: "5.2",
    equation: "?p = ?b ? ?T ? ?A ? ?Q ? ?E",
    description: "Power bipolar transistors.",
    baseRate: 0.0021,
    activationEnergy: 0.35,
    factors: [TRANSISTOR_APPLICATION, Q_SEMI],
  }),
  standardModel({
    id: "fet",
    category: "Discrete semiconductors",
    name: "Field-effect transistor",
    section: "5.2",
    equation: "?p = ?b ? ?T ? ?A ? ?Q ? ?E",
    description: "JFET and MOSFET discrete devices.",
    baseRate: 0.0012,
    activationEnergy: 0.35,
    factors: [TRANSISTOR_APPLICATION, Q_SEMI],
  }),
  standardModel({
    id: "thyristor",
    category: "Discrete semiconductors",
    name: "Thyristor / SCR",
    section: "5.2",
    equation: "?p = ?b ? ?T ? ?A ? ?Q ? ?E",
    description: "Silicon-controlled rectifiers and triacs.",
    baseRate: 0.0044,
    activationEnergy: 0.35,
    factors: [TRANSISTOR_APPLICATION, Q_SEMI],
  }),

  // ------------------------------------------------------------ microcircuits
  microcircuitModel("microcircuit-logic", "Monolithic logic IC", "5.1", "Gates, counters, buffers and glue logic.", 0.005, 0.005),
  microcircuitModel("microcircuit-memory", "Memory IC", "5.1", "SRAM, DRAM, EEPROM and flash memories.", 0.005, 0.005),
  microcircuitModel("microcircuit-processor", "Microprocessor / controller", "5.1", "CPUs, microcontrollers and DSPs.", 0.01, 0.01),
  standardModel({
    id: "hybrid",
    category: "Microcircuits",
    name: "Hybrid microcircuit",
    section: "5.1",
    equation: "?p = ?b ? ?T ? ?Q ? ?E",
    description: "Thick- and thin-film hybrid assemblies.",
    baseRate: 0.0005,
    activationEnergy: 0.35,
    factors: [Q_MICRO],
  }),

  // --------------------------------------------------------- electromechanical
  standardModel({
    id: "relay",
    category: "Electromechanical",
    name: "Electromechanical relay",
    section: "5.4.1",
    equation: "?p = ?b ? ?T ? ?L ? ?C ? ?Q ? ?E",
    description: "General-purpose, sensitive and latching relays.",
    baseRate: 0.005,
    activationEnergy: 0.35,
    factors: [RELAY_LOAD, RELAY_CONTACT, Q_ELECTRO],
  }),
  standardModel({
    id: "switch",
    category: "Electromechanical",
    name: "Switch",
    section: "5.4.2",
    equation: "?p = ?b ? ?T ? ?L ? ?C ? ?Q ? ?E",
    description: "Toggle, pushbutton, rotary and limit switches.",
    baseRate: 0.001,
    activationEnergy: 0.35,
    factors: [RELAY_LOAD, RELAY_CONTACT, Q_ELECTRO],
  }),
  {
    id: "connector",
    category: "Electromechanical",
    name: "Connector",
    section: "5.4.3",
    equation: "?p = ?b ? N ? ?T ? ?K ? ?Q ? ?E",
    description: "Multi-contact electrical connectors; ?b is per contact.",
    baseRate: 0.0002,
    activationEnergy: 0.35,
    factors: [
      { key: "contacts", label: "Contacts (N)", kind: "number", default: 20, min: 1, max: 1000, step: 1 },
      CONNECTOR_MATING,
      Q_ELECTRO,
    ],
    compute: (values, context) => {
      const contacts = Number(values.contacts ?? 20);
      const piK = factorValue(values, CONNECTOR_MATING);
      const piQ = factorValue(values, Q_ELECTRO);
      return 0.0002 * contacts * arrheniusPiT(context.temperature, 0.35) * piK * piQ * context.environmentFactor;
    },
  },

  // -------------------------------------------------------------------- other
  {
    id: "pcb",
    category: "Other",
    name: "Printed circuit board",
    section: "5.5.1",
    equation: "?p = ?b ? L ? ?T ? ?Q ? ?E",
    description: "Rigid printed circuit board; ?b is per layer.",
    baseRate: 0.00026,
    activationEnergy: 0.35,
    factors: [
      { key: "layers", label: "Layers (L)", kind: "number", default: 4, min: 1, max: 32, step: 1 },
      Q_BOARD,
    ],
    compute: (values, context) => {
      const layers = Number(values.layers ?? 4);
      const piQ = factorValue(values, Q_BOARD);
      return 0.00026 * layers * arrheniusPiT(context.temperature, 0.35) * piQ * context.environmentFactor;
    },
  },
  standardModel({
    id: "interconnect",
    category: "Other",
    name: "Interconnection assembly",
    section: "5.5.2",
    equation: "?p = ?b ? ?T ? ?Q ? ?E",
    description: "Backplanes, wire-wrap and soldered interconnection assemblies.",
    baseRate: 0.00003,
    activationEnergy: 0.35,
    factors: [Q_BOARD],
  }),
  standardModel({
    id: "crystal",
    category: "Other",
    name: "Crystal / oscillator",
    section: "5.5",
    equation: "?p = ?b ? ?T ? ?Q ? ?E",
    description: "Quartz crystals and clock oscillators.",
    baseRate: 0.0005,
    activationEnergy: 0.35,
    factors: [Q_PASSIVE],
  }),
  standardModel({
    id: "fuse",
    category: "Other",
    name: "Fuse",
    section: "5.5",
    equation: "?p = ?b ? ?T ? ?Q ? ?E",
    description: "Cartridge and resettable fuses.",
    baseRate: 0.0005,
    activationEnergy: 0.35,
    factors: [Q_PASSIVE],
  }),
  standardModel({
    id: "lamp",
    category: "Other",
    name: "Indicator lamp",
    section: "5.5",
    equation: "?p = ?b ? ?T ? ?Q ? ?E",
    description: "Incandescent and neon indicator lamps.",
    baseRate: 0.001,
    activationEnergy: 0.35,
    factors: [Q_PASSIVE],
  }),
  standardModel({
    id: "generic",
    category: "Other",
    name: "Generic electronic part",
    section: "5.6",
    equation: "?p = ?b ? ?T ? ?Q ? ?E",
    description: "Fallback model for a part without a dedicated handbook family.",
    baseRate: 0.001,
    activationEnergy: 0.35,
    factors: [Q_BOARD],
  }),
];

export const MIL217F_CATEGORIES = Array.from(new Set(MIL217F_MODELS.map(model => model.category)));

export function mil217fModel(id: string): Mil217fModelDef | undefined {
  return MIL217F_MODELS.find(model => model.id === id);
}

export function defaultMil217fInputs(model: Mil217fModelDef): Mil217fValues {
  const values: Mil217fValues = {};
  for (const def of model.factors) values[def.key] = def.default;
  return values;
}

export function mil217fFactorResults(model: Mil217fModelDef, values: Mil217fValues): Mil217fFactorResult[] {
  return model.factors.map(def => {
    const raw = values[def.key] ?? def.default;
    const normalised = factorValue(values, def);
    const exponent = model.exponents?.[def.key] ?? 1;
    return {
      key: def.key,
      label: def.label,
      raw,
      effective: Math.pow(normalised, exponent),
      unit: def.unit,
    };
  });
}

function countRate(model: Mil217fModelDef, values: Mil217fValues, context: Mil217fContext) {
  const quality = model.factors.find(def => def.key === "quality");
  const piQ = quality ? factorValue(values, quality) : 1;
  const base = model.countBaseRate ?? model.baseRate;
  return base * piQ * context.environmentFactor;
}

export function analyzeMil217f(parts: Mil217fPart[], options: Mil217fOptions): Mil217fAnalysis {
  const environment = mil217fEnvironment(options.environment);
  const temperature = options.ambient + options.temperatureRise;
  const context: Mil217fContext = {
    temperature,
    environment: environment.value,
    environmentFactor: environment.factor,
  };
  const results: Mil217fPartResult[] = [];
  const warnings: string[] = [];

  for (const part of parts) {
    const model = mil217fModel(part.modelId);
    if (!model) {
      warnings.push(`${part.reference}: unknown part model "${part.modelId}".`);
      continue;
    }
    const values = { ...defaultMil217fInputs(model), ...part.inputs };
    const lambdaP = options.method === "count"
      ? countRate(model, values, context)
      : model.compute(values, context);
    const validQuantity = Number.isFinite(part.quantity) && part.quantity > 0;
    if (!validQuantity) warnings.push(`${part.reference}: quantity must be greater than zero; using 1.`);
    const quantity = validQuantity ? part.quantity : 1;
    const piT = model.id.startsWith("microcircuit")
      ? 0.1 * arrheniusPiT(temperature, model.activationEnergy)
      : arrheniusPiT(temperature, model.activationEnergy);
    // The displayed base rate follows the active method: ?g in parts-count, the
    // handbook's ?b (C1??T + C2??E for microcircuits) in parts-stress.
    let lambdaB: number;
    if (options.method === "count") {
      lambdaB = model.countBaseRate ?? model.baseRate;
    } else if (model.id.startsWith("microcircuit")) {
      const c1Value = Number(values.c1 ?? 0);
      const c2Value = Number(values.c2 ?? 0);
      lambdaB = c1Value * piT + c2Value * context.environmentFactor;
    } else {
      lambdaB = model.baseRate;
    }
    results.push({
      part,
      model,
      temperature,
      piT,
      lambdaB,
      lambdaP,
      quantity,
      contribution: lambdaP * quantity,
      factors: mil217fFactorResults(model, values),
    });
  }

  const totalMicro = results.reduce((sum, result) => sum + result.contribution, 0);
  const totalRate = totalMicro * 1e-6;
  const totalFits = totalRate * 1e9;
  const mtbf = totalRate > 0 ? 1 / totalRate : Number.POSITIVE_INFINITY;

  const categoryMap = new Map<string, { rate: number; count: number }>();
  for (const result of results) {
    const current = categoryMap.get(result.model.category) ?? { rate: 0, count: 0 };
    current.rate += result.contribution * 1e-6;
    current.count += result.quantity;
    categoryMap.set(result.model.category, current);
  }

  if (!parts.length) warnings.push("No parts yet. Import the Data Register or add a part to start the prediction.");
  if (options.ambient + options.temperatureRise > 125) warnings.push("Junction temperature exceeds 125 ?C; confirm the part rating and derating.");
  if (options.method === "count") warnings.push("Parts Count is an early estimate. Use Parts Stress once the part stresses are known.");
  if (results.some(result => result.lambdaP <= 0)) warnings.push("One or more parts have a zero or invalid failure rate; check the model inputs.");

  return {
    method: options.method,
    results,
    totalRate,
    totalFits,
    mtbf,
    categories: Array.from(categoryMap.entries()).map(([category, value]) => ({ category, ...value })),
    warnings,
  };
}

export function formatMil217fRate(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "?";
  if (value >= 1e-3) return value.toExponential(3);
  if (value >= 1e-6) return value.toExponential(3);
  return value.toExponential(3);
}
