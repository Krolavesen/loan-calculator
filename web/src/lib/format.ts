const nok = new Intl.NumberFormat('nb-NO', {
  style: 'currency',
  currency: 'NOK',
  maximumFractionDigits: 0,
})

const percent = new Intl.NumberFormat('nb-NO', {
  style: 'percent',
  maximumFractionDigits: 2,
})

export const formatMoney = (value: number) => nok.format(value)
export const formatPercent = (value: number) => percent.format(value)

/** Turn a month index into a "1 yr 6 mo" style elapsed-time label. */
export function formatMonthLabel(month: number): string {
  if (month === 0) return 'Start'
  const years = Math.floor(month / 12)
  const months = month % 12
  if (years === 0) return `${months} mo`
  if (months === 0) return `${years} yr`
  return `${years} yr ${months} mo`
}
