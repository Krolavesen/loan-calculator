import type { Schedule } from '../lib/api'
import { formatMoney, formatMonthLabel } from '../lib/format'

interface ScheduleTableProps {
  schedule: Schedule
  /** Show every n-th month so the table stays readable. */
  stride?: number
}

export function ScheduleTable({ schedule, stride = 12 }: ScheduleTableProps) {
  const rows = schedule.balance
    .map((_, month) => month)
    .filter((month) => month % stride === 0 || month === schedule.months)

  return (
    <div className="table-wrap">
      <table className="schedule">
        <caption className="visually-hidden">Projected loan schedule</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Balance</th>
            <th scope="col">Interest</th>
            <th scope="col">Dividend / yr</th>
            <th scope="col">Deduction</th>
            <th scope="col">Monthly cost</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((month) => (
            <tr key={month}>
              <th scope="row">{formatMonthLabel(month)}</th>
              <td>{formatMoney(schedule.balance[month]!)}</td>
              <td>{formatMoney(schedule.interest[month]!)}</td>
              <td>{formatMoney(schedule.dividend[month]!)}</td>
              <td>{formatMoney(schedule.deduction[month]!)}</td>
              <td className="emphasis">{formatMoney(schedule.monthlyCost[month]!)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
