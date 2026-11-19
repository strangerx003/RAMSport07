# RAMSport ? Standards Compliance Matrix

**Application:** RAMSport (Next.js reliability, availability, maintainability and safety workbench)
**Baseline:** `RAMSport06_C#_nostorage`
**Date:** 15 November 2026
**Scope:** Traceability between the standards claimed by RAMSport and the code that implements or omits each requirement.

---

## 1. How to read this matrix

Every row is a **requirement clause or topic** taken from the cited standard, the **evidence** that exists in this repository, the **file and symbol** where an auditor can inspect it, and an honest **status**.

| Status | Meaning |
|---|---|
| **Implemented** | The requirement is fully covered by working code and is exercised by the production build and/or `scripts/verify-workbench.mjs`. |
| **Partial** | The requirement is covered in substance, but one or more sub-clauses are absent (for example, a scale is borrowed from another standard, or only the calculation is present and not the management process). |
| **Gap** | RAMSport does not implement the requirement. It must not be claimed as compliant in a safety case or tender response. |

Evidence is always the **symbol name**, because line numbers move. Where a line number is useful it is given as `file:symbol`.

> **Important:** A "Gap" row is not a defect in the application; it marks the boundary of what RAMSport is. Safety cases that rely on RAMSport must supply the missing artefacts (hazard log, THR/SIL derivation, independent assessment) from their own programme.

---

## 2. Architecture evidence (applies to every standard)

These properties are preconditions for any regulated use: data must be durable, attributable and independent of the browser.

| Property | Evidence | Location |
|---|---|---|
| Server-side persistence, MongoDB when configured | `readRecord`, `writeRecord`, `mutateRecord`, `removeRecord`, `usingMongo` | `src/server/store.ts` |
| Atomic filesystem fallback when MongoDB is absent | Same store module, JSON records under `RAMSPORT_DATA_DIR` | `src/server/store.ts` |
| No browser storage of project or account data | No `localStorage`, `sessionStorage`, `indexedDB` or `document.cookie` usage anywhere in `src/` | verified by repository search; regression test asserts the same |
| Session is a signed HttpOnly cookie | `SESSION_COOKIE`, `createSessionToken`, `verifySessionToken`, `sessionCookie` | `src/server/session.ts` |
| Password hashing | `PBKDF2_ITERATIONS`, `hashPassword`, `verifyHash` | `src/server/crypto.ts` |
| Same-origin enforcement for mutations | `isSameOriginRequest` | `src/server/session.ts` |
| Single document API surface | `handleApi` | `src/server/api.ts` |
| Document load / save / autosave | `loadDocument`, `saveDocument`, `queueDocumentSave`, `flushDocumentSaves` | `src/services/documents/client.ts` |
| Data Register as the single asset source | `Asset`, `readAssets`, `saveAssets`, `loadProjectRegister` | `src/data/workspace.ts`; `src/app/(workspace)/data-register/page.tsx` |
| Explorer-style Files UI | `FileBrowser`, `FileManager`, `entryIcon`, `TYPE_LABELS` | `src/components/files/` |

---

## 3. ISO 55000 ? Asset management

**Overall status: Partial.** RAMSport supplies the analytical toolkit for an asset-management system; it does not supply the management system itself (policy, objectives, SAMP, asset-management plans).

| # | Requirement | RAMSport evidence | Location | Status |
|---|---|---|---|---|
| 55000.1 | Asset management policy and objectives | No policy object, approval workflow or objective register | ? | **Gap** |
| 55000.2 | Asset register and asset information | Asset register with tag, system, quantity, ?, MTTR, criticality; persisted server-side | `Asset`, `readAssets`, `saveAssets` ? `src/data/workspace.ts`; `src/app/(workspace)/data-register/page.tsx` | **Implemented** |
| 55000.3 | Life-cycle costing of assets | PM and CM life-cycle cost with CBS, NPV, EAC and selectable horizons | `analyzeLcc` ? `src/engine/lcc.ts`; `src/components/lcc/lcc-pm-workbench.tsx`, `lcc-cm-workbench.tsx` | **Implemented** |
| 55000.4 | Resource optimisation / spares | Poisson provisioning, reorder point, pipeline stock, fill rate, spares LCC | `analyzeSpares` ? `src/engine/spares.ts`; `src/components/spares/spares-workbench.tsx` | **Implemented** |
| 55000.5 | Risk-based decision making | EN 50126 severity ? frequency matrix, risk tiers and acceptability test | `EN50126_RISK_MATRIX`, `en50126RiskLevel`, `en50126IsAcceptable` ? `src/engine/en50126.ts`; `analyzeFmeca` ? `src/engine/fmeca.ts` | **Partial** ? risk is assessed per failure mode, but not linked to asset-management plans or investment decisions |
| 55000.6 | Asset performance monitoring and review | Dashboard and module reports only; no trend/KPI history store | `src/app/(workspace)/dashboard/page.tsx` | **Partial** |
| 55000.7 | Asset management system documentation | Documentation set exists, but not an ISO 55000 SAMP | `docs/specifications/`; `docs/operations/` | **Gap** |

---

## 4. IEC 60300-3-3 ? Dependability management, life-cycle costing

**Overall status: Implemented for the LCC calculation; Partial for the surrounding LCC process.** The engine implements the cost-breakdown and discounting mathematics in full. The standard's LCC *plan*, uncertainty treatment beyond sensitivity, and residual-value modelling are partial or absent.

| # | Requirement | RAMSport evidence | Location | Status |
|---|---|---|---|---|
| 60300-3-3.1 | LCC process and LCC plan | No standalone LCC plan artefact; the workbench is the process record | `src/components/lcc/` | **Partial** |
| 60300-3-3.2 | Cost Breakdown Structure (WBS ? life-cycle stage ? cost category) | Result exposes `categories` (labour, materials & spares, support & logistics, downtime/consequential, overhead, residual risk, acquisition, disposal) and `stages` (realization, utilization, retirement) with shares | `LccResult.categories`, `LccResult.stages` ? `analyzeLcc` in `src/engine/lcc.ts` | **Implemented** |
| 60300-3-3.3 | Preventive-maintenance cost profile | Per-asset PM task list: frequency, labour hours/rate, material, downtime hours/rate, support; `active` flag | `LccPmTask`, `LccPmAsset`, `defaultPmTask`, `pmAnnual` ? `src/engine/lcc.ts` | **Implemented** |
| 60300-3-3.4 | Corrective-maintenance cost profile | Crew size, labour rate, parts per repair, downtime rate, logistic and administrative delay, no-fault-found, callout, scrap, replacement | `LccCmProfile`, `LccCmAsset`, `defaultCmProfile`, `cmAnnual` ? `src/engine/lcc.ts` | **Implemented** |
| 60300-3-3.5 | Downtime and consequential costs | Downtime is a first-class cost category; CM downtime = MTTR + administrative delay + logistic delay | `AnnualCosts.downtime`; `LccCategoryTotal` key `downtime` ? `src/engine/lcc.ts` | **Implemented** |
| 60300-3-3.6 | Discounted cash flow / NPV | Escalated, end-of-year discounting with fractional final year; nominal and present-value helpers | `recurringPresentValue`, `recurringNominal`, `discountFactor` ? `src/engine/lcc.ts` | **Implemented** |
| 60300-3-3.7 | Equivalent annual cost | Capital-recovery based EAC, including the zero-discount case | `equivalentAnnualCost` (internal), surfaced as `LccPeriodResult.eac` ? `src/engine/lcc.ts` | **Implemented** |
| 60300-3-3.8 | Sensitivity analysis | Eight scenarios: discount ?2 points, labour/material/downtime/support +20 %, residual risk +50 %, escalation +1 point; delta and delta % against base NPV | `LccResult.sensitivity`, `npvWith` ? `analyzeLcc` in `src/engine/lcc.ts` | **Implemented** |
| 60300-3-3.9 | Selectable analysis periods | Day, month, 6 months, 1 year, 5, 10, 20, 35 years and custom; period length resolved consistently | `LCC_PERIODS`, `lccPeriodYears` ? `src/engine/lcc.ts` | **Implemented** |
| 60300-3-3.10 | Data Register as cost input | Assets imported from the project Data Register and converted to PM/CM cost objects | `pmAssetFromRegister`, `cmAssetFromRegister`, `loadProjectRegister` ? `src/engine/lcc.ts`, `src/data/workspace.ts` | **Implemented** |
| 60300-3-3.11 | Residual value / salvage value | No residual asset value; only a recurring residual-**risk** allowance (`residualRiskPerYear`) and disposal cost | `LccInputs.residualRiskPerYear`, `includeDisposal` ? `src/engine/lcc.ts` | **Partial** |
| 60300-3-3.12 | Uncertainty and risk analysis | Deterministic sensitivity only; no Monte Carlo, probability distributions or confidence bounds | `LccResult.sensitivity` ? `src/engine/lcc.ts` | **Partial** |
| 60300-3-3.13 | LCC reporting and export | Report rows, print/export dialog and saved `.lccpm` / `.lcccm` documents with formula versions | `src/components/reporting/ExportDialog.tsx`; `src/components/documents/SaveDialog.tsx`; `LccPmDocument`, `LccCmDocument` | **Implemented** |

### 4.1 LCC formula reference

```
NPV        = Acquisition
           + ?_{t=1..n} [AnnualRecurring ? (1+escalation)^(t?1) / (1+discount)^t]
           + Disposal ? (1+discount)^(?n)

EAC        = NPV ? discount / (1 ? (1+discount)^(?n))        (NPV / n when discount = 0)

AnnualRecurring = Labour + Material + Support + Downtime + Overhead + ResidualRisk
Overhead        = (Labour + Material) ? overheadRate
```

---

## 5. EN 50126-1 ? Railway RAMS, systems approach

**Overall status: Partial.** The risk-assessment core (severity, frequency, matrix, acceptability) is implemented. The safety-programme artefacts (THR/TFFR/SIL derivation, safety case, FRACAS, independent assessment) are not.

| # | Requirement | RAMSport evidence | Location | Status |
|---|---|---|---|---|
| 50126-1.1 | RAM programme and RAM plan | No programme or plan artefact; individual RAM analyses exist | ? | **Gap** |
| 50126-1.2 | Severity categories S1?S5 | Severity definitions with descriptions, ordered S1 (worst) to S5 | `EN50126_SEVERITIES`, `EN50126_SEVERITY_ORDER`, `en50126SeverityDef` ? `src/engine/en50126.ts` | **Implemented** |
| 50126-1.3 | Frequency / probability classes | Ordered frequency classes with quantitative bounds, mapped from a failure rate | `EN50126_FREQUENCIES`, `en50126FrequencyFromRate` ? `src/engine/en50126.ts` | **Implemented** |
| 50126-1.4 | Risk matrix (severity ? frequency) | Full S1?S5 ? frequency matrix producing Intolerable / Undesirable / Tolerable / Negligible | `EN50126_RISK_MATRIX`, `en50126RiskLevel`, `en50126RiskRank`, `en50126WorstRisk` ? `src/engine/en50126.ts` | **Implemented** |
| 50126-1.5 | Risk acceptance and ALARP | Acceptability predicate plus risk-level definitions that state the ALARP obligation for Tolerable risk | `en50126IsAcceptable`, `EN50126_RISK_LEVELS` ? `src/engine/en50126.ts` | **Partial** ? no formal CoP / reference-system / explicit-risk-estimation (ERE) selection workflow |
| 50126-1.6 | Hazard identification and recording | Failure mode, cause, mission phase, local/next/end effect, detection, compensating measure, severity, frequency, ?, ?, ?p, operating time | `FmecaModeRecord`, `analyzeFmeca` ? `src/engine/fmeca.ts`; `src/components/fmeca/FmecaWorkbench.tsx` | **Partial** ? hazard records live inside a FMECA, not in a standalone hazard log with owners and closure evidence |
| 50126-1.7 | Hazard control and risk reduction | Risk tier per mode; `criticalItems` list for Undesirable and Intolerable modes; model warnings | `FmecaAnalysis.criticalItems`, `FmecaItemResult.worstRisk` ? `src/engine/fmeca.ts` | **Partial** |
| 50126-1.8 | THR / TFFR apportionment and SIL | Not implemented | ? | **Gap** |
| 50126-1.9 | Safety requirements specification | Not implemented as a separate artefact | ? | **Gap** |
| 50126-1.10 | Validation, verification and independent assessment | Not implemented | ? | **Gap** |
| 50126-1.11 | Safety case | Not implemented | ? | **Gap** |
| 50126-1.12 | FRACAS | Not implemented | ? | **Gap** |
| 50126-1.13 | Reliability and availability modelling | Component and series availability, MTBF, FIT; RBD evaluation | `componentAvailability`, `seriesAvailability`, `meanTimeBetweenFailures`, `failuresInTime` ? `src/engine/reliability.ts`; `src/engine/rbd.ts` | **Partial** |

---

## 6. IEC 60812 ? Failure modes and effects analysis (FMEA / FMECA)

**Overall status: Partial.** RAMSport implements a qualitative FMEA and a MIL-STD-1629A-style quantitative criticality analysis. It does not implement IEC 60812's 1?10 severity/occurrence/detection scales or RPN.

| # | Requirement | RAMSport evidence | Location | Status |
|---|---|---|---|---|
| 60812.1 | FMEA procedure and worksheets | Item/function/failure-mode worksheet with cause, effects (local, next, end), detection, compensating provision and remarks | `FmecaItemRecord`, `FmecaModeRecord`; `src/components/fmeca/FmecaWorkbench.tsx` | **Implemented** |
| 60812.2 | Design FMEA (DFMEA) | Supported through the generic design-oriented worksheet | `src/components/fmeca/FmecaWorkbench.tsx` | **Partial** |
| 60812.3 | Process FMEA (PFMEA) | No process-step, man/machine/material/method/environment taxonomy | ? | **Gap** |
| 60812.4 | Severity scale | EN 50126 S1?S5 is used instead of an IEC 60812 1?10 scale | `FMECA_SEVERITIES` ? `src/engine/fmeca.ts`; `EN50126_SEVERITIES` ? `src/engine/en50126.ts` | **Partial** |
| 60812.5 | Occurrence scale | EN 50126 frequency classes are used instead of an IEC 60812 1?10 occurrence scale | `FMECA_FREQUENCIES` ? `src/engine/fmeca.ts` | **Partial** |
| 60812.6 | Detection scale | Detection is recorded as free text; there is no detection ranking | `FmecaModeRecord.detection` ? `src/engine/fmeca.ts` | **Gap** |
| 60812.7 | Risk Priority Number (S ? O ? D) | Not computed | ? | **Gap** |
| 60812.8 | Criticality analysis (Cm / Cr) | Mode criticality `Cm = ? ? ? ? ?p ? t`; item criticality by severity band and total `Cr` | `FmecaModeResult.cm`, `FmecaItemResult.cr`, `FmecaItemResult.totalCr`, `formatCriticality` ? `src/engine/fmeca.ts` | **Implemented** |
| 60812.9 | Criticality / risk matrix | Severity ? frequency count matrix and risk-level counts | `FmecaAnalysis.matrix`, `FmecaAnalysis.riskCounts` ? `src/engine/fmeca.ts` | **Implemented** |
| 60812.10 | Common-cause failure | No CCF or ?-factor group analysis | ? | **Gap** |
| 60812.11 | FMEA?FTA relationship | RBD and FTA exist as separate modules; no traceability link from an FMEA mode to a fault-tree event | `src/engine/fta.ts`; `src/components/fta/` | **Gap** |
| 60812.12 | Human and software factors | No dedicated human-reliability or software-FMEA fields | ? | **Gap** |

---

## 7. IEC 61703 ? Mathematical expressions for RAM

**Overall status: Partial.** Core steady-state availability, MTBF and spares/downtime mathematics are implemented. Advanced repairable-system mathematics (Markov, renewal, production availability) is not.

| # | Requirement | RAMSport evidence | Location | Status |
|---|---|---|---|---|
| 61703.1 | MTBF / MTTF | MTBF from ?, both per asset in LCC and per spare item | `meanTimeBetweenFailures` ? `src/engine/reliability.ts`; `LccAssetResult.mtbfHours`, `SpareItemResult.mtbfHours` | **Implemented** |
| 61703.2 | MTTR and maintainability | MTTR entered per asset/item and used in availability and downtime | `LccAssetBase.mttr`, `SpareItem.mttr`; `cmAnnual` ? `src/engine/lcc.ts` | **Implemented** |
| 61703.3 | Steady-state availability | `A = 1 / (1 + ??MTTR)` per component and series product | `componentAvailability`, `componentAvailabilityPercent`, `seriesAvailability` ? `src/engine/reliability.ts` | **Implemented** |
| 61703.4 | Operational availability | Availability including logistic and administrative delay, and expected spares-induced downtime | `LccAssetResult.operationalAvailability`; `SpareItemResult.operationalAvailability` ? `src/engine/lcc.ts`, `src/engine/spares.ts` | **Implemented** |
| 61703.5 | MDT and downtime components | CM downtime = MTTR + administrative delay + logistic delay | `cmAnnual` ? `src/engine/lcc.ts` | **Partial** ? no separate preventive-maintenance downtime or scheduled-outage model |
| 61703.6 | Renewal and Markov models | Not implemented | ? | **Gap** |
| 61703.7 | Production availability | Not implemented | ? | **Gap** |
| 61703.8 | Spares and maintenance-support metrics | Reorder point, pipeline stock, fill rate, expected backorders, stockout risk, cycle service level | `poissonQuantile`, `poissonCdf`, `poissonExpectedBackorders`, `analyzeSpares` ? `src/engine/spares.ts` | **Implemented** |
| 61703.9 | Life-data distributions and confidence | 2/3-parameter Weibull, MRR, MLE, Weibayes, B-lives and confidence bounds | `analyzeWeibull`, `weibullBLife`, `weibullMttf`, `chiSquareQuantile`, `betaQuantile` ? `src/engine/weibull.ts` | **Implemented** |

---

## 8. MIL-STD-1629A ? FMECA (military)

**Overall status: Partial.** The quantitative criticality calculation is implemented. The military severity/probability category scheme and DMEA are not.

| # | Requirement | RAMSport evidence | Location | Status |
|---|---|---|---|---|
| 1629A.1 | FMA / FEA tasks | Failure-mode, effect and criticality worksheet | `analyzeFmeca` ? `src/engine/fmeca.ts`; `src/components/fmeca/FmecaWorkbench.tsx` | **Implemented** |
| 1629A.2 | Severity categories I?IV | EN 50126 S1?S5 is used; no I?IV mapping is stored or displayed | `FMECA_SEVERITIES` ? `src/engine/fmeca.ts` | **Gap** |
| 1629A.3 | Probability levels A?E | EN 50126 frequency classes are used; no A?E mapping | `FMECA_FREQUENCIES` ? `src/engine/fmeca.ts` | **Gap** |
| 1629A.4 | Mode criticality number Cm | `Cm = ? ? ? ? ?p ? t`, computed only in `fmeca` mode | `FmecaModeResult.cm` ? `analyzeFmeca` in `src/engine/fmeca.ts` | **Implemented** |
| 1629A.5 | Item criticality number Cr | `Cr(severity) = ? Cm` over modes in that severity band, plus `totalCr` | `FmecaItemResult.cr`, `FmecaItemResult.totalCr` ? `src/engine/fmeca.ts` | **Implemented** |
| 1629A.6 | Criticality matrix | Severity ? frequency mode-count matrix; `criticalItems` list | `FmecaAnalysis.matrix`, `FmecaAnalysis.criticalItems` ? `src/engine/fmeca.ts` | **Partial** ? matrix shows counts, not cumulative Cr |
| 1629A.7 | Quantitative caveat | Explicit warning that criticality numbers are relative rankings, not absolute probabilities | `analyzeFmeca` warning ? `src/engine/fmeca.ts` | **Implemented** |
| 1629A.8 | Damage-mode and effects analysis (DMEA) | Not implemented | ? | **Gap** |
| 1629A.9 | Maintenance-task derivation | No automatic task derivation from criticality | ? | **Gap** |

---

## 9. MIL-STD-882E ? System safety

**Overall status: Gap.** RAMSport contains an EN 50126 risk matrix that is conceptually similar, but it does not implement the MIL-STD-882E process, severity categories, probability levels, RAC matrix, software-safety taxonomy or hazard tracking system.

| # | Requirement | RAMSport evidence | Location | Status |
|---|---|---|---|---|
| 882E.1 | Eight-element system safety process | Not implemented | ? | **Gap** |
| 882E.2 | Severity categories 1?4 | EN 50126 S1?S5 only; no 1?4 mapping | `src/engine/en50126.ts` | **Gap** |
| 882E.3 | Probability levels A?F | EN 50126 frequency classes only; no A?F mapping | `src/engine/en50126.ts` | **Gap** |
| 882E.4 | Risk Assessment Code (RAC) matrix | EN 50126 risk tiers, not the 882E RAC codes | `EN50126_RISK_MATRIX` ? `src/engine/en50126.ts` | **Gap** |
| 882E.5 | Software safety (SCC / SwCI / LOR) | Not implemented | ? | **Gap** |
| 882E.6 | Hazard tracking system | No hazard register with owner, status, closure and verification | ? | **Gap** |
| 882E.7 | Risk acceptance authority | `en50126IsAcceptable` returns a boolean; no acceptance authority, signature or waiver record | `src/engine/en50126.ts` | **Gap** |
| 882E.8 | Tasks 100?400 series | Not implemented | ? | **Gap** |

---

## 10. EN 50126-3 ? Rolling-stock RAM

**Overall status: Partial.** The spares-provisioning and spares-LCC mathematics are implemented and are the strongest part of this standard's coverage. The rolling-stock RAM programme, FailI/FailS/FailM categories, LRU breakdown and demonstration/warranty activities are not.

| # | Requirement | RAMSport evidence | Location | Status |
|---|---|---|---|---|
| 50126-3.1 | Customer/supplier RAM specification | No RAM specification artefact; analyses are performed per document | ? | **Gap** |
| 50126-3.2 | RAM programme | No programme artefact | ? | **Gap** |
| 50126-3.3 | Vehicle breakdown structure / LRU | No LRU hierarchy; items are flat | `SpareItem` ? `src/engine/spares.ts` | **Gap** |
| 50126-3.4 | FailI / FailS / FailM categories | Not implemented as named categories | ? | **Gap** |
| 50126-3.5 | Reliability targets (FR, MTBF, MTTF, MDBF) | MTBF and annual failure count per item; no target-versus-demonstrated comparison | `SpareItemResult.mtbfHours`, `annualFailures` ? `src/engine/spares.ts` | **Partial** |
| 50126-3.6 | Maintainability and MTTR targets | MTTR, repair turnaround and logistic delay are inputs; no maintainability target demonstration | `SpareItem.mttr`, `repairTurnaroundDays`; `itemResult` ? `src/engine/spares.ts` | **Partial** |
| 50126-3.7 | Availability targets | Operational availability per item, including expected spares-induced downtime | `SpareItemResult.operationalAvailability` ? `src/engine/spares.ts` | **Partial** |
| 50126-3.8 | Initial spares provisioning | Poisson demand over the protection period; stock sized to the target cycle service level | `poissonQuantile`, `poissonCdf` ? `src/engine/spares.ts` | **Implemented** |
| 50126-3.9 | Replenishment / reorder point | Reorder point from lead-time demand; pipeline stock from lead time plus repair turnaround | `SpareItemResult.reorderPoint`, `pipelineStock` ? `src/engine/spares.ts` | **Implemented** |
| 50126-3.10 | Service-level metrics | Cycle service level, fill rate, expected backorders, stockout risk, weighted service level | `SpareItemResult`, `SparesResult.totals.weightedServiceLevel` ? `src/engine/spares.ts` | **Implemented** |
| 50126-3.11 | Insurance spares for low-demand safety items | Insurance spare forced to one when the Poisson result is zero for a safety-critical item | `insuranceRecommended`, `SpareItem.insurance` ? `src/engine/spares.ts` | **Implemented** |
| 50126-3.12 | Obsolescence and last-time buy | Last-time-buy quantity and cost when obsolescence falls inside the horizon | `lastTimeBuyQty`, `obsolescenceCost` ? `src/engine/spares.ts` | **Implemented** |
| 50126-3.13 | Spares life-cycle cost | Initial, replenishment, holding and downtime cost; NPV, undiscounted and EAC by period | `lccNpv`, `lccUndiscounted`, `SparesResult.periods` ? `src/engine/spares.ts` | **Implemented** |
| 50126-3.14 | Criticality-driven service levels | Suggested service level by criticality (safety 99 %, mission 98 %, operational 95 %, other 90 %) | `recommendedServiceLevel` ? `src/engine/spares.ts` | **Implemented** |
| 50126-3.15 | Demonstration, burn-in and warranty | Not implemented | ? | **Gap** |

---

## 11. Document kind mapping

Each analysis saves to a dedicated extension so that the file browser, document router and save dialog stay consistent.

| Document kind | Extension | Standard | Engine | Formula version |
|---|---|---|---|---|
| `lccpm` | `.lccpm` | IEC 60300-3-3 | `src/engine/lcc.ts` (`mode = "pm"`) | `lcc-pm-iec60300-3-3-v1` |
| `lcccm` | `.lcccm` | IEC 60300-3-3 | `src/engine/lcc.ts` (`mode = "cm"`) | `lcc-cm-iec60300-3-3-v1` |
| `spares` | `.spares` | EN 50126-3 / IEC 61703 | `src/engine/spares.ts` | `spares-en50126-3-v1` |
| `fmeca` | `.fmeca` | IEC 60812 / MIL-STD-1629A / EN 50126-1 | `src/engine/fmeca.ts` | `fmeca-*` |
| `weibull` | `.wbl` | IEC 61649 | `src/engine/weibull.ts` | ? |
| `mil217f` | `.217f` | MIL-HDBK-217F Notice 2 | `src/engine/mil217f.ts` | `mil217f-notice2-v1` |
| `rbd` | `.rbd` | IEC 61078 (RBD) | `src/engine/rbd.ts` | ? |
| `fta` | `.fta` | IEC 61025 | `src/engine/fta.ts` | ? |
| `data` | `.json` | ISO 55000 asset information | `src/data/workspace.ts` | ? |

The mapping is registered in `src/lib/document-kinds.ts` and consumed by `src/lib/document-context.ts`, `src/components/documents/SaveDialog.tsx`, `src/components/files/file-types.ts` and `src/server/api.ts`.

---

## 12. Repository structure

```
RAMSport06_C#_nostorage/
??? compliance/
?   ??? compliance-matrix.md          ? this file
??? docs/
?   ??? specifications/               ? TRD, app flow, UI/UX, schema, plan, architecture
?   ??? operations/                   ? operations, security, deployment and product notes
?   ??? status/                       ? historical build and UI status records
?   ??? archive/                      ? historical audits and design references
??? scripts/
?   ??? verify-workbench.mjs          ? server-backed regression checks
?   ??? diagnostics/                  ? CDP screenshot and DOM tooling
??? src/
    ??? app/(workspace)/              ? dashboard, data-register, fmeca, fta, rbd,
    ?                                    weibull, mil-std-217f, lcc-pm, lcc-cm, spare-parts
    ??? components/
    ?   ??? fmeca/  lcc/  spares/     ? analysis workbenches
    ?   ??? files/                    ? Explorer-style file browser
    ?   ??? documents/                ? save dialog and document chrome
    ?   ??? reporting/                ? export and print
    ??? data/workspace.ts             ? Data Register and module scratchpads
    ??? engine/                       ? pure analysis engines (no React, no DOM)
    ?   ??? en50126.ts  fmeca.ts
    ?   ??? lcc.ts      spares.ts
    ?   ??? reliability.ts  rbd.ts  fta.ts
    ?   ??? weibull.ts  mil217f.ts
    ?   ??? canvas-zoom.ts  rbd-routing.ts
    ??? lib/                          ? document kinds, context, icons, formatting
    ??? server/                       ? API, store, session, crypto, users
    ??? services/documents/client.ts  ? load / save / autosave
```

---

## 13. Verification evidence

Only checks that exist in this repository are listed. Each must be re-run after any change.

| Check | Command | Scope | Result |
|---|---|---|---|
| Production build (compilation + TypeScript + static generation) | `node node_modules\next\dist\bin\next build` | All routes and modules | **Passes** ? 16/16 static pages generated, no type errors |
| Server-backed regression suite | `node scripts/verify-workbench.mjs` | Server persistence, no browser storage, document routing, Data Register bridge, LCC/Spares/compliance assertions, deployment headers | **Passes** ? "Server-backed workbench regression checks passed." |

The regression suite asserts, among other things:

- no `localStorage` / `sessionStorage` / `indexedDB` usage;
- the signed HttpOnly session cookie and same-origin mutation guard;
- `.lccpm`, `.lcccm`, `.spares` routing through `document-kinds.ts`, `document-context.ts`, `SaveDialog`, `file-types.ts` and `server/api.ts`;
- the LCC engine exposes `analyzeLcc`, `LCC_PERIODS` and `recurringPresentValue`;
- the spares engine exposes `analyzeSpares` and `poissonQuantile`;
- the compliance matrix covers every standard claimed above.

> There are no Playwright, browser-layout or API-integration scripts in this folder. Do not cite them as evidence.

---

## 14. Consolidated gap register

The following items are **not** implemented and must be supplied externally if a programme claims full compliance. They are grouped so that a project can assign owners.

| ID | Standard | Missing artefact | Impact |
|---|---|---|---|
| G-01 | EN 50126-1 | THR/TFFR apportionment and SIL derivation | Safety requirements cannot be derived from RAMSport output alone |
| G-02 | EN 50126-1 | Hazard log with owners, actions, closure evidence | Hazard tracking must be held in a separate system |
| G-03 | EN 50126-1 | Safety case, V&V and independent assessment | Certification evidence is out of scope |
| G-04 | EN 50126-1 | FRACAS | Field-failure feedback loop is out of scope |
| G-05 | IEC 60812 | IEC 60812 severity/occurrence/detection scales and RPN | FMEA severity is expressed in EN 50126 terms |
| G-06 | IEC 60812 | Process FMEA and common-cause failure | Manufacturing and CCF analyses must be done elsewhere |
| G-07 | IEC 61703 | Markov, renewal and production-availability models | Only steady-state availability is computed |
| G-08 | MIL-STD-1629A | Severity I?IV / probability A?E categories and DMEA | Military category mapping is not stored |
| G-09 | MIL-STD-882E | Entire 882E process, RAC matrix, software safety, hazard tracking | Do not claim MIL-STD-882E compliance |
| G-10 | EN 50126-3 | RAM specification, LRU breakdown, FailI/FailS/FailM, demonstration and warranty | Spares mathematics is available; the rolling-stock RAM programme is not |
| G-11 | ISO 55000 | Asset management policy, SAMP and performance-review history | RAMSport is a toolkit, not an asset-management system |
| G-12 | IEC 60300-3-3 | LCC plan, residual asset value, probabilistic uncertainty | LCC calculation is complete; the process wrapper is partial |

---

## 15. Using this matrix in an audit

1. **Traceability** ? quote the requirement clause, then the symbol in the *Location* column. Symbols are stable; line numbers are not.
2. **Status discipline** ? never present a **Partial** or **Gap** row as compliant. Attach the external artefact or a deviation statement.
3. **Evidence refresh** ? re-run the two commands in ?13 and update the *Result* column before issuing a compliance statement.
4. **Change control** ? when an engine symbol is renamed, update this matrix in the same change; `scripts/verify-workbench.mjs` checks that the standards coverage still exists.

---

*Maintained with the source tree. Last verified against the production build and `scripts/verify-workbench.mjs` on 15 November 2026.*
