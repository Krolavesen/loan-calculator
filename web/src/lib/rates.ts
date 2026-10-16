/**
 * Convert between the nominal and the effective annual rate.
 *
 * The model compounds monthly (`nominal_rate / 12` in loan_calculator.py), so
 * the effective rate is `(1 + nominal / 12) ** 12 - 1`. It leaves out fees, so
 * it is lower than a bank's quoted effektiv rente.
 */
export const toEffectiveRate = (nominal: number) => (1 + nominal / 12) ** 12 - 1

export const toNominalRate = (effective: number) => 12 * ((1 + effective) ** (1 / 12) - 1)
