import type { LoanInput } from './api'

/** A money field that may still be blank. */
export type Money = number | null

/** What the form holds: the loan inputs, with the money fields allowed blank. */
export interface FormValues {
  price: Money
  jointExpenses: Money
  equities: [Money, Money]
  nominalRate: number
  years: number
  borrowers: number
  deposit: Money
  includeDividend: boolean
  includeDeduction: boolean
  ownershipShare: number
  salaries: [Money, Money]
  studentLoans: [Money, Money]
}

/** The starting point: no personal figures, sensible loan terms. */
export const EMPTY_FORM: FormValues = {
  price: null,
  jointExpenses: null,
  equities: [null, null],
  nominalRate: 0.035,
  years: 30,
  borrowers: 2,
  deposit: null,
  includeDividend: true,
  includeDeduction: true,
  ownershipShare: 0.5,
  salaries: [null, null],
  studentLoans: [null, null],
}

/** The form can be projected once there is a purchase price. */
export const isReady = (form: FormValues) => (form.price ?? 0) > 0

/** Turn the form into a request, treating blank money fields as 0. */
export function toLoanInput(form: FormValues): LoanInput {
  const pair = (values: [Money, Money]): [number, number] => [values[0] ?? 0, values[1] ?? 0]
  return {
    price: form.price ?? 0,
    jointExpenses: form.jointExpenses ?? 0,
    equities: pair(form.equities),
    nominalRate: form.nominalRate,
    years: form.years,
    borrowers: form.borrowers,
    deposit: form.deposit ?? 0,
    includeDividend: form.includeDividend,
    includeDeduction: form.includeDeduction,
    ownershipShare: form.ownershipShare,
    salaries: pair(form.salaries),
    studentLoans: pair(form.studentLoans),
  }
}
